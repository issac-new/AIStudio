// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PersonBotPicker from '@/components/hermes/person/PersonBotPicker.vue'
import { PERSON_BOTS } from '../../packages/shared/person-bots'

vi.mock('@/utils/person-bot-label', () => ({ personBotLabel: (bot: { type: string }) => bot.type }))
vi.mock('@/utils/deployment-url', () => ({ deploymentUrl: (path: string) => path }))

describe('Person Bot carousel', () => {
  let wrapper: VueWrapper
  let viewport: HTMLElement
  const step = 114
  const count = PERSON_BOTS.length
  const selected = () => wrapper.get('[aria-pressed="true"]')

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    wrapper = mount(PersonBotPicker, {
      props: { value: PERSON_BOTS[0].type, 'onUpdate:value': (value: string) => wrapper.setProps({ value }) },
      attachTo: document.body,
    })
    viewport = wrapper.get('.person-bot-viewport').element as HTMLElement
    Object.defineProperty(viewport, 'clientWidth', { value: 300 })
    wrapper.findAll('.person-bot-slot').forEach((slot, position) => Object.defineProperties(slot.element, {
      offsetLeft: { value: 100 + position * step }, offsetWidth: { value: 100 },
    }))
    viewport.scrollTo = vi.fn((options: ScrollToOptions) => {
      if (options.behavior !== 'smooth') viewport.scrollLeft = options.left!
    }) as typeof viewport.scrollTo
    viewport.scrollBy = vi.fn((options: ScrollToOptions) => { viewport.scrollLeft += options.left! }) as typeof viewport.scrollBy
    await nextTick()
    await nextTick()
    vi.advanceTimersByTime(60)
    await nextTick()
  })

  afterEach(() => {
    wrapper.unmount()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('keeps selecting the visible Bot when touch scrolling arrives after the finger lifts', async () => {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, { bubbles: true })
      Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: 7 } })
      viewport.dispatchEvent(event)
    }
    viewport.scrollLeft = (count + 3) * step
    await wrapper.get('.person-bot-viewport').trigger('scroll')
    expect(selected().attributes('data-bot')).toBe(PERSON_BOTS[3].type)
    expect(wrapper.props('value')).toBe(PERSON_BOTS[3].type)
  })

  it('handles a final scroll arriving after an earlier scrollend without needing another gesture', async () => {
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: step, cancelable: true }))
    await wrapper.get('.person-bot-viewport').trigger('scroll')
    await wrapper.get('.person-bot-viewport').trigger('scrollend')
    viewport.scrollLeft = (count + 5) * step
    await wrapper.get('.person-bot-viewport').trigger('scroll')
    expect(selected().attributes('data-bot')).toBe(PERSON_BOTS[5].type)
  })

  it('recovers selection after an interrupted smooth centering never reaches its target', async () => {
    await wrapper.findAll('.person-bot-option')[count + 4].trigger('click')
    vi.advanceTimersByTime(1201)
    viewport.scrollLeft = (count + 2) * step
    await wrapper.get('.person-bot-viewport').trigger('scroll')
    expect(selected().attributes('data-bot')).toBe(PERSON_BOTS[2].type)
  })

  it('ignores focus-induced scrolling after the user moves to another control', async () => {
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: step, cancelable: true }))
    await wrapper.get('.person-bot-viewport').trigger('scroll')
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    viewport.scrollLeft = (count + 5) * step
    await wrapper.get('.person-bot-viewport').trigger('scroll')
    expect(selected().attributes('data-bot')).toBe(PERSON_BOTS[1].type)
  })

})
