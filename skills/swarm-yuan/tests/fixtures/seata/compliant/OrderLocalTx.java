package com.example.seata;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * compliant fixture: 本地事务拆到独立 bean，与全局事务边界分离。
 */
@Service
public class OrderLocalTx {

    @Transactional(rollbackFor = Exception.class)
    public void saveOrder(String sku, int count) {
        // 本地事务边界
    }
}
