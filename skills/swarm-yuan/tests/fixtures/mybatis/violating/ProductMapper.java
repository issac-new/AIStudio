package com.example;

import org.apache.ibatis.annotations.Mapper;

/**
 * violating fixture 扩充（P1）：第 2 个 Mapper 接口（无对应 XML namespace）。
 * 与 OrderMapper 合计 mcnt=2，而 XML namespace 仅 1 个 → fw_mybatis_binding(fail)。
 */
@Mapper
public interface ProductMapper {
}
