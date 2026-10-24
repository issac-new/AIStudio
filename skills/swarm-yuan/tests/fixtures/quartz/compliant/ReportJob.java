package com.example.schedule;

import org.quartz.DisallowConcurrentExecution;
import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.quartz.JobExecutionException;
import org.quartz.PersistJobDataAfterExecution;

/**
 * 合规样例：
 * - @DisallowConcurrentExecution：同一 JobDetail 串行执行（fw_quartz_disallow_concurrent pass）
 * - @PersistJobDataAfterExecution：JobDataMap 状态跨执行写回 JobStore
 */
@DisallowConcurrentExecution
@PersistJobDataAfterExecution
public class ReportJob implements Job {

    @Override
    public void execute(JobExecutionContext context) throws JobExecutionException {
        // 生成报表：按 JobDataMap 中 reportType/lookbackDays 回源查库
        long lookback = context.getMergedJobDataMap().getLong("lookbackDays");
        String type = context.getMergedJobDataMap().getString("reportType");
        context.getJobDetail().getJobDataMap().put("lastRunMillis", System.currentTimeMillis());
    }
}
