package com.example.seata;

import io.seata.rm.tcc.api.BusinessActionContext;
import io.seata.rm.tcc.api.TwoPhaseBusinessAction;

/**
 * compliant fixture: TCC 开启 useTCCFence（防空回滚/幂等/悬挂）+ 显式方法名。
 */
public interface AccountTccAction {

    @TwoPhaseBusinessAction(name = "deduct", commitMethod = "commit", rollbackMethod = "rollback", useTCCFence = true)
    boolean prepare(BusinessActionContext ctx, String accountId, long amount);

    boolean commit(BusinessActionContext ctx);

    boolean rollback(BusinessActionContext ctx);
}
