// compliant fixture:
//  - Preload("Orders") 一次性加载关联，无 N+1 → n_plus_one pass
//  - gorm.Open 后 db.DB() 配 SetMaxOpenConns/SetMaxIdleConns/SetConnMaxLifetime → conn_pool pass
//  - AutoMigrate 仅在 *_test.go（此处 main.go 不含 AutoMigrate）→ automigrate_prod pass
//  - First 配 errors.Is(err, gorm.ErrRecordNotFound) → record_not_found pass
//
// 期望：bash run-framework-fixture.sh gorm → compliant 退出码 == 0（PASS）
package main

import (
	"errors"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Name   string `gorm:"index"`
	Orders []Order `gorm:"foreignKey:UserID;references:ID"`
}

type Order struct {
	gorm.Model
	UserID uint64 `gorm:"index"`
}

func main() {
	db, err := gorm.Open(sqlite.Open("test.db"), &gorm.Config{})
	if err != nil {
		panic(err)
	}
	// 合规：配连接池
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 合规：Preload 一次性加载，无 N+1
	var users []User
	_ = db.Preload("Orders").Find(&users).Error

	// 合规：First 配 ErrRecordNotFound 判断
	var first User
	err = db.First(&first, 1).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		panic(err)
	}
}
