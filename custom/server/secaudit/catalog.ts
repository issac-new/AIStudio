// overlay/secaudit 域：审计面目录（攻击面分类与自查清单）。
//
// 12 类面向 Agent 部署的攻击面（映射到 Cloudflare 16 类中本部署可及的子集；
// 原生二进制/内核/移动端 IPC 等本部署不涉及的不列入——列入只会留在 unchecked 噪音里）。
// manual=true 的面靠人工/自助 agent 狩猎；manual=false 的面有只读采集器兜底（自动计数）。
import type { SurfaceClass, SurfaceDefinition } from './types'

export const SURFACE_CATALOG: SurfaceDefinition[] = [
  { class: 'auth_access', name: '认证与访问', focus: '登录/令牌/账户侧路（默认口令、超级管理员旁路、JWT 伪签）', manual: true },
  { class: 'tool_exec', name: '工具执行', focus: '命令/脚本执行链（审批旁路、危险命令形态、rlimit/沙箱边界）', manual: false, collector: 'tool_exec' },
  { class: 'skills', name: '技能注册', focus: 'SKILL.md/脚本形态（内联 shell、curl|sh、密钥形、越权路径）', manual: false, collector: 'skills' },
  { class: 'mcp', name: 'MCP 注册', focus: 'server 命令/env/外联/仿名（下载即执行、内嵌密钥、typosquat）', manual: false, collector: 'mcp' },
  { class: 'supply_chain', name: '供应链与发布', focus: '依赖/补丁/构建链（npm audit、补丁注入完整性、dist 一致性）', manual: true },
  { class: 'secrets', name: '密钥与凭据', focus: '环境变量/配置文件内嵌密钥、令牌落盘、日志泄漏', manual: false, collector: 'secrets' },
  { class: 'browser_net', name: '浏览器与网络', focus: '外联主机白/黑名单、URL 护栏、远程更新源', manual: true },
  { class: 'data_lifecycle', name: '数据隔离与留存', focus: 'store/账本/证据的读写边界、留存与轮换、跨租户隔离', manual: true },
  { class: 'prompt_injection', name: '提示词注入', focus: '工具结果注入、外发内容重写、护栏旁路', manual: true },
  { class: 'agents', name: 'Agent 与影子进程', focus: '未注册 profile、孤儿进程、越权 profile 复用', manual: false, collector: 'agents' },
  { class: 'availability', name: '资源与可用性', focus: '资源耗尽（token 预算/并发/磁盘）、看门狗失效、熔断缺口', manual: true },
  { class: 'human_review', name: '人工评审与治理', focus: '审批绑定提交、自证漏洞、熔断与回滚、夜间扫描覆盖', manual: false, collector: 'review' },
]

export function surfaceDefinition(cls: SurfaceClass): SurfaceDefinition | undefined {
  return SURFACE_CATALOG.find((d) => d.class === cls)
}

export function surfaceClasses(): SurfaceClass[] {
  return SURFACE_CATALOG.map((d) => d.class)
}
