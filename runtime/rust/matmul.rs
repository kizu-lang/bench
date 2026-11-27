const S: usize = 200;

fn matmul(x: &[f64; S * S], y: &[f64; S * S], z: &mut [f64; S * S]) {
    for i in 0..S {
        for j in 0..S {
            let mut sum = 0.0_f64;
            for k in 0..S {
                sum += x[i * S + k] * y[k * S + j];
            }
            z[i * S + j] = sum;
        }
    }
}

fn main() {
    let mut a_buf = vec![0.0_f64; S * S];
    let mut b_buf = vec![0.0_f64; S * S];
    let mut c_buf = vec![0.0_f64; S * S];
    let a: &mut [f64; S * S] = a_buf.as_mut_slice().try_into().unwrap();
    let b: &mut [f64; S * S] = b_buf.as_mut_slice().try_into().unwrap();
    let c: &mut [f64; S * S] = c_buf.as_mut_slice().try_into().unwrap();
    for i in 0..(S * S) {
        a[i] = (i % 7) as f64 * 0.5;
        b[i] = (i % 5) as f64 * 0.25;
    }
    let extra = std::env::args().len() - 1;
    let mut total = 0.0_f64;
    for r in 0..(150 + extra) {
        a[r] += 1.0;
        matmul(a, b, c);
        total += c[(r % 40) * 1000 + r % 200];
    }
    println!("{}", total as i64);
}
