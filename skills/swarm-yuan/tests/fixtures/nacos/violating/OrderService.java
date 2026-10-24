package com.example.order;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * violating fixture:
 *  - @Value 注入 Nacos 配置但无 @RefreshScope → fw_nacos_config_listener(warn)
 *  - application.yml：明文 password（fw_nacos_config_encrypt fail 主触发）
 *    + 无 namespace 隔离（fw_nacos_namespace_isolation warn）
 *    + server-addr 单地址（fw_nacos_server_cluster warn）
 *
 * 期望：bash run-framework-fixture.sh nacos → violating 退出码 != 0（FAIL）
 */
@Service
public class OrderService {

    @Value("${order.timeout:3000}")
    private long orderTimeout;

    public long getOrderTimeout() {
        return orderTimeout;
    }
}
