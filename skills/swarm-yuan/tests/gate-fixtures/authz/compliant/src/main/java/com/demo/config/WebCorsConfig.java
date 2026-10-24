package com.demo.config;

// 合规模本：CORS 显式域名白名单（非 "*" 全放行）
public class WebCorsConfig {

    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("https://app.internal.example.cn")
            .allowCredentials(true);
    }
}
