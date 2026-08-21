// Custom filesystem backend: standard workspace-write fence, plus the
// workspace-write-plus preset's extra write allowlist (config-type files
// without a same-named workspace counterpart; user DSH skills directory;
// user DSH profiles directory; user DSH home directory). Per-allowance
// switches come from the
// workspace-write-plus settings namespace (or composition config).
// Mirrors @deepseek-ai/dsh-fs-sandbox (LocalFileSystem inheritance).
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { FsError } from '@deepseek-ai/dsh-fs'
import { writableRoots } from '@deepseek-ai/dsh-sandbox'
import { isPathUnder } from './containment.js'
import { isAllowedExtra, defaultSkillsDir, defaultProfilesDir, defaultDshHome } from './config-file.js'
import { isPlusConfigSession } from './preset.js'
import { currentSwitches, ensureSettingsRegistered } from './settings.js'

export class PlusConfigFileSystem extends LocalFileSystem {
  static inject = ['sandboxPolicy', 'sessions', 'settings']

  constructor(ctx, config) {
    super(ctx, config)
    ensureSettingsRegistered(ctx, config)
    this.defaultMode = ctx.sandboxPolicy.defaultMode
    this.skillsDir = config?.skillsDir ?? defaultSkillsDir()
    this.profilesDir = config?.profilesDir ?? defaultProfilesDir()
    this.dshHome = config?.dshHome ?? defaultDshHome()
    this.configExtensions = config?.configExtensions
    this.configNames = config?.configNames
  }

  get sandboxMode() {
    return this.defaultMode
  }

  /** Current allowance switches (published by the package-root apply). */
  get switches() {
    return currentSwitches()
  }

  async writeText(target, content, expected, signal, sandboxPolicy) {
    return super.writeText(await this.checkedTarget(target, sandboxPolicy), content, expected, signal)
  }

  async editText(target, edit, expected, signal, sandboxPolicy) {
    return super.editText(await this.checkedTarget(target, sandboxPolicy), edit, expected, signal)
  }

  async checkedTarget(target, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    const { mode } = policy
    if (mode === 'danger-full-access') return target
    if (mode === 'read-only') {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under read-only mode`, 'FS_SANDBOX_DENIED')
    }
    // workspace-write (and workspace-write-plus preset sessions): containment
    // on the FRESH canonical path, delegate with that fresh target.
    const fresh = await this.resolve(target.displayPath)
    let contained = false
    for (const root of writableRoots(policy)) {
      if (await isPathUnder(fresh.targetKey, root)) {
        contained = true
        break
      }
    }
    const switches = this.switches
    if (!contained && switches.enabled !== false && isPlusConfigSession(this.ctx, policy.sessionId)) {
      if (await isAllowedExtra(fresh.targetKey, policy.workspaceRoot, {
        skillsDir: this.skillsDir,
        profilesDir: this.profilesDir,
        dshHome: this.dshHome,
        configExtensions: this.configExtensions,
        configNames: this.configNames,
        allowConfigFiles: switches.allowConfigFiles,
        allowSkills: switches.allowSkills,
        allowProfiles: switches.allowProfiles,
        allowDshHome: switches.allowDshHome,
      })) {
        contained = true
      }
    }
    if (!contained) {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under ${mode} mode`, 'FS_SANDBOX_DENIED')
    }
    return fresh
  }
}

export default PlusConfigFileSystem
