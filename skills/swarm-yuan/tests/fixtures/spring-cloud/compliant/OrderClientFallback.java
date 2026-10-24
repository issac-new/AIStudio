package com.example.cloud;

import org.springframework.stereotype.Component;

@Component
public class OrderClientFallback implements org.springframework.cloud.openfeign.FallbackFactory<OrderClient> {
    @Override
    public OrderClient create(Throwable cause) {
        return id -> "fallback-order";
    }
}
