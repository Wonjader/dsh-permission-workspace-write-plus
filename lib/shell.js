// Cross-platform shell backend for the workspace-write-plus preset.
// Windows: extends PwshLocalExecutor (mirrors @deepseek-ai/dsh-pwsh-sandbox).
// Linux/macOS: extends LocalBashExecutor (mirrors @deepseek-ai/dsh-bash-sandbox).
// Plus sessions get OS sleep/shutdown commands executed host-side — the
// sandboxed ACL/landlock/seccomp would deny them otherwise.
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import { classifyDenial, classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from './helpers.js'
import { isPlusConfigSession } from './preset.js'
import { currentSwitches, ensureSettingsRegistered } from './settings.js'

const WIN32 = process.platform === 'win32'

// Windows system commands (pwsh). rundll32 SetSuspendState = sleep button.
const WIN_SYSTEM_COMMAND_RE = /^\s*(?:shutdown|powercfg)(?:\.exe)?\b/i
const WIN_SUSPEND_COMMAND_RE = /^\s*rundll32(?:\.exe)?\b/i

// POSIX system commands (bash/sh): shutdown variants and suspend helpers.
const POSIX_SYSTEM_COMMAND_RE = /^\s*(?:shutdown|poweroff|halt|reboot|systemctl\s+(?:poweroff|halt|reboot|suspend|hibernate)|pm-hibernate|pm-suspend|pm-suspend-hybrid)(?:\s|$)/i
// macOS power management via pmset / caffeinate.
const MACOS_PMSET_RE = /^\s*pmset\b/i
const MACOS_CAFFEINATE_RE = /^\s*caffeinate\b/i

/** Is this shell command an allowed OS sleep/shutdown command? */
export function isSystemCommand(command) {
  if (typeof command !== 'string') return false
  const trimmed = command.trim()
  if (WIN32) {
    if (WIN_SYSTEM_COMMAND_RE.test(trimmed)) return true
    if (WIN_SUSPEND_COMMAND_RE.test(trimmed)) return /SetSuspendState/i.test(trimmed)
    return false
  }
  if (POSIX_SYSTEM_COMMAND_RE.test(trimmed)) return true
  if (process.platform === 'darwin') {
    if (MACOS_PMSET_RE.test(trimmed)) return true
    if (MACOS_CAFFEINATE_RE.test(trimmed)) return true
  }
  return false
}

/** Shared plus-session policy resolution. */
function plusPolicy(spec, ctx) {
  return spec.sandboxPolicy ?? ctx.sandboxPolicy.resolve()
}

/**
 * Windows backend: sandbox-consuming pwsh executor with the plus-system-command
 * host-side passthrough (extends the local pwsh executor, confines via ctx.sandbox).
 */
export class PlusConfigPwshExecutor extends PwshLocalExecutor {
  static inject = ['subprocess', 'sandbox', 'sandboxPolicy', 'sessions', 'settings']

  processFacts = new Map()

  constructor(ctx, config) {
    super(ctx, config)
    ensureSettingsRegistered(ctx, config)
    this.mode = ctx.sandboxPolicy.defaultMode
  }

  /** Current allowance switches (published by the package-root apply). */
  get switches() {
    return currentSwitches()
  }

  get sandboxMode() {
    return this.mode
  }

  resolve(request) {
    return { ...super.resolve(request), sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() }
  }

  async run(spec) {
    const policy = plusPolicy(spec, this.ctx)
    const { mode } = policy
    if (mode === 'danger-full-access') {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    if (this.switches.allowSystemCommands !== false
        && this.switches.enabled !== false
        && isPlusConfigSession(this.ctx, policy.sessionId)
        && isSystemCommand(spec.command)) {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    const confined = this.confine(spec, { ...policy, mode })
    let result
    try {
      result = await this.runArgv(spec, confined.argv)
    } catch (error) {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted()
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, confined.runnerFailureRules)
    if (runnerFailure !== undefined) {
      throw new SandboxUnavailableError(mode, runnerFailure.detail)
    }
    return {
      ...result,
      sandbox: { mode, denied: classifyDenial(result, confined.denialSignatures), enforcement: confined.enforcement },
    }
  }

  start(spec) {
    const policy = plusPolicy(spec, this.ctx)
    const { mode } = policy
    if (mode === 'danger-full-access') return super.start(spec)
    if (this.switches.allowSystemCommands !== false
        && this.switches.enabled !== false
        && isPlusConfigSession(this.ctx, policy.sessionId)
        && isSystemCommand(spec.command)) {
      return super.start(spec)
    }
    const confined = this.confine(spec, { ...policy, mode })
    let proc
    try {
      proc = this.startArgv(spec, confined.argv)
    } catch (error) {
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const { enforcement, denialSignatures, runnerFailureRules } = confined
    this.processFacts.set(proc, {
      mode,
      enforcement,
      denialSignatures,
      runnerFailureRules,
      runnerProgram: confined.argv[0],
      workdir: spec.workdir,
    })
    return proc
  }

  onProcessDone(proc, stderr, spawnFailed, spawnError) {
    const facts = this.processFacts.get(proc)
    if (facts !== undefined) {
      this.processFacts.delete(proc)
      const runnerFailed = spawnFailed
        ? isRunnerSpawnFailure(spawnError, facts.runnerProgram, facts.workdir)
        : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...(runnerFailed ? { runnerFailed } : {}),
      }
    }
    super.onProcessDone(proc, stderr, spawnFailed, spawnError)
  }

  confine(spec, policy) {
    return this.ctx.sandbox.confine(this.argv(spec), policy)
  }
}

/**
 * POSIX backend: sandbox-consuming bash executor with the plus-system-command
 * host-side passthrough (mirrors @deepseek-ai/dsh-bash-sandbox structure).
 */
export class PlusConfigBashExecutor extends LocalBashExecutor {
  static inject = ['subprocess', 'sandbox', 'sandboxPolicy', 'sessions', 'settings']

  processFacts = new Map()

  constructor(ctx, config) {
    super(ctx, config)
    ensureSettingsRegistered(ctx, config)
    this.mode = ctx.sandboxPolicy.defaultMode
  }

  /** Current allowance switches (published by the package-root apply). */
  get switches() {
    return currentSwitches()
  }

  get sandboxMode() {
    return this.mode
  }

  resolve(request) {
    return { ...super.resolve(request), sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() }
  }

  async run(spec) {
    const policy = plusPolicy(spec, this.ctx)
    const { mode } = policy
    if (mode === 'danger-full-access') {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    if (this.switches.allowSystemCommands !== false
        && this.switches.enabled !== false
        && isPlusConfigSession(this.ctx, policy.sessionId)
        && isSystemCommand(spec.command)) {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    const confined = this.confine(spec.command, { ...policy, mode })
    let result
    try {
      result = await this.runArgv(spec, confined.argv)
    } catch (error) {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted()
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, confined.runnerFailureRules)
    if (runnerFailure !== undefined) {
      throw new SandboxUnavailableError(mode, runnerFailure.detail)
    }
    return {
      ...result,
      sandbox: { mode, denied: classifyDenial(result, confined.denialSignatures), enforcement: confined.enforcement },
    }
  }

  start(spec) {
    const policy = plusPolicy(spec, this.ctx)
    const { mode } = policy
    if (mode === 'danger-full-access') return super.start(spec)
    if (this.switches.allowSystemCommands !== false
        && this.switches.enabled !== false
        && isPlusConfigSession(this.ctx, policy.sessionId)
        && isSystemCommand(spec.command)) {
      return super.start(spec)
    }
    const confined = this.confine(spec.command, { ...policy, mode })
    let proc
    try {
      proc = this.startArgv(spec, confined.argv)
    } catch (error) {
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const { enforcement, denialSignatures, runnerFailureRules } = confined
    this.processFacts.set(proc, {
      mode,
      enforcement,
      denialSignatures,
      runnerFailureRules,
      runnerProgram: confined.argv[0],
      workdir: spec.workdir,
    })
    return proc
  }

  onProcessDone(proc, stderr, spawnFailed, spawnError) {
    const facts = this.processFacts.get(proc)
    if (facts !== undefined) {
      this.processFacts.delete(proc)
      const runnerFailed = spawnFailed
        ? isRunnerSpawnFailure(spawnError, facts.runnerProgram, facts.workdir)
        : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...(runnerFailed ? { runnerFailed } : {}),
      }
    }
    super.onProcessDone(proc, stderr, spawnFailed, spawnError)
  }

  confine(command, policy) {
    return this.ctx.sandbox.confine(['bash', '-c', command], policy)
  }
}

// Loader mounts the class matching this platform as ctx.shell.
const PlatformExecutor = WIN32 ? PlusConfigPwshExecutor : PlusConfigBashExecutor
export default PlatformExecutor