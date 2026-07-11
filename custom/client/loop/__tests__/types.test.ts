// overlay/custom/client/loop/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import { PATTERN_TEMPLATES, type LoopPattern } from '../types'

describe('PATTERN_TEMPLATES', () => {
  const allPatterns: LoopPattern[] = [
    'daily-triage', 'pr-babysitter', 'ci-sweeper', 'dep-sweeper',
    'changelog-drafter', 'post-merge-cleanup', 'issue-triage',
  ]

  it('has a template for every pattern', () => {
    for (const p of allPatterns) {
      expect(PATTERN_TEMPLATES[p]).toBeDefined()
      expect(PATTERN_TEMPLATES[p].pattern).toBe(p)
    }
  })

  it('every template has a valid cron expression', () => {
    for (const p of allPatterns) {
      expect(PATTERN_TEMPLATES[p].defaultCron).toMatch(/^[\d*/,-]+(\s[\d*/,-]+)+$/)
    }
  })
})
