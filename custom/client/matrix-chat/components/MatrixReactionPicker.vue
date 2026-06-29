<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'

interface Props {
  eventId: string | null
  visible: boolean
  /**
   * Triggering button's bounding rect, used to anchor the picker above the
   * button (mirrors element-web `aboveLeftOf(buttonRect)` for the react menu).
   * When omitted the picker falls back to absolute positioning relative to its
   * host (kept for backward compatibility with the inline emoji toolbar).
   */
  anchorRect?: DOMRect | null
}

const props = withDefaults(defineProps<Props>(), {
  anchorRect: null,
})
const emit = defineEmits<{
  close: []
  select: [emoji: string]
}>()

const pickerRef = ref<HTMLElement | null>(null)
const composerStore = useMatrixComposerStore()

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys & Emotion',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👁️‍🗨️','🗨️','🗯️','💭','💤'],
  },
  {
    name: 'People & Body',
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴️','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘','🛀','🛌','👭','👫','👬','💏','💑','👪','🗣️','👤','👥','🫂','👣'],
  },
  {
    name: 'Animals & Nature',
    emojis: ['🐵','🐒','🦍','🦧','🐶','🐕','🦮','🐩','🐺','🦊','🦝','🐱','🐈','🦁','🐯','🐅','🐆','🐴','🐎','🦄','🦓','🦌','🦬','🐮','🐂','🐃','🐄','🐷','🐖','🐗','🐽','🐏','🐑','🐐','🐪','🐫','🦙','🦒','🐘','🦣','🦏','🦛','🐭','🐁','🐀','🐹','🐰','🐇','🐿️','🦫','🦔','🦇','🐻','🐨','🐼','🦥','🦦','🦨','🦘','🦡','🐾','🦃','🐔','🐓','🐣','🐤','🐥','🐦','🐧','🕊️','🦅','🦆','🦢','🦉','🦤','🪶','🦩','🦚','🦜','🐸','🐊','🐢','🦎','🐍','🐲','🐉','🦕','🦖','🐳','🐋','🐬','🦭','🐟','🐠','🐡','🦈','🐙','🐚','🐌','🦋','🐛','🐜','🐝','🪲','🐞','🦗','🪳','🕷️','🕸️','🦂','🦟','🪰','🪱','🦠','💐','🌸','💮','🏵️','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🪴','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🍄','🌰','🦀','🦞','🦐','🦑','🌍','🌎','🌏','🌐','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌙','🌚','🌛','🌜','☀️','🌝','🌞','⭐','🌟','🌠','☁️','⛅','⛈️','🌤️','🌥️','🌦️','🌧️','🌨️','❄️','🌬️','💨','💧','💦','☔','☂️','🌊','🌫️'],
  },
  {
    name: 'Food & Drink',
    emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🍍','🥝','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧋','🧃','🧉','🧊'],
  },
  {
    name: 'Activities',
    emojis: ['🎃','🎄','🎆','🎇','🧨','✨','🎈','🎉','🎊','🎋','🎍','🎎','🎏','🎐','🎑','🧧','🎀','🎁','🎗️','🎟️','🎫','🎖️','🏆','🏅','🥇','🥈','🥉','⚽','⚾','🥎','🏀','🏐','🏈','🏉','🎾','🥏','🎳','🏏','🏑','🏒','🥍','🏓','🏸','🥊','🥋','🥅','⛳','⛸️','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪀','🪁','🎱','🔮','🪄','🧿','🎮','🕹️','🎰','🎲','🧩','🧸','🪅','🪆','♠️','♥️','♦️','♣️','♟️','🃏','🀄','🎴','🎭','🖼️','🎨','🧵','🪡','🧶','🪢','👓','🕶️','🥽','🥼','🦺','👔','👕','👖','🧣','🧤','🧥','🧦','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🛍️','🎒','🩴','👞','👟','🥾','🥿','👠','👡','🩰','👢','👑','👒','🎩','🎓','🧢','🪖','⛑️','📿','💄','💍','💎','🔇','🔈','🔉','🔊','📢','📣','📯','🔔','🔕','🎼','🎵','🎶','🎙️','🎚️','🎛️','🎤','🎧','📻','🎷','🪗','🎸','🎹','🎺','🎻','🪕','🥁','🪘','📱','📲','☎️','📞','📟','📠','🔋','🔌','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💽','💾','💿','📀','🧮','🎥','🎞️','📽️','🎬','📺','📷','📸','📹','📼','🔍','🔎','🕯️','💡','🔦','🏮','🪔','📔','📕','📖','📗','📘','📙','📚','📓','📒','📃','📜','📄','📰','🗞️','📑','🔖','🏷️','💰','🪙','💴','💵','💶','💷','💸','💳','🧾','💹','✉️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮','🗳️','✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝','💼','📁','📂','🗂️','📅','📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔫','🪃','🏹','🛡️','🪚','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🪝','🧰','🧲','🪜','⚗️','🧪','🧫','🧬','🔬','🔭','📡','💉','🩸','💊','🩹','🩺','🌡️','🚪','🛗','🪞','🪟','🛏️','🛋️','🪑','🚽','🪠','🚿','🛁','🪤','🪒','🧴','🧷','🧹','🧺','🧻','🪣','🧼','🪥','🧽','🧯','🛒','🚬','⚰️','🪦','⚱️','🗿','🪧','🪤'],
  },
  {
    name: 'Symbols',
    emojis: ['🏧','🚮','🚰','♿','🚹','🚺','🚻','🚼','🚾','🛂','🛃','🛄','🛅','⚠️','🚸','⛔','🚫','🚳','🚭','🚯','🚱','🚷','📵','🔞','☢️','☣️','⬆️','↗️','➡️','↘️','⬇️','↙️','⬅️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔃','🔄','🔙','🔚','🔛','🔜','🔝','🛐','⚛️','🕉️','✡️','☸️','☯️','✝️','☦️','☪️','☮️','🕎','🔯','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🔀','🔁','🔂','▶️','⏩','⏭️','⏯️','◀️','⏪','⏮️','🔼','⏫','🔽','⏬','⏸️','⏹️','⏺️','⏏️','🎦','🔅','🔆','📶','📳','📴','♀️','♂️','⚧️','✖️','➕','➖','➗','♾️','‼️','⁉️','❓','❔','❕','❗','〰️','💱','💲','⚕️','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❎','➰','➿','〽️','✳️','✴️','❇️','©️','®️','™️','#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔠','🔡','🔢','🔣','🔤','🅰️','🅱️','🆎','🆑','🆒','🆓','ℹ️','🆔','Ⓜ','🆕','🆖','🅾️','🆗','🅿️','🆘','🆙','🆚','🈁','🈂️','🈷️','🈶','🈯','🉐','🈹','🈚','🈲','🉑','🈸','🈴','🈳','㊗️','㊙️','🈺','🈵','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫','⬛','⬜','◼️','◻️','◾','◽','▪️','▫️','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔳','🔲'],
  },
]

