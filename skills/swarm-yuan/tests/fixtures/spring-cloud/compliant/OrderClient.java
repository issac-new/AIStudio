package com.example.cloud;

import org.springframework.cloud.openfeign.FeignClient;

/**
 * compliant fixture:
 *  - @FeignClient 配 fallbackFactory + 超时（application.yml）
 *  - 配置中心密码 {cipher} 加密
 *
 * 期望：bash run-framework-fixture.sh spring-cloud → compliant 退出码 0（PASS）
 */
@FeignClient(name = "order-service", fallbackFactory = OrderClientFallback.class)
public interface OrderClient {
    String getOrder(String id);
}
