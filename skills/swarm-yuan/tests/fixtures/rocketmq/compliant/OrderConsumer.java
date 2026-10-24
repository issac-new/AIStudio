package com.example.mq;

import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * compliant fixture:
 *  - 消费幂等：msgKey 经 Redis setIfAbsent（SETNX + TTL）去重
 *  - 显式 maxReconsumeTimes / consumeThreadNumber；重试耗尽进 %DLQ% 由独立兜底任务处理
 *  - application.yml 双侧开启 enable-msg-trace
 *
 * 期望：bash run-framework-fixture.sh rocketmq → compliant 退出码 0（PASS）
 */
@Service
@RocketMQMessageListener(
        consumerGroup = "order-consumer-group",
        topic = "order-topic",
        maxReconsumeTimes = 3,
        consumeThreadNumber = 20)
public class OrderConsumer implements RocketMQListener<String> {

    private StringRedisTemplate stringRedisTemplate;
    private OrderRepository orderRepository;

    @Override
    public void onMessage(String message) {
        // 幂等去重：以业务唯一键 SETNX，已消费直接返回（at-least-once 重复投递防护）
        String msgKey = extractMsgKey(message);
        Boolean firstConsume = stringRedisTemplate.opsForValue()
                .setIfAbsent("rocketmq:consume:" + msgKey, "1", Duration.ofHours(24));
        if (!Boolean.TRUE.equals(firstConsume)) {
            return; // 重复消息，幂等跳过
        }
        Order order = parse(message);
        orderRepository.save(order); // DB 侧另有 uk_order_no 唯一键兜底
        deductStock(order);
    }

    private String extractMsgKey(String message) {
        return message.substring(0, Math.min(32, message.length()));
    }

    private Order parse(String message) {
        return new Order(message);
    }

    private void deductStock(Order order) {
        // 库存扣减，业务唯一键幂等
    }

    static class Order {
        Order(String payload) {}
    }

    interface OrderRepository {
        void save(Order order);
    }
}
