package com.example.mq;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

/**
 * violating fixture:
 *  - 消费体无幂等去重（at-least-once 重投必重复）
 *  - 无 concurrency（spring-amqp 默认单线程串行）
 *  - 无 DLX 死信配置；application.yml 侧 acknowledge-mode: none 为 fail 主触发
 *
 * 期望：bash run-framework-fixture.sh rabbitmq → violating 退出码 != 0（FAIL）
 */
@Service
public class OrderConsumer {

    private OrderRepository orderRepository;

    @RabbitListener(queues = "orders")
    public void onMessage(String payload) {
        Order order = parse(payload);
        orderRepository.save(order);
        charge(order);
    }

    private Order parse(String payload) {
        return new Order(payload);
    }

    private void charge(Order order) {
        // 扣款，无重复消费保护
    }

    static class Order {
        Order(String payload) {}
    }

    interface OrderRepository {
        void save(Order order);
    }
}
