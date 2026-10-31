import { expect, test } from '@playwright/test'
import { authenticate, mockHermesApi, TEST_ACCESS_KEY } from './fixtures'

test('updates an unopened single chat from shared background and read states', async ({ page }, testInfo) => {
  await authenticate(page)
  const sessions = ['Current conversation', 'Remote conversation'].map((title, index) => ({
    id: `shared-state-${index}`, title, profile: 'default', source: 'builtin_agent', agent: 'ekko-agent',
    model: 'test-model', provider: 'test-provider', started_at: 2 - index, last_active: 2 - index, message_count: 1,
  }))
  await page.addInitScript(() => {
    ;(window as any).__PW_CHAT_SOCKET_RESUMES__ = Object.fromEntries([0, 1].map(index => [`shared-state-${index}`, {
      session_id: `shared-state-${index}`, isWorking: false, events: [], messages: [],
    }]))
  })
  await mockHermesApi(page, { sessions })
  await page.goto('/#/hermes/session/shared-state-0')
  const row = page.locator('.session-item').filter({ hasText: 'Remote conversation' }).first()
  await expect(row).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).__PW_CHAT_SOCKET__?.allSockets?.some((socket: any) => socket.options?.query?.session_state === '1'))).toBe(true)
  const update = async (working: boolean, backgroundPending: number, unread: boolean) => page.evaluate(state => {
    const socket = (window as any).__PW_CHAT_SOCKET__.allSockets.find((socket: any) => socket.options?.query?.session_state === '1')
    socket.__trigger('sessions.state.updated', state)
  }, { sessionId: 'shared-state-1', working, backgroundPending, unread, lastMessageId: 10, readMessageId: unread ? 0 : 10 })
  await update(true, 0, false)
  await expect(row.locator('.session-item-agent-logo-wrap.streaming')).toBeVisible()
  await update(true, 2, true)
  await expect(row.locator('.session-item-agent-logo-wrap.streaming')).toBeVisible()
  await expect(row.locator('.session-item-unread-dot')).toHaveCount(0)
  await update(false, 0, true)
  await expect(row.locator('.session-item-agent-logo-wrap.streaming')).toHaveCount(0)
  await expect(row.locator('.session-item-unread-dot')).toBeVisible()
  // A receipt from another device clears unread without opening this transcript.
  await update(false, 0, false)
  await expect(row.locator('.session-item-unread-dot')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('single-chat-shared-state.png') })
})

// All session data and socket traffic in this test are fixtures, not live tasks.
test('restores sidebar delegation activity on reload and keeps it scoped during navigation', async ({ page }, testInfo) => {
  await authenticate(page, TEST_ACCESS_KEY, 'research')
  const sessions = ['Delegated fixture', 'Idle fixture'].map((title, index) => ({
    id: `sidebar-fixture-${index}`, title, profile: 'research', source: 'api_server',
    model: 'test-model', provider: 'test-provider', started_at: 2 - index,
    last_active: 2 - index, message_count: 1,
  }))
  await page.addInitScript(() => {
    const pending = window.localStorage.getItem('fixture-background-finished') ? 0 : 2
    ;(window as any).__PW_CHAT_SOCKET_RESUMES__ = Object.fromEntries([0, 1].map(index => {
      const sid = `sidebar-fixture-${index}`
      return [sid, {
        session_id: sid, isWorking: false, backgroundPending: index === 0 ? pending : 0,
        messages: [{ id: index + 1, role: 'assistant', content: `Fixture answer ${index}`, timestamp: 1, finish_reason: 'stop' }],
        // Stale task history must never override the authoritative aggregate.
        events: index === 0 ? [{ event: 'subagent.start', data: {
          event: 'subagent.start', session_id: sid, subagent_id: 'historical-child',
          goal: 'Historical fixture task', background_pending: 7,
        } }] : [],
      }]
    }))
  })
  const api = await mockHermesApi(page, { sessions })
  await page.goto('/#/hermes/chat')
  const delegated = page.locator('.session-item').filter({ hasText: 'Delegated fixture' })
  const idle = page.locator('.session-item').filter({ hasText: 'Idle fixture' })
  const working = delegated.locator('.session-item-agent-logo-wrap.streaming')
  await expect(working).toHaveCount(2)
  await expect(page.getByPlaceholder('Type a message... (Enter to send, Shift+Enter for new line)')).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)

  await idle.first().click()
  await expect(page.getByText('Fixture answer 1', { exact: true })).toBeVisible()
  await expect(working).toHaveCount(2)
  await expect(idle.locator('.session-item-agent-logo-wrap.streaming')).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('04-mocked-navigated-background.png') })

  await delegated.first().click()
  await expect(page.getByText('Fixture answer 0', { exact: true })).toBeVisible()
  await page.reload()
  await expect(working).toHaveCount(2)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('05-mocked-reloaded-background.png') })

  await page.evaluate(() => {
    const state = (window as any).__PW_CHAT_SOCKET__
    state.broadcast('delegation.updated', {
      event: 'delegation.updated', session_id: 'sidebar-fixture-0',
      status: 'cancelled', background_pending: 1,
    })
  })
  await expect(working).toHaveCount(2)
  await page.evaluate(() => {
    ;(window as any).__PW_CHAT_SOCKET__.broadcast('delegation.updated', {
      event: 'delegation.updated', session_id: 'sidebar-fixture-0',
      status: 'failed', background_pending: 0,
    })
    window.localStorage.setItem('fixture-background-finished', '1')
  })
  await expect(working).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Fixture answer 0', { exact: true })).toBeVisible()
  await expect(working).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('06-mocked-reloaded-terminal.png') })
  expect(api.unexpectedRequests).toEqual([])
})
