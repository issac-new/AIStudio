#!/usr/bin/env bash
# v0.7.35 → v0.7.36+ 上游 type fix 应用器（mimo 级联 + dead-code + vue-flow）
# 在 npm run inject 后执行一次——直接修上游树（被 inject 复位后能恢复）。
set -euo pipefail
HERMES_STUDIO="${HERMES_STUDIO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)/upstream/hermes-studio}"
cd "$HERMES_STUDIO"

echo "[v0735-fixes] 1. mimo 类型级联：opencode→opencode+mimo+dsh"
find packages -name "*.ts" -o -name "*.vue" 2>/dev/null | xargs grep -l "'opencode' | 'dsh'" 2>/dev/null | xargs sed -i '' "s/'opencode' | 'dsh'/'opencode' | 'mimo' | 'dsh'/g" || true

echo "[v0735-fixes] 2. agent-options 默认图（mimo 入口）"
find packages -name "*.ts" -o -name "*.vue" 2>/dev/null | xargs grep -l "opencode: '/coding-agents/opencode.png'," 2>/dev/null | xargs sed -i '' "s|opencode: '/coding-agents/opencode.png',|opencode: '/coding-agents/opencode.png',\n    mimo: '/coding-agents/mimo.png',|g" || true

echo "[v0735-fixes] 3. AgentManagerView 安装/卸载/检查 update map"
find packages -name "*.vue" -o -name "*.ts" 2>/dev/null | xargs grep -l "opencode: false, dsh" 2>/dev/null | xargs sed -i '' "s/opencode: false, dsh: false, cursor: false/opencode: false, mimo: false, dsh: false, cursor: false/g" || true
find packages -name "*.vue" -o -name "*.ts" 2>/dev/null | xargs grep -l "opencode: null,$" 2>/dev/null | xargs sed -i '' "s/opencode: null,$/opencode: null,\n  mimo: null,/g" || true

echo "[v0735-fixes] 4. CodingAgentConfigView 设置映射"
find packages -name "*.vue" -o -name "*.ts" 2>/dev/null | xargs grep -l "opencode: { preference:" 2>/dev/null | xargs sed -i '' "s|opencode: { preference: 'memory', configuration: 'settings' },|opencode: { preference: 'memory', configuration: 'settings' },\n  mimo: { preference: 'memory', configuration: 'settings' },|g" || true

echo "[v0735-fixes] 5. App.vue usesPageSidebar → @ts-expect-error"
if grep -q "const usesPageSidebar = computed(() => false);" packages/client/src/App.vue; then
  sed -i '' 's|^const usesPageSidebar = computed(() => false);$|// @ts-expect-error -- overlay: kept for downstream type compat, unused in current build\nconst usesPageSidebar = computed(() => false);|' packages/client/src/App.vue
fi

echo "[v0735-fixes] 6. MessageItem.vue gateway 比较 → 类型断言"
if grep -q 'const isGatewayNotice = computed(() => props.message.systemType === "gateway");' packages/client/src/components/hermes/chat/MessageItem.vue; then
  sed -i '' 's|const isGatewayNotice = computed(() => props.message.systemType === "gateway");|const isGatewayNotice = computed(() => (props.message.systemType as string \| undefined) === "gateway");|' packages/client/src/components/hermes/chat/MessageItem.vue
fi

echo "[v0735-fixes] 7. PageSidebarNav.vue openMatrixChat + matrix section"
if grep -q "function openMatrixChat()" packages/client/src/components/layout/PageSidebarNav.vue; then
  python3 -c "
import re
p = 'packages/client/src/components/layout/PageSidebarNav.vue'
src = open(p).read()
src = src.replace(
  'function openMatrixChat() {\n  if (props.active === '\\''matrix'\\'') return\n  void router.push({ name: '\\''hermes.matrixChat'\\'' })\n}',
  '// @ts-expect-error -- overlay: kept for downstream type compat, unused in current build\nfunction openMatrixChat() {\n  if ((props.active as string) === '\\''matrix'\\'') return\n  void router.push({ name: '\\''hermes.matrixChat'\\'' })\n}')
open(p, 'w').write(src)
"
fi

echo "[v0735-fixes] 8. chat.ts zcode dead-branch"
if grep -q "if (id === 'zcode') return 'zcode'" packages/client/src/stores/hermes/chat.ts; then
  python3 -c "
p = 'packages/client/src/stores/hermes/chat.ts'
src = open(p).read()
src = src.replace(\"  if (id === 'zcode') return 'zcode' as CodingAgentId\", '  if (id === 'mimo') return 'mimo'\\n  if (id === 'zcode') return 'zcode' as ChatAgentId')
open(p, 'w').write(src)
"
fi

echo "[v0735-fixes] 9. chat.ts ekko-agent import"
if ! grep -q "type CodingAgentId" packages/client/src/stores/hermes/chat.ts; then
  sed -i '' "s|import { inferCodingAgentApiMode, normalizeCodingAgentApiMode, type ChatCodingAgentId } from '@/api/coding-agents'|import { inferCodingAgentApiMode, normalizeCodingAgentApiMode, type ChatCodingAgentId, type CodingAgentId } from '@/api/coding-agents'|" packages/client/src/stores/hermes/chat.ts 2>/dev/null || true
fi

echo "[v0735-fixes] done"
