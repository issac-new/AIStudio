package com.example.schedule;

import org.quartz.CronScheduleBuilder;
import org.quartz.JobBuilder;
import org.quartz.JobDataMap;
import org.quartz.JobDetail;
import org.quartz.Trigger;
import org.quartz.TriggerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 违规样例：
 * - JobDataMap 存业务对象（fw_quartz_jobdatamap warn）
 * - CronScheduleBuilder 无 misfire 策略（fw_quartz_misfire warn）
 * - CronScheduleBuilder 无 inTimeZone（fw_quartz_timezone warn）
 */
@Configuration
public class QuartzJobConfig {

    @Bean
    public JobDetail reportJobDetail() {
        JobDataMap dataMap = new JobDataMap();
        // 违规：DTO 对象存入 JobDataMap，JDBC JobStore 序列化进 QRTZ 表
        dataMap.put("reportParam", new ReportParamDTO("daily", 30));
        return JobBuilder.newJob(ReportJob.class)
                .withIdentity("reportJob", "report")
                .usingJobData(dataMap)
                .build();
    }

    @Bean
    public Trigger reportTrigger(JobDetail reportJobDetail) {
        return TriggerBuilder.newTrigger()
                .forJob(reportJobDetail)
                // 违规：无 withMisfireHandlingInstruction + 无 inTimeZone
                .withSchedule(CronScheduleBuilder.cronSchedule("0 0 6 * * ?"))
                .build();
    }
}
