// Shared: is a session running under the workspace-write-plus preset?
// Accepts the historical "workspace-plus-config" key so sessions that picked
// the preset before the rename keep their elevated behavior.
const PLUS_PRESET_KEYS = new Set(['workspace-write-plus', 'workspace-plus-config'])

/**
 * The session's event log across harness generations. Current harnesses expose
 * it through `snapshotEvents()` / `ownEvents()` — synchronous reads are
 * deprecated, but the raw `permission/preset` intent is the only signal that
 * survives two presets sharing one sandbox/approval bundle (workspace-write and
 * workspace-write-plus DO share one), so the derived projection cannot tell
 * them apart. Older harnesses expose a plain `events` array; a harness with
 * none of the three yields undefined, which fails closed.
 * @param session - the session to read.
 * @returns the events, or undefined when this harness exposes none of them.
 */
function sessionEvents(session) {
  for (const reader of ['snapshotEvents', 'ownEvents']) {
    if (typeof session[reader] === 'function') {
      try {
        const events = session[reader]()
        if (Array.isArray(events)) return events
      } catch {
        // Fall through to the next reader.
      }
    }
  }
  return Array.isArray(session.events) ? session.events : undefined
}

/**
 * Last answer per session, keyed by the log length. The decision comes from the
 * newest `permission/preset` event, so a session whose log has not grown cannot
 * have changed it; the cache keeps a per-write check off the event snapshot.
 */
const presetCache = new WeakMap()

/**
 * Is a session running under the workspace-write-plus preset?
 * @param ctx - plugin context (`ctx.sessions`).
 * @param sessionId - the session to inspect.
 * @returns true when the newest `permission/preset` event names this preset.
 */
export function isPlusConfigSession(ctx, sessionId) {
  if (!sessionId) return false
  let session
  try {
    session = ctx.sessions.get(sessionId)
  } catch {
    return false
  }
  if (session === undefined || session === null) return false

  let seq = -1
  try {
    if (typeof session.seq === 'number') seq = session.seq
  } catch {
    // A harness without the cheap sequence getter simply skips the cache.
  }
  if (seq >= 0) {
    const cached = presetCache.get(session)
    if (cached !== undefined && cached.seq === seq) return cached.plus
  }

  let plus = false
  const events = sessionEvents(session)
  if (events !== undefined) {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i]
      if (ev && ev.type === 'permission/preset') {
        plus = PLUS_PRESET_KEYS.has(ev.data?.preset)
        break
      }
    }
  }
  if (seq >= 0) presetCache.set(session, { seq, plus })
  return plus
}
