import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** PATH entries of an env, tolerant of the Windows `Path` casing. */
export function pathEntries(env: NodeJS.ProcessEnv = process.env): string[] {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH'
  return String(env[pathKey] || '').split(delimiter).map(entry => entry.trim()).filter(Boolean)
}

function windowsExecutableSuffixes(env: NodeJS.ProcessEnv): string[] {
  const pathExt = Object.keys(env).find(key => key.toLowerCase() === 'pathext')
  const raw = pathExt ? String(env[pathExt]) : ''
  const suffixes = raw.split(';').map(entry => entry.trim()).filter(Boolean)
  if (!suffixes.length) return ['', '.com', '.exe', '.bat', '.cmd']
  return suffixes.includes('') ? suffixes : ['', ...suffixes].map(suffix => suffix.toLowerCase())
}

export function scanPathForCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): string[] {
  const trimmed = command.trim()
  // Only bare command names are resolvable through PATH; callers resolving
  // explicit paths keep using their own existsSync checks.
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return []
  const suffixes = process.platform === 'win32' ? windowsExecutableSuffixes(env) : ['']
  const found: string[] = []
  for (const dir of pathEntries(env)) {
    for (const suffix of suffixes) {
      const candidate = join(dir, trimmed + suffix)
      if (exists(candidate) && !found.includes(candidate)) found.push(candidate)
    }
  }
  return found
}
