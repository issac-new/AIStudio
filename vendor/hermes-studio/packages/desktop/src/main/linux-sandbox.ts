import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface LinuxSandboxProbe {
  /** chrome-sandbox exists next to the binary, is root-owned and SUID. */
  chromeSandboxSetuid?: boolean
  /** /proc/sys/user/max_user_namespaces value; undefined when unreadable. */
  maxUserNamespaces?: number
  /** /proc/sys/kernel/unprivileged_userns_clone (Ubuntu-specific); undefined when absent. */
  unprivilegedUsernsCloneEnabled?: boolean
}

function readNumberFile(path: string): number | undefined {
  try {
    const value = Number.parseInt(readFileSync(path, 'utf-8').trim(), 10)
    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Collect the kernel/packaging facts the sandbox decision needs. Never throws. */
export function probeLinuxSandbox(execPath: string): LinuxSandboxProbe {
  const probe: LinuxSandboxProbe = {
    maxUserNamespaces: readNumberFile('/proc/sys/user/max_user_namespaces'),
  }
  try {
    const cloneRaw = readFileSync('/proc/sys/kernel/unprivileged_userns_clone', 'utf-8').trim()
    if (cloneRaw === '0') probe.unprivilegedUsernsCloneEnabled = false
    else if (cloneRaw === '1') probe.unprivilegedUsernsCloneEnabled = true
  } catch {
    // Not every kernel exposes the Ubuntu-specific clone sysctl.
  }
  try {
    const stats = statSync(join(dirname(execPath), 'chrome-sandbox'))
    probe.chromeSandboxSetuid = stats.uid === 0 && (stats.mode & 0o4000) !== 0
  } catch {
    probe.chromeSandboxSetuid = false
  }
  return probe
}

export interface SandboxRelaunchOptions {
  platform?: NodeJS.Platform
  packaged: boolean
  hasNoSandboxFlag: boolean
  isRoot: boolean
}

/**
 * Kylin/UOS desktops commonly disable unprivileged user namespaces, and
 * AppImage mounts make the SUID chrome-sandbox helper impossible. Without
 * either, Chromium dies at startup ("The SUID sandbox helper binary was
 * found, but is not configured correctly" or a userns failure). Relaunching
 * once with --no-sandbox is the documented fallback; the flag also breaks
 * any relaunch loop.
 */
export function shouldRelaunchWithoutSandbox(probe: LinuxSandboxProbe, options: SandboxRelaunchOptions): boolean {
  if ((options.platform ?? process.platform) !== 'linux') return false
  if (!options.packaged) return false
  if (options.hasNoSandboxFlag || options.isRoot) return false
  if (probe.chromeSandboxSetuid) return false
  const usernsEnabled = (probe.maxUserNamespaces ?? 0) > 0 && probe.unprivilegedUsernsCloneEnabled !== false
  return !usernsEnabled
}
