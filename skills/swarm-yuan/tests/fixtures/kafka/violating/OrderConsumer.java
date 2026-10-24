package com.example.mq;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

/**
 * violating fixture:
 *  - 消费体无幂等去重，无 concurrency，无死信配置
 *  - application.yml 侧 enable-auto-commit=true + acks=0 为 fail 主触发
 *
 * 期望：bash run-framework-fixture.sh kafka → violating 退出码 != 0（FAIL）
 */
@Service
public class OrderConsumer {

    private OrderRepository orderRepository;

    @KafkaListener(topics = "orders", groupId = "order-group")
    public void onMessage(ConsumerRecord<String, String> record) {
        Order order = parse(record.value());
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
