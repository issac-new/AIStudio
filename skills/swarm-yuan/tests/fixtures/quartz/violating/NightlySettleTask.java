package com.example.schedule;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 违规样例：
 * - @Scheduled 多实例部署无 ShedLock/分布式锁（fw_quartz_scheduled_lock fail 主触发）
 * - cron 无 zone 时区（fw_quartz_timezone warn）
 * - 写操作无幂等（fw_quartz_idempotent warn）
 */
@Component
public class NightlySettleTask {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // 多实例部署时每台实例都会触发，重复结算
    @Scheduled(cron = "0 0 2 * * ?")
    public void nightlySettle() {
        List<Long> ids = jdbcTemplate.queryForList(
                "select id from t_order where status = 'UNSETTLED'", Long.class);
        for (Long id : ids) {
            jdbcTemplate.update(
                    "update t_account set balance = balance + ? where order_id = ?", 100, id);
        }
    }
}
