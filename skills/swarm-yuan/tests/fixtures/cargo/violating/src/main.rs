// violating fixture src/main.rs:
//  - #![allow(warnings)] → fw_cargo_allow_warnings(fail)
//  - unsafe 块无 SAFETY 说明 → fw_cargo_unsafe(fail)
//  - .unwrap() → fw_cargo_unwrap_expect(warn)
//
// 期望：cargo fixture violating → 退出码 != 0（FAIL，因 allow_warnings/unsafe/git_deps fail 主触发）

#![allow(warnings)]
#![allow(dead_code)]

use std::env;

fn read_buf(ptr: *const u8, len: usize) -> u8 {
    // 违规：unsafe 块无 // SAFETY: 说明
    unsafe { *ptr }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    // 违规：生产代码 .unwrap()（panic on None/Err，须用 ? 或 match）
    let first = args.first().unwrap();
    // 违规：.expect() 同理
    let n: i32 = "abc".parse().expect("parse failed");
    println!("{} {}", first, n);
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        // 测试代码 unwrap 豁免（在 #[cfg(test)] 模块内）
        let x: Option<i32> = Some(1);
        assert_eq!(x.unwrap(), 1);
    }
}
