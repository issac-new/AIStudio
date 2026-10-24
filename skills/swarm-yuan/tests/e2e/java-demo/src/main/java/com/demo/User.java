package com.demo;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import java.util.List;
import lombok.Data;
/**
 * lombok 违例：@Entity + @Data 同类，懒加载递归风险
 */
@Entity
@Data
public class User {
    private Long id;
    @OneToMany private List<Order> orders;
}
class Order { private Long id; }
