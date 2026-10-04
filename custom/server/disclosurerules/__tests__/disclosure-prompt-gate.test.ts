// P12 讨好者防线守门：注入树上两个系统提示组装器都必须带 Disclosure of Limits 段。
// 563/564 patch 被误删或漂移时此测试当场红（注入树=upstream 工作区，patch 已应用态）。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const ekkoPrompt = resolve(overlayRoot, '..', 'upstream', 'hermes-studio', 'packages', 'ekko-agent', 'src', 'runtime', 'system-prompt.ts')
const agentPrompt = resolve(overlayRoot, '..', 'upstream', 'hermes-agent', 'agent', 'system_prompt.py')

describe('P12 讨好者防线（patch 563/564 注入态守门）', () => {
  it('ekko TS：EKKO_DISCLOSURE_GUIDELINES 常量 + buildSystemPrompt 接线在位', () => {
    expect(existsSync(ekkoPrompt), 'ekko system-prompt.ts 缺席（注入树未就绪？）').toBe(true)
    const txt = readFileSync(ekkoPrompt, 'utf8')
    expect(txt).toContain('EKKO_DISCLOSURE_GUIDELINES = `## Disclosure of Limits')
    // 正文四条纪律关键词（截断范围/未验证标注/明说不知道/点名未覆盖）
    expect(txt).toContain('state exactly what range you actually saw')
    expect(txt).toContain('I couldn\'t verify X')
    expect(txt).toContain('name what was not covered')
    // 接线：常量确实被 push 进 sections（防"定义了没接线"）
    const body = txt.slice(txt.indexOf('export function buildSystemPrompt'))
    expect(body).toContain('sections.push(EKKO_DISCLOSURE_GUIDELINES)')
  })

  it('hermes python：HERMES_DISCLOSURE_GUIDELINES 常量 + stable 层接线在位', () => {
    expect(existsSync(agentPrompt), 'hermes-agent system_prompt.py 缺席').toBe(true)
    const txt = readFileSync(agentPrompt, 'utf8')
    expect(txt).toContain('HERMES_DISCLOSURE_GUIDELINES = """## Disclosure of Limits')
    // 接线在 stable 层（build_system_prompt_parts 内、guidance 之后）
    const fn = txt.slice(txt.indexOf('def build_system_prompt_parts'))
    expect(fn).toContain('stable_parts.append(HERMES_DISCLOSURE_GUIDELINES)')
  })
})
