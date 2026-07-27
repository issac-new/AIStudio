/**
 * OpenClaw ↔ MemoryCore bridge.
 *
 * Responsibilities (mirrors V7 §0.2 + §2.6 + §2.4.6):
 *   1. `before_prompt_build` → call `memoryCore.onTurnStart`, return a
 *      `prependContext` block with retrieved memory.
 *   2. `agent_end`          → derive a `TurnResultDTO` from messages,
 *      call `memoryCore.onTurnEnd`.
 *   3. `before_tool_call`   → start a tool-outcome timer per toolCallId.
 *   4. `after_tool_call`    → emit `recordToolOutcome` with duration +
 *      success flag so decision-repair can fire.
 *   5. `session_start` / `session_end` → open/close core session.
 *
 * This module imports *only* TypeScript types from `./openclaw-api.ts`.
 * It never pulls in `openclaw/plugin-sdk` at runtime; the host provides
 * the `OpenClawPluginApi` instance at plugin-load time.
 *
 * Shape fidelity: the handler signatures match
 * `openclaw/src/plugins/hook-types.ts::PluginHookHandlerMap`. When
 * OpenClaw updates the SDK, only `openclaw-api.ts` needs to be adjusted.
 */
import type { AgentKind, RetrievalResultDTO, SessionId, ToolCallDTO } from "../../agent-contract/dto.js";
import type { MemoryCore } from "../../agent-contract/memory-core.js";
import type { AfterToolCallEvent, AgentEndEvent, BeforePromptBuildEvent, BeforePromptBuildResult, BeforeToolCallEvent, HostLogger, PluginHookAgentContext, PluginHookSessionContext, PluginHookSubagentContext, PluginHookToolContext, SessionEndEvent, SessionStartEvent, SubagentEndedEvent, SubagentSpawnedEvent, ToolResultPersistEvent } from "./openclaw-api.js";
export interface FlatMessage {
    role: "user" | "assistant" | "tool_call" | "tool_result" | "thinking" | "system";
    /** Plain-text body. Empty for tool-call / pure-thinking entries. */
    content: string;
    toolName?: string;
    toolCallId?: string;
    /** For `tool_call` entries — parsed arguments. */
    toolInput?: unknown;
    /** Flag set on tool_result entries when the tool itself errored. */
    isError?: boolean;
    errorCode?: string;
    ts?: number;
}
/**
 * Flatten an OpenClaw `AgentMessage[]` (pi-ai shape) into a fully
 * role-typed event list.
 *
 * Failure modes are deliberate no-ops: malformed entries are skipped
 * silently. Anything truly unrecognised does NOT silently get coerced
 * into "user" — that was the bug that caused tool stdout to be stored
 * as user_text. Unknown roles are simply ignored.
 */
export declare function flattenMessages(input: unknown[] | undefined): FlatMessage[];
/**
 * Return `true` when a user-slot message is actually OpenClaw
 * runtime bootstrap / boot-check / sentinel reply and should be
 * dropped entirely (not captured, not passed to retrieval).
 */
export declare function isOpenClawBootstrapMessage(raw: string): boolean;
export interface CapturedTurn {
    userText: string;
    agentText: string;
    /**
     * LLM-native thinking captured this turn (Claude extended-thinking,
     * pi-ai `ThinkingContent`, …). Belongs to the conversation log,
     * NOT to the plugin's reflection / scoring path.
     */
    agentThinking?: string;
    toolCalls: ToolCallDTO[];
    reflection?: string;
}
/**
 * Derive a single `user → assistant` turn from the tail of the message
 * list. Algorithm:
 *
 *   1. Walk backward to the last `user` message — that's the prompt
 *      this turn answers. Anything older is from prior turns.
 *   2. Everything after that user message belongs to this turn:
 *      assistant text, model thinking blocks, tool calls (assistant
 *      side), and the matching tool results (independent role).
 *   3. Pair `tool_call` (issued by assistant) with `tool_result`
 *      (separate role) by `toolCallId`; fall back to `toolName` when
 *      the host doesn't pass an id.
 *
 * The function never throws — malformed entries are dropped silently
 * so a single bad message can't poison the whole capture.
 */
