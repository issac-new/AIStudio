package com.example.dubbo;

import org.apache.dubbo.config.annotation.DubboService;

/**
 * violating fixture:
 *  - @DubboService 无 version / timeout → fw_dubbo_version_required/timeout_config warn
 *  - application.properties qos 公网暴露 → fw_dubbo_qos_exposure(fail) 主触发
 *  - 消费端直连 url → fw_dubbo_direct_url(fail) 次触发
 *
 * 期望：bash run-framework-fixture.sh dubbo → violating 退出码 != 0（FAIL）
 */
@DubboService
public class OrderServiceImpl {
    public String createOrder(String sku, int count) {
        return "ok";
    }
}
