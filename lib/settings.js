// workspace-write-plus settings namespace: per-allowance switches for every
// capability this preset adds beyond plain workspace-write. Registered when a
// settings service exists; each switch defaults to on. The schema is a real
// schemastery object so settings.describe() can serialize the form (a plain
// function schema would 500 /api/settings.describe).
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, installSettingsSection } from '@deepseek-ai/dsh-settings'

export const SETTINGS_NS = settingsNamespace('workspace-write-plus')

/** Settings schema: boolean fields, defaults when absent. */
export const SettingsSchema = z.object({
  // Master: anything beyond workspace-write is gated on this.
  enabled: z.boolean().default(true),
  // Config-type files outside the workspace (no same-named counterpart).
  allowConfigFiles: z.boolean().default(true),
  // User DSH skills directory (<DSH_HOME>/skills).
  allowSkills: z.boolean().default(true),
  // User DSH profiles directory (<DSH_HOME>/profiles): plugin packages and
  // profile composition files installed by DSH itself.
  allowProfiles: z.boolean().default(true),
  // User DSH home directory (<DSH_HOME>). Kept for compatibility; turning
  // this off still leaves skills and profiles independently controllable.
  allowDshHome: z.boolean().default(true),
  // OS sleep/shutdown commands (shutdown/poweroff/systemctl suspend/...).
  allowSystemCommands: z.boolean().default(true),
  // Sleep guard: hold the host awake while any agent turn is in flight.
  allowSleepGuard: z.boolean().default(true),
})

export const DEFAULT_SETTINGS = {
  enabled: true,
  allowConfigFiles: true,
  allowSkills: true,
  allowProfiles: true,
  allowDshHome: true,
  allowSystemCommands: true,
  allowSleepGuard: true,
}

/** Resolve effective switches: stored settings, else composition config, else defaults. */
export function resolveSettings(stored, config = {}) {
  const pick = (key) => {
    if (stored !== undefined && stored !== null && typeof stored[key] === 'boolean') return stored[key]
    if (config[key] !== undefined && typeof config[key] === 'boolean') return config[key]
    return DEFAULT_SETTINGS[key]
  }
  return {
    enabled: pick('enabled'),
    allowConfigFiles: pick('allowConfigFiles'),
    allowSkills: pick('allowSkills'),
    allowProfiles: pick('allowProfiles'),
    allowDshHome: pick('allowDshHome'),
    allowSystemCommands: pick('allowSystemCommands'),
    allowSleepGuard: pick('allowSleepGuard'),
  }
}

/**
 * Install the settings section; the caller keeps its own `source` thunk in
 * sync through `onChange`. Registration rides the caller's fiber.
 * @param ctx - plugin context (settings service optional).
 * @param entryConfig - composition entry config used as the base layer.
 * @param onResolved - called with () => effective switches whenever the
 *   source changes (attach/detach/value change).
 */
export function installSettings(ctx, entryConfig, onResolved) {
  let readCurrent = null
  installSettingsSection(ctx, SETTINGS_NS, SettingsSchema, entryConfig ?? DEFAULT_SETTINGS, {
    setSource: (getCurrent) => { readCurrent = getCurrent; onResolved(() => readCurrent()) },
    onChange: () => { onResolved(() => readCurrent?.() ?? entryConfig ?? DEFAULT_SETTINGS) },
  })
}
// Shared runtime switches: the package-root apply() registers the settings
// section once and publishes the effective switches here; fs/shell backends
// and sleep-guard read them on every call. Module-level store keeps backends
// decoupled from settings lifecycle (they may construct before the settings
// service exists).
const state = {
  switches: { ...DEFAULT_SETTINGS },
}

const switchListeners = new Set()

/** Subscribe to effective-switch replacement (disposer removes the listener). */
export function watchSwitches(listener) {
  switchListeners.add(listener)
  return () => { switchListeners.delete(listener) }
}

/** Publish the effective switches (from the registering backend). */
export function publishSwitches(switches) {
  state.switches = switches ?? { ...DEFAULT_SETTINGS }
  for (const listener of [...switchListeners]) {
    try {
      listener(state.switches)
    } catch (error) {
      // One bad listener must not stop the other consumers (or the settings
      // provider) from seeing the new value.
      console.error('[workspace-write-plus] switch listener failed:', error)
    }
  }
}

/** One-shot guard: only the first plugin row registers the section. */
let settingsInstalled = false

/**
 * Backend registration: installs the settings section once (idempotent
 * across the fs/shell rows and the package-root row) and keeps the shared
 * switches in sync. Call from a class-plugin constructor (Cordis awaits
 * ctx.inject inside the fiber); the package-root apply() path is also safe:
 * whichever row arrives first wins.
 */
export function ensureSettingsRegistered(ctx, entryConfig) {
  if (settingsInstalled) return
  settingsInstalled = true
  // The registering backend's config may carry its own fields (cwd, ...);
  // project only the switch keys into the settings base layer.
  const base = pickSwitches(entryConfig)
  installSettings(ctx, base, (getCurrent) => {
    publishSwitches(getCurrent?.() ?? base)
  })
}

function pickSwitches(config) {
  if (config === undefined || config === null) return undefined
  const out = {}
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof config[key] === 'boolean') out[key] = config[key]
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Read the current effective switches (backends call this per operation). */
export function currentSwitches() {
  return state.switches
}

/**
 * Package-root registration: installs the settings section once and keeps
 * the shared switches in sync. Safe to call from the root apply() only.
 */
export function registerSettings(ctx, entryConfig) {
  if (settingsInstalled) return
  settingsInstalled = true
  installSettings(ctx, entryConfig, (getCurrent) => {
    publishSwitches(getCurrent?.() ?? resolveSettings(undefined, entryConfig))
  })
}
