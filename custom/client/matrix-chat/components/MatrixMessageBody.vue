<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import MatrixSenderProfile from './MatrixSenderProfile.vue'

interface Props {
  displayContent: string
  formattedContent: string | null
  msgType: string
  isBigEmoji: boolean
  isEdited: boolean
  sender: string
}

const props = defineProps<Props>()
const { t } = useI18n()

const isEmote = computed(() => props.msgType === 'm.emote')

// ─── HTML content rendering helper ────────────────────────
function renderHtmlContent() {
  const html = props.formattedContent
  if (!html) return null
  return h('div', {
    class: 'mx_EventTile_html markdown-body',
    innerHTML: sanitizeHtml(html),
  })
}

function sanitizeHtml(html: string): string {
  const allowedTags = ['b', 'i', 'em', 'strong', 'u', 's', 'strike', 'del', 'a', 'p', 'br', 'pre', 'code', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'span', 'div', 'sup', 'sub']
  const allowedAttrs: Record<string, string[]> = {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['data-mx-spoiler', 'data-mx-color'],
    code: ['class'],
    pre: ['class'],
  }
  
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  function cleanNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode()
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (!allowedTags.includes(tag)) {
      const fragment = document.createDocumentFragment()
      el.childNodes.forEach((child) => {
        const cleaned = cleanNode(child)
        if (cleaned) fragment.appendChild(cleaned)
      })
      return fragment
    }
    
    const newEl = document.createElement(tag)
    const attrs = allowedAttrs[tag] || []
    attrs.forEach((attr) => {
      if (el.hasAttribute(attr)) {
        let val = el.getAttribute(attr)!
        if (attr === 'href' && !val.startsWith('#') && !val.startsWith('http')) {
          val = '#'
        }
        newEl.setAttribute(attr, val)
      }
    })
    
    if (tag === 'a') {
      newEl.setAttribute('rel', 'noopener noreferrer')
      newEl.setAttribute('target', '_blank')
    }
    
    el.childNodes.forEach((child) => {
      const cleaned = cleanNode(child)
      if (cleaned) newEl.appendChild(cleaned)
    })
    return newEl
  }
  
  const fragment = document.createDocumentFragment()
  doc.body.childNodes.forEach((child) => {
    const cleaned = cleanNode(child)
    if (cleaned) fragment.appendChild(cleaned)
  })
  
  const container = document.createElement('div')
  container.appendChild(fragment)
  return container.innerHTML
}
</script>

<template>
  <div class="mx_EventTile_content" :class="{ 'mx_EventTile_content--big-emoji': isBigEmoji }">
    <!-- Emote message -->
    <div v-if="isEmote" class="mx_EventTile_emote">
      * <MatrixSenderProfile :user-id="sender" /> {{ displayContent }}
      <span v-if="isEdited" class="mx_EventTile_edited">{{ t('matrixChat.edited') }}</span>
    </div>

    <!-- HTML formatted message -->
    <component :is="renderHtmlContent" v-else-if="formattedContent && !isBigEmoji" />

    <!-- Plain text message -->
    <div v-else class="mx_EventTile_body" :class="{ 'mx_EventTile_body--big-emoji': isBigEmoji }">
      {{ displayContent }}
      <span v-if="isEdited" class="mx_EventTile_edited">{{ t('matrixChat.edited') }}</span>
    </div>
  </div>
</template>
