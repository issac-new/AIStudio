package com.example;

import com.baomidou.mybatisplus.annotation.TableName;

// 漏改字段场景：旧状态字段已重命名为 orderState（研发改字段后 XML 未同步）
// 注意：本文件注释与代码中均不得出现旧字段名字面词——field_sync 判定是词边界宽松匹配（任意出现即算同步）
@TableName("t_user")
public class User {
    private Long id;
    private String userName;
    private String orderState;

    public Long getId() { return id; }
    public String getUserName() { return userName; }
    public String getOrderState() { return orderState; }
}