const activeCategory = ref(0)

// ─── Selected emojis (mirror element-web ReactionPicker.selectedEmojis) ────
// Reactive: re-evaluates whenever the event's reactions change (the store's
// getEventReactions reads SDK relations, which mutate the same ref the
// reactions row already depends on for live updates).
const selectedKeys = computed<Set<string>>(() => composerStore.getMyReactionKeys(props.eventId))

function isSelected(emoji: string): boolean {
  return selectedKeys.value.has(emoji)
}

// Whether the user is allowed to redact their own reactions (mirror
// element-web ReactionPicker.isEmojiDisabled: cannot toggle off when
// canSelfRedact is false).
const canSelfRedact = computed(() => composerStore.canSelfRedact)

function isEmojiDisabled(emoji: string): boolean {
  // element-web: disable an already-reacted emoji only when the user lacks
  // redact power (they cannot toggle it off).
  if (!isSelected(emoji)) return false
  return !canSelfRedact.value
}

// ─── Toggle: send if not present, redact if present (mirror onChoose) ───────
async function selectEmoji(emoji: string) {
  if (isEmojiDisabled(emoji)) return
  // The store's toggleReaction mirrors element-web ReactionPicker.onChoose:
  //   existing my-reaction → redactEvent; otherwise → send m.reaction.
  await composerStore.toggleReaction(props.eventId, emoji)
  emit('select', emoji)
  emit('close')
}

