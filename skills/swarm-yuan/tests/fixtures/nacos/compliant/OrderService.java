package com.example.order;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;

/**
 * compliant fixture:
 *  - @Value + @RefreshScope：Nacos 配置推送后注入值可刷新 → fw_nacos_config_listener pass
 *  - application.yml：namespace 隔离 + 集群 server-addr + metadata + 敏感值 ${ENV} 外部化
 *
 * 期望：bash run-framework-fixture.sh nacos → compliant 退出码 0（PASS）
 */
@Service
@RefreshScope
public class OrderService {

    @Value("${order.timeout:3000}")
    private long orderTimeout;

    public long getOrderTimeout() {
        return orderTimeout;
    }
}
