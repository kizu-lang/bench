const std = @import("std");
const Body = struct { x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64 };
const solar = 4.0 * 3.141592653589793 * 3.141592653589793;
const days = 365.24;
fn body(x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64) Body {
    return .{ .x = x, .y = y, .z = z, .vx = vx * days, .vy = vy * days, .vz = vz * days, .mass = mass * solar };
}
fn advance(b: *[5]Body, dt: f64) void {
    var i: usize = 0;
    while (i < 5) : (i += 1) {
        var j = i + 1;
        while (j < 5) : (j += 1) {
            const dx = b[i].x - b[j].x;
            const dy = b[i].y - b[j].y;
            const dz = b[i].z - b[j].z;
            const d2 = dx * dx + dy * dy + dz * dz;
            const mag = dt / (d2 * @sqrt(d2));
            const mi = b[i].mass * mag;
            const mj = b[j].mass * mag;
            b[i].vx -= dx * mj;
            b[i].vy -= dy * mj;
            b[i].vz -= dz * mj;
            b[j].vx += dx * mi;
            b[j].vy += dy * mi;
            b[j].vz += dz * mi;
        }
    }
    i = 0;
    while (i < 5) : (i += 1) {
        b[i].x += dt * b[i].vx;
        b[i].y += dt * b[i].vy;
        b[i].z += dt * b[i].vz;
    }
}
fn energy(b: *const [5]Body) f64 {
    var e: f64 = 0.0;
    var i: usize = 0;
    while (i < 5) : (i += 1) {
        e += 0.5 * b[i].mass * (b[i].vx * b[i].vx + b[i].vy * b[i].vy + b[i].vz * b[i].vz);
        var j = i + 1;
        while (j < 5) : (j += 1) {
            const dx = b[i].x - b[j].x;
            const dy = b[i].y - b[j].y;
            const dz = b[i].z - b[j].z;
            e -= b[i].mass * b[j].mass / @sqrt(dx * dx + dy * dy + dz * dz);
        }
    }
    return e;
}
pub fn main(init: std.process.Init.Minimal) void {
    var b = [5]Body{
        body(0, 0, 0, 0, 0, 0, 1),
        body(4.84143144246472090e+00, -1.16032004402742839e+00, -1.03622044471123109e-01, 1.66007664274403694e-03, 7.69901118419740425e-03, -6.90460016972063023e-05, 9.54791938424326609e-04),
        body(8.34336671824457987e+00, 4.12479856412430479e+00, -4.03523417114321381e-01, -2.76742510726862411e-03, 4.99852801234917238e-03, 2.30417297573763929e-05, 2.85885980666130812e-04),
        body(1.28943695621391310e+01, -1.51111514016986312e+01, -2.23307578892655734e-01, 2.96460137564761618e-03, 2.37847173959480950e-03, -2.96589568540237556e-05, 4.36624404335156298e-05),
        body(1.53796971148509165e+01, -2.59193146099879641e+01, 1.79258772950371181e-01, 2.68067772490389322e-03, 1.62824170038242295e-03, -9.51592254519715870e-05, 5.15138902046611451e-05),
    };
    var px: f64 = 0;
    var py: f64 = 0;
    var pz: f64 = 0;
    for (b) |x| {
        px += x.vx * x.mass;
        py += x.vy * x.mass;
        pz += x.vz * x.mass;
    }
    b[0].vx = 0 - px / solar;
    b[0].vy = 0 - py / solar;
    b[0].vz = 0 - pz / solar;
    const steps = 20000000 + init.args.vector.len - 1;
    var s: usize = 0;
    while (s < steps) : (s += 1) advance(&b, 0.01);
    std.debug.print("{d}\n", .{@as(i64, @intFromFloat(energy(&b) * 1000000000.0))});
}
