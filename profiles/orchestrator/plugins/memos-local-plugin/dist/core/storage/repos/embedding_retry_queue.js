export function makeEmbeddingRetryQueueRepo(db) {
    const columns = `
    id, target_kind, target_id, vector_field, source_text, embed_role, status,
    attempts, max_attempts, next_attempt_at, claimed_by, lease_until, last_error,
    created_at, updated_at
  `;
    return {
        enqueue(input) {
            db.prepare(`INSERT INTO embedding_retry_queue (
           id, target_kind, target_id, vector_field, source_text, embed_role,
           status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at
         ) VALUES (
           @id, @target_kind, @target_id, @vector_field, @source_text, @embed_role,
           'pending', 0, @max_attempts, @now, NULL, @now, @now
         )
         ON CONFLICT(target_kind, target_id, vector_field) DO UPDATE SET
           source_text=excluded.source_text,
           embed_role=excluded.embed_role,
           status=CASE
             WHEN embedding_retry_queue.status IN ('failed','succeeded') THEN 'pending'
             ELSE embedding_retry_queue.status
           END,
           attempts=CASE
             WHEN embedding_retry_queue.status IN ('failed','succeeded') THEN 0
             ELSE embedding_retry_queue.attempts
           END,
           claimed_by=NULL,
           lease_until=NULL,
           last_error=CASE
             WHEN embedding_retry_queue.status IN ('failed','succeeded') THEN NULL
             ELSE embedding_retry_queue.last_error
           END,
           max_attempts=excluded.max_attempts,
           next_attempt_at=MIN(embedding_retry_queue.next_attempt_at, excluded.next_attempt_at),
           updated_at=excluded.updated_at`).run({
                id: input.id,
                target_kind: input.targetKind,
                target_id: input.targetId,
                vector_field: input.vectorField,
                source_text: input.sourceText,
                embed_role: input.embedRole ?? "document",
                max_attempts: input.maxAttempts ?? 6,
                now: input.now,
            });
        },
        claimDue(input) {
            const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 25)));
            const ids = db.tx(() => {
                const rows = db.prepare(`SELECT id
             FROM embedding_retry_queue
            WHERE (
              status='pending'
              OR (status='in_progress' AND lease_until IS NOT NULL AND lease_until <= @now)
            )
              AND next_attempt_at <= @now
            ORDER BY next_attempt_at ASC, created_at ASC
            LIMIT @limit`).all({ now: input.now, limit });
                if (rows.length === 0)
                    return [];
                const picked = rows.map((r) => r.id);
                const placeholders = picked.map((_, i) => `@id${i}`).join(",");
                const params = {
                    worker_id: input.workerId,
                    lease_until: input.leaseUntil,
                    now: input.now,
                };
                picked.forEach((id, i) => { params[`id${i}`] = id; });
                db.prepare(`UPDATE embedding_retry_queue
              SET status='in_progress',
                  claimed_by=@worker_id,
                  lease_until=@lease_until,
                  updated_at=@now
            WHERE id IN (${placeholders})
              AND (
                status='pending'
                OR (status='in_progress' AND lease_until IS NOT NULL AND lease_until <= @now)
              )
              AND next_attempt_at <= @now`).run(params);
                const claimed = db.prepare(`SELECT id
             FROM embedding_retry_queue
            WHERE id IN (${placeholders})
              AND status='in_progress'
              AND claimed_by=@worker_id
              AND lease_until=@lease_until
            ORDER BY next_attempt_at ASC, created_at ASC`).all(params);
                return claimed.map((r) => r.id);
            });
            if (ids.length === 0)
                return [];
            const placeholders = ids.map((_, i) => `@id${i}`).join(",");
            const params = {};
            ids.forEach((id, i) => { params[`id${i}`] = id; });
            const rows = db.prepare(`SELECT ${columns}
           FROM embedding_retry_queue
          WHERE id IN (${placeholders})
          ORDER BY next_attempt_at ASC, created_at ASC`).all(params);
            return rows.map(mapRow);
        },
        listDue(now, limit = 25) {
            const rows = db.prepare(`SELECT ${columns}
           FROM embedding_retry_queue
          WHERE status='pending'
            AND next_attempt_at <= @now
          ORDER BY next_attempt_at ASC, created_at ASC
          LIMIT @limit`).all({ now, limit: Math.max(1, Math.min(200, Math.floor(limit))) });
            return rows.map(mapRow);
        },
        transact(fn) {
            return db.tx(fn);
        },
        touchClaimHeld(id, input) {
            const res = db.prepare(`UPDATE embedding_retry_queue
            SET updated_at=@now
          WHERE id=@id
            AND status='in_progress'
            AND claimed_by=@worker_id
            AND lease_until=@lease_until`).run({
                id,
                worker_id: input.workerId,
                lease_until: input.leaseUntil,
                now: input.now,
            });
            return res.changes > 0;
        },
        isClaimHeld(id, input) {
            const row = db.prepare(`SELECT COUNT(*) AS n
           FROM embedding_retry_queue
          WHERE id=@id
            AND status='in_progress'
            AND claimed_by=@worker_id
            AND lease_until=@lease_until`).get({
                id,
                worker_id: input.workerId,
                lease_until: input.leaseUntil,
            });
            return (row?.n ?? 0) > 0;
        },
        markRetry(id, input) {
            db.prepare(`UPDATE embedding_retry_queue
            SET status='pending',
                attempts=@attempts,
                next_attempt_at=@next_attempt_at,
                claimed_by=NULL,
                lease_until=NULL,
                last_error=@last_error,
                updated_at=@now
          WHERE id=@id`).run({
                id,
                attempts: input.attempts,
                next_attempt_at: input.nextAttemptAt,
                last_error: input.error,
                now: input.now,
            });
        },
        markRetryClaimed(id, input) {
            const res = db.prepare(`UPDATE embedding_retry_queue
            SET status='pending',
                attempts=@attempts,
                next_attempt_at=@next_attempt_at,
                claimed_by=NULL,
                lease_until=NULL,
                last_error=@last_error,
                updated_at=@now
          WHERE id=@id
            AND status='in_progress'
            AND claimed_by=@worker_id
            AND lease_until=@lease_until`).run({
                id,
                worker_id: input.workerId,
                lease_until: input.leaseUntil,
                attempts: input.attempts,
                next_attempt_at: input.nextAttemptAt,
                last_error: input.error,
                now: input.now,
            });
            return res.changes > 0;
        },
        markFailed(id, input) {
            db.prepare(`UPDATE embedding_retry_queue
            SET status='failed',
                attempts=@attempts,
                claimed_by=NULL,
                lease_until=NULL,
                last_error=@last_error,
                updated_at=@now
          WHERE id=@id`).run({ id, attempts: input.attempts, last_error: input.error, now: input.now });
        },
        markFailedClaimed(id, input) {
            const res = db.prepare(`UPDATE embedding_retry_queue
            SET status='failed',
                attempts=@attempts,
                claimed_by=NULL,
                lease_until=NULL,
                last_error=@last_error,
                updated_at=@now
          WHERE id=@id
            AND status='in_progress'
            AND claimed_by=@worker_id
            AND lease_until=@lease_until`).run({
                id,
                worker_id: input.workerId,
                lease_until: input.leaseUntil,
                attempts: input.attempts,
                last_error: input.error,
                now: input.now,
            });
            return res.changes > 0;
        },
        markSucceeded(id, now) {
            db.prepare(`UPDATE embedding_retry_queue
            SET status='succeeded',
                next_attempt_at=@now,
                claimed_by=NULL,
                lease_until=NULL,
                updated_at=@now
          WHERE id=@id`).run({ id, now });
        },
        markSucceededClaimed(id, input) {
            const res = db.prepare(`UPDATE embedding_retry_queue
            SET status='succeeded',
                next_attempt_at=@now,
                claimed_by=NULL,
                lease_until=NULL,
                updated_at=@now
          WHERE id=@id
            AND status='in_progress'
            AND claimed_by=@worker_id
            AND lease_until=@lease_until`).run({
                id,
                worker_id: input.workerId,
                lease_until: input.leaseUntil,
                now: input.now,
            });
            return res.changes > 0;
        },
        countByStatus(status) {
            const row = db.prepare(`SELECT COUNT(*) AS n FROM embedding_retry_queue WHERE status=@status`).get({ status });
            return row?.n ?? 0;
        },
    };
}
function mapRow(row) {
    return {
        id: row.id,
        targetKind: row.target_kind,
        targetId: row.target_id,
        vectorField: row.vector_field,
        sourceText: row.source_text,
        embedRole: row.embed_role,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        claimedBy: row.claimed_by,
        leaseUntil: row.lease_until,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
//# sourceMappingURL=embedding_retry_queue.js.map