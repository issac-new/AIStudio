package com.example.order;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;

/**
 * compliant fixture:
 *  - @SentinelResource 配 blockHandler（BlockException 通道）+ fallback（业务异常通道），分工明确
 *  - 降级方法均为本地轻量兜底，无远程调用
 *  - application.yml 已配 Nacos 数据源持久化规则 → fw_sentinel_rule_persist pass
 *
 * 期望：bash run-framework-fixture.sh sentinel → compliant 退出码 0（PASS）
 */
public class OrderService {

    @SentinelResource(value = "orderQuery", blockHandler = "queryBlockHandler", fallback = "queryFallback")
    public String queryOrder(String orderId) {
        return "order-" + orderId;
    }

    /** 限流/熔断/系统保护通道：本地兜底，禁止远程调用 */
    public String queryBlockHandler(String orderId, BlockException ex) {
        return "order-degraded";
    }

    /** 业务异常通道：本地兜底 */
    public String queryFallback(String orderId, Throwable t) {
        return "order-fallback";
    }
}
