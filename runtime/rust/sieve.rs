const N: usize = 2_000_000;

fn sieve(f: &mut [bool; N]) -> i64 {
    for slot in f.iter_mut() {
        *slot = true;
    }
    f[0] = false;
    f[1] = false;
    let mut p = 2;
    while p * p < N {
        if f[p] {
            let mut m = p * p;
            while m < N {
                f[m] = false;
                m += p;
            }
        }
        p += 1;
    }
    let mut count = 0_i64;
    for &v in f.iter() {
        if v {
            count += 1;
        }
    }
    count
}

fn main() {
    let mut buf = vec![false; N];
    let flags: &mut [bool; N] = buf.as_mut_slice().try_into().unwrap();
    let extra = std::env::args().len() - 1;
    let mut total = 0_i64;
    for _ in 0..(300 + extra) {
        total += sieve(flags);
    }
    println!("{total}");
}
