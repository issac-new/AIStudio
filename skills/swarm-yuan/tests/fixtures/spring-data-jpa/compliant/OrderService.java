package com.example.jpa;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * compliant fixture:
 *  - 查询方法 @Transactional(readOnly = true) 关脏检查
 *  - 写路径在托管实体上改字段（不 setId + save 部分更新）
 *  - 乐观锁冲突捕获 OptimisticLockingFailureException 转业务重试
 */
@Service
public class OrderService {

    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Transactional(readOnly = true)
    public Page<Order> findByStatus(Order.OrderStatus status, Pageable pageable) {
        return orderRepository.findByStatus(status, pageable);
    }

    @Transactional
    public Order updateStatus(Long id, Order.OrderStatus status) {
        try {
            Order order = orderRepository.findById(id).orElseThrow();
            order.setStatus(status);
            return orderRepository.save(order);
        } catch (OptimisticLockingFailureException e) {
            throw new IllegalStateException("并发修改冲突，请重试", e);
        }
    }
}
