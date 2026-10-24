package com.example.dubbo;

import org.apache.dubbo.config.annotation.DubboReference;
import org.springframework.stereotype.Component;

/**
 * compliant fixture: 走注册中心，无直连 url；显式 timeout。
 */
@Component
public class OrderConsumer {

    @DubboReference(version = "1.0.0", timeout = 3000)
    private Object orderService;
}
