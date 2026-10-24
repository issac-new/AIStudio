package com.example.job;

import com.xxl.job.core.context.XxlJobHelper;
import com.xxl.job.core.handler.annotation.XxlJob;
import groovy.lang.GroovyClassLoader;
import org.springframework.stereotype.Component;

/**
 * violating fixture（2026-07-20 P1 唤醒沉睡 fail 门禁）：
 *  - GroovyClassLoader 动态执行 API 与 XxlJobHelper.getJobParam 任务参数同文件
 *    → 任务参数拼入代码执行 = RCE，触发 fw_xxljob_glue_injection(fail)
 *
 * 期望：bash run-framework-fixture.sh xxl-job → violating 退出码 != 0（FAIL）
 */
@Component
public class GlueJobHandler {

    @XxlJob("glueEvalJob")
    public void glueEvalJob() throws Exception {
        String param = XxlJobHelper.getJobParam();
        GroovyClassLoader loader = new GroovyClassLoader();
        // 任务参数直接当代码解析执行（RCE 面）
        Class<?> scriptClass = loader.parseClass(param);
        scriptClass.getDeclaredConstructor().newInstance();
    }
}
