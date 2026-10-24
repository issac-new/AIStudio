package com.example.app;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * compliant fixture:
 *  - @Transactional 方法被同类调用改为拆到独立 Bean（此处 doSave 为公开入口，无同类自调用）
 *  - Actuator 收敛、jakarta 命名空间、无字段注入
 *  - R121：@Transactional 方法体内抛 new IllegalArgumentException(...) —— 构造形态
 *    不是同类方法自调用（曾误报 fw_sboot_transactional_selfinvoke，真实项目 OrderService 中招）
 *
 * 期望：bash run-framework-fixture.sh spring-boot → compliant 退出码 0（PASS）
 */
@Service
public class OrderService {

    @Transactional
    public void doSave(String order) {
        if (order == null || order.isEmpty()) {
            throw new IllegalArgumentException("order must not be blank");
        }
        // 写库
    }

    public void validate(String order) {
        throw new IllegalStateException("unsupported in sample");
    }
}
