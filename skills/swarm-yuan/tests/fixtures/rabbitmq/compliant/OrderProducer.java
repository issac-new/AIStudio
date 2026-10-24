package com.example.mq;

import java.util.UUID;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

/**
 * compliant fixture: persistent 消息 + message-id（供消费端幂等）+ CorrelationData 配套 confirm。
 */
@Service
public class OrderProducer {

    private RabbitTemplate rabbitTemplate;

    public void sendOrderEvent(String orderId, String payload) {
        rabbitTemplate.convertAndSend("orders.exchange", "orders.created", payload,
            message -> {
                message.getMessageProperties().setMessageId(
                    orderId + "-" + UUID.randomUUID());
                message.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                return message;
            },
            new CorrelationData(orderId));
    }
}
