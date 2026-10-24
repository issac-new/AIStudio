package com.demo;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 定时任务入口（DIM_SCHEDULE_JOB 枚举目标；§C+.2-J 链路：读写 t_user/t_order 资产，
 * 改 User/Order 字段的影响面必须覆盖本 job——reader/writer 的 SQL 列是内嵌字符串，import 边查不到）
 */
@Component
public class ReportJob {
    private final UserMapper userMapper;

    public ReportJob(UserMapper userMapper) { this.userMapper = userMapper; }

    @Scheduled(cron = "0 0 * * * *")
    public void runHourly() {
        userMapper.list();
    }
}
