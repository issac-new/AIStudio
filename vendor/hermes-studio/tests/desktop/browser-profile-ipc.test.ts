import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserProfileStore } from '../../packages/desktop/src/main/browser/browser-profile-store'
import type { BrowserProfileCreateInput, DesktopBrowserProfile } from '../../packages/desktop/src/main/browser/browser-types'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function loadCreateProfileHandler(store: BrowserProfileStore) {
  const source = readFileSync('packages/desktop/src/main/index.ts', 'utf8')
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
  const statement = ast.statements.find(statement => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false
    const call = statement.expression
    const channel = call.arguments[0]
    return call.expression.getText(ast) === 'ipcMain.handle'
      && channel && ts.isStringLiteral(channel) && channel.text === 'hermes-desktop:browser-create-profile'
  })
  if (!statement) throw new Error('Browser profile creation IPC handler is missing')
  const compiled = ts.transpileModule(statement.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  let handler: ((event: unknown, input: unknown) => Promise<DesktopBrowserProfile>) | undefined
  runInNewContext(compiled, {
    ipcMain: {
      handle: (_channel: string, callback: typeof handler) => { handler = callback },
    },
    browserForEvent: () => ({ createProfile: (input: BrowserProfileCreateInput) => store.create(input) }),
  })
  if (!handler) throw new Error('Browser profile creation IPC handler was not registered')
  return handler
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'ekko-browser-profile-ipc-'))
  roots.push(root)
  const store = new BrowserProfileStore(join(root, 'state'))
  await store.initialize()
  const rootDirectory = join(root, 'work')
  await mkdir(rootDirectory)
  return { createProfile: loadCreateProfileHandler(store), rootDirectory }
}

describe('desktop browser profile creation IPC', () => {
  it.each([undefined, null, '', 'invalid'])('uses the system proxy when the supplied mode is %s', async proxyMode => {
    const { createProfile, rootDirectory } = await setup()
    const profile = await createProfile({}, {
      name: 'Work',
      rootDirectory,
      ...(proxyMode === undefined ? {} : { proxyMode }),
    })
    expect(profile.proxyMode).toBe('system')
    expect(profile.proxyRules).toBe('')
  })

  it.each(['direct', 'system', 'fixed_servers'] as const)('preserves an explicit %s selection', async proxyMode => {
    const { createProfile, rootDirectory } = await setup()
    const proxyRules = proxyMode === 'fixed_servers' ? 'http://127.0.0.1:7890' : ''
    const profile = await createProfile({}, { name: 'Work', rootDirectory, proxyMode, proxyRules })
    expect(profile).toMatchObject({ proxyMode, proxyRules })
  })
})
