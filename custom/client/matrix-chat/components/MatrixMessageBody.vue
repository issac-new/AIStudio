<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import MatrixSenderProfile from './MatrixSenderProfile.vue'
import { getStoredUsername } from '@/api/client'
import { linkifyPlainText } from '../utils/linkify'

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

// P4①②（§五）：纯文本消息的卡链接化 + @我 高亮。linkify 先转义全文再受控替换
// 生成 <a>/<span>，随后再过 sanitizeHtml 白名单（纵深防御双层）。
const linkifiedPlain = computed(() =>
  linkifyPlainText(props.displayContent, getStoredUsername()),
)

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
    a: ['href', 'title', 'rel', 'class'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['data-mx-spoiler', 'data-mx-color', 'class'],
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
        // HERMES_CUSTOM[SecXssMsgBody] BEGIN: URL 属性强制安全协议白名单
        // href/src 仅允许 http(s)/#锚点/matrix:；拒绝 javascript:/data:text-html 等伪协议。
        if (attr === 'href') {
          if (val.startsWith('#')) {
            // 锚点，放行
          } else if (/^https?:\/\//i.test(val) || /^matrix:/i.test(val)) {
            // 安全协议，放行
          } else {
            val = '#'
          }
        } else if (attr === 'src') {
          if (!/^https?:\/\//i.test(val) && !/^mxc:\/\//i.test(val)) {
            // 非图片 URL（mxc:// 是 Matrix 媒体 URI），跳过该属性
            return
          }
        }
        // HERMES_CUSTOM[SecXssMsgBody] END
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

    <!-- Plain text message（P4：卡链接+@我高亮；linkify 转义优先 + sanitize 白名单双层） -->
    <div v-else class="mx_EventTile_body" :class="{ 'mx_EventTile_body--big-emoji': isBigEmoji }">
      <span v-if="linkifiedPlain.cardIds.length || linkifiedPlain.mentionsMe || linkifiedPlain.html !== displayContent"
            class="mx_EventTile_linkified"
            v-html="sanitizeHtml(linkifiedPlain.html)" />
      <template v-else>{{ displayContent }}</template>
      <span v-if="isEdited" class="mx_EventTile_edited">{{ t('matrixChat.edited') }}</span>
    </div>
  </div>
</template>

<style scoped>
/* P4①② 卡链接与 @我 高亮 */
:deep(.mx-card-link) {
  color: var(--accent-primary, #2563eb);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
  background: rgba(37, 99, 235, 0.08);
  border-radius: 4px;
  padding: 0 4px;
  text-decoration: none;
}
:deep(.mx-card-link:hover) { text-decoration: underline; }
:deep(.mx-mention-me) {
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 0 3px;
  font-weight: 600;
}
:deep(.mx-mention) { color: var(--accent-primary, #2563eb); }
</style>
