-- 反例：主键表无 bucket / 无 compaction / 无 snapshot 保留 / 无分区
CREATE TABLE IF NOT EXISTS ods_orders (
    order_id BIGINT,
    user_id BIGINT,
    amount DECIMAL(18,2),
    update_time TIMESTAMP(3),
    PRIMARY KEY (order_id) NOT ENFORCED
) WITH (
    'connector' = 'paimon',
    'merge-engine' = 'deduplicate'
);
