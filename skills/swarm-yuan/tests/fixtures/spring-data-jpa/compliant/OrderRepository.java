package com.example.jpa;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * compliant fixture：列表查询 Page + Pageable 分页；@EntityGraph 一次取回 items 防 N+1。
 */
public interface OrderRepository extends JpaRepository<Order, Long> {

    @EntityGraph(attributePaths = {"items"})
    Page<Order> findByStatus(Order.OrderStatus status, Pageable pageable);
}