export declare function extractTurn(messages: FlatMessage[], now: number): CapturedTurn | null;
/**
 * Map OpenClaw `(agentId, sessionKey)` → stable core `SessionId`.
 *
 * OpenClaw regenerates `sessionId` on `/new` and `/reset`. That would
 * reset our V7 §0.1 "follow-up vs new task" tracking. `sessionKey` is
 * the durable identifier (per conversation thread), so we key on it.
 */
export declare function bridgeSessionId(agentId: string, sessionKey: string): SessionId;
/**
 * Ephemeral OpenClaw sub-agents (slug generator, boot-check probes,
 * approval prompts, …) open their own run inside the same plugin host
 * and carry a conventional `temp:*` sessionKey. They are NOT user
 * conversations — capturing them pollutes the Tasks panel with empty
 * "未命名任务" rows, skews L2 induction, and costs LLM calls on
 * reflection / relation classification.
 *
 * Source of truth: `openclaw/src/hooks/llm-slug-generator.ts#67` sets
 * `sessionKey: "temp:slug-generator"`. Other internal runners may use
 * the same `temp:*` prefix going forward, so we filter the whole
 * namespace.
 */
export declare function isEphemeralSessionKey(sessionKey: string | undefined): boolean;
/**
 * Render the retrieval result as a prompt-prependable block.
 *
 * Callers may opt into a short cold-start hint when the store has no
 * hits. The automatic OpenClaw before-prompt path disables that hint so
 * no-hit turns continue with the user's prompt instead of injecting
 * extra context.
 */
export declare function renderContextBlock(packet: RetrievalResultDTO | null, opts?: {
    hintWhenEmpty?: boolean;
}): string;
export interface BridgeOptions {
    agent: AgentKind;
    core: MemoryCore;
    log: HostLogger;
    /** When true, keep retrieval enabled but skip turn-end capture entirely. */
    memoryAddDisabled?: boolean;
    readOnlyInjectionProfile?: "all" | "experience" | "skill" | "skill_experience";
    /** Task domain preset (`ir` enables IR-eval-only behaviors). */
    domain?: "" | "ir";
    /** Override the wall-clock source (tests). */
    now?: () => number;
}
export interface BridgeHandle {
    /** Handler for OpenClaw `before_prompt_build` hook. */
    handleBeforePrompt: (event: BeforePromptBuildEvent, ctx: PluginHookAgentContext) => Promise<BeforePromptBuildResult | void>;
    /** Handler for OpenClaw `agent_end` hook. */
    handleAgentEnd: (event: AgentEndEvent, ctx: PluginHookAgentContext) => Promise<void>;
    /** Handler for `before_tool_call` — start duration tracking. */
    handleBeforeToolCall: (event: BeforeToolCallEvent, ctx: PluginHookToolContext) => void;
    /** Handler for `after_tool_call` — record outcome. */
    handleAfterToolCall: (event: AfterToolCallEvent, ctx: PluginHookToolContext) => Promise<void>;
    /** Handler for `tool_result_persist` — append repeated-failure hint. */
    handleToolResultPersist: (event: ToolResultPersistEvent, ctx: PluginHookToolContext) => {
        message?: unknown;
    } | void;
    /** Handler for `session_start`. */
    handleSessionStart: (event: SessionStartEvent, ctx: PluginHookSessionContext) => Promise<void>;
    /** Handler for `session_end`. */
    handleSessionEnd: (event: SessionEndEvent, ctx: PluginHookSessionContext) => Promise<void>;
    /** Handler for `subagent_spawned` — cache delegation metadata. */
    handleSubagentSpawned: (event: SubagentSpawnedEvent, ctx: PluginHookSubagentContext) => void;
    /** Handler for `subagent_ended` — clear cached delegation metadata. */
    handleSubagentEnded: (event: SubagentEndedEvent, ctx: PluginHookSubagentContext) => Promise<void>;
    /** Snapshot for tests. */
    trackedSessions: () => number;
    trackedToolCalls: () => number;
}
export declare function createOpenClawBridge(opts: BridgeOptions): BridgeHandle;
//# sourceMappingURL=bridge.d.ts.map