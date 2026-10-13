// Cross-platform shell backend for the workspace-write-plus preset.
// Windows: extends PwshLocalExecutor (mirrors @deepseek-ai/dsh-pwsh-sandbox).
// Linux/macOS: extends LocalBashExecutor (mirrors @deepseek-ai/dsh-bash-sandbox).
// Plus sessions get OS sleep/shutdown commands executed host-side — the
// sandboxed ACL/landlock/seccomp would deny them otherwise.
//
// The current executor contract runs through `execute(spec)` + `executeArgv`;
// the older one through `run`/`start` + `runArgv`/`startArgv`. Both pairs are
// implemented: whichever the running harness calls is the one that runs, and
// the other stays inert (the current base has no `run`/`start`, the older one
// no `execute`).
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
 * Whether this call runs host-side and unfenced under the plus preset: the
 * enabled OS sleep/shutdown passthrough for a plus session.
 */
function isHostSideCommand(executor, policy, command) {
  const switches = executor.switches
  return switches.allowSystemCommands !== false
    && switches.enabled !== false
    && isPlusConfigSession(executor.ctx, policy.sessionId)
    && isSystemCommand(command)
}

/** Record one process's confinement facts for the tool layer's rendering. */
function rememberProcessFacts(executor, proc, facts, mode, workdir) {
  executor.processFacts.set(proc, {
    mode,
    enforcement: facts.enforcement,
    denialSignatures: facts.denialSignatures,
    runnerFailureRules: facts.runnerFailureRules,
    runnerProgram: facts.argv[0],
    workdir,
  })
}

/**
 * Decorate a handle's foreground projection in place, memoized once — the
 * current executor contract keeps the handle's identity (per-process facts and
 * `onProcessDone` key on the exact instance).
 */
function decorateResult(ex, map, mapError) {
  const base = ex.result.bind(ex)
  let decorated
  ex.result = () => {
    decorated ??= base().then(map, mapError)
    return decorated
  }
  return ex
}

/**
 * Current-contract execution: fence the command through `ctx.sandbox`, except
 * for the two host-side cases (full access, and a plus session's system
 * command). `runUnconfined` is the class's own `super.execute(spec)`.
 */
async function executeWithPlus(executor, spec, runUnconfined) {
  const policy = plusPolicy(spec, executor.ctx)
  const { mode } = policy
  if (mode === 'danger-full-access' || isHostSideCommand(executor, policy, spec.command)) {
    return decorateResult(await runUnconfined(), (result) => ({ ...result, sandbox: { mode, denied: false } }))
  }
  let confined
  const ex = await executor.executeArgv(spec, async (signal) => {
    const prepared = await executor.confine(spec, { ...policy, mode }, signal)
    signal.throwIfAborted()
    confined = prepared
    return prepared.argv
  }, (process) => {
    rememberProcessFacts(executor, process, confined, mode, spec.workdir)
  })
  return decorateResult(ex, (result) => {
    if (confined === undefined) return { ...result, sandbox: { mode, denied: false } }
    const { enforcement, denialSignatures, runnerFailureRules } = confined
    // Runner failure outranks denial because the command did not run.
    const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, runnerFailureRules)
    if (runnerFailure !== undefined) throw new SandboxUnavailableError(mode, runnerFailure.detail)
    return { ...result, sandbox: { mode, denied: classifyDenial(result, denialSignatures), enforcement } }
  }, (error) => {
    if (spec.signal?.aborted === true) spec.signal.throwIfAborted()
    if (confined !== undefined && isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
      throw new SandboxUnavailableError(mode, String(error))
    }
    throw error
  })
}

/** Shared per-process settlement for both contracts. */
function settleProcessFacts(executor, proc, stderr, runnerRejected, runnerError) {
  const facts = executor.processFacts.get(proc)
  if (facts === undefined) return
  executor.processFacts.delete(proc)
  const runnerFailed = runnerRejected
    ? isRunnerSpawnFailure(runnerError, facts.runnerProgram, facts.workdir)
    : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined
  proc.sandbox = {
    mode: facts.mode,
    denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
    enforcement: facts.enforcement,
    ...(runnerFailed ? { runnerFailed } : {}),
  }
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

  /** Current harness contract. */
  async execute(spec) {
    return executeWithPlus(this, spec, () => super.execute(spec))
  }

  /** Older harness contract (inert where the base has no `run`). */
  async run(spec) {
    const policy = plusPolicy(spec, this.ctx)
    const { mode } = policy
    if (mode === 'danger-full-access' || isHostSideCommand(this, policy, spec.command)) {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    const confined = await this.confine(spec, { ...policy, mode })
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
    if (mode === 'danger-full-access' || isHostSideCommand(this, policy, spec.command)) return super.start(spec)
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
    rememberProcessFacts(this, proc, confined, mode, spec.workdir)
    return proc
  }

  onProcessDone(proc, stderr, runnerRejected, runnerError) {
    settleProcessFacts(this, proc, stderr, runnerRejected, runnerError)
    super.onProcessDone(proc, stderr, runnerRejected, runnerError)
  }

  confine(spec, policy, signal) {
    return this.ctx.sandbox.confine(this.argv(spec), policy, signal)
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

  /** Current harness contract. */
  async execute(spec) {
    return executeWithPlus(this, spec, () => super.execute(spec))
  }

  /** Older harness contract (inert where the base has no `run`). */
  async run(spec) {
    const policy = plusPolicy(spec, this.ctx)
    const { mode } = policy
    if (mode === 'danger-full-access' || isHostSideCommand(this, policy, spec.command)) {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    const confined = await this.confine(spec, { ...policy, mode })
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
    if (mode === 'danger-full-access' || isHostSideCommand(this, policy, spec.command)) return super.start(spec)
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
    rememberProcessFacts(this, proc, confined, mode, spec.workdir)
    return proc
  }

  onProcessDone(proc, stderr, runnerRejected, runnerError) {
    settleProcessFacts(this, proc, stderr, runnerRejected, runnerError)
    super.onProcessDone(proc, stderr, runnerRejected, runnerError)
  }

  confine(spec, policy, signal) {
    return this.ctx.sandbox.confine(['bash', '-c', spec.command], policy, signal)
  }
}

// Loader mounts the class matching this platform as ctx.shell.
const PlatformExecutor = WIN32 ? PlusConfigPwshExecutor : PlusConfigBashExecutor
export default PlatformExecutor
