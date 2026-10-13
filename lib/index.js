// Entry point: re-exports the plugin backends (loader rows import /fs and
// /shell). The package-root row (name: dsh-permission-workspace-write-plus)
// mounts this host plugin so clientModules discovers the ./client bundle
// (dsh.client declaration, access-mode glyph, General-settings switches) and
// so the workspace-write-plus settings section is registered exactly once
// (per-allowance switches, including profiles and sleep guard).
export { default as PlusConfigFileSystem } from './fs.js'
export { default as PlusConfigPwshExecutor } from './shell.js'
export { isPlusConfigSession } from './preset.js'
import { PlusConfigFileSystem } from './fs.js'
import { PlusConfigPwshExecutor } from './shell.js'
import { registerSettings, resolveSettings, publishSwitches } from './settings.js'
import { apply as applySleepGuard } from './sleep-guard.js'

export const name = 'dsh-permission-workspace-write-plus'

/**
 * The plugin's settings schema, exported under the loader's reserved name.
 * Current hosts derive a plugin's settings form from its own entry config
 * (`settings.describe()` keys forms by profile entry id and auto-generates the
 * page), so the package-root row is what carries the switches there; older
 * hosts keep using the `workspace-write-plus` section below.
 */
export { SettingsSchema as Config } from './settings.js'

/** Preset key this package contributes to the permission table. */
const PRESET_KEY = 'workspace-write-plus'

/**
 * The profile rows a working install needs. Loader patches replace an entry's
 * whole `config` object (they are not merged), and the profile's
 * cordis.patch.yml is applied after every bundle — so profile wiring has to
 * stay atomic (the disable rows and the insert rows together), and a profile
 * that configures `permission` has to repeat the preset.
 */
const PROFILE_HINT = `- id: fs-sandbox
  disabled: true
- id: pwsh-sandbox        # Windows
  disabled: true
- id: bash-sandbox        # Linux/macOS/WSL
  disabled: true
- insert:
    - id: fs-workspace-plus-config
      name: dsh-permission-workspace-write-plus/fs
    - id: shell-workspace-plus-config
      name: dsh-permission-workspace-write-plus/shell
- id: permission
  config:
    presets:
      # ... keep the stock presets the base bundle declares ...
      workspace-write-plus:
        sandbox: workspace-write
        approval: ask
        name: Workspace Write Plus`

/**
 * An installed-but-unwired plugin is otherwise silent: the package mounts, the
 * preset is missing from the running permission table (the desktop app, for
 * one, installs the bundle but never edits the profile patch), and nothing the
 * user does changes that. Report the exact rows to add instead.
 * @param ctx - loader context (logger optional).
 */
function reportUnwired(ctx) {
  const warn = (message) => {
    try {
      ctx.logger?.warn(message)
    } catch {
      // Diagnostics must never take the plugin — or the host — down.
    }
  }
  ctx.inject(['permissionPresets'], (child) => {
    child.effect(() => {
      let names
      try {
        names = child.permissionPresets?.names
      } catch {
        return
      }
      if (!Array.isArray(names) || names.includes(PRESET_KEY)) return
      warn(
        `[dsh-permission-workspace-write-plus] the "${PRESET_KEY}" preset is not in the running permission table, `
        + 'so this plugin currently has no effect on write permissions.\n'
        + 'Loader patches replace an entry\'s whole `config` (they are not merged) and the profile patch layer is '
        + 'applied after every bundle, so the profile\'s cordis.patch.yml has to carry the preset — and, when the '
        + 'package was installed as a bundle only, the fs/shell wiring as well.\n'
        + 'Add this to the profile\'s cordis.patch.yml:\n'
        + PROFILE_HINT,
      )
    })
  })
}

/**
 * Host apply: publish the effective switches, register the
 * workspace-write-plus settings namespace on hosts that still have a
 * section-install API, and start the merged cross-platform sleep guard. The
 * fs/shell backends read the shared switches through currentSwitches().
 * @param ctx - loader context (settings service optional).
 * @param config - composition entry config.
 */
export function apply(ctx, config) {
  // Current hosts re-run this apply on every settings edit (the entry config IS
  // the form), so publishing here keeps the backends in sync there; older hosts
  // overwrite it from the settings document inside registerSettings.
  publishSwitches(resolveSettings(undefined, config))
  registerSettings(ctx, config)
  applySleepGuard(ctx, config)
  reportUnwired(ctx)
}
