fn main() {
    let extra = std::env::args().len() as i64 - 1;
    let limit = 6_000_000 + extra;
    let mut total = 0_i64;
    for n in 1..limit {
        let mut x = n;
        let mut steps = 0_i64;
        while x != 1 {
            if x % 2 == 0 {
                x /= 2;
            } else {
                x = 3 * x + 1;
            }
            steps += 1;
        }
        total += steps;
    }
    println!("{total}");
}
