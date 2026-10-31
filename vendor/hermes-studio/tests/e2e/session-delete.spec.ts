import { expect, test } from '@playwright/test'
import { authenticate, mockChatSocket, mockHermesApi } from './fixtures'

for (const method of ['single', 'batch'] as const) {
  test(`shows the new-chat page after ${method} deletion of the last conversation`, async ({ page }, testInfo) => {
    const session = { id: 'last-active', title: 'Last active conversation', source: 'cli', agent: 'hermes', profile: 'default', model: 'test-model', provider: 'test-provider', started_at: 1_800_000_000, message_count: 0 }
    const sessions = [session]
    if (method === 'batch') sessions.push({ ...session, id: 'second-chat', title: 'Second conversation' })
    const initialIds = sessions.map(item => item.id)
    const deleted: string[] = []
    await authenticate(page)
    await mockChatSocket(page)
    await mockHermesApi(page, { sessions })
    await page.addInitScript(session => {
      (window as any).__PW_CHAT_SOCKET_RESUMES__ = { [session.id]: { session_id: session.id, title: session.title, messages: [], isWorking: false, events: [] } }
    }, session)
    await page.route('**/api/studio/sessions/last-active*', route => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      deleted.push(session.id)
      sessions.splice(0)
      return route.fulfill({ json: { ok: true } })
    })
    await page.route('**/api/studio/sessions/batch-delete', route => {
      const body = route.request().postDataJSON()
      deleted.push(...body.ids)
      sessions.splice(0)
      return route.fulfill({ json: { deleted: body.ids.length, failed: 0, errors: [] } })
    })
    await page.goto('/#/hermes/session/last-active')
    await expect(page.locator('.header-session-title')).toHaveText(session.title)
    const sidebar = page.locator('.chat-panel > .session-list')
    if (method === 'single') {
      const row = sidebar.locator('.session-item').filter({ hasText: session.title }).first()
      await row.hover()
      await row.locator('.session-item-delete').click()
    } else {
      await sidebar.getByRole('button', { name: 'Session list actions', exact: true }).click()
      await page.locator('.n-dropdown-option:visible').filter({ hasText: /^Batch selection$/ }).click()
      const toolbar = sidebar.locator('.session-list-toolbar')
      await toolbar.getByRole('button', { name: 'Select all', exact: true }).click()
      await expect(toolbar).toContainText(`${initialIds.length} selected`)
      await toolbar.getByRole('button', { name: 'Delete', exact: true }).click()
    }
    await page.locator('.n-popconfirm').getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(sidebar.locator('.session-item')).toHaveCount(0)
    await expect(sidebar.locator('.session-empty')).toBeVisible()
    await expect(page).toHaveURL(/#\/hermes\/chat$/)
    const draft = page.locator('.new-chat-page')
    await expect(draft).toBeVisible()
    await expect(page.locator('.message-list')).toHaveCount(0)
    expect(deleted).toEqual(initialIds)
    await page.screenshot({ path: testInfo.outputPath('empty-new-chat.png') })
    await page.reload()
    await expect(sidebar.locator('.session-empty')).toBeVisible()
    await expect(sidebar.locator('.session-item')).toHaveCount(0)
    await expect(draft).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(draft).toBeVisible()
    expect(await page.evaluate(() => (window as any).__PW_CHAT_SOCKET__.emitted.filter((event: any) => event.event === 'run'))).toEqual([])
    await draft.locator('.input-textarea').fill('Start after deleting every conversation')
    await draft.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(draft).toBeHidden()
    await expect(page).toHaveURL(/#\/hermes\/session\/(?!last-active)[^/?]+$/)
    await expect.poll(() => page.evaluate(() => (window as any).__PW_CHAT_SOCKET__.emitted.filter((event: any) => event.event === 'run').length)).toBe(1)
  })
}

test('keeps the remaining conversation visible when batch deletion partly fails', async ({ page }) => {
  const sessions = ['deleted-chat', 'kept-chat'].map(id => ({ id, title: id, source: 'cli', profile: 'default', started_at: 1, message_count: 0 }))
  await authenticate(page)
  await mockChatSocket(page)
  await mockHermesApi(page, { sessions })
  await page.addInitScript(ids => {
    (window as any).__PW_CHAT_SOCKET_RESUMES__ = Object.fromEntries(ids.map(id => [id, {
      session_id: id, messages: [], isWorking: false, events: [],
    }]))
  }, sessions.map(session => session.id))
  await page.route('**/api/studio/sessions/batch-delete', route => {
    sessions.splice(0, 1)
    return route.fulfill({ json: { deleted: 1, failed: 1, errors: [{ id: 'kept-chat', error: 'Delete failed' }] } })
  })
  await page.goto('/#/hermes/session/deleted-chat')
  await expect(page.locator('.header-session-title')).toHaveText('deleted-chat')
  const sidebar = page.locator('.chat-panel > .session-list')
  await sidebar.getByRole('button', { name: 'Session list actions', exact: true }).click()
  await page.locator('.n-dropdown-option:visible').filter({ hasText: /^Batch selection$/ }).click()
  const toolbar = sidebar.locator('.session-list-toolbar')
  await toolbar.getByRole('button', { name: 'Select all', exact: true }).click()
  await toolbar.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.locator('.n-popconfirm').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page).toHaveURL(/#\/hermes\/session\/kept-chat$/)
  await expect(page.locator('.header-session-title')).toHaveText('kept-chat')
  await expect(page.locator('.new-chat-page')).toHaveCount(0)
})

test('waits for the session list before showing an existing conversation with no messages', async ({ page }) => {
  const session = { id: 'existing-chat', title: 'Existing empty conversation', source: 'cli', profile: 'default', started_at: 1, message_count: 0 }
  await authenticate(page)
  await mockChatSocket(page)
  await mockHermesApi(page, { sessions: [session] })
  await page.addInitScript(id => {
    (window as any).__PW_CHAT_SOCKET_RESUMES__ = { [id]: { session_id: id, messages: [], isWorking: false, events: [] } }
  }, session.id)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route(/\/api\/studio\/sessions(?:\?.*)?$/, async route => {
    await pending
    await route.fallback()
  })
  try {
    await page.goto('/#/hermes/chat')
    await expect(page.locator('.chat-view')).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('.new-chat-page')).toHaveCount(0)
  } finally { release() }
  await expect(page.locator('.header-session-title')).toHaveText(session.title)
  await expect(page.locator('.new-chat-page')).toHaveCount(0)
})

test('loads newly available conversations when returning from an empty chat page', async ({ page }) => {
  const sessions: any[] = []
  await authenticate(page)
  await mockChatSocket(page)
  await mockHermesApi(page, { sessions })
  await page.addInitScript(() => {
    (window as any).__PW_CHAT_SOCKET_RESUMES__ = { 'newly-available': {
      session_id: 'newly-available', messages: [], isWorking: false, events: [],
    } }
  })
  await page.goto('/#/hermes/chat')
  await expect(page.locator('.new-chat-page')).toBeVisible()
  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page).toHaveURL(/#\/hermes\/history$/)
  sessions.push({ id: 'newly-available', title: 'Newly available conversation', source: 'cli', profile: 'default', started_at: 1, message_count: 0 })
  await page.getByRole('link', { name: 'Chat', exact: true }).click()
  await expect(page.locator('.header-session-title')).toHaveText('Newly available conversation')
  await expect(page.locator('.new-chat-page')).toHaveCount(0)
})
