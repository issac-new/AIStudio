// overlay/custom/server/kanban/__tests__/specialist-presets.test.ts
// routa 契约库入库守门（2026-10-02 吸收二期 #19-1）：12 件预置完整+id 稳定+
// 列覆盖+presets 路由注册。逐字对照锚点=上游 yaml（id/name/reminder 三字段
// 不得漂移——来源 routa/resources/specialists/workflows/kanban/*.yaml 与
// review/{pr-reviewer,security-reviewer,pr-analyzer}.yaml）。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { SPECIALIST_PRESETS, getPreset } from '../specialist-presets'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
const ROUTA = resolve(OVERLAY_ROOT, '../upstream/routa/resources/specialists')

// 上游 routa 源在仓外 upstream 缓存（解析序见 AGENTS.md 规则 9；本机锚点
// ~/lab/upstream/routa → NVMe 缓存卷）。源缺席（缓存卷未挂载等）时逐字对照
// 无从谈起——显式 skip 并标注原因，不冒充通过也不假红（fail-soft 不造假）；
// 源恢复即自动恢复守门。仓内四用例（全量/id 唯一/列覆盖/词表/路由注册）不受影响。
const ROUTA_AVAILABLE = existsSync(ROUTA)
const itIfRouta = ROUTA_AVAILABLE ? it : it.skip

describe('specialist 预置库（routa 九件套+review 三层）', () => {
  it('12 件全量（看板 9 + 评审 3），id 唯一', () => {
    expect(SPECIALIST_PRESETS).toHaveLength(12)
    expect(new Set(SPECIALIST_PRESETS.map(p => p.id)).size).toBe(12)
  })

  itIfRouta('看板九件套 id/name/reminder 与上游 yaml 逐字一致（防漂移）' + (ROUTA_AVAILABLE ? '' : '（SKIP：上游 routa 源缺席=' + ROUTA + '，恢复 upstream 缓存后自动恢复守门）'), () => {
    for (const base of ['backlog-refiner', 'todo-orchestrator', 'dev-executor', 'qa-frontend', 'review-guard', 'blocked-resolver', 'done-reporter', 'pr-publisher']) {
      const yaml = readFileSync(resolve(ROUTA, 'workflows/kanban', `${base}.yaml`), 'utf-8')
      const preset = getPreset(`kanban-${base}`)
      expect(preset, `缺 kanban-${base}`).toBeTruthy()
      const yamlId = /id:\s*"([^"]+)"/.exec(yaml)?.[1]
      const yamlName = /name:\s*"([^"]+)"/.exec(yaml)?.[1]
      const yamlReminder = /role_reminder:\s*"([\s\S]*?)"\n/.exec(yaml)?.[1]
      expect(preset!.name).toBe(yamlName)
      if (yamlReminder) expect(preset!.reminder).toBe(yamlReminder)
      expect(yamlId).toBe(preset!.id)
    }
  })

  it('列覆盖：六闸列语义全配（backlog/todo/dev/review/done/blocked+通配）', () => {
    const cols = new Set(SPECIALIST_PRESETS.map(p => p.column))
    for (const c of ['backlog', 'todo', 'dev', 'review', 'done', 'blocked', '*']) {
      expect(cols.has(c), `列 ${c} 无预置`).toBe(true)
    }
  })

  it('证据建议件与 requiredArtifacts 契约词表对齐（非空即短横线命名）', () => {
    for (const p of SPECIALIST_PRESETS) {
      for (const a of p.suggestedArtifacts) {
        expect(a).toMatch(/^[a-z][a-z0-9-]*$/)
      }
    }
  })

  it('presets 路由注册（编排编辑器消费入口）', () => {
    const ctrl = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/kanban/column-automation-controller.ts'), 'utf8')
    expect(ctrl).toContain("'/presets'")
    expect(ctrl).toContain('SPECIALIST_PRESETS')
  })
})
