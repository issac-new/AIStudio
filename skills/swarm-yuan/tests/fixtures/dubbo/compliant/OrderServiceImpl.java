package com.example.dubbo;

import org.apache.dubbo.config.annotation.DubboService;

/**
 * compliant fixture:
 *  - @DubboService 显式 version + timeout + retries=0（写接口不重试；此前 Javadoc 声称已声明而代码缺失，
 *    warn 级误报从未被双态夹具抓住——warn 盲区实录）
 *  - 本 Javadoc 提及 @DubboService 字样但不是注解：门禁须剥注释，否则把注释行当未带 version 的注解报警
 *  - qos 仅本机（默认），注册中心地址在 application.yml 以 Spring Boot 嵌套形态声明（registry: / address: N/A）
 *
 * 期望：bash run-framework-fixture.sh dubbo → compliant 退出码 == 0 且 timeout_idempotent/version_required/registry 零 warn
 */
@DubboService(version = "1.0.0", timeout = 3000, retries = 0)
public class OrderServiceImpl {
    public String createOrder(String sku, int count) {
        return "ok";
    }
}
