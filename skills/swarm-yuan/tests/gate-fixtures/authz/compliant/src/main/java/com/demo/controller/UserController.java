package com.demo.controller;

// 合规模本：请求映射方法显式鉴权（服务端默认拒绝、显式授权）
@RestController
@PreAuthorize("hasRole('ADMIN')")
public class UserController {

    @GetMapping("/users")
    public List<User> list() {
        return userService.findAll();
    }
}
