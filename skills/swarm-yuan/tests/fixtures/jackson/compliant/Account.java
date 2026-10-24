package com.example.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class Account {
    private String username;

    // 合规：接收侧可用、序列化侧屏蔽
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password;

    public String getUsername() { return username; }
}
