package com.example.cache;

import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

/**
 * 合规样例：
 * - set 带 TTL + 随机抖动（防雪崩，fw_redis_no_expire/avalanche pass）
 * - Redisson RLock（可重入 + 看门狗续期，fw_redis_lock pass）
 * - multiGet 批量读（fw_redis_pipeline pass）
 * - 空值缓存 CACHE_NULL 防穿透 + RLock 互斥重建防击穿（fw_redis_penetration/breakdown pass）
 * - key 冒号分层 order:detail:{id}（fw_redis_key_naming pass）
 * - 写库后删缓存 Cache Aside（fw_redis_db_consistency pass）
 */
@Service
public class OrderCacheService {

    private static final String ORDER_KEY = "order:detail:";
    private static final String CACHE_NULL = "NULL_VALUE";
    private static final long BASE_TTL_SECONDS = 1800;

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private OrderMapper orderMapper;

    private long jitterTtl() {
        // 基准 TTL + 随机抖动，防批量同刻过期雪崩
        return BASE_TTL_SECONDS + ThreadLocalRandom.current().nextLong(300);
    }

    public Order getOrder(String orderId) {
        Object cached = redisTemplate.opsForValue().get(ORDER_KEY + orderId);
        if (CACHE_NULL.equals(cached)) {
            return null; // 空值缓存：拦截穿透
        }
        if (cached == null) {
            RLock lock = redissonClient.getLock("order:rebuild:" + orderId);
            try {
                lock.lock(); // 互斥重建：防击穿（看门狗自动续期）
                Order order = orderMapper.selectById(orderId);
                if (order == null) {
                    redisTemplate.opsForValue().set(ORDER_KEY + orderId, CACHE_NULL,
                            Duration.ofSeconds(60));
                    return null;
                }
                redisTemplate.opsForValue().set(ORDER_KEY + orderId, order,
                        jitterTtl(), TimeUnit.SECONDS);
                return order;
            } finally {
                lock.unlock();
            }
        }
        return (Order) cached;
    }

    public List<Object> getOrders(List<String> orderIds) {
        // MGET 单命令批量读，替代循环逐条 GET
        List<String> keys = orderIds.stream().map(id -> ORDER_KEY + id).toList();
        return redisTemplate.opsForValue().multiGet(keys);
    }

    public void updateOrder(Order order) {
        // Cache Aside：先更库再删缓存
        orderMapper.updateById(order);
        redisTemplate.delete(ORDER_KEY + order.getId());
    }
}
