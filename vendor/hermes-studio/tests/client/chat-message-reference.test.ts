// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { formatMessageWithReference, formatReferencedContentForDisplay, parseMessageReference } from '@/stores/hermes/chat'

describe('single-chat message references', () => {
  it('formats a referenced message as a readable Markdown quote', () => {
    expect(formatMessageWithReference({
      id: 'assistant-1',
      role: 'assistant',
      content: 'First line\n\nSecond line',
    }, 'Continue from this answer')).toBe([
      '<quoted_message>',
      'First line',
      '',
      'Second line',
      '</quoted_message>',
      '',
      'Continue from this answer',
    ].join('\n'))
  })

  it('supports an attachment-only reply while preserving the reference', () => {
    expect(formatMessageWithReference({
      id: 'user-1',
      role: 'user',
      content: 'Review this file',
    }, '')).toBe([
      '<quoted_message>',
      'Review this file',
      '</quoted_message>',
    ].join('\n'))
  })

  it('parses agent markup for clean display without exposing the tags', () => {
    const parsed = parseMessageReference([
      '<quoted_message sender="Worker">',
      '@Reviewer previous answer',
      '</quoted_message>',
      '',
      'Continue from there',
    ].join('\n'))

    expect(parsed).toEqual({
      content: '@Reviewer previous answer',
      reply: 'Continue from there',
    })
    expect(formatReferencedContentForDisplay(parsed!.content)).toBe('> @Reviewer previous answer')
  })
})
