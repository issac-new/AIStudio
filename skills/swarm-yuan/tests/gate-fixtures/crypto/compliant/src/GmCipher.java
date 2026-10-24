import javax.crypto.Cipher;

// 加解密工具样本（compliant）：使用国密白名单算法 SM4
public class GmCipher {
    public static Cipher sm4Cipher() throws Exception {
        return Cipher.getInstance("SM4/GCM/NoPadding");
    }
}
