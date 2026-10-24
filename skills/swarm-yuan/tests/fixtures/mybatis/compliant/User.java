package com.example;

import com.baomidou.mybatisplus.annotation.TableName;

@TableName("t_user")
public class User {
    private Long id;
    private String userName;
    private String orderState;

    public Long getId() { return id; }
    public String getUserName() { return userName; }
    public String getOrderState() { return orderState; }
}
