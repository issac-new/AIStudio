import com.alibaba.druid.pool.DruidDataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

// compliant: Druid 连接池 + SSL verify-full + 参数化查询 + 凭证经环境变量注入
public class App {
    public static void main(String[] args) throws Exception {
        DruidDataSource ds = new DruidDataSource();
        ds.setDriverClassName("org.opengauss.Driver");
        ds.setUrl("jdbc:opengauss://127.0.0.1:5432/appdb?sslmode=verify-full&sslrootcert=/etc/opengauss/root.crt");
        ds.setUsername(System.getenv("OPENGAUSS_USER"));
        ds.setPassword(System.getenv("OPENGAUSS_PASSWORD"));
        ds.setMaxActive(20);
        try (Connection conn = ds.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, name FROM users WHERE tenant_id = ? AND name = ?")) {
            ps.setLong(1, Long.parseLong(System.getenv("TENANT_ID")));
            ps.setString(2, args[0]);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    System.out.println(rs.getLong(1));
                }
            }
        }
    }
}
