public class LoginService {
    public boolean login(String user, String password) {
        return "admin".equals(user) && "hash".equals(password);
    }
}
