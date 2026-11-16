const std = @import("std");
pub fn main(init: std.process.Init.Minimal) void {
    var total: i64 = 0;
    var n: i64 = 1;
    const limit: i64 = 6000000 + @as(i64, @intCast(init.args.vector.len)) - 1;
    while (n < limit) : (n += 1) {
        var x = n;
        var steps: i64 = 0;
        while (x != 1) {
            if (@rem(x, 2) == 0) {
                x = @divTrunc(x, 2);
            } else {
                x = 3 * x + 1;
            }
            steps += 1;
        }
        total += steps;
    }
    std.debug.print("{d}\n", .{total});
}
