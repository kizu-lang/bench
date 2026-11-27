fn fib(n: i64) -> i64 {
    if n < 2 {
        return n;
    }
    fib(n - 1) + fib(n - 2)
}

fn main() {
    let extra = std::env::args().len() as i64 - 1;
    println!("{}", fib(42 + extra));
}
