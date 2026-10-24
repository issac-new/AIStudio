package com.example.mq;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

/**
 * compliant fixture: 三参构造带业务键 key（同订单恒同分区，保分区内有序）。
 */
@Service
public class OrderProducer {

    private KafkaTemplate<String, String> kafkaTemplate;

    public void sendOrderEvent(String orderId, String payload) {
        kafkaTemplate.send(new ProducerRecord<>("orders", orderId, payload));
    }
}
