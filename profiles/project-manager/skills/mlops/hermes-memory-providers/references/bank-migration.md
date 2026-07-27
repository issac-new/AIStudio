# Bank Migration Between Hindsight Banks

When switching from a shared bank to `bank_id_template`-based isolation, data
must be migrated across 6 related tables that share composite foreign keys on
`(id, bank_id)` or `(document_id, bank_id)`.

## Tables to Migrate

| Table | Records | FK Dependency |
|-------|---------|---------------|
| `documents` | Parent | Referenced by memory_units, chunks |
| `memory_units` | 7 | References documents |
| `chunks` | 4 | References documents |
| `entities` | 9 | Independent |
| `memory_links` | 8 | Independent |
| `observation_history` | 1 | Independent |

## The FK Challenge

These tables have composite foreign keys like:
- `memory_units(document_id, bank_id) → documents(id, bank_id)`
- `chunks(document_id, bank_id) → documents(id, bank_id)`

Updating `documents.bank_id` from 'hermes' to 'hermes-orchestrator' fails
because `memory_units` still references `(doc_id, 'hermes')`. Updating
`memory_units` first fails because `documents` doesn't have `(doc_id, 'hermes-orchestrator')`.

## Safe Migration Procedure

### Method 1: Session replication role (recommended)

Temporarily disable FK trigger checks:

```sql
SET session_replication_role = 'replica';

UPDATE documents SET bank_id = 'hermes-orchestrator' WHERE bank_id = 'hermes';
UPDATE memory_units SET bank_id = 'hermes-orchestrator' WHERE bank_id = 'hermes';
UPDATE chunks SET bank_id = 'hermes-orchestrator' WHERE bank_id = 'hermes';
UPDATE entities SET bank_id = 'hermes-orchestrator' WHERE bank_id = 'hermes';
UPDATE memory_links SET bank_id = 'hermes-orchestrator' WHERE bank_id = 'hermes';
UPDATE observation_history SET bank_id = 'hermes-orchestrator' WHERE bank_id = 'hermes';

SET session_replication_role = 'origin';
```

Execute as:
```bash
docker cp migrate.sql hindsight-db-1:/tmp/migrate.sql
docker exec hindsight-db-1 psql -U hindsight -d hindsight -f /tmp/migrate.sql
```

### Method 2: Update banks table

After migrating data, update the `banks` table to register the new bank:

```sql
INSERT INTO banks (bank_id, name, disposition, created_at, updated_at)
VALUES (
  'hermes-orchestrator',
  'hermes-orchestrator',
  '{"empathy": 3, "literalism": 3, "skepticism": 3}',
  (SELECT MIN(created_at) FROM memory_units WHERE bank_id = 'hermes-orchestrator'),
  NOW()
);

DELETE FROM banks WHERE bank_id = 'hermes';  -- only if empty
```

## Verify Migration

```sql
-- Check data distribution
SELECT bank_id, COUNT(*) as records FROM (
  SELECT bank_id FROM memory_units UNION ALL
  SELECT bank_id FROM entities UNION ALL
  SELECT bank_id FROM chunks UNION ALL
  SELECT bank_id FROM documents UNION ALL
  SELECT bank_id FROM memory_links UNION ALL
  SELECT bank_id FROM observation_history
) t GROUP BY bank_id ORDER BY bank_id;

-- API should show the new bank
curl -s http://localhost:8888/v1/default/banks

-- API recall should work on the new bank
curl -s -X POST "http://localhost:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","limit":3}'
```
