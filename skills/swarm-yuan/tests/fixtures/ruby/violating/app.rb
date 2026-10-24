# fixture violating: 硬编码密钥 + ENV 键漂移 + 视图 @ivar 漂移 → 4 门禁全主触发
require "sinatra"
require_relative "helper"

# 违规 1：硬编码密钥与口令字面量（fw_ruby_hardcoded_secret）
client_secret = "8f2b7c1e9a4d6b3f5e0c2a8d7b6e5f4c"
config = { password: "SuperSecret2024!" }

# 违规 2：ENV 引用键未登记于 .env 样例（fw_ruby_env_key_drift）
db_pass = ENV["DB_PASSWORD"]
app_name = ENV["APP_NAME"]

get "/users" do
  # 违规 3：视图在用的 @missing_var 未见赋值、赋值的 @extra 无视图引用（fw_ruby_view_var）
  @user = params["user_id"]
  @extra = 1
  erb :users_show
end

# 人工检查面（ruby.md 规律 6）：Sinatra 路由字符串与跳转契约
get "/legacy" do
  redirect "/users/profile"
end
