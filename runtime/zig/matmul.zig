const std = @import("std");
const S = 200;
var a: [S * S]f64 = undefined;
var b: [S * S]f64 = undefined;
var c: [S * S]f64 = undefined;
fn matmul(x: *const [S * S]f64, y: *const [S * S]f64, z: *[S * S]f64) void {
    var i: usize = 0;
    while (i < S) : (i += 1) {
        var j: usize = 0;
        while (j < S) : (j += 1) {
            var sum: f64 = 0.0;
            var k: usize = 0;
            while (k < S) : (k += 1) sum += x[i * S + k] * y[k * S + j];
            z[i * S + j] = sum;
        }
    }
}
pub fn main(init: std.process.Init.Minimal) void {
    var i: usize = 0;
    while (i < S * S) : (i += 1) {
        a[i] = @as(f64, @floatFromInt(i % 7)) * 0.5;
        b[i] = @as(f64, @floatFromInt(i % 5)) * 0.25;
    }
    var total: f64 = 0.0;
    var r: usize = 0;
    while (r < 150 + init.args.vector.len - 1) : (r += 1) {
        a[r] = a[r] + 1.0;
        matmul(&a, &b, &c);
        total += c[(r % 40) * 1000 + r % 200];
    }
    std.debug.print("{d}\n", .{@as(i64, @intFromFloat(total))});
}
