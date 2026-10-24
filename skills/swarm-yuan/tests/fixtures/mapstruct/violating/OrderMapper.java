package com.example.map;

import org.mapstruct.Mapper;

/**
 * violating fixture:
 *  - @Mapper 无 unmappedTargetPolicy=ERROR（默认 IGNORE 静默漏映射）→ fw_mapstruct_unmapped_target(fail)
 *  - pom.xml lombok + mapstruct 无 lombok-mapstruct-binding → fw_mapstruct_lombok_binding(fail)
 *  - annotationProcessorPaths 中 mapstruct-processor 先于 lombok → fw_mapstruct_processor_order(warn)
 *
 * 期望：bash run-framework-fixture.sh mapstruct → violating 退出码 != 0（FAIL）
 */
@Mapper
public interface OrderMapper {

    OrderDto toDto(Order order);
}
