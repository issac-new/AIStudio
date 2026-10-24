package com.example.seata;

import io.seata.spring.annotation.GlobalTransactional;
import org.springframework.stereotype.Service;

/**
 * compliant fixture:
 *  - 全局事务独立方法（不与 @Transactional 同边界），显式 timeoutMills
 *  - 本地事务拆到独立 bean（OrderLocalTx）
 *
 * 期望：bash run-framework-fixture.sh seata → compliant 退出码 == 0（PASS）
 */
@Service
public class OrderService {

    private final OrderLocalTx localTx;

    public OrderService(OrderLocalTx localTx) {
        this.localTx = localTx;
    }

    @GlobalTransactional(timeoutMills = 300000, rollbackFor = Exception.class)
    public void createOrder(String sku, int count) {
        localTx.saveOrder(sku, count);
    }
}
