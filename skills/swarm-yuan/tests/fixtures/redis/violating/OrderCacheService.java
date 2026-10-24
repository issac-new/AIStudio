package com.example.cache;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 违规样例：
 * - set 二参无 TTL（fw_redis_no_expire fail 主触发）
 * - 裸 setIfAbsent 锁：无 owner 标识、无过期时间（fw_redis_lock fail 主触发）
 * - 循环逐条 GET 无 multiGet/pipeline（fw_redis_pipeline warn）
 * - miss 回源无空值缓存/布隆、无互斥重建（fw_redis_penetration/breakdown warn）
 * - 字面量 key 无冒号分层（fw_redis_key_naming warn）
 * - 写库无删缓存（fw_redis_db_consistency warn）
 */
@Service
public class OrderCacheService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private OrderMapper orderMapper;

    public Order getOrder(String orderId) {
        Object cached = redisTemplate.opsForValue().get("orderCache");
        if (cached == null) {
            // 穿透：无空值缓存/布隆；击穿：无互斥锁直接并发回源
            Order order = orderMapper.selectById(orderId);
            // 无 TTL 常驻缓存（fw_redis_no_expire fail）
            redisTemplate.opsForValue().set("orderCache", order);
            return order;
        }
        return (Order) cached;
    }

    public List<Order> getOrders(List<String> orderIds) {
        List<Order> result = new ArrayList<>();
        // 循环逐条 GET（fw_redis_pipeline warn）
        for (String id : orderIds) {
            Object o = redisTemplate.opsForValue().get("order_" + id);
            if (o != null) {
                result.add((Order) o);
            }
        }
        return result;
    }

    public void updateOrder(Order order) {
        // 写库但无删缓存痕迹（fw_redis_db_consistency warn）
        orderMapper.updateById(order);
    }

    public boolean tryLock(String bizKey) {
        // 裸 SETNX 锁：无 owner UUID、无 expire（fw_redis_lock fail）
        Boolean ok = redisTemplate.opsForValue().setIfAbsent("lock_" + bizKey, "1");
        return Boolean.TRUE.equals(ok);
    }

    public void unlock(String bizKey) {
        redisTemplate.delete("lock_" + bizKey);
    }
}
