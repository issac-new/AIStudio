<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore, type ChannelKind, type CollabChannel } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const router = useRouter()
const { t } = useI18n()
const menuOpen = ref(false)

function navigateRoute(ch: CollabChannel) {
  store.selectChannel(ch.id)
  if (ch.routeTarget) {
    router.push(ch.routeTarget)
  }
}

const KIND_ICON: Record<ChannelKind, string> = { matrix: '👥', chat: '💬', group: '🗣', plain: '📡' }

const newOptions: { kind: ChannelKind; labelKey: string; descKey: string }[] = [
  { kind: 'matrix', labelKey: 'cockpit.newMatrix', descKey: 'cockpit.newMatrixDesc' },
  { kind: 'chat', labelKey: 'cockpit.newChat', descKey: 'cockpit.newChatDesc' },
  { kind: 'group', labelKey: 'cockpit.newGroup', descKey: 'cockpit.newGroupDesc' },
]

function pickNew(kind: ChannelKind) {
  menuOpen.value = false
  // P4 占位：创建频道；真实接入需后端
  console.log('new collab', kind)
}
</script>

<template>
  <div class="cockpit-collab-bar">
    <span class="cockpit-collab-bar__label">{{ t('cockpit.collabWith') }}</span>
    <button
      v-for="c in store.channelsForSelectedTask"
      :key="c.id"
      type="button"
      :data-channel-id="c.id"
      class="cockpit-collab-bar__chip"
      @click="navigateRoute(c)"
    >
      <span class="cockpit-collab-bar__chip-icon">{{ KIND_ICON[c.kind] }}</span>
      <span class="cockpit-collab-bar__chip-label">{{ c.label }}</span>
      <span v-if="c.routeTarget" class="cockpit-collab-bar__chip-nav" :title="t('cockpit.openFull')" @click.stop="navigateRoute(c)">↗</span>
    </button>
    <button class="cockpit-collab-bar__add" type="button" data-action="add" @click="menuOpen = !menuOpen">
      <span>＋</span>
      <span>{{ t('cockpit.addCollab') }}</span>
    </button>
    <div v-if="menuOpen" class="cockpit-collab-bar__menu">
      <div class="cockpit-collab-bar__menu-head">{{ t('cockpit.addCollabTitle') }}</div>
      <button
        v-for="opt in newOptions"
        :key="opt.kind"
        type="button"
        :data-new-kind="opt.kind"
        class="cockpit-collab-bar__menu-opt"
        @click="pickNew(opt.kind)"
      >
        <span class="cockpit-collab-bar__menu-icon">{{ KIND_ICON[opt.kind] }}</span>
        <span>
          <div class="cockpit-collab-bar__menu-name">{{ t(opt.labelKey) }}</div>
          <div class="cockpit-collab-bar__menu-desc">{{ t(opt.descKey) }}</div>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-collab-bar { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); position: relative; flex-wrap: wrap; }
.cockpit-collab-bar__label { font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.cockpit-collab-bar__chip { display: flex; align-items: center; gap: 5px; font-size: 11px; padding: 3px 10px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit; transition: border-color 0.12s, color 0.12s, background 0.12s;
  &:hover { border-color: var(--text-muted); color: var(--text-primary); }
}
.cockpit-collab-bar__chip-icon { font-size: 11px; }
.cockpit-collab-bar__chip-count { font-size: 10px; color: var(--text-muted); }
.cockpit-collab-bar__chip-nav {
  font-size: 10px; color: var(--text-muted); cursor: pointer; margin-left: 2px;
  padding: 1px 3px; border-radius: 3px; line-height: 1;
  &:hover { color: var(--accent-primary); background: var(--bg-secondary); }
}
.cockpit-collab-bar__add { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 10px; border: 1px solid var(--accent-primary); border-radius: 6px; background: var(--accent-primary); color: var(--text-on-accent); cursor: pointer; font-weight: 600; font: inherit;
  &:hover { background: var(--accent-hover); }
}
.cockpit-collab-bar__menu { position: absolute; top: 36px; right: 12px; width: 230px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.12); z-index: 30; overflow: hidden; }
.cockpit-collab-bar__menu-head { padding: 9px 12px; border-bottom: 1px solid var(--border-color); font-size: 11px; font-weight: 700; color: var(--text-primary); }
.cockpit-collab-bar__menu-opt { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font: inherit; border-bottom: 1px solid var(--border-color);
  &:last-child { border-bottom: none; }
  &:hover { background: var(--bg-secondary); }
}
.cockpit-collab-bar__menu-icon { font-size: 14px; margin-top: 1px; color: var(--text-secondary); }
.cockpit-collab-bar__menu-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-collab-bar__menu-desc { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
</style>
