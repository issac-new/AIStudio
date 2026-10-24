package com.example.map;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;

/**
 * compliant fixture:
 *  - unmappedTargetPolicy = ReportingPolicy.ERROR（漏映射编译期失败）
 *  - componentModel = "spring"（Spring DI，不用 Mappers.getMapper）
 *  - @MappingTarget 更新 + NullValuePropertyMappingStrategy.IGNORE（源 null 不覆盖目标）
 *  - ignore = true 均带原因注释
 */
@Mapper(componentModel = "spring",
        unmappedTargetPolicy = ReportingPolicy.ERROR,
        nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface OrderMapper {

    OrderDto toDto(Order order);

    @Mapping(target = "id", ignore = true) // id 由 DB 生成，更新入参不携带
    void updateFromDto(OrderDto dto, @MappingTarget Order entity);
}
