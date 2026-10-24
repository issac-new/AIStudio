package com.example.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

// 合规：Id.NAME + @JsonSubTypes 白名单 + defaultImpl 兜底未知 type id
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", defaultImpl = UnknownShape.class)
@JsonSubTypes({
    @JsonSubTypes.Type(value = CircleShape.class, name = "circle"),
    @JsonSubTypes.Type(value = UnknownShape.class, name = "unknown")
})
public abstract class Shape {
    public String name;
}
