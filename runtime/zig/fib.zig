const std = @import("std");
fn fib(n: i64) i64 {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}
pub fn main(init: std.process.Init.Minimal) void {
    std.debug.print("{d}\n", .{fib(42 + @as(i64, @intCast(init.args.vector.len)) - 1)});
}
