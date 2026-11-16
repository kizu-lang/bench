const std = @import("std");
const Node = struct { left: ?*Node, right: ?*Node };
const A = std.heap.c_allocator;
fn make(depth: usize) *Node {
    const n = A.create(Node) catch unreachable;
    if (depth == 0) {
        n.* = .{ .left = null, .right = null };
    } else {
        n.* = .{ .left = make(depth - 1), .right = make(depth - 1) };
    }
    return n;
}
fn free(n: *Node) void {
    if (n.left) |l| free(l);
    if (n.right) |r| free(r);
    A.destroy(n);
}
fn check(n: *const Node) i64 {
    var t: i64 = 1;
    if (n.left) |l| t += check(l);
    if (n.right) |r| t += check(r);
    return t;
}
pub fn main(init: std.process.Init.Minimal) void {
    const max = 18 + init.args.vector.len - 1;
    const stretch = make(max + 1);
    var total = check(stretch);
    free(stretch);
    const long = make(max);
    var d: usize = 4;
    while (d <= max) : (d += 2) {
        const it = @as(usize, 1) << @intCast(max - d + 4);
        var i: usize = 0;
        while (i < it) : (i += 1) {
            const t = make(d);
            total += check(t);
            free(t);
        }
    }
    total += check(long);
    free(long);
    std.debug.print("{d}\n", .{total});
}
