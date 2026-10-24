package com.example.sec;

import org.springframework.context.annotation.Bean;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * violating fixture:
 *  - extends WebSecurityConfigurerAdapter（6.x 起移除）→ fw_ssec_adapter(fail)
 *  - NoOpPasswordEncoder 弱哈希 → fw_ssec_password_encoder(fail)
 *  - .password("plaintext123") 明文密码 → fw_ssec_plaintext_password(fail)
 *  - User.withDefaultPasswordEncoder（官方标注仅 demo）→ fw_ssec_default_password_encoder(fail)
 *  - signWith("字面量") JWT 密钥硬编码 → fw_ssec_jwt_secret(fail)
 *
 * 期望：bash run-framework-fixture.sh spring-security → violating 退出码 != 0（FAIL）
 */
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return NoOpPasswordEncoder.getInstance();
    }

    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth.inMemoryAuthentication()
            .withUser("admin").password("plaintext123").roles("ADMIN");
        // demo 专用编码器混入生产配置（P1-1 唤醒 fw_ssec_default_password_encoder）
        org.springframework.security.core.userdetails.User.withDefaultPasswordEncoder()
            .username("demo").password("demo").roles("USER").build();
    }

    /** JWT 签名密钥硬编码字面量（P1-1 唤醒 fw_ssec_jwt_secret） */
    public String issueToken(String subject) {
        return io.jsonwebtoken.Jwts.builder()
            .setSubject(subject)
            .signWith("this-is-a-hardcoded-jwt-secret")
            .compact();
    }
}
