// Output formatting utilities

use std::io::Write;

pub fn success(msg: &str) {
    println!("  ✓ {}", msg);
}

pub fn error(msg: &str) {
    let _ = writeln!(std::io::stderr(), "  ✗ {}", msg);
}

pub fn info(msg: &str) {
    println!("  {}", msg);
}

pub fn warn(msg: &str) {
    println!("  ! {}", msg);
}

pub fn cyan(msg: &str) -> String {
    format!("\x1b[36m{}\x1b[0m", msg)
}

pub fn green(msg: &str) -> String {
    format!("\x1b[32m{}\x1b[0m", msg)
}

pub fn yellow(msg: &str) -> String {
    format!("\x1b[33m{}\x1b[0m", msg)
}

pub fn dim(msg: &str) -> String {
    format!("\x1b[2m{}\x1b[0m", msg)
}
