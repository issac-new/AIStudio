// overlay/custom/server/incident/tool-semantics.ts
// 工具事件业务语义层（六文调研轮 H1，论文 Semantic Gap：日志记 click(x=843,y=421)，
// 调查员要的是"点了确认支付按钮"）。
//
// 纯函数：tool 调用（名+实参）→ 业务动作短语。只读实参中安全字段（路径/URL/命令
// 首段），不落敏感值（密钥/token 类键名一律不读值——脱敏纪律）。未识别工具返回
// null 如实降级，不硬造语义。
export interface ToolSemantic {
  /** 业务动作短语（人话，如"访问 example.com""执行命令 npm run build"）。 */
  phrase: string
  /** 语义粒度：exact=按实参生成；generic=仅工具名级别。 */
  grain: 'exact' | 'generic'
}

/** 值安全提取：只取白名单键，且只留前 60 字符（防长命令全文进报告层）。 */
function safeStr(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = args?.[key]
  if (typeof v !== 'string' || !v.trim()) return undefined
  return v.trim().slice(0, 60)
}

/** 敏感键防御：这些键的值绝不读（即使未来加进白名单也先过这里）。 */
const SENSITIVE_KEYS = /token|secret|password|apikey|api_key|credential|authorization/i

export function describeToolCall(tool: string, args?: unknown): ToolSemantic | null {
  const a = (args && typeof args === 'object' && !Array.isArray(args)) ? args as Record<string, unknown> : undefined
  switch (tool) {
    case 'browser_navigate': {
      const url = safeStr(a, 'url')
      if (url) return { phrase: `访问网页 ${hostOf(url)}`, grain: 'exact' }
      return { phrase: '打开网页（URL 未留痕）', grain: 'generic' }
    }
    case 'browser_click': {
      const desc = safeStr(a, 'description') ?? safeStr(a, 'element') ?? safeStr(a, 'selector')
      if (desc) return { phrase: `点击页面元素「${desc}」`, grain: 'exact' }
      return { phrase: '点击页面（元素语义未留痕——坐标级日志，语义鸿沟实例）', grain: 'generic' }
    }
    case 'browser_type': {
      const sel = safeStr(a, 'description') ?? safeStr(a, 'selector')
      // 输入内容不进语义层（可能含敏感信息）；只描述"在哪个输入框打字"
      return { phrase: sel ? `在「${sel}」输入内容（内容值不落语义层）` : '页面输入（目标未留痕）', grain: sel ? 'exact' : 'generic' }
    }
    case 'terminal_exec': {
      const cmd = safeStr(a, 'command')
      if (cmd) return { phrase: `执行命令 ${cmd.split(/\s+/).slice(0, 4).join(' ')}`, grain: 'exact' }
      return { phrase: '执行终端命令（命令文本未留痕）', grain: 'generic' }
    }
    case 'code_exec': {
      const lang = safeStr(a, 'language') ?? safeStr(a, 'runtime')
      return { phrase: `执行${lang ? ` ${lang}` : ''}代码（代码体不落语义层）`, grain: lang ? 'exact' : 'generic' }
    }
    case 'write_file': {
      const p = safeStr(a, 'path') ?? safeStr(a, 'file_path')
      if (p) return { phrase: `写入文件 ${p}`, grain: 'exact' }
      return { phrase: '写入文件（路径未留痕）', grain: 'generic' }
    }
    case 'read_file': {
      const p = safeStr(a, 'path') ?? safeStr(a, 'file_path')
      if (p) return { phrase: `读取文件 ${p}`, grain: 'exact' }
      return { phrase: '读取文件（路径未留痕）', grain: 'generic' }
    }
    case 'delegate_task': {
      const label = safeStr(a, 'label') ?? safeStr(a, 'agent') ?? safeStr(a, 'description')
      return { phrase: `派生子任务${label ? `：${label}` : '（目标未留痕）'}`, grain: label ? 'exact' : 'generic' }
    }
    case 'memory_write': {
      const title = safeStr(a, 'title') ?? safeStr(a, 'content')
      return { phrase: `写入长期记忆${title ? `「${title}」` : ''}（内容体不落语义层）`, grain: title ? 'exact' : 'generic' }
    }
    case 'memory_search': {
      const q = safeStr(a, 'query') ?? safeStr(a, 'q')
      return { phrase: `检索记忆${q ? `：${q}` : ''}`, grain: q ? 'exact' : 'generic' }
    }
    default:
      return null  // 未识别工具：不硬造语义（诚实降级）
  }
}

function hostOf(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.host
  } catch {
    return url.slice(0, 40)
  }
}

export { SENSITIVE_KEYS }
