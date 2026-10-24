package com.example;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.util.List;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

/**
 * compliant fixture:
 *  - @Entity 上用 @Getter @Setter 替代 @Data（无 @Data → fw_lombok_data_jpa pass）
 *  - @ToString/@EqualsAndHashCode 显式排除 orders 懒加载字段（fw_lombok_equals_lazy pass）
 *  - 无 @Slf4j + LoggerFactory.getLogger 共存（fw_lombok_slf4j_dup pass）
 *  - 无 @Builder（fw_lombok_builder_jackson pass）
 *  - 无 @SneakyThrows/@Cleanup/@Getter(lazy=true)/val 等（其余门禁 pass）
 *
 * 期望：bash run-framework-fixture.sh lombok → compliant 退出码 == 0（PASS）
 */
@Entity
@Table(name = "t_user")
@Getter
@Setter
@ToString(exclude = {"orders"})
@EqualsAndHashCode(of = {"id"})
public class User {
    @Id
    private Long id;

    private String name;

    @OneToMany(mappedBy = "user")
    private List<Order> orders;
}
