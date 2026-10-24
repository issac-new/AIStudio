package com.example.dto;

import com.fasterxml.jackson.annotation.JsonTypeInfo;

// 违规：@JsonTypeInfo 未声明兜底实现类（未知 type id 无兜底；须配 @JsonSubTypes 白名单）
// 注：本文件任何位置不得出现兜底参数关键字字面量——门禁按 @JsonTypeInfo 起 8 行窗口 grep，
// 注释里出现该字面量会把 fail 触发中和掉（2026-07-20 P1 唤醒修复前即因此沉睡）。
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
public abstract class Shape {
    public String name;
}
