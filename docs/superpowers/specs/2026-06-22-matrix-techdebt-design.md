# Matrix 聊天 + 服务端配置 技术债修复设计

**日期**：2026-06-22
**范围**：non-cockpit 技术债，7 项实现 + 1 项 toast 占位 + 1 项保持文档

---

## 1. 范围与排除

| 项目 | 处理方式 |
|------|----------|
| #1 文件上传 | 完整实现 |
| #2 转发对话框 | 完整实现 |
| #3 搜索对话框 | 完整实现 |
| #4 视频通话 | toast 提示"即将推出" |
| #5 语音通话 | toast 提示"即将推出" |
| #6 getMatrixAdminToken | 从环境变量读取 |
| #7/8 homeserverUrl | 从环境变量读取 + fallback |
| #9 缓存陷阱 | 保持 RELEASE-NOTES.md 文档记录 |

---

## 2. #1 文件上传 — MatrixMessageInput.vue

**现状**：`onFileSelected()` handler 已拿到 File 对象，但直接 `target.value = ''` 丢弃。
**UI 已就绪**：`<input type="file">` + 上传按钮 + format toolbar 集成。

**修改点**：

```typescript
// MatrixMessageInput.vue — onFileSelected()
async function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  sending.value = true
  try {
    await composerStore.sendFile(file)
  } catch {
    // error handled in store
  } finally {
    sending.value = false
    target.value = ''
  }
}
```

**新增 composer store 方法**：`sendFile(file: File)` — 调用 Matrix SDK `client.uploadContent()` 获取 mxc URL，然后 `client.sendMessage()` 发送 `m.file` 类型消息。

---

## 3. #2 转发对话框 — MatrixMessageItem.vue

**现状**：`handleForward()` 空函数。上下文菜单和右键菜单都已有 "Forward" 项。

**新增组件**：`MatrixForwardDialog.vue`
- 复用 `MatrixInviteDialog` 的结构模式
- 搜索/选择目标房间（已有 room list store）
- 调用 `composerStore.sendMessage()` 发送原消息内容到目标房间
- Props: `event` (MatrixEvent), `visible` (boolean)
- Emits: `close`

**修改 MatrixMessageItem.vue**：`handleForward()` 打开对话框。

---

## 4. #3 搜索对话框 — MatrixRoomHeader.vue

**现状**：`handleSearch()` 空函数，搜索按钮已存在。

**新增组件**：`MatrixSearchDialog.vue`
- 搜索输入框 + 结果列表
- 调用 Matrix SDK `client.searchRoomEvents({ search_term, keys: ['content.body'] })`
- 结果展示：发送者头像、内容摘要、时间戳、跳转按钮
- Props: `visible` (boolean)
- Emits: `close`, `select(eventId)`

**修改 MatrixRoomHeader.vue**：`handleSearch()` 打开对话框。

---

## 5. #4 #5 音视频通话 toast — MatrixRoomHeader.vue

**现状**：`handleVideoCall()` 和 `handleVoiceCall()` 空函数。

**方案**：不引入 WebRTC/Jitsi 依赖，改为友好提示。

```typescript
function handleVideoCall() {
  alert(t('matrixChat.comingSoon'))
}
function handleVoiceCall() {
  alert(t('matrixChat.comingSoon'))
}
```

或者使用项目已有的 toast/notification 系统（如果存在）。

---

## 6. #6/#7/#8 服务端配置 — auth.patch

**现状**：
- `getMatrixAdminToken()` 返回 null，注释 "TODO: Read from Hermes config system"
- `listMatrixUsers` 和 `createMatrixUser` 中 `homeserverUrl` 硬编码 `'http://localhost:8008'`

**修改**：

```typescript
// 集中配置读取
function getMatrixHomeserverUrl(): string {
  return process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008'
}

function getMatrixAdminToken(_ctx: Context): string | null {
  return process.env.MATRIX_ADMIN_TOKEN || null
}
```

**涉及文件**：`overlay/patches/012-server-controllers-auth.patch`
- 第 79-84 行：修改 `getMatrixAdminToken` 实现
- 第 185 行：替换硬编码为 `getMatrixHomeserverUrl()`
- 第 257 行：同上

---

## 7. 文件变更清单

| 文件 | 操作 | 变更内容 |
|------|------|----------|
| `MatrixMessageInput.vue` | 修改 | `onFileSelected()` 实现 |
| `matrix-composer.ts` (store) | 修改 | 新增 `sendFile()` |
| `MatrixForwardDialog.vue` | **新增** | 转发对话框组件 |
| `MatrixMessageItem.vue` | 修改 | `handleForward()` 打开对话框 |
| `MatrixSearchDialog.vue` | **新增** | 搜索对话框组件 |
| `MatrixRoomHeader.vue` | 修改 | 搜索/音视频 handler |
| `012-server-controllers-auth.patch` | 修改 | 环境变量读取 |

---

## 8. 自审

- **Placeholder 扫描**：无 TBD/TODO
- **内部一致性**：所有修改仅限所列文件，不涉及无关重构
- **范围聚焦**：7 项实现 + 1 项 toast + 1 项文档，无范围蔓延
- **不含歧义**：所有 API 调用明确（Matrix SDK methods），环境变量名明确
