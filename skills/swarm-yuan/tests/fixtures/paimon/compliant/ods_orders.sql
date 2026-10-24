-- 正例：主键表显式 bucket + compaction 参数 + snapshot 保留 + 分区 + changelog-producer
CREATE TABLE IF NOT EXISTS ods_orders (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(18,2),
    update_time TIMESTAMP(3),
    dt STRING,
    PRIMARY KEY (dt, order_id) NOT ENFORCED
) PARTITIONED BY (dt)
WITH (
    'connector' = 'paimon',
    'bucket' = '8',
    'merge-engine' = 'deduplicate',
    'changelog-producer' = 'lookup',
    'num-sorted-run.compaction-trigger' = '5',
    'num-sorted-run.stop-trigger' = '10',
    'compaction.max.file-num' = '50',
    'snapshot.time-retained' = '24 h',
    'snapshot.num-retained.min' = '10'
);
