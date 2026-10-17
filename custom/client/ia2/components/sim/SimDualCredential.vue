<script setup lang="ts">
// 双凭证标（R4）：一切「完成」声明必须带 提交号+卡号 双锚，缺一红显缺口。
// 只展示锚，不做核验——核验属服务端反向核验正身（合并铁律：界面不复制语义）。
const props = defineProps<{
  commit?: string | null
  card?: string | null
}>()

const shortCommit = (c: string) => (c.length > 10 ? c.slice(0, 10) : c)
</script>

<template>
  <span class="sim-dual-cred" data-testid="sim-dual-cred">
    <span
      v-if="props.commit"
      class="sim-dual-cred__chip"
      data-testid="sim-dual-cred-commit"
      :title="`提交锚 ${props.commit}`"
    >提交 {{ shortCommit(props.commit) }}</span>
    <span v-else class="sim-dual-cred__chip sim-dual-cred__gap" data-testid="sim-dual-cred-commit-gap">缺提交锚</span>
    <span
      v-if="props.card"
      class="sim-dual-cred__chip"
      data-testid="sim-dual-cred-card"
      :title="`卡锚 ${props.card}`"
    >卡 {{ props.card }}</span>
    <span v-else class="sim-dual-cred__chip sim-dual-cred__gap" data-testid="sim-dual-cred-card-gap">缺卡锚</span>
  </span>
</template>

<style scoped>
.sim-dual-cred {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}
.sim-dual-cred__chip {
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(127, 127, 127, 0.15);
  font-family: ui-monospace, monospace;
}
.sim-dual-cred__gap {
  color: var(--ia-fail);
  background: rgba(221, 51, 51, 0.12);
}
</style>
