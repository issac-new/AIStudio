package com.example;

import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper {
    java.util.List<User> list();
}
