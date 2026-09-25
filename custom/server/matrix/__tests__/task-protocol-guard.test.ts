// 协议镜像对账守门（边界设计 §6-T2）：服务端 task-protocol.ts 的事件类型常量
// 必须与客户端 matrix-teams/protocol.ts 逐字一致；客户端改名/漂移时本测试当场 fail。
// 镜像范围只含 v1 稳定面（assign/receipt），v2 在途字段不镜像、不校验。
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { TASK_ASSIGN_EVENT_TYPE, TASK_RECEIPT_EVENT_TYPE } from '../task-protocol'

const clientProtocolPath = join(__dirname, '..', '..', '..', 'client', 'matrix-teams', 'protocol.ts')

describe('协议镜像对账：服务端 task-protocol ↔ 客户端 protocol', () => {
  const clientSrc = readFileSync(clientProtocolPath, 'utf8')

  it('task.assign 类型字符串逐字一致', () => {
    expect(clientSrc).toContain(`assign: '${TASK_ASSIGN_EVENT_TYPE}'`)
  })

  it('task.receipt 类型字符串逐字一致', () => {
    expect(clientSrc).toContain(`receipt: '${TASK_RECEIPT_EVENT_TYPE}'`)
  })

  it('服务端镜像不含 v2 在途字段（协议 v2 落地后移除本断言并扩镜像）', () => {
    const serverSrc = readFileSync(join(__dirname, '..', 'task-protocol.ts'), 'utf8')
    for (const v2Field of ['parentId', 'capability', 'dependsOn']) {
      expect(serverSrc).not.toContain(`${v2Field}?:`)
    }
  })
})
