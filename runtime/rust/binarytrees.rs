struct Node {
    left: Option<Box<Node>>,
    right: Option<Box<Node>>,
}

fn make(depth: usize) -> Box<Node> {
    if depth == 0 {
        Box::new(Node {
            left: None,
            right: None,
        })
    } else {
        Box::new(Node {
            left: Some(make(depth - 1)),
            right: Some(make(depth - 1)),
        })
    }
}

fn check(n: &Node) -> i64 {
    let mut total = 1_i64;
    if let Some(ref l) = n.left {
        total += check(l);
    }
    if let Some(ref r) = n.right {
        total += check(r);
    }
    total
}

fn main() {
    let max = 18 + std::env::args().len() - 1;
    let mut total = {
        let stretch = make(max + 1);
        check(&stretch)
    };
    let long_lived = make(max);
    let mut depth = 4;
    while depth <= max {
        let iterations = 1_usize << (max - depth + 4);
        for _ in 0..iterations {
            let t = make(depth);
            total += check(&t);
        }
        depth += 2;
    }
    total += check(&long_lived);
    println!("{total}");
}
