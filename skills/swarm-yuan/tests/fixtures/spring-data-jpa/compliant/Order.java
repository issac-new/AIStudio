package com.example.jpa;

import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * compliant fixture:
 *  - @Enumerated(EnumType.STRING)（禁 ORDINAL）
 *  - @OneToMany LAZY + Repository @EntityGraph（防 N+1）
 *  - @Version 乐观锁 + Service 捕获 OptimisticLockingFailureException
 *  - @CreatedDate/@LastModifiedDate + @EnableJpaAuditing（JpaConfig）
 *  - equals/hashCode 用业务键 orderNo，不含懒加载关联
 */
@Entity
@EntityListeners(AuditingEntityListener.class)
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private long version;

    private String orderNo;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
    private List<OrderItem> items;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant modifiedAt;

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Order)) return false;
        Order other = (Order) o;
        return orderNo != null && orderNo.equals(other.orderNo);
    }

    @Override
    public int hashCode() {
        return orderNo != null ? orderNo.hashCode() : getClass().hashCode();
    }

    public enum OrderStatus { NEW, PAID, SHIPPED }
}
