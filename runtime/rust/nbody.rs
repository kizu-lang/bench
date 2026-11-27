const SOLAR: f64 = 4.0 * 3.141592653589793 * 3.141592653589793;
const DAYS: f64 = 365.24;

#[derive(Clone, Copy)]
struct Body {
    x: f64,
    y: f64,
    z: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    mass: f64,
}

fn body(x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64) -> Body {
    Body {
        x,
        y,
        z,
        vx: vx * DAYS,
        vy: vy * DAYS,
        vz: vz * DAYS,
        mass: mass * SOLAR,
    }
}

fn advance(b: &mut [Body; 5], dt: f64) {
    for i in 0..5 {
        for j in (i + 1)..5 {
            let dx = b[i].x - b[j].x;
            let dy = b[i].y - b[j].y;
            let dz = b[i].z - b[j].z;
            let d2 = dx * dx + dy * dy + dz * dz;
            let mag = dt / (d2 * d2.sqrt());
            let mi = b[i].mass * mag;
            let mj = b[j].mass * mag;
            b[i].vx -= dx * mj;
            b[i].vy -= dy * mj;
            b[i].vz -= dz * mj;
            b[j].vx += dx * mi;
            b[j].vy += dy * mi;
            b[j].vz += dz * mi;
        }
    }
    for body in b.iter_mut() {
        body.x += dt * body.vx;
        body.y += dt * body.vy;
        body.z += dt * body.vz;
    }
}

fn energy(b: &[Body; 5]) -> f64 {
    let mut e = 0.0_f64;
    for i in 0..5 {
        let bi = b[i];
        e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
        for j in (i + 1)..5 {
            let dx = bi.x - b[j].x;
            let dy = bi.y - b[j].y;
            let dz = bi.z - b[j].z;
            e -= bi.mass * b[j].mass / (dx * dx + dy * dy + dz * dz).sqrt();
        }
    }
    e
}

fn main() {
    let mut bodies = [
        body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0),
        body(
            4.84143144246472090e+00,
            -1.16032004402742839e+00,
            -1.03622044471123109e-01,
            1.66007664274403694e-03,
            7.69901118419740425e-03,
            -6.90460016972063023e-05,
            9.54791938424326609e-04,
        ),
        body(
            8.34336671824457987e+00,
            4.12479856412430479e+00,
            -4.03523417114321381e-01,
            -2.76742510726862411e-03,
            4.99852801234917238e-03,
            2.30417297573763929e-05,
            2.85885980666130812e-04,
        ),
        body(
            1.28943695621391310e+01,
            -1.51111514016986312e+01,
            -2.23307578892655734e-01,
            2.96460137564761618e-03,
            2.37847173959480950e-03,
            -2.96589568540237556e-05,
            4.36624404335156298e-05,
        ),
        body(
            1.53796971148509165e+01,
            -2.59193146099879641e+01,
            1.79258772950371181e-01,
            2.68067772490389322e-03,
            1.62824170038242295e-03,
            -9.51592254519715870e-05,
            5.15138902046611451e-05,
        ),
    ];
    let mut px = 0.0_f64;
    let mut py = 0.0_f64;
    let mut pz = 0.0_f64;
    for b in bodies.iter() {
        px += b.vx * b.mass;
        py += b.vy * b.mass;
        pz += b.vz * b.mass;
    }
    bodies[0].vx = -px / SOLAR;
    bodies[0].vy = -py / SOLAR;
    bodies[0].vz = -pz / SOLAR;
    let extra = std::env::args().len() as i64 - 1;
    let steps = 20_000_000 + extra;
    for _ in 0..steps {
        advance(&mut bodies, 0.01);
    }
    println!("{}", (energy(&bodies) * 1_000_000_000.0) as i64);
}
