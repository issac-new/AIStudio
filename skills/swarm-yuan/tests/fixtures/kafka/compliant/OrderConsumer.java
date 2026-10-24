package com.example.mq;

import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Service;

/**
 * compliant fixture:
 *  - 手动提交（AckMode.MANUAL）+ setIfAbsent 业务唯一键去重（幂等）
 *  - concurrency 显式配置（<= 分区数），@RetryableTopic + @DltHandler 死信兜底
 *  - MeterRegistry 埋点 lag/吞吐观测；CooperativeSticky 增量再均衡（见 application.yml）
 *
 * 期望：bash run-framework-fixture.sh kafka → compliant 退出码 = 0（PASS）
 */
@Service
public class OrderConsumer {

    private StringRedisTemplate redisTemplate;
    private MeterRegistry meterRegistry;
    private OrderRepository orderRepository;

    @RetryableTopic(attempts = "4", dltTopicSuffix = ".DLT")
    @KafkaListener(topics = "orders", groupId = "order-group", concurrency = "3")
    public void onMessage(ConsumerRecord<String, String> record, Acknowledgment ack) {
        String msgKey = record.key();
        // 幂等去重：业务唯一键 SETNX，重复投递直接确认跳过
        Boolean firstSeen = redisTemplate.opsForValue()
            .setIfAbsent("kafka:dedup:" + msgKey, "1", java.time.Duration.ofDays(1));
        if (Boolean.FALSE.equals(firstSeen)) {
            ack.acknowledge();
            return;
        }
        Order order = parse(record.value());
        orderRepository.save(order);
        charge(order);
        meterRegistry.counter("kafka.consume.success", "topic", "orders").increment();
        ack.acknowledge();
    }

    @DltHandler
    public void onDlt(ConsumerRecord<String, String> record) {
        // 死信消息落告警 + 人工兜底
        meterRegistry.counter("kafka.consume.dlt", "topic", "orders").increment();
    }

    private Order parse(String payload) {
        return new Order(payload);
    }

    private void charge(Order order) {
        // 扣款
    }

    static class Order {
        Order(String payload) {}
    }

    interface OrderRepository {
        void save(Order order);
    }
}
