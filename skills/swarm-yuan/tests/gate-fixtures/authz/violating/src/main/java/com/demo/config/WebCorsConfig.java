package com.demo.config;

// 违例样本：CORS allowedOrigins("*") 且 allowCredentials(true)（CWE-284 不当访问控制）
// 附带 permitAll() 全放行样本——warn-only，不判 fail（须人工复核是否为有意公开端点）
public class WebCorsConfig {

    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
            .allowedOrigins("*")
            .allowCredentials(true);
    }

    public void configure(HttpSecurity http) {
        http.authorizeRequests().anyRequest().permitAll();
    }
}
