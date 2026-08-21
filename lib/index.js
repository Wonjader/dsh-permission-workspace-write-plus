// Entry point: re-exports the plugin backends (loader rows import /fs and
// /shell). The package-root row (name: dsh-permission-workspace-write-plus)
// mounts this host plugin so clientModules discovers the ./client bundle
// (dsh.client declaration, access-mode glyph, General-settings switches) and
// so the workspace-write-plus settings section is registered exactly once
// (per-allowance switches, including profiles and sleep guard).
export { default as PlusConfigFileSystem } from './fs.js'
export { default as PlusConfigPwshExecutor } from './shell.js'
export { isPlusConfigSession } from './preset.js'
import { registerSettings } from './settings.js'
import { apply as applySleepGuard } from './sleep-guard.js'

export const name = 'dsh-permission-workspace-write-plus'

/**
 * Host apply: register the workspace-write-plus settings namespace and start
 * the merged cross-platform sleep guard. The fs/shell backends read the
 * shared switches through currentSwitches().
 * @param ctx - loader context (settings service optional).
 */
export function apply(ctx, config) {
  registerSettings(ctx, config)
  applySleepGuard(ctx, config)
}
