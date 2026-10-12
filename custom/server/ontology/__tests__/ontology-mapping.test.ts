import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seedSpec } from '../ontology-seed'

const SRC = readFileSync(join(__dirname, '..', 'ontology-mapping.txt'), 'utf-8')
const LINES = SRC.split('\n').filter((l) => l.startsWith('term-map:'))

describe('本体映射注册表（P1-2）', () => {
  it('每条五字段齐备且载体类型合法', () => {
    expect(LINES.length).toBeGreaterThanOrEqual(15)
    for (const l of LINES) {
      const parts = l.split('|').map((s) => s.trim())
      expect(parts.length).toBe(7)
      expect(['kanban', 'file', 'endpoint', 'event']).toContain(parts[3])
      expect(['read', 'write', 'both']).toContain(parts[5])
    }
  })

  it('映射实体须与种子本体对账（RFD/Verdict/Run/EvidenceFrame 为新增预案）', () => {
    const spec = seedSpec()
    const seedIds = new Set(spec.entityTypes.map((e) => e.id))
    const known = new Set([...seedIds, 'RFD', 'Verdict', 'Run', 'EvidenceFrame', 'IssueRow', 'DispRow', 'Milestone'])
    for (const l of LINES) {
      const entity = l.split('|')[0].trim().replace('term-map:', '')
      expect(known.has(entity)).toBe(true)
    }
  })
})
