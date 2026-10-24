package com.example.job;

import org.apache.shardingsphere.elasticjob.api.ShardingContext;
import org.apache.shardingsphere.elasticjob.simple.job.SimpleJob;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 违规样例：
 * - 用 getShardingItem 但不按 totalCount 取模分发，每实例处理全量数据（fw_elasticjob_sharding warn）
 * - 写操作无幂等保障（fw_elasticjob_idempotent warn）
 * - catch 吞异常不上报（fw_elasticjob_error_handler warn）
 */
@Component
public class OrderShardingJob implements SimpleJob {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public void execute(ShardingContext context) {
        int item = context.getShardingItem();
        // 违规：仅打日志，查询不按 item % totalCount 过滤 → 每实例全量重复处理
        System.out.println("sharding item = " + item);
        List<Long> orderIds = jdbcTemplate.queryForList(
                "select id from t_order where status = 'RETRYING'", Long.class);
        for (Long orderId : orderIds) {
            try {
                // 重复执行会重复加款（无幂等去重）
                jdbcTemplate.update(
                        "update t_account set balance = balance + 100 where order_id = ?",
                        orderId);
            } catch (Exception e) {
                // 吞异常：调度层误判成功
                System.out.println("ignore " + e.getMessage());
            }
        }
    }
}
