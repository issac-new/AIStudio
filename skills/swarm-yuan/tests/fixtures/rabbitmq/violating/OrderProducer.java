package com.example.mq;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;

/**
 * violating fixture:
 *  - 每次发送新建 Connection/Channel（连接风暴反模式）
 *  - queueDeclare durable=false（broker 重启队列消失）
 *  - basicPublish 非 persistent + 无任何发布确认
 */
public class OrderProducer {

    public void sendOrderEvent(String payload) throws Exception {
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost("rabbitmq");
        try (Connection conn = factory.newConnection();
             Channel channel = conn.createChannel()) {
            channel.queueDeclare("orders", false, false, false, null);
            channel.basicPublish("", "orders", null, payload.getBytes("UTF-8"));
        }
    }
}
