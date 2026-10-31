import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {runInNewContext} from 'node:vm'
import {transpileModule} from 'typescript'

const read = (path: string) => readFileSync(path, 'utf8')

describe('approval system notification click targets', () => {
  it('allows only the exact Person root alongside existing Hermes routes in both click handlers',()=>{
    const workerAllow=runInNewContext(`${read('packages/client/public/notification-sw.js')}\nsafeClickUrl`,{self:{addEventListener(){}}})
    const main=read('packages/desktop/src/main/index.ts'),start=main.indexOf('function safeNotificationClickUrl(')
    const code=main.slice(start,main.indexOf("ipcMain.handle('hermes-desktop:notify-completion'",start))
    const desktopAllow=runInNewContext(`${transpileModule(code,{}).outputText}\nsafeNotificationClickUrl`)
    for(const allow of [workerAllow,desktopAllow]) {
      expect(allow('/person')).toBe('/person');expect(allow('/hermes/session/s')).toBe('/hermes/session/s')
      for(const path of ['/person-other','/person/../settings','https://example.com/person','/person?url=evil','/hermes/\\evil']) expect(allow(path)).toBeNull()
    }
  })

  it('routes a safe internal target through Service Worker and Electron notification clicks', () => {
    const serviceWorker = read('packages/client/public/notification-sw.js')
    const desktopMain = read('packages/desktop/src/main/index.ts')
    const desktopPreload = read('packages/desktop/src/preload/index.ts')
    const desktopBridge = read('packages/client/src/utils/desktop-bridge.ts')

    expect(serviceWorker).toContain('safeClickUrl(event.notification.data?.clickUrl)')
    expect(serviceWorker).toContain("value.startsWith('/hermes/')")
    expect(serviceWorker).toContain('client.navigate')
    expect(desktopMain).toContain('safeNotificationClickUrl')
    expect(desktopMain).toContain('webUiHashUrl(clickUrl)')
    expect(desktopPreload).toContain('clickUrl?: string')
    expect(desktopBridge).toContain('clickUrl?: string')
  })

  it('consumes exact Workflow target identity after workflow and run data load', () => {
    const globalPending = read('packages/client/src/components/layout/GlobalPendingActions.vue')
    const workflowView = read('packages/client/src/views/hermes/WorkflowView.vue')
    const chatView = read('packages/client/src/views/hermes/ChatView.vue')
    const globalAgentView = read('packages/client/src/views/hermes/GlobalAgentView.vue')
    const groupChatView = read('packages/client/src/views/hermes/GroupChatView.vue')
    expect(globalPending).toContain('profile: action.profile')
    expect(chatView).toContain('await profilesStore.switchProfile(profile)')
    expect(globalAgentView).toContain('await profilesStore.switchProfile(profile)')
    expect(groupChatView).toContain('await profilesStore.switchProfile(profile)')
    expect(workflowView).toContain("import { useRoute } from 'vue-router'")
    expect(workflowView).toContain('await profilesStore.switchProfile(profile)')
    expect(workflowView).toContain('route.query.workflowId')
    expect(workflowView).toContain('route.query.runId')
    expect(workflowView).toContain('route.query.nodeId')
    expect(workflowView).toContain('route.query.executionId')
    expect(workflowView).toContain('loadWorkflowRuns(workflowId, runId')
    expect(workflowView).toContain('workflowNodeSessionByExecution(run.node_sessions, nodeId, executionId)')
    expect(workflowView).toContain('openWorkflowNodeSession(nodeId, nodeSession)')
  })
})
