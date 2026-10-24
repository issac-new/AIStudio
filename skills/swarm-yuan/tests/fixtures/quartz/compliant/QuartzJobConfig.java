package com.example.schedule;

import org.quartz.CronScheduleBuilder;
import org.quartz.JobBuilder;
import org.quartz.JobDetail;
import org.quartz.Trigger;
import org.quartz.TriggerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.TimeZone;

/**
 * 合规样例：
 * - JobDataMap 仅存 String/long 基本类型标识（fw_quartz_jobdatamap pass）
 * - CronScheduleBuilder 显式 misfire DoNothing（对账类跳过错过的周期，fw_quartz_misfire pass）
 * - inTimeZone(Asia/Shanghai)（fw_quartz_timezone pass）
 */
@Configuration
public class QuartzJobConfig {

    @Bean
    public JobDetail reportJobDetail() {
        return JobBuilder.newJob(ReportJob.class)
                .withIdentity("reportJob", "report")
                // 仅放基本类型标识，任务执行时按 id 回源查库
                .usingJobData("reportType", "daily")
                .usingJobData("lookbackDays", 30L)
                .build();
    }

    @Bean
    public Trigger reportTrigger(JobDetail reportJobDetail) {
        return TriggerBuilder.newTrigger()
                .forJob(reportJobDetail)
                .withSchedule(CronScheduleBuilder
                        .cronSchedule("0 0 6 * * ?")
                        .inTimeZone(TimeZone.getTimeZone("Asia/Shanghai"))
                        .withMisfireHandlingInstructionDoNothing())
                .build();
    }
}
