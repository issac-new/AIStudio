package com.example.job;

import com.xxl.job.core.handler.annotation.XxlJob;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 违规样例：
 * - 批量循环但无分片广播痕迹（fw_xxljob_route_strategy warn）
 * - 写操作无幂等保障（fw_xxljob_idempotent warn）
 * - catch 吞异常不上报失败（fw_xxljob_fail_retry warn）
 * - System.out 打印而非 XxlJobHelper.log（fw_xxljob_log_collection warn）
 */
@Component
public class BatchJobHandler {

    private JdbcTemplate jdbcTemplate;

    @XxlJob("rechargeRetryJob")
    public void rechargeRetryJob() {
        List<Long> orderIds = jdbcTemplate.queryForList(
                "select id from t_order where status = 'RETRYING'", Long.class);
        for (Long orderId : orderIds) {
            try {
                // 重复执行会重复加款（无幂等去重）
                jdbcTemplate.update(
                        "update t_account set balance = balance + 100 where order_id = ?",
                        orderId);
                System.out.println("recharged order " + orderId);
            } catch (Exception e) {
                // 吞异常：调度中心误判成功，重试与告警失效
                System.out.println("ignore error " + e.getMessage());
            }
        }
    }
}
