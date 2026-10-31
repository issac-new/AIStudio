import { beforeEach, expect, it, vi } from 'vitest'
import { dirname, parse, resolve } from 'node:path'

const state = vi.hoisted(() => ({ home: '', canonical: '', readdir: vi.fn(), realpath: vi.fn(), git: vi.fn(), save: vi.fn() }))
vi.mock('os', async importOriginal => ({ ...await importOriginal<typeof import('os')>(), homedir: () => state.home }))
vi.mock('fs', async importOriginal => ({ ...await importOriginal<typeof import('fs')>(),
  readdirSync: state.readdir, realpathSync: state.realpath, statSync: () => ({ isDirectory: () => true }),
}))
vi.mock('child_process', async importOriginal => ({ ...await importOriginal<typeof import('child_process')>(), execFileSync: state.git }))
vi.mock('../../packages/server/src/modules/studio/public/logging', () => ({ logger: { warn: vi.fn() } }))
vi.mock('../../packages/server/src/modules/studio/repositories/workspace-run-changes-store', () => ({ saveWorkspaceRunChange: state.save }))

beforeEach(() => {
  vi.resetModules()
  state.home = resolve('snapshot-test-root', 'home')
  state.canonical = ''
  state.readdir.mockReset().mockImplementation(() => { throw new Error('A protected directory read must not be attempted') })
  state.realpath.mockReset().mockImplementation(path => state.canonical || path)
  state.git.mockReset().mockImplementation(() => { throw new Error('Not a Git repository') })
  state.save.mockReset()
})

it.each(['home', 'parent', 'volume'])('runs without scanning or creating a diff when the workspace is the user %s', async kind => {
  const workspace = kind === 'home' ? state.home : kind === 'parent' ? dirname(state.home) : parse(state.home).root
  const tracker = await import('../../packages/server/src/modules/studio/services/chat-run/workspace-diff-tracker')
  tracker.startWorkspaceRunCheckpoint({ sessionId: 'scheduled', runId: kind, workspace })
  expect(tracker.completeWorkspaceRunCheckpoint({ sessionId: 'scheduled', runId: kind, workspace })).toBeNull()
  expect(state.readdir).not.toHaveBeenCalled()
  expect(state.realpath).not.toHaveBeenCalled()
  expect(state.git).not.toHaveBeenCalled()
  expect(state.save).not.toHaveBeenCalled()
})

it('does not scan a symlink whose canonical workspace is the home directory', async () => {
  state.canonical = state.home
  const workspace = resolve('snapshot-home-alias')
  const tracker = await import('../../packages/server/src/modules/studio/services/chat-run/workspace-diff-tracker')
  tracker.startWorkspaceRunCheckpoint({ sessionId: 'alias', runId: 'alias', workspace })
  expect(tracker.completeWorkspaceRunCheckpoint({ sessionId: 'alias', runId: 'alias', workspace })).toBeNull()
  expect(state.readdir).not.toHaveBeenCalled()
  expect(state.save).not.toHaveBeenCalled()
})

it('does not snapshot a home-wide Git root reached through a project directory', async () => {
  state.git.mockReturnValue(state.home)
  const workspace = resolve(state.home, 'project')
  const tracker = await import('../../packages/server/src/modules/studio/services/chat-run/workspace-diff-tracker')
  tracker.startWorkspaceRunCheckpoint({ sessionId: 'home-git', runId: 'home-git', workspace })
  expect(tracker.completeWorkspaceRunCheckpoint({ sessionId: 'home-git', runId: 'home-git', workspace })).toBeNull()
  expect(state.git).toHaveBeenCalledTimes(1)
  expect(state.readdir).not.toHaveBeenCalled()
  expect(state.save).not.toHaveBeenCalled()
})
