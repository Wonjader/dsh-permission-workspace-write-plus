// Sleep guard, merged into dsh-permission-workspace-write-plus 0.6.0.
// While any agent turn is in flight, hold the host awake; release on turn
// end and on plugin dispose. Default for all sessions and presets.
//
// Platforms:
//   Windows:     SetThreadExecutionState(ES_CONTINUOUS|ES_SYSTEM_REQUIRED)
//                via a resident PowerShell process (stdin-driven).
//   Linux:       systemd-inhibit --what=sleep held open.
//   macOS:       caffeinate -i (prevent idle sleep) held open.
//   WSL:         Linux guard (systemd-inhibit when available) PLUS a Windows
//                PowerShell guard launched through WSL interop so the
//                WINDOWS HOST stays awake too.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { currentSwitches, watchSwitches } from './settings.js'

const WIN32 = process.platform === 'win32'
const DARWIN = process.platform === 'darwin'
const LINUX = process.platform === 'linux'

const WSL_POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

/** True when running inside WSL (Linux kernel + WSL markers). */
export function isWslEnvironment() {
  if (!LINUX) return false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try {
    return /microsoft|wsl/i.test(readFileSync('/proc/sys/kernel/osrelease', 'utf8'))
  } catch {
    return false
  }
}

const IS_WSL = isWslEnvironment()

/** Executable candidates for the Windows-host wake lock. */
export function windowsGuardCandidates() {
  if (WIN32) return ['powershell']
  if (IS_WSL) {
    const candidates = []
    if (existsSync(WSL_POWERSHELL)) candidates.push(WSL_POWERSHELL)
    candidates.push('powershell.exe')
    return candidates
  }
  return []
}

// Resident PowerShell loop calling kernel32. `2147483649` is parsed as
// UInt32 because 0x80000001 becomes a negative Int32 literal in PowerShell.
// ES_CONTINUOUS | ES_SYSTEM_REQUIRED = hold; ES_CONTINUOUS alone = release.
const PS_LOOP = `
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class E { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f); }';
while ($true) { $line = [Console]::In.ReadLine(); if ($null -eq $line) { break }
  if ($line -eq 'on')  { [E]::SetThreadExecutionState([uint32]::Parse('2147483649')) | Out-Null }
  elseif ($line -eq 'off') { [E]::SetThreadExecutionState([uint32]::Parse('2147483648')) | Out-Null }
  elseif ($line -eq 'exit') { break } }
`

function spawnSystemdGuard() {
  return spawn('systemd-inhibit', [
    '--what=sleep',
    '--who=dsh-permission-workspace-write-plus',
    '--why=agent turn in flight',
    'sleep',
    'infinity',
  ], { stdio: 'ignore', detached: false })
}

function spawnCaffeinateGuard() {
  return spawn('caffeinate', ['-i'], { stdio: 'ignore', detached: false })
}

/**
 * Install the sleep guard on a Cordis context.
 * @param ctx - plugin context (logger optional).
 */
export function apply(ctx) {
  let turnCount = 0
  let winGuard = null
  let posixGuard = null
  let winFailed = false
  let posixFailed = false
  let winCandidateIndex = 0
  const warned = new Set()

  const warnOnce = (key, message) => {
    if (warned.has(key)) return
    warned.add(key)
    try {
      ctx.logger?.warn(message)
    } catch {
      // The guard must never take the plugin down because logging failed.
    }
  }

  const enabled = () => {
    const switches = currentSwitches()
    return switches.enabled !== false && switches.allowSleepGuard !== false
  }

  const releaseWindows = () => {
    if (!winGuard) return
    const proc = winGuard
    winGuard = null
    try {
      proc.stdin.write('off\n')
      proc.stdin.write('exit\n')
      proc.stdin.end()
    } catch {
      try { proc.kill() } catch { /* ignore */ }
    }
  }

  const releasePosix = () => {
    if (!posixGuard) return
    const proc = posixGuard
    posixGuard = null
    try { proc.kill('SIGTERM') } catch { /* ignore */ }
  }

  const releaseAll = () => {
    releaseWindows()
    releasePosix()
  }

  const ensureWindows = () => {
    if (winGuard || winFailed) return
    const candidates = windowsGuardCandidates()
    if (winCandidateIndex >= candidates.length) {
      winFailed = true
      return
    }
    const executable = candidates[winCandidateIndex]
    let proc
    try {
      proc = spawn(executable, [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_LOOP,
      ], {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      })
    } catch {
      winCandidateIndex += 1
      winFailed = winCandidateIndex >= candidates.length
      ensureWindows()
      return
    }
    winGuard = proc
    proc.on('error', (error) => {
      if (winGuard === proc) winGuard = null
      winCandidateIndex += 1
      if (winCandidateIndex >= candidates.length) {
        winFailed = true
        warnOnce('win-spawn', `[workspace-write-plus] Windows sleep guard unavailable: ${String(error)}`)
      } else {
        // Try the next candidate once (e.g. /mnt/c path missing although
        // PATH still carries powershell.exe through WSL interop).
        ensureWindows()
      }
    })
    proc.on('exit', () => {
      if (winGuard === proc) winGuard = null
    })
    try {
      proc.stdin.write('on\n')
    } catch {
      releaseWindows()
    }
  }

  const ensurePosix = () => {
    if (posixGuard || posixFailed) return
    let proc
    try {
      proc = DARWIN ? spawnCaffeinateGuard() : spawnSystemdGuard()
    } catch {
      posixFailed = true
      return
    }
    posixGuard = proc
    proc.on('error', (error) => {
      if (posixGuard === proc) posixGuard = null
      posixFailed = true
      warnOnce('posix-spawn', `[workspace-write-plus] ${DARWIN ? 'caffeinate' : 'systemd-inhibit'} sleep guard unavailable: ${String(error)}`)
    })
    proc.on('exit', () => {
      if (posixGuard === proc) posixGuard = null
    })
  }

  const syncGuards = () => {
    if (turnCount > 0 && enabled()) {
      if (WIN32 || IS_WSL) ensureWindows()
      if (DARWIN || LINUX) ensurePosix()
    } else {
      releaseAll()
    }
  }

  const hold = () => {
    turnCount += 1
    syncGuards()
  }

  const release = () => {
    turnCount = Math.max(0, turnCount - 1)
    if (turnCount === 0) releaseAll()
  }

  // Settings can disable the guard while a turn is still running.
  const offWatch = watchSwitches(() => { syncGuards() })

  // Session events ride the Cordis bus as `session/event` carrying
  // (session, event); turn/start and turn/end are SessionEvent types.
  ctx.on('session/event', (_session, event) => {
    if (event?.type === 'turn/start') hold()
    else if (event?.type === 'turn/end') release()
  })

  ctx.effect(() => () => {
    offWatch()
    turnCount = 0
    releaseAll()
  })
}

export default { name: 'sleep-guard', apply }
