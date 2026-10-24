package com.example.mq;

import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Service;

/**
 * violating fixture:
 *  - @RocketMQMessageListener 消费体无任何幂等去重 → fw_rocketmq_idempotent_consumer(fail) 主触发
 *  - 无 maxReconsumeTimes / 无 consumeThread 配置 → fw_rocketmq_retry_dlq / fw_rocketmq_backlog warn
 *
 * 期望：bash run-framework-fixture.sh rocketmq → violating 退出码 != 0（FAIL）
 */
@Service
@RocketMQMessageListener(consumerGroup = "order-consumer-group", topic = "order-topic")
public class OrderConsumer implements RocketMQListener<String> {

    private OrderRepository orderRepository;

    @Override
    public void onMessage(String message) {
        // 假设消息只投递一次：直接写库，重复消费即重复处理
        Order order = parse(message);
        orderRepository.save(order);
        deductStock(order);
    }

    private Order parse(String message) {
        return new Order(message);
    }

    private void deductStock(Order order) {
        // 库存扣减，无幂等保护
    }

    static class Order {
        Order(String payload) {}
    }

    interface OrderRepository {
        void save(Order order);
    }
}
