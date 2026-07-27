/**
 * `api_logs` repository — structured log of the user-facing memory
 * operations (`memos_search`, `memory_add`). Mirrors the legacy
 * `memos-local-openclaw` plugin's table so the new viewer can render
 * the same rich JSON payloads (candidates, filtered, hub results,
 * ingestion stats, …).
 *
 * Schema: see `core/storage/migrations/007-api-logs.sql`.
 *
 * Write path: invoked synchronously inside the pipeline whenever we
 * complete a `memory.search` retrieval (adapter tool bridge) or an
 * `agent_end`-driven ingest turn.
 *
 * Read path: paginated newest-first by `called_at`. The viewer tails
 * the table via `GET /api/v1/api-logs`.
 */
export const API_LOG_RETENTION_LIMIT = 10_000;
const API_LOG_PRUNE_BATCH_SIZE = 5_000;
export function makeApiLogsRepo(db) {
    let pruneScheduled = false;
    let pruneInProgress = false;
    let pruneAgain = false;
    const insert = db.prepare(`INSERT INTO api_logs (tool_name, input_json, output_json, duration_ms, success, called_at)
     VALUES (@tool_name, @input_json, @output_json, @duration_ms, @success, @called_at)`);
    const countAll = db.prepare(`SELECT COUNT(*) AS n FROM api_logs`);
    const countByTool = db.prepare(`SELECT COUNT(*) AS n FROM api_logs WHERE tool_name = @tool_name`);
    const retentionBoundary = db.prepare(`SELECT id, called_at
     FROM api_logs
     ORDER BY called_at DESC, id DESC
     LIMIT 1 OFFSET @offset`);
    const deleteOlderBatch = db.prepare(`DELETE FROM api_logs
     WHERE id IN (
       SELECT id
       FROM api_logs
       WHERE called_at < @called_at
          OR (called_at = @called_at AND id < @id)
       ORDER BY called_at ASC, id ASC
       LIMIT @batch
     )`);
    const selectAll = db.prepare(`SELECT id, tool_name, input_json, output_json, duration_ms, success, called_at
     FROM api_logs
     ORDER BY called_at DESC, id DESC
     LIMIT @limit OFFSET @offset`);
    const selectByTool = db.prepare(`SELECT id, tool_name, input_json, output_json, duration_ms, success, called_at
     FROM api_logs
     WHERE tool_name = @tool_name
     ORDER BY called_at DESC, id DESC
     LIMIT @limit OFFSET @offset`);
    const countByToolNames = (toolNames) => {
        const names = normalizeToolNames(toolNames);
        if (names.length === 0)
            return countAll.get({})?.n ?? 0;
        if (names.length === 1) {
            return countByTool.get({ tool_name: names[0] })?.n ?? 0;
        }
        const params = namedToolParams(names);
        const placeholders = Object.keys(params).map((key) => `@${key}`).join(", ");
        const row = db
            .prepare(`SELECT COUNT(*) AS n FROM api_logs WHERE tool_name IN (${placeholders})`)
            .get(params);
        return row?.n ?? 0;
    };
    const selectByToolNames = (toolNames, limit, offset) => {
        const names = normalizeToolNames(toolNames);
        if (names.length === 0)
            return selectAll.all({ limit, offset });
        if (names.length === 1) {
            return selectByTool.all({ tool_name: names[0], limit, offset });
        }
        const toolParams = namedToolParams(names);
        const placeholders = Object.keys(toolParams).map((key) => `@${key}`).join(", ");
        return db
            .prepare(`SELECT id, tool_name, input_json, output_json, duration_ms, success, called_at
         FROM api_logs
         WHERE tool_name IN (${placeholders})
         ORDER BY called_at DESC, id DESC
         LIMIT @limit OFFSET @offset`)
            .all({ ...toolParams, limit, offset });
    };
    function schedulePrune() {
        if (pruneInProgress) {
            pruneAgain = true;
            return;
        }
        if (pruneScheduled)
            return;
        pruneScheduled = true;
        const timer = setTimeout(runPruneTask, 0);
        const maybeNodeTimer = timer;
        maybeNodeTimer.unref?.();
    }
    function runPruneTask() {
        pruneScheduled = false;
        if (pruneInProgress) {
            pruneAgain = true;
            return;
        }
        pruneInProgress = true;
        pruneAgain = false;
        let boundary;
        try {
            boundary = retentionBoundary.get({ offset: API_LOG_RETENTION_LIMIT - 1 });
        }
        catch {
            finishPruneTask();
            return;
        }
        if (!boundary) {
            finishPruneTask();
            return;
        }
        pruneBatch(boundary);
    }
    function pruneBatch(boundary) {
        let changes = 0;
        try {
            changes = deleteOlderBatch.run({
                called_at: boundary.called_at,
                id: boundary.id,
                batch: API_LOG_PRUNE_BATCH_SIZE,
            }).changes;
        }
        catch {
            finishPruneTask();
            return;
        }
        if (changes === 0) {
            finishPruneTask();
            return;
        }
        const timer = setTimeout(() => pruneBatch(boundary), 0);
        const maybeNodeTimer = timer;
        maybeNodeTimer.unref?.();
    }
    function finishPruneTask() {
        pruneInProgress = false;
        if (pruneAgain) {
            pruneAgain = false;
            schedulePrune();
        }
    }
    return {
        insert(row) {
            insert.run({
                tool_name: row.toolName,
                input_json: typeof row.input === "string" ? row.input : safeStringify(row.input),
                output_json: typeof row.output === "string" ? row.output : safeStringify(row.output),
                duration_ms: Math.max(0, Math.floor(row.durationMs)),
                success: row.success ? 1 : 0,
                called_at: row.calledAt ?? Date.now(),
            });
            schedulePrune();
        },
        count(filter = {}) {
            if (filter.toolNames?.length) {
                return countByToolNames(filter.toolNames);
            }
            if (filter.toolName) {
                return countByTool.get({ tool_name: filter.toolName })?.n ?? 0;
            }
            return countAll.get({})?.n ?? 0;
        },
        list(filter = {}) {
            const limit = Math.max(1, Math.min(500, filter.limit ?? 50));
            const offset = Math.max(0, filter.offset ?? 0);
            const rows = filter.toolNames?.length
                ? selectByToolNames(filter.toolNames, limit, offset)
                : filter.toolName
                    ? selectByTool.all({ tool_name: filter.toolName, limit, offset })
                    : selectAll.all({ limit, offset });
            return rows.map(mapRow);
        },
    };
}
function normalizeToolNames(toolNames) {
    return [...new Set(toolNames.map((name) => name.trim()).filter(Boolean))];
}
function namedToolParams(toolNames) {
    return Object.fromEntries(toolNames.map((name, index) => [`tool_${index}`, name]));
}
function mapRow(r) {
    return {
        id: r.id,
        toolName: r.tool_name,
        inputJson: r.input_json,
        outputJson: r.output_json,
        durationMs: r.duration_ms,
        success: !!r.success,
        calledAt: r.called_at,
    };
}
function safeStringify(v) {
    try {
        return JSON.stringify(v ?? {});
    }
    catch {
        return "{}";
    }
}
//# sourceMappingURL=api_logs.js.map