// custom/__tests__/precommit-vendor-guard.test.ts
// 守门：pre-commit 垫片 vendor 挡护（2026-10-26 D4 挂账清偿）。
// 背景：2026-10-24 首装版（b7aef6874）带两条职责（spec-first 委托 + vendor 自动撤出），
// 但装配模板未回移，次日全量重生成（ed382ccfa）把挡护段抹掉——AGENTS.md「pre-commit
// 自动撤出」自此空转两天。本测试锁「模板↔产物双向同步」：任一侧丢失挡护三要素当场红。
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const SHIM = readFileSync(resolve(ROOT, '.swarm-yuan/hooks/pre-commit'), 'utf8')
const GEN = readFileSync(resolve(ROOT, 'skills/swarm-yuan/scripts/generate-skill.sh'), 'utf8')

// 挡护三要素：逃生开关判定 / 暂存面探测 / 自动撤出
const GUARD_PROBE = 'git diff --cached --name-only -- vendor/'
const GUARD_RESET = 'git reset -q HEAD -- vendor/'
const GUARD_ESCAPE_NE = '"1"'

describe('pre-commit 垫片 vendor 挡护（模板↔产物双向同步）', () => {
  it('垫片：spec-first 委托带缺席 fail-open（全新克隆不死锁）', () => {
    // 2026-10-28 对账轮：委托脚本改为按检出根三级候选定位（不再写死不入库的 .claude 绝对路径）
    expect(SHIM).toContain('git rev-parse --show-toplevel')
    expect(SHIM).toContain('if [ -n "$SF" ]; then')
    expect(SHIM).toContain('bash "$SF" "$@" || exit $?')
    expect(SHIM).toContain('L2 降级跳过')
    expect(SHIM).not.toContain('/Users/') // 禁写死作者机器路径
  })

  it('垫片：vendor 注入态自动撤出 + VENDOR_SYNC=1 逃生通道', () => {
    expect(SHIM).toContain('${VENDOR_SYNC:-0}')
    expect(SHIM).toContain(GUARD_ESCAPE_NE)
    expect(SHIM).toContain(GUARD_PROBE)
    expect(SHIM).toContain(GUARD_RESET)
    expect(SHIM).toContain('已自动撤出暂存区')
    expect(SHIM.trimEnd().endsWith('exit 0')).toBe(true)
  })

  it('装配模板：挡护段已回移（重生成不得再丢——D2 根因锁）', () => {
    expect(GEN).toContain('\\${VENDOR_SYNC:-0}')   // heredoc 转义形态
    expect(GEN).toContain(GUARD_PROBE)
    expect(GEN).toContain(GUARD_RESET)
    expect(GEN).toContain('已自动撤出暂存区')
    expect(GEN).toContain('\\$SF')                  // 产物字面量 $SF 的模板转义
  })

  it('垫片保持可执行位（装配产物形态）', () => {
    const mode = statSync(resolve(ROOT, '.swarm-yuan/hooks/pre-commit')).mode
    expect(mode & 0o111).not.toBe(0) // 至少一组可执行位
  })
})
