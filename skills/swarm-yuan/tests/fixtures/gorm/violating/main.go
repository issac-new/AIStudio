// violating fixture:
//  - for-range 循环内 db.Find 逐条查询，无 Preload/Joins → fw_gorm_n_plus_one(fail)
//  - gorm.Open 后无 SetMaxOpenConns → fw_gorm_conn_pool(fail) 主触发
//  - AutoMigrate 在 main.go 生产入口 → fw_gorm_automigrate_prod(warn)
//  - First 无 ErrRecordNotFound 判断 → fw_gorm_record_not_found(warn)
//
// 期望：bash run-framework-fixture.sh gorm → violating 退出码 != 0（FAIL）
package main

import (
	"fmt"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Name   string `gorm:"index"`
	OrderID uint64
}

type Order struct {
	gorm.Model
	UserID uint64
}

func main() {
	db, err := gorm.Open(sqlite.Open("test.db"), &gorm.Config{})
	if err != nil {
		panic(err)
	}
	// 违规：AutoMigrate 在生产入口 main.go
	_ = db.AutoMigrate(&User{}, &Order{})

	// 违规：for-range 循环内逐条查询（N+1），无 Preload
	var users []User
	_ = db.Find(&users)
	for _, u := range users {
		var orders []Order
		_ = db.Find(&orders, "user_id = ?", u.ID) // N+1
		fmt.Println(u.Name, len(orders))
	}

	// 违规：First 无 ErrRecordNotFound 判断
	var first User
	_ = db.First(&first, 1).Error
}
