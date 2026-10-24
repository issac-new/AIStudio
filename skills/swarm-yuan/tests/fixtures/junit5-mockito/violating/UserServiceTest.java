package com.example.service;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.junit.jupiter.api.Assertions.assertNotNull;

// 违规：断言仅 assertNotNull（无具体期望值）；@MockBean 未清理（无 @DirtiesContext）
@SpringBootTest
class UserServiceTest {

    @MockBean
    private UserRepository userRepository;

    private UserService userService = new UserService();

    @Test
    void testFindUser() {
        assertNotNull(userService.find(1L));
    }

    @Test
    void testListUsers() {
        assertNotNull(userService.list());
    }
}
