package com.example.schedule;

import org.quartz.Job;
import org.quartz.JobExecutionContext;
import org.quartz.JobExecutionException;

/**
 * 违规样例：Job 实现类无 @DisallowConcurrentExecution（fw_quartz_disallow_concurrent warn）
 */
public class ReportJob implements Job {

    @Override
    public void execute(JobExecutionContext context) throws JobExecutionException {
        // 生成报表（共享输出文件，并发执行会写坏）
    }
}
