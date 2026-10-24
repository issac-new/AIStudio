package com.example.cloud;

import org.springframework.cloud.openfeign.FeignClient;

/**
 * violating fixture:
 *  - @FeignClient 无 fallback + 超时未配 → fw_scloud_feign_fallback/timeout warn
 *  - 配置中心明文 password（application.yml）→ fw_scloud_config_encrypt(fail) 主触发
 *
 * 期望：bash run-framework-fixture.sh spring-cloud → violating 退出码 != 0（FAIL）
 */
@FeignClient(name = "order-service")
public interface OrderClient {
    String getOrder(String id);
}
