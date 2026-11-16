const std = @import("std");
const N = 2000000;
var flags: [N]bool = undefined;
fn sieve(f: *[N]bool) i64 {
    var i: usize = 0;
    while (i < N) : (i += 1) f[i] = true;
    f[0] = false;
    f[1] = false;
    var p: usize = 2;
    while (p * p < N) : (p += 1) {
        if (f[p]) {
            var m = p * p;
            while (m < N) : (m += p) f[m] = false;
        }
    }
    var count: i64 = 0;
    i = 0;
    while (i < N) : (i += 1) {
        if (f[i]) count += 1;
    }
    return count;
}
pub fn main(init: std.process.Init.Minimal) void {
    var total: i64 = 0;
    var r: usize = 0;
    while (r < 300 + init.args.vector.len - 1) : (r += 1) total += sieve(&flags);
    std.debug.print("{d}\n", .{total});
}
