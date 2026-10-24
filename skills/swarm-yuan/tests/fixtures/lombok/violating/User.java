package com.example;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.util.List;
import lombok.Data;
import lombok.ToString;

/**
 * violating fixture:
 *  - @Entity + @Data 同文件 → 触发 fw_lombok_data_jpa(fail)
 *  - @Data 含 @EqualsAndHashCode/@ToString 全字段 → @OneToMany 懒加载触发 LazyInitializationException
 *  - @ToString 未排除 orders → 同样问题
 *
 * 期望：bash run-framework-fixture.sh lombok → violating 退出码 != 0（FAIL）
 */
@Entity
@Table(name = "t_user")
@Data
@ToString
public class User {
    @Id
    private Long id;

    private String name;

    @OneToMany(mappedBy = "user")
    private List<Order> orders;
}
