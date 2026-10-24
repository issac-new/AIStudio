package com.example.mq;

import org.apache.rocketmq.client.producer.MessageQueueSelector;
import org.apache.rocketmq.client.producer.TransactionListener;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.stereotype.Service;

/**
 * violating fixture 扩充（P1）：
 *  - MessageQueueSelector 顺序选队列发送，但消费端 OrderConsumer 仍是并发监听
 *   （无顺序监听形态）→ fw_rocketmq_orderly_listener(fail)
 *  - sendMessageInTransaction 事务消息，但本类只实现 executeLocalTransaction、
 *    缺失 broker 事务状态回查方法 → fw_rocketmq_tx_checkback(fail)
 *
 * 注意：本文件注释不得出现顺序监听注解/回查方法名的字面串，
 * 否则会反向命中门禁的「已配套」守卫，使 fail 门禁继续沉睡。
 */
@Service
public class OrderProducer implements TransactionListener {

    private RocketMQTemplate rocketMQTemplate;
    // 原生 API 选队列器：按业务键哈希选队列（由配置注入）
    private MessageQueueSelector orderQueueSelector;

    public void sendOrderCreated(Order order) {
        // 顺序发送：按订单号选队列（消费端并发监听将破坏分区顺序语义）
        rocketMQTemplate.syncSendOrderly("order-topic", buildMessage(order), String.valueOf(orderIdOf(order)));
    }

    public void sendOrderTx(Order order) {
        // 事务消息：half 消息发出后，本地事务结果无回查通道（回查方法未实现）
        rocketMQTemplate.sendMessageInTransaction("order-tx-topic", buildMessage(order), null);
    }

    @Override
    public Object executeLocalTransaction(Object msg, Object arg) {
        // 仅执行本地事务；broker 发起状态回查时无对应实现，half 消息悬挂
        return "COMMIT";
    }

    private Object buildMessage(Order order) {
        return order;
    }

    private long orderIdOf(Order order) {
        return 0L;
    }

    static class Order {
    }
}
