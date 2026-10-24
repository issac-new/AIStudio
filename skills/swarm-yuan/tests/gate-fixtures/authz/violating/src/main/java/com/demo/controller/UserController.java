package com.demo.controller;

// 违例样本：控制器含请求映射但全文无鉴权注解/安全配置（CWE-862 缺失授权）
@RestController
public class UserController {

    @GetMapping("/users")
    public List<User> list() {
        return userService.findAll();
    }

    @PostMapping("/users")
    public User create(User input) {
        return userService.save(input);
    }
}
