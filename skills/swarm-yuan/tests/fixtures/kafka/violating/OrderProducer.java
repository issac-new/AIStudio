package com.example.mq;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

/**
 * violating fixture: 两参构造无 key，同业务键消息散布多分区全局乱序。
 */
@Service
public class OrderProducer {

    private KafkaTemplate<String, String> kafkaTemplate;

    public void sendOrderEvent(String payload) {
        kafkaTemplate.send(new ProducerRecord<>("orders", payload));
    }
}
