package com.example.job;

import org.apache.shardingsphere.elasticjob.api.ShardingContext;
import org.apache.shardingsphere.elasticjob.simple.job.SimpleJob;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 合规样例：
 * - 分片确定性分发：id % totalCount == item（fw_elasticjob_sharding pass）
 * - 幂等：状态机 CAS 更新，重复执行无副作用（fw_elasticjob_idempotent pass）
 * - catch 后 rethrow 交调度层 + JobErrorHandler（fw_elasticjob_error_handler pass）
 */
@Component
public class OrderShardingJob implements SimpleJob {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public void execute(ShardingContext context) {
        int item = context.getShardingItem();
        int total = context.getShardingTotalCount();
        // 确定性分发：本分片仅处理 id % total == item 的数据段
        List<Long> orderIds = jdbcTemplate.queryForList(
                "select id from t_order where status = 'RETRYING' and mod(id, ?) = ?",
                Long.class, total, item);
        for (Long orderId : orderIds) {
            try {
                boolean idempotentCas = true;
                if (idempotentCas) {
                    // 幂等：仅当状态仍为 RETRYING 时更新（状态机 CAS）
                    jdbcTemplate.update(
                            "update t_order set status = 'RETRIED', retry_time = now() "
                                    + "where id = ? and status = 'RETRYING'", orderId);
                }
            } catch (Exception e) {
                // 上报失败：rethrow 交调度层与 JobErrorHandler 告警链
                throw new IllegalStateException("retry order failed: " + orderId, e);
            }
        }
    }
}
