package com.example.seata;

import io.seata.spring.annotation.GlobalTransactional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * violating fixture:
 *  - @GlobalTransactional 与 @Transactional 同边界混用 → fw_seata_local_tx_mixed(fail) 主触发
 *  - AccountTccAction 无 useTCCFence → fw_seata_tcc_fence(fail) 次触发
 *
 * 期望：bash run-framework-fixture.sh seata → violating 退出码 != 0（FAIL）
 */
@Service
public class OrderService {

    @GlobalTransactional
    @Transactional(rollbackFor = Exception.class)
    public void createOrder(String sku, int count) {
        // 本地事务先提交，全局回滚覆盖不了
    }
}
