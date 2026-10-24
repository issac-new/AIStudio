package com.example.mq;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * compliant fixture:
 *  - durable quorum 队列 + DLX 死信兜底（x-dead-letter-exchange）
 *  - publisher confirm / returns 回调
 */
@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange ordersExchange() {
        return new TopicExchange("orders.exchange", true, false);
    }

    @Bean
    public DirectExchange ordersDlx() {
        return new DirectExchange("orders.dlx", true, false);
    }

    @Bean
    public Queue ordersQueue() {
        return QueueBuilder.durable("orders")
            .withArgument("x-queue-type", "quorum")
            .withArgument("x-dead-letter-exchange", "orders.dlx")
            .withArgument("x-dead-letter-routing-key", "orders.dlq")
            .build();
    }

    @Bean
    public Queue ordersDlq() {
        return QueueBuilder.durable("orders.dlq")
            .withArgument("x-queue-type", "quorum")
            .build();
    }

    @Bean
    public Binding ordersBinding(Queue ordersQueue, TopicExchange ordersExchange) {
        return BindingBuilder.bind(ordersQueue).to(ordersExchange).with("orders.#");
    }

    @Bean
    public Binding dlqBinding(Queue ordersDlq, DirectExchange ordersDlx) {
        return BindingBuilder.bind(ordersDlq).to(ordersDlx).with("orders.dlq");
    }

    @Bean
    public RabbitTemplate rabbitTemplate(org.springframework.amqp.rabbit.connection.ConnectionFactory cf) {
        RabbitTemplate template = new RabbitTemplate(cf);
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack) {
                // 发送失败告警 + 落库重投
            }
        });
        template.setReturnsCallback(returned -> {
            // 不可路由消息兜底
        });
        return template;
    }
}
