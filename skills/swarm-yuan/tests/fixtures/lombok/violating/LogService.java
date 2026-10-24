package com.example;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * violating fixture（2026-07-20 P1 唤醒沉睡 fail 门禁）：
 *  - @Slf4j 已生成 log 字段，同文件又手写 LoggerFactory.getLogger → 触发 fw_lombok_slf4j_dup(fail)
 *
 * 期望：bash run-framework-fixture.sh lombok → violating 退出码 != 0（FAIL）
 */
@Slf4j
public class LogService {

    private static final Logger logger = LoggerFactory.getLogger(LogService.class);

    public void doWork() {
        logger.info("manual logger");
        log.info("lombok logger");
    }
}
