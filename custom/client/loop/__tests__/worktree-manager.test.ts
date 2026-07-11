// overlay/custom/client/loop/__tests__/worktree-manager.test.ts
import { describe, it, expect } from 'vitest'
import { WorktreeManager } from '../../../server/loop/engine/worktree-manager'
import type { TaskContract } from '../types'

describe('WorktreeManager', () => {
  it('removes a non-existent worktree without error', async () => {
    const wm = new WorktreeManager('.loop-test-wt')
    await expect(wm.remove('nonexistent')).resolves.not.toThrow()
  })
})
