// overlay/custom/client/ide/utils/diagram-api.ts
// 图产物机械验收客户端 API（/api/hermes/diagram/*，服务端契约镜像，spec 项3）。

export interface DiagramCheckFindingDto {
  file: string
  message: string
}

export interface DiagramCheckResultDto {
  ok: boolean
  files: Array<{ path: string; ok: boolean }>
  findings: DiagramCheckFindingDto[]
  runnerError?: string
  durationMs: number
}

export async function checkDiagram(path: string, offline = false): Promise<DiagramCheckResultDto> {
  // 懒加载 @/api/client（同 mermaid-brand.ts 注释：模块级 import 击穿无 DOM 测试环境）
  const { request } = await import('@/api/client')
  return request<DiagramCheckResultDto>('/api/hermes/diagram/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, offline }),
    credentials: 'same-origin',
  })
}
