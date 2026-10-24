package com.example;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;

/**
 * 回归发现#18 正向用例（2026-08-27 第七轮回归）：Wrapper 字符串 API 注入面。
 * - extends BaseMapper + QueryWrapper → has_mp=1 且 Wrapper 用法存在；
 * - wrapper.inLast("...") 内 .apply( 拼接用户输入 → fw_mybatis_wrapper_injection(warn) 须命中。
 * 同时保护 #18 修复的检测分支：先筛 Wrapper 文件再扫（Function.apply 不再误报）。
 */
@org.apache.ibatis.annotations.Mapper
public interface WrapperMapper extends BaseMapper<com.example.WrapperOrder> {

    default QueryWrapper<com.example.WrapperOrder> risky(String userInput) {
        QueryWrapper<com.example.WrapperOrder> qw = new QueryWrapper<>();
        qw.apply("status = " + userInput);      // warn: 字符串拼接 apply
        qw.last("limit 1");                     // warn: last 直通
        qw.having("count(*) > " + userInput);   // warn: having 拼接
        return qw;
    }
}

class WrapperOrder { }
