package com.example.app;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * violating fixture:
 *  - @Transactional 方法 doSave 被同类方法 callSave 直接调用（this.doSave）→ 事务失效
 *    触发 fw_sboot_transactional_selfinvoke(fail)
 *
 * 期望：bash run-framework-fixture.sh spring-boot → violating 退出码 != 0（FAIL）
 */
@Service
public class OrderService {

    @Transactional
    public void doSave(String order) {
        // 写库
    }

    public void callSave(String order) {
        this.doSave(order);
    }
}
