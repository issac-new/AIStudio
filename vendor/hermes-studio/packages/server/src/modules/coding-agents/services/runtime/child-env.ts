const CODING_AGENT_CHILD_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM',
  'TMP', 'TEMP', 'TMPDIR',
  'LANG', 'LANGUAGE', 'TZ',
  'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy',
  'NODE_PATH', 'NODE_EXTRA_CA_CERTS',
])

const CODING_AGENT_CHILD_ENV_KEYS_WIN32 = new Set(
  [...CODING_AGENT_CHILD_ENV_KEYS].map(key => key.toLowerCase()),
)

function isAllowedChildEnvKey(key: string): boolean {
  // Windows env vars are case-insensitive but Object.entries preserves the
  // registered casing (commonly `Path`, `windir`), which an exact-match
  // allowlist silently drops. Compare case-insensitively there only; POSIX
  // keys stay case-sensitive.
  if (process.platform === 'win32') return CODING_AGENT_CHILD_ENV_KEYS_WIN32.has(key.toLowerCase())
  return CODING_AGENT_CHILD_ENV_KEYS.has(key)
}

export function isolatedCodingAgentChildEnv(
  launchEnv: NodeJS.ProcessEnv = {},
  sourceEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) continue
    if (isAllowedChildEnvKey(key) || key.startsWith('LC_')) env[key] = value
  }
  for (const [key, value] of Object.entries(launchEnv)) {
    if (value !== undefined) env[key] = value
  }
  return env
}