function handleClickOutside(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

// ─── Anchor positioning (mirror element-web aboveLeftOf(buttonRect)) ────────
// When an anchorRect is provided, position the picker above the trigger
// button so the emoji grid appears in the same place every time regardless of
// where the tile sits in the layout.
const pickerStyle = computed<Record<string, string>>(() => {
  const rect = props.anchorRect
  if (!rect) return {}
  const top = Math.max(8, rect.top - 8) // 8px gap above the button; picker height flips via transform
  return {
    left: `${rect.left}px`,
    top: `${top}px`,
    transform: 'translateY(-100%)',
  }
})

// Reset to the first category each time the picker opens.
watch(() => props.visible, (v) => {
  if (v) activeCategory.value = 0
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    v-if="visible"
    ref="pickerRef"
    class="reaction-picker"
    :class="{ 'reaction-picker--floating': anchorRect }"
    :style="pickerStyle"
  >
    <div class="reaction-picker-categories">
      <button
        v-for="(cat, idx) in EMOJI_CATEGORIES"
        :key="cat.name"
        class="reaction-picker-category-tab"
        :class="{ 'reaction-picker-category-tab--active': idx === activeCategory }"
        :title="cat.name"
        @click="activeCategory = idx"
      >
        {{ cat.emojis[0] }}
      </button>
    </div>
    <div class="reaction-picker-emoji-grid">
      <button
        v-for="emoji in EMOJI_CATEGORIES[activeCategory].emojis"
        :key="emoji"
        class="reaction-picker-emoji-btn"
        :class="{
          'reaction-picker-emoji-btn--selected': isSelected(emoji),
          'reaction-picker-emoji-btn--disabled': isEmojiDisabled(emoji),
        }"
        :disabled="isEmojiDisabled(emoji)"
        @click="selectEmoji(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.reaction-picker {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 20;
  background: var(--bg-card);
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  width: 320px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
}

// Floating variant: anchored to the trigger button rect (element-web parity)
.reaction-picker--floating {
  position: fixed;
  bottom: auto;
  left: auto;
}

.reaction-picker-categories {
  display: flex;
  gap: 2px;
  padding: 8px;
  border-bottom: 1px solid $border-color;
  overflow-x: auto;
  flex-shrink: 0;
}

.reaction-picker-category-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: $radius-sm;
  cursor: pointer;
  font-size: 18px;
  transition: background $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.08);
  }

  &--active {
    background: rgba(var(--accent-primary-rgb), 0.12);
  }
}

.reaction-picker-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 8px;
  overflow-y: auto;
}

.reaction-picker-emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: $radius-sm;
  cursor: pointer;
  font-size: 20px;
  transition: background $transition-fast;

  &:hover {
    background: rgba(var(--accent-primary-rgb), 0.08);
  }

  // Highlight the current user's existing reaction (element-web selected state)
  &--selected {
    background: rgba(var(--accent-primary-rgb), 0.14);
    box-shadow: inset 0 0 0 1px var(--accent-primary, $accent-primary);
  }

  &--disabled {
    opacity: 0.4;
    cursor: not-allowed;

    &:hover {
      background: transparent;
    }
  }
}
</style>
