// Matrix 凭据校验器行为守门（2026-10-31 日常工作台回归批②）。
// 网关免密自动登录链按设计写空 deviceId（matrix-client.ts 头注：空 deviceId 的
// client 走 /sync 正常）；校验器曾因空 deviceId 判无凭据，自动登录会话的房间画布
// 恒「未认证」、matrix client 永不启动（走查实录 0 次 :8008 请求）。
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { getMatrixCredentials, storeMatrixCredentials } from '../stores/matrix-credentials'

beforeEach(() => {
  localStorage.clear()
})

describe('getMatrixCredentials 必填集', () => {
  it('空 deviceId（网关自动登录形态）不判 null——accessToken/userId/homeserver 才是必填', () => {
    storeMatrixCredentials({
      accessToken: 'syt_x', userId: '@swarm:matrix.test', deviceId: '', homeserverUrl: 'http://127.0.0.1:8008',
    })
    expect(getMatrixCredentials()).toEqual({
      accessToken: 'syt_x', userId: '@swarm:matrix.test', deviceId: '', homeserverUrl: 'http://127.0.0.1:8008',
    })
  })

  it('键缺席仍判 null（缺 token / 缺 userId / 缺 homeserver 三态）', () => {
    localStorage.setItem('matrix_access_token', 'syt_x')
    localStorage.setItem('matrix_user_id', '@swarm:matrix.test')
    expect(getMatrixCredentials()).toBeNull()
    localStorage.setItem('matrix_homeserver_url', 'http://127.0.0.1:8008')
    localStorage.removeItem('matrix_access_token')
    expect(getMatrixCredentials()).toBeNull()
    localStorage.setItem('matrix_access_token', 'syt_x')
    localStorage.removeItem('matrix_user_id')
    expect(getMatrixCredentials()).toBeNull()
  })
})
