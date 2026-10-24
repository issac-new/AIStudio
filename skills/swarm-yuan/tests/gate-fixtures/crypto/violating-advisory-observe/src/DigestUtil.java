import java.security.MessageDigest;

// 摘要工具样本（violating）：使用弱算法 MD5，违反 GB/T 39786 密评白名单
public class DigestUtil {
    public static byte[] digest(byte[] input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        return md.digest(input);
    }
}
