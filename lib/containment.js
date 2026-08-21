// Path containment mechanics (mirrors @deepseek-ai/dsh-fs-sandbox/src/containment.ts)
import { stat } from 'node:fs/promises'
import { dirname, sep } from 'node:path'

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

function isMissing(error) {
  return typeof error === 'object' && error !== null && MISSING_CODES.has(error.code)
}

function comparablePath(path, caseSensitive) {
  return caseSensitive ? path : path.toLowerCase()
}

function isLexicallyUnder(path, root, caseSensitive) {
  const t = comparablePath(path, caseSensitive)
  const r = comparablePath(root, caseSensitive)
  if (t === r) return true
  const prefix = r.endsWith(sep) ? r : r + sep
  return t.startsWith(prefix)
}

async function statIfPresent(path) {
  try {
    return await stat(path, { bigint: true })
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

export async function isPathUnder(path, root, caseSensitive = process.platform !== 'win32') {
  if (isLexicallyUnder(path, root, caseSensitive)) return true
  const rootInfo = await statIfPresent(root)
  if (!rootInfo) return false
  let ancestor = path
  for (;;) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}
