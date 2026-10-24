package com.example.jpa;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * compliant fixture：审计字段（@CreatedDate 等）须 @EnableJpaAuditing 激活。
 */
@Configuration
@EnableJpaAuditing
public class JpaConfig {
}
