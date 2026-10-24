package com.example.dubbo;

import org.apache.dubbo.config.annotation.DubboReference;
import org.springframework.stereotype.Component;

/**
 * violating fixture: 直连 url 绕过注册中心（生产禁用）。
 */
@Component
public class OrderConsumer {

    @DubboReference(url = "dubbo://192.168.1.10:20880")
    private Object orderService;
}
