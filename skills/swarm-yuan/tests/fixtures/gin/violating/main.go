// violating fixture:
//  - gin.New() 无 gin.Recovery() → fw_gin_recovery_middleware(fail)
//  - c.BindJSON（Must bind 自动 400+Abort）→ fw_gin_should_bind_not_bind(warn)
//  - goroutine 内直接用 c（非 c.Copy）→ fw_gin_context_copy(fail) 主触发
//  - engine.Run 无 Shutdown → fw_gin_graceful_shutdown(warn)
//  - c.Abort 后无 return → fw_gin_abort_return(warn)
//  - AllowAllOrigins + AllowCredentials 双 true → fw_gin_cors(fail)
//  - URL query 取 token 鉴权 → fw_gin_auth_middleware(fail)
//
// 期望：bash run-framework-fixture.sh gin → violating 退出码 != 0（FAIL）
package main

import (
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type LoginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func main() {
	r := gin.New() // 无 Recovery

	// 违规：AllowAllOrigins=true 与 AllowCredentials=true 共存
	// （浏览器规范禁止 * + 凭证，CORS 凭证请求全部被拒）
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowCredentials: true,
		AllowMethods:     []string{"GET", "POST"},
		MaxAge:           12 * time.Hour,
	}))

	// 违规：鉴权 token 取自 URL query（进 access log / Referer 泄露 CWE-598）
	r.Use(func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"msg": "no token"})
			return
		}
		c.Next()
	})

	r.POST("/login", func(c *gin.Context) {
		var req LoginReq
		// 违规：c.BindJSON 自动 400+Abort，须改 c.ShouldBindJSON
		if err := c.BindJSON(&req); err != nil {
			return
		}
		// 违规：goroutine 内直接用 c（gin.Context 对象池复用，须 c.Copy()）
		go func() {
			_ = c.Request.URL.Path // 直接用 c，数据竞争风险
		}()

		// 违规：c.Abort() 后未 return
		if req.Username == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"msg": "empty"})
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// 违规：engine.Run 无 Shutdown，SIGTERM 强断在途请求
	_ = r.Run(":8080")
}
