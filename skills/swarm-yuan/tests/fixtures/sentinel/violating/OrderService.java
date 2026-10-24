package com.example.order;

import com.alibaba.csp.sentinel.annotation.SentinelResource;

/**
 * violating fixture:
 *  - @SentinelResource 无 blockHandler/fallback → fw_sentinel_resource_fallback(warn)
 *  - 无任何数据源持久化配置（application.yml 仅 transport.dashboard）→ fw_sentinel_rule_persist(fail) 主触发
 *
 * 期望：bash run-framework-fixture.sh sentinel → violating 退出码 != 0（FAIL）
 */
public class OrderService {

    @SentinelResource(value = "orderQuery")
    public String queryOrder(String orderId) {
        return "order-" + orderId;
    }
}
