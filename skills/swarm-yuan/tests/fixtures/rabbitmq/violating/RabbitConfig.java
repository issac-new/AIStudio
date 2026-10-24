package com.example.mq;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * violating fixture: nonDurable + autoDelete 业务队列（断连即删，消息蒸发）。
 */
@Configuration
public class RabbitConfig {

    @Bean
    public Queue tmpQueue() {
        return QueueBuilder.nonDurable("orders.tmp").autoDelete().build();
    }
}
