package com.example;

import org.apache.ibatis.annotations.Mapper;

/**
 * violating fixture 扩充（P1）：第 1 个 Mapper 接口（@Mapper 注解形态）。
 * 与 ProductMapper 合计 mcnt=2，而 XML namespace 仅 1 个 → fw_mybatis_binding(fail)。
 */
@Mapper
public interface OrderMapper {
}
