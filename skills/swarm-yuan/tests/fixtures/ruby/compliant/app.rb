# fixture compliant: ENV 注入 + lock 同步 + 视图 @ivar 双向对齐 → 4 门禁全 pass
require "sinatra"
require_relative "helper"

# 合规：配置经 ENV 注入，.env 样例已登记
app_name = ENV["APP_NAME"]
db_host = ENV["DB_HOST"]

get "/users" do
  # 合规：渲染侧赋值与模板 @ivar 双向对齐
  @user = params["user_id"]
  @title = app_name
  erb :users_show
end

get "/health" do
  "ok #{db_host}"
end
