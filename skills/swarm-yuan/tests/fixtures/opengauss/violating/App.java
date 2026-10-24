import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

// violating: 连接串内嵌凭证 + 明文传输 + DriverManager 裸连（无连接池）
public class App {
    public static void main(String[] args) throws Exception {
        Connection conn = DriverManager.getConnection(
            "jdbc:opengauss://127.0.0.1:5432/appdb?user=admin&password=Admin@123&sslmode=disable");
        // violating: SQL 字符串拼接 + createStatement 裸语句执行
        String userName = args[0];
        String sql = "SELECT * FROM users WHERE name = '" + userName + "'";
        Statement st = conn.createStatement();
        ResultSet rs = st.executeQuery(sql);
        while (rs.next()) {
            System.out.println(rs.getString(1));
        }
    }
}
