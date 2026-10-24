package com.example.jpa;

import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.List;

/**
 * violating fixture:
 *  - @OneToMany 无 @EntityGraph/JOIN FETCH（N+1）→ fw_jpa_nplus1(warn)
 *  - @Enumerated 无类型（默认 ORDINAL）→ fw_jpa_enum_ordinal(fail) 主触发
 *
 * 期望：bash run-framework-fixture.sh spring-data-jpa → violating 退出码 != 0（FAIL）
 */
@Entity
public class Order {

    @Id
    private Long id;

    @Enumerated
    private OrderStatus status;

    @OneToMany
    private List<OrderItem> items;

    public enum OrderStatus { NEW, PAID, SHIPPED }
}
