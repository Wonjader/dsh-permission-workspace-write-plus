// Config-file + user-skills + user-profiles + DSH-home allowlist for the
// workspace-write-plus preset.
import { readdirSync } from 'node:fs'
import { basename, join, resolve as resolvePath } from 'node:path'
import { homedir } from 'node:os'
import { isPathUnder } from './containment.js'

const DEFAULT_CONFIG_EXTENSIONS = [
  '.yaml', '.yml', '.json', '.toml', '.ini', '.conf', '.cfg',
  '.properties', '.env', '.settings', '.xml', '.editorconfig',
  '.gitconfig', '.gitignore', '.npmrc', '.pypirc', '.pip', '.npmignore',
]
const DEFAULT_CONFIG_NAMES = [
  'settings.yaml', 'settings.yml', 'settings.json', 'config.yaml', 'config.yml',
  'config.json', 'cordis.yml', 'cordis.patch.yml', 'package.json',
  'tsconfig.json', 'pnpm-workspace.yaml', '.env', '.env.local',
]
const cacheTtlMs = 60_000

let basenameCache

function dshHomeDir() {
  return resolvePath(process.env.DSH_HOME || join(homedir(), '.dsh'))
}

export function defaultSkillsDir() {
  return join(dshHomeDir(), 'skills')
}

export function defaultProfilesDir() {
  return join(dshHomeDir(), 'profiles')
}

export function defaultDshHome() {
  return dshHomeDir()
}

function isConfigName(path, extensions, names) {
  const base = basename(path).toLowerCase()
  if (names.includes(base)) return true
  return extensions.some(ext => base.endsWith(ext))
}

function workspaceBasenames(root, maxDepth = 8, maxEntries = 20000) {
  const now = Date.now()
  if (basenameCache && basenameCache.root === root && basenameCache.expiresAt > now) {
    return basenameCache.names
  }
  const names = new Set()
  const walk = (dir, depth) => {
    if (depth > maxDepth || names.size > maxEntries) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      names.add(entry.name.toLowerCase())
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1)
    }
  }
  walk(root, 0)
  basenameCache = { root, names, expiresAt: now + cacheTtlMs }
  return names
}

/**
 * workspace-write-plus extra write allowlist:
 *  1. config-type files OUTSIDE the workspace with no same-named counterpart
 *     inside it (originals of workspace copies stay off-limits), or
 *  2. files under the user DSH skills directory (`<DSH_HOME>/skills`), or
 *  3. files under the user DSH profiles directory (`<DSH_HOME>/profiles`),
 *     where DSH installs plugin packages and profile composition files, or
 *  4. files under the user DSH home directory (`<DSH_HOME>`, compatibility).
 * Each category has an independent switch (default on); turning one off
 * removes only that allowance.
 */
export async function isAllowedExtra(targetPath, workspaceRoot, options) {
  const extensions = options?.configExtensions ?? DEFAULT_CONFIG_EXTENSIONS
  const names = options?.configNames ?? DEFAULT_CONFIG_NAMES
  const skillsDir = options?.skillsDir ?? defaultSkillsDir()
  const profilesDir = options?.profilesDir ?? defaultProfilesDir()
  const dshHome = options?.dshHome ?? defaultDshHome()
  const allowConfigFiles = options?.allowConfigFiles !== false
  const allowSkills = options?.allowSkills !== false
  const allowProfiles = options?.allowProfiles !== false
  const allowDshHome = options?.allowDshHome !== false
  if (allowConfigFiles && isConfigName(targetPath, extensions, names)) {
    const name = basename(targetPath).toLowerCase()
    if (!workspaceBasenames(workspaceRoot).has(name)) return true
  }
  if (allowSkills && await isPathUnder(targetPath, skillsDir).catch(() => false)) return true
  if (allowProfiles && await isPathUnder(targetPath, profilesDir).catch(() => false)) return true
  if (allowDshHome && await isPathUnder(targetPath, dshHome).catch(() => false)) return true
  return false
}

export function clearBasenameCache() {
  basenameCache = undefined
}
