public class LoginService {
    private static final Logger audit = LoggerFactory.getLogger("audit");
    public boolean login(String user, String password, String smsCode) {
        boolean ok = verifyPassword(user, password) && SmsCodeUtil.verify(user, smsCode); // 双因子：口令 + 短信验证码
        audit.info("login user={} result={}", user, ok);
        return ok;
    }
}
