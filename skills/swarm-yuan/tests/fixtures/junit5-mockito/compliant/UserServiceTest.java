package com.example.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// 合规：纯单测 MockitoExtension + @Mock（无 Spring 上下文成本），断言含具体期望值，verify 显式次数
@ExtendWith(MockitoExtension.class)
@DisplayName("UserService 单元测试")
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = new UserService(userRepository);
    }

    @Test
    @DisplayName("find: 用户存在时应返回其用户名")
    void find_shouldReturnUsername_whenUserExists() {
        when(userRepository.findNameById(1L)).thenReturn("alice");

        String name = userService.find(1L);

        assertEquals("alice", name);
        verify(userRepository, times(1)).findNameById(1L);
    }
}
