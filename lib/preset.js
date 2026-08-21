// Shared: is a session running under the workspace-write-plus preset?
// Accepts the historical "workspace-plus-config" key so sessions that picked
// the preset before the rename keep their elevated behavior.
const PLUS_PRESET_KEYS = new Set(['workspace-write-plus', 'workspace-plus-config'])

export function isPlusConfigSession(ctx, sessionId) {
  if (!sessionId) return false
  let session
  try {
    session = ctx.sessions.get(sessionId)
  } catch {
    return false
  }
  const events = session?.events
  if (!Array.isArray(events)) return false
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i]
    if (ev && ev.type === 'permission/preset') {
      return PLUS_PRESET_KEYS.has(ev.data?.preset)
    }
  }
  return false
}
