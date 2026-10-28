// evidence/ 二进制冻结守门（2026-10-28 清偿轮）：
// AGENTS.md 规则 8 要求「中间产物（截图等二进制）不入库」。evidence/ 下 37 个跟踪文件
// 中 34 个 PNG 属 2026-10-28 之前的历史留档，删除会抹掉当时的走验证据，故按「冻结存量、
// 禁新增」处理：本测把 34 条路径写死为白名单，任何新增/漏删都当场红。
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const BINARY_EXT = /\.(png|jpe?g|webp|gif|pdf|zip|mp4|mov)$/i

// 白名单：2026-10-28 冻结的历史证据截图（只许减少并同步改本表，不许新增）
const FROZEN = [
  'evidence/2026-10-18-ide-work-modes/work-mode.png',
  'evidence/20260928-ide-walkthrough/shots/01-login.png',
  'evidence/20260928-ide-walkthrough/shots/02-ide-workspace.png',
  'evidence/20260928-ide-walkthrough/shots/03-model-picker.png',
  'evidence/20260928-ide-walkthrough/shots/04-perm-switcher.png',
  'evidence/20260928-ide-walkthrough/shots/05-mention-picker.png',
  'evidence/20260928-ide-walkthrough/shots/06-recovery-dialog.png',
  'evidence/20260928-ide-walkthrough/shots/07-statusbar-slots.png',
  'evidence/20260928-ide-walkthrough/shots/08-kanban-board.png',
  'evidence/20260928-ide-walkthrough/shots/09-kanban-swimlane.png',
  'evidence/20260928-ide-walkthrough/shots/10-kanban-gantt.png',
  'evidence/20260928-ide-walkthrough/shots/11-tools-timeline.png',
  'evidence/20260928-ide-walkthrough/shots/12-skills-tab.png',
  'evidence/20260928-ide-walkthrough/shots/13-prompt-typed.png',
  'evidence/20260928-ide-walkthrough/shots/14-message-sent.png',
  'evidence/20260928-ide-walkthrough/shots/15-agent-response.png',
  'evidence/20260928-ide-walkthrough/shots/16-task-resent.png',
  'evidence/20260928-ide-walkthrough/shots/17-agent-working.png',
  'evidence/20260928-ide-walkthrough/shots/18-agent-final.png',
  'evidence/20260928-ide-walkthrough/shots/19-tools-with-data.png',
  'evidence/20260928-ide-walkthrough/shots/20-files-pane-status.png',
  'evidence/20261001-flat-tabs-walkthrough/02-accounts-health.png',
  'evidence/20261001-flat-tabs-walkthrough/03-gov-org.png',
  'evidence/20261001-flat-tabs-walkthrough/04-gov-registry.png',
  'evidence/20261001-flat-tabs-walkthrough/05-gov-audit.png',
  'evidence/20261001-flat-tabs-walkthrough/06-gov-docs.png',
  'evidence/20261001-flat-tabs-walkthrough/07-observatory.png',
  'evidence/20261001-flat-tabs-walkthrough/08-trace.png',
  'evidence/20261001-flat-tabs-walkthrough/09-final-board.png',
  'evidence/20261002-swarm-capability-4articles/screenshots/gov-harness.png',
  'evidence/20261002-swarm-capability-4articles/screenshots/gov-org-knowledge.png',
  'evidence/20261002-swarm-capability-4articles/screenshots/gov-org-post-a5.png',
  'evidence/20261002-swarm-capability-4articles/screenshots/ide-context-archive.png',
  'evidence/20261002-swarm-capability-4articles/screenshots/ide-context-archive2.png',
]

function trackedEvidenceBinaries(): string[] {
  const out = execFileSync('git', ['ls-files', 'evidence'], { cwd: ROOT, encoding: 'utf8' })
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && BINARY_EXT.test(l))
    .sort()
}

describe('evidence/ 二进制冻结', () => {
  it('跟踪的二进制集合等于冻结白名单（禁新增；删减须同步改本表）', () => {
    expect(trackedEvidenceBinaries()).toEqual([...FROZEN].sort())
  })

  it('白名单文件均实际在位（防静默丢失历史证据）', () => {
    const missing = FROZEN.filter((f) => !existsSync(resolve(ROOT, f)))
    expect(missing).toEqual([])
  })
})
