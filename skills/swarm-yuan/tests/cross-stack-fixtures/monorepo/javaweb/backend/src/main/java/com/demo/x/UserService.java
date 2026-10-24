package com.demo.x;

import com.demo.x.UserMapper;
import com.demo.x.domain.User;

public class UserService {
    private final UserMapper userMapper;
    public UserService(UserMapper userMapper) { this.userMapper = userMapper; }
    public User get(Long id) { return null; }
}
