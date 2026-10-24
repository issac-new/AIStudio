package com.example.seata;

import io.seata.rm.tcc.api.BusinessActionContext;
import io.seata.rm.tcc.api.TwoPhaseBusinessAction;

/**
 * violating fixture: TCC 未开启 useTCCFence（空回滚/幂等/悬挂三坑无防护）。
 */
public interface AccountTccAction {

    @TwoPhaseBusinessAction(name = "deduct")
    boolean prepare(BusinessActionContext ctx, String accountId, long amount);

    boolean commit(BusinessActionContext ctx);

    boolean rollback(BusinessActionContext ctx);
}
