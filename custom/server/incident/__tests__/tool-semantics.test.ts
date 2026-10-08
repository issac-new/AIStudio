// overlay/custom/server/incident/__tests__/tool-semantics.test.ts
// 工具语义层（六文调研轮 H1）守门测试：语义鸿弥合 + 敏感值不落语义层 + 诚实降级。
import { describe, it, expect } from 'vitest'
import { describeToolCall } from '../tool-semantics'

describe('describeToolCall', () => {
  it('browser_navigate 带 URL → 精确到域名', () => {
    const s = describeToolCall('browser_navigate', { url: 'https://mp.weixin.qq.com/s/abc' })
    expect(s?.phrase).toContain('mp.weixin.qq.com')
    expect(s?.grain).toBe('exact')
  })

  it('browser_click 只有坐标 → 如实标注语义鸿沟（不硬造）', () => {
    const s = describeToolCall('browser_click', { x: 843, y: 421 })
    expect(s?.grain).toBe('generic')
    expect(s?.phrase).toContain('语义未留痕')
  })

  it('browser_click 带元素描述 → 精确语义', () => {
    const s = describeToolCall('browser_click', { description: '确认支付按钮' })
    expect(s?.phrase).toContain('确认支付按钮')
  })

  it('terminal_exec 命令只取前 4 词（长命令不全文进报告层）', () => {
    const s = describeToolCall('terminal_exec', { command: 'npm run build -- --mode production --config /very/long/path' })
    expect(s?.phrase).toBe('执行命令 npm run build --')
  })

  it('敏感语义：browser_type 输入内容不落短语；memory_write 只留标题', () => {
    const t = describeToolCall('browser_type', { selector: '密码输入框', text: 'p@ssw0rd123' })
    expect(t?.phrase).not.toContain('p@ssw0rd')
    const m = describeToolCall('memory_write', { title: '部署流程', content: ' SECRET=abc' })
    expect(m?.phrase).toContain('部署流程')
    expect(m?.phrase).not.toContain('SECRET')
  })

  it('未识别工具 → null（诚实降级不硬造语义）', () => {
    expect(describeToolCall('some_future_tool', { a: 1 })).toBeNull()
    expect(describeToolCall('browser_navigate')).toBeTruthy()  // 无参时给 generic 档
  })
})
