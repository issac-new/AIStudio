// compliant fixture src/main.rs:
//  - 无 #![allow(warnings)] → fw_cargo_allow_warnings pass
//  - 无 unsafe → fw_cargo_unsafe pass
//  - 用 ? / match 处理 Result/Option → fw_cargo_unwrap_expect pass
//
// 期望：cargo fixture compliant → 退出码 == 0（PASS）
use std::env;
use std::error::Error;
use std::fs;

fn read_config(path: &str) -> Result<String, Box<dyn Error>> {
    // 合规：用 ? 操作符处理 Result（非 unwrap）
    let content = fs::read_to_string(path)?;
    Ok(content)
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();
    // 合规：用 match 处理 Option（非 unwrap）
    let first = match args.first() {
        Some(s) => s.as_str(),
        None => "default",
    };
    let n: i32 = match "42".parse() {
        Ok(v) => v,
        Err(_) => 0,
    };
    println!("{} {}", first, n);
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let x: Option<i32> = Some(1);
        assert_eq!(x.unwrap(), 1);
    }
}
