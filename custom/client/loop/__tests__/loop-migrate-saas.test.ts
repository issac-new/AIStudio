// overlay/custom/client/loop/__tests__/loop-migrate-saas.test.ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { resolve } from 'path'

describe('Loop Migration (Matrix → SaaS)', () => {
  it('migration script file exists', () => {
    expect(existsSync(resolve(process.cwd(), 'scripts/loop-migrate-saas.mjs'))).toBe(true)
  })
})
