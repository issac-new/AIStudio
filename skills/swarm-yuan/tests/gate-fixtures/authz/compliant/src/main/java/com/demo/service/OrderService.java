package com.demo.service;

// 合规模本：主键来自服务端会话主体（非用户可控键值直取）
public class OrderService {

    public Order getOrder(AuthPrincipal principal, long orderId) {
        Order order = orderRepository.findById(orderId);
        if (!order.belongsTo(principal.getTenantId())) {
            throw new AccessDeniedException("跨租户访问被拒绝");
        }
        return order;
    }
}
