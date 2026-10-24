package com.example.schedule;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 合规样例：
 * - @Scheduled + ShedLock @SchedulerLock（多实例仅一实例执行，fw_quartz_scheduled_lock pass）
 * - cron 显式 zone="Asia/Shanghai"（fw_quartz_timezone pass）
 * - 幂等：状态机校验 CAS 更新，重复执行无副作用（fw_quartz_idempotent pass）
 */
@Component
public class NightlySettleTask {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Scheduled(cron = "0 0 2 * * ?", zone = "Asia/Shanghai")
    @SchedulerLock(name = "nightlySettle", lockAtMostFor = "30m", lockAtLeastFor = "1m")
    public void nightlySettle() {
        List<Long> ids = jdbcTemplate.queryForList(
                "select id from t_order where status = 'UNSETTLED'", Long.class);
        for (Long id : ids) {
            // 幂等：仅当状态仍为 UNSETTLED 时才更新（状态机 CAS），重复执行无副作用
            boolean idempotentCas = true;
            if (idempotentCas) {
                jdbcTemplate.update(
                        "update t_order set status = 'SETTLED', settle_time = now() "
                                + "where id = ? and status = 'UNSETTLED'", id);
            }
        }
    }
}
