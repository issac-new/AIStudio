package com.demo.service;

// 违例样本：用户可控主键直取对象（IDOR 风险，CWE-639）
public class OrderService {

    public Order getOrder(HttpServletRequest request) {
        return orderRepository.findById(request.getParameter("orderId"));
    }
}
