package com.example.job;

import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.handler.annotation.XxlJob;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 合规样例：
 * - 分片广播：shardIndex % shardTotal 取模分发
 * - 幂等：insertIgnore 依赖 (order_id, biz_date) 唯一键去重，重复执行无副作用
 * - 失败显式上报 XxlJobHelper.handleFail
 * - 日志走 XxlJobHelper.log
 */
@Component
public class BatchJobHandler {

    private JdbcTemplate jdbcTemplate;

    @XxlJob("rechargeRetryJob")
    public void rechargeRetryJob() {
        int shardIndex = XxlJobHelper.getShardIndex();
        int shardTotal = XxlJobHelper.getShardTotal();
        List<Long> orderIds = jdbcTemplate.queryForList(
                "select id from t_order where status = 'RETRYING'", Long.class);
        for (Long orderId : orderIds) {
            if (orderId % shardTotal != shardIndex) {
                continue;
            }
            try {
                // 幂等：唯一键 (order_id, biz_date)，重复调度不产生重复账
                jdbcTemplate.update(
                        "insert ignore into t_recharge_log(order_id, biz_date, amount) values (?, current_date, 100)",
                        orderId);
                XxlJobHelper.log("recharged order {}", orderId);
            } catch (Exception e) {
                XxlJobHelper.handleFail("recharge failed order=" + orderId + " err=" + e.getMessage());
                throw new IllegalStateException("recharge failed", e);
            }
        }
    }
}
