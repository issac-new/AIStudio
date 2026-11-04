// delegate 脚本静态断言（AgentTeams 吸收批二「执行记录写口」第 4 项）。
// 动态驱动测试不可行（需 zcode 引擎 + ACP 桥真进程），退而求其次做源级守门：
// 每个退出路径在退出前必有 runs.jsonl 留痕调用。判据来自 spec——没有 transcript
// 的索引条目会隐形，被拒绝的尝试恰恰最该被看见。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const overlayRoot = resolve(__dirname, '..', '..', '..', '..')
const scriptPath = join(overlayRoot, 'runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py')
const skillPath = join(overlayRoot, 'runtime/hermes-skills/coding-delegate/SKILL.md')
const manifestPath = join(overlayRoot, 'runtime-manifest.json')

const script = readFileSync(scriptPath, 'utf8')
const lines = script.split('\n')

/** 收口面：finish() 函数体内必须恰有一次留痕调用（覆盖全部 return finish 路径）。 */
function finishBodyHasRecordCall(): boolean {
  const start = lines.findIndex((l) => l.startsWith('    def finish('))
  if (start < 0) return false
  for (let i = start; i < Math.min(start + 40, lines.length); i++) {
    if (lines[i].startsWith('        return exit_code')) return lines.slice(start, i).some((l) => l.includes('_append_run_record('))
  }
  return false
}

describe('zcode-acp-delegate.py：每个退出路径留痕（runs.jsonl）', () => {
  const exitReturns = lines
    .map((l, i) => ({ text: l, idx: i }))
    .filter(({ text }) => /return EXIT_[A-Z_]+\s*(;|$|\))/.test(text.trim()) || /return finish\(/.test(text))
  const finishReturns = exitReturns.filter(({ text }) => text.includes('return finish('))
  const bareReturns = exitReturns.filter(({ text }) => !text.includes('return finish('))

  it('退出路径总数 ≥7（引擎不可用/超时/协议/早退/正常等全数在场）', () => {
    expect(exitReturns.length, `实际退出点：${exitReturns.length}`).toBeGreaterThanOrEqual(7)
  })

  it('finish() 收口体含留痕调用（return finish 路径全部由此覆盖）', () => {
    expect(finishReturns.length).toBeGreaterThanOrEqual(7)
    expect(finishBodyHasRecordCall(), 'finish() 函数体内未见 _append_run_record 调用').toBe(true)
  })

  it('绕开 finish 的裸 return EXIT_* 前必有 _append_run_record 调用（6 行窗口）', () => {
    for (const r of bareReturns) {
      const window = lines.slice(Math.max(0, r.idx - 6), r.idx)
      expect(
        window.some((l) => l.includes('_append_run_record(')),
        `第 ${r.idx + 1} 行裸退出前未留痕：${r.text.trim()}`,
      ).toBe(true)
    }
  })

  it('runs.jsonl 记录契约完整（v/run/kind/cli/outcome/exit/reason/时间戳/指纹/logBytes）', () => {
    for (const key of ['"v": 1', '"run": run_id', '"kind": "delegate"', '"cli": "zcode-acp"',
      '"outcome"', '"exit"', '"reason"', '"taskId"', '"board"', '"startedAt"', '"endedAt"',
      '"promptSha256"', '"logBytes"']) {
      expect(script).toContain(key)
    }
  })

  it('outcome 映射：0=success / 2=blocked / 3=timeout / 4|5=failed（缺省 failed）', () => {
    expect(script).toContain('{0: "success", 2: "blocked", 3: "timeout"}')
    expect(script).toContain('.get(exit_code, "failed")')
  })

  it('拒绝短码：engine-not-found 与 task-context 各自到位', () => {
    expect(script).toContain('"engine-not-found"')
    expect(script).toContain('"task-context"')
  })

  it('历史缺陷已修：回执键统一 camelCase（promptSha256），无 snake_case 键残留', () => {
    // 消费方 custom/server/report/evidence-blocks.ts 按 camelCase 读取；
    // 旧 engine-not-found 早退手拼 "prompt_sha256" 键且字段残缺——回归守门
    // （断言带引号的 JSON 键形态，Python 局部变量 prompt_sha 不在此列）。
    expect(script).not.toContain('"prompt_sha256"')
    expect(script).toContain('"promptSha256": prompt_sha')
  })

  it('engine-not-found 早退统一走 finish() 收口（契约单一事实源）', () => {
    expect(script).toContain('return finish(EXIT_ENGINE_MISSING, "engine_not_found")')
    expect(script).not.toContain('write_delegate_result(Path(cwd_override)')
  })
})

describe('SKILL.md / runtime-manifest 同步', () => {
  it('SKILL.md 硬约束声明 runs.jsonl 由脚本自动追加、禁手改', () => {
    const skill = readFileSync(skillPath, 'utf8')
    expect(skill).toContain('`materials/runs.jsonl` 由驱动脚本自动追加')
    expect(skill).toContain('禁手改')
  })

  it('runtime-manifest 已收录脚本与技能卡条目（部署面不缺文件）', () => {
    const manifest = readFileSync(manifestPath, 'utf8')
    expect(manifest).toContain('hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py')
    expect(manifest).toContain('hermes-skills/coding-delegate/SKILL.md')
  })
})
