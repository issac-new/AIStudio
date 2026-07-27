# ACP Protocol Methods (v1) — SDK Schema Reference

Source: `@agentclientprotocol/claude-agent-acp/node_modules/@agentclientprotocol/sdk/dist/schema/index.js`
Package: `@agentclientprotocol/sdk`

## Agent Methods (client → agent)

These methods are sent from the Hermes/ACP client **to** `claude-agent-acp`.

| Constant | Method | Purpose |
|----------|--------|---------|
| `authenticate` | `authenticate` | Auth handshake (gateway/bedrock/terminal) |
| `document_did_change` | `document/didChange` | File change notification |
| `document_did_close` | `document/didClose` | File close notification |
| `document_did_focus` | `document/didFocus` | File focus notification |
| `document_did_open` | `document/didOpen` | File open notification |
| `document_did_save` | `document/didSave` | File save notification |
| `initialize` | `initialize` | **REQUIRED** — protocol handshake |
| `logout` | `logout` | Logout |
| `mcp_message` | `mcp/message` | Forward MCP message |
| `nes_accept` | `nes/accept` | Accept notification elicitation |
| `nes_close` | `nes/close` | Close notification elicitation |
| `nes_reject` | `nes/reject` | Reject notification elicitation |
| `nes_start` | `nes/start` | Start notification elicitation |
| `nes_suggest` | `nes/suggest` | Suggest notification elicitation |
| `providers_disable` | `providers/disable` | Disable a provider |
| `providers_list` | `providers/list` | List providers |
| `providers_set` | `providers/set` | Set provider |
| `session_cancel` | `session/cancel` | Cancel running prompt in session |
| `session_close` | `session/close` | Close a session |
| `session_delete` | `session/delete` | Delete a session |
| `session_fork` | `session/fork` | Fork a session (new ID, keeps history) |
| **`session_list`** | **`session/list`** | **List sessions in a directory** |
| `session_load` | `session/load` | Load/replay a session's history |
| **`session_new`** | **`session/new`** | **Create a new session** |
| **`session_prompt`** | **`session/prompt`** | **Send a prompt to a session** |
| `session_resume` | `session/resume` | Resume an existing session |
| `session_set_config_option` | `session/set_config_option` | Set a config option |
| `session_set_mode` | `session/set_mode` | Set agent mode |

## Client Methods (agent → client)

These methods are sent **from** `claude-agent-acp` back to the client.

| Constant | Method | Purpose |
|----------|--------|---------|
| `elicitation_complete` | `elicitation/complete` | Elicitation form complete |
| `elicitation_create` | `elicitation/create` | Create elicitation form |
| `fs_read_text_file` | `fs/read_text_file` | Read file request |
| `fs_write_text_file` | `fs/write_text_file` | Write file request |
| `mcp_connect` | `mcp/connect` | Connect MCP server |
| `mcp_disconnect` | `mcp/disconnect` | Disconnect MCP server |
| `mcp_message` | `mcp/message` | MCP message |
| `session_request_permission` | `session/request_permission` | Permission request |
| `session_update` | `session/update` | Session state update |
| `terminal_create` | `terminal/create` | Create terminal |
| `terminal_kill` | `terminal/kill` | Kill terminal |
| `terminal_output` | `terminal/output` | Terminal output |
| `terminal_release` | `terminal/release` | Release terminal |
| `terminal_wait_for_exit` | `terminal/wait_for_exit` | Wait for terminal exit |

## session/new Request Schema

```typescript
{
  sessionId: string,           // uuid — NOTE: agent may override this
  cwd: string,                 // absolute path, MUST exist
  mcpServers: McpServer[],     // required, can be empty []
  additionalDirectories?: string[],
  _meta?: {
    claudeCode?: {
      options?: {
        maxTurns?: number,
        permissionMode?: "default" | "bypassPermissions" | "acceptEdits" | "plan" | "auto" | "dontAsk",
        autoApprove?: boolean,
        resume?: string,       // sessionId to resume (for resumeSession)
        tools?: any,
        env?: Record<string, string>,
        settings?: any,
        hooks?: any,
        mcpServers?: any,
        disallowedTools?: string[],
        abortController?: AbortController,
        extraArgs?: Record<string, string>,
      }
    },
    systemPrompt?: string | object,
    disableBuiltInTools?: boolean
  }
}
```

## session/prompt Request Schema

```typescript
{
  sessionId: string,          // the actual session ID (from session/new response)
  prompt: ContentBlock[],     // REQUIRED — array, not bare string
}
```

Where `ContentBlock` is Anthropic content block format:
```json
[
  {"type": "text", "text": "Your message here"},
  {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}}
]
```

## session/list Request Schema

```typescript
{
  cwd?: string  // directory to list sessions from
}
```

Response: `{ sessions: [{ sessionId, cwd, title, updatedAt }] }`

## Key Architecture Note

`claude-agent-acp` is a **stdio-based JSON-RPC 2.0 server**. It requires a **persistent connection** — each invocation starts a fresh process that loses all prior state. The connection lifecycle:

```
1. start subprocess
2. → initialize (handshake)
3. → session/new (starts native SDK binary, slow ~15-30s first time)
4. → session/prompt (first prompt)
5. → session/prompt (subsequent prompts on same session)
6. → session/close (optional)
7. ← kill subprocess
```

The native binary (`@anthropic-ai/claude-agent-sdk`) is loaded lazily during `session/new`, which adds significant latency on the first call. Subsequent `session/prompt` calls on the same session are faster.
