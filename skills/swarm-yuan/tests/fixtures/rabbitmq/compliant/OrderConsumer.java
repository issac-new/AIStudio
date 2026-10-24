package com.example.mq;

import com.rabbitmq.client.Channel;
import java.io.IOException;
import java.time.Duration;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

/**
 * compliant fixture:
 *  - acknowledge-mode: manual（见 application.yml），业务成功才 basicAck，失败 basicNack 进 DLQ
 *  - message-id SETNX 幂等去重；concurrency 显式配置
 *
 * 期望：bash run-framework-fixture.sh rabbitmq → compliant 退出码 = 0（PASS）
 */
@Service
public class OrderConsumer {

    private StringRedisTemplate redisTemplate;
    private OrderRepository orderRepository;

    @RabbitListener(queues = "orders", concurrency = "2-8")
    public void onMessage(@Payload String payload,
                          @Header(AmqpHeaders.MESSAGE_ID) String messageId,
                          @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag,
                          Channel channel) throws IOException {
        // 幂等去重：message-id 为业务唯一键
        Boolean firstSeen = redisTemplate.opsForValue()
            .setIfAbsent("rabbitmq:dedup:" + messageId, "1", Duration.ofDays(1));
        if (Boolean.FALSE.equals(firstSeen)) {
            channel.basicAck(deliveryTag, false);
            return;
        }
        try {
            Order order = parse(payload);
            orderRepository.save(order);
            charge(order);
            channel.basicAck(deliveryTag, false);
        } catch (Exception e) {
            // requeue=false，失败消息路由 DLQ 兜底
            channel.basicNack(deliveryTag, false, false);
        }
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
