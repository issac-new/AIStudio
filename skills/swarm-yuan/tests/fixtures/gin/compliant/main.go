// compliant fixture:
//  - gin.Default()（自带 Logger+Recovery）→ recovery pass
//  - c.ShouldBindJSON + binding:"required" 标签 → should_bind / validator pass
//  - goroutine 内用 cCp := c.Copy() → context_copy pass
//  - http.Server + srv.Shutdown(ctx) → graceful_shutdown pass
//  - c.AbortWithStatusJSON + return → abort_return pass
//
// 期望：bash run-framework-fixture.sh gin → compliant 退出码 == 0（PASS）
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
}

func main() {
	r := gin.Default() // 自带 Logger + Recovery
	r.POST("/login", func(c *gin.Context) {
		var req LoginReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"msg": "invalid"})
			return
		}
		// 合规：goroutine 内用 c.Copy() 只读副本
		cCp := c.Copy()
		go func() {
			_ = cCp.Request.URL.Path
		}()
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// 合规：http.Server + Shutdown 优雅关闭
	srv := &http.Server{Addr: ":8080", Handler: r}
	go func() {
		_ = srv.ListenAndServe()
	}()
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
