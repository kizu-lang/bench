package main

import (
	"fmt"
	"os"
)

type Node struct{ left, right *Node }

func make_(depth int) *Node {
	if depth == 0 {
		return &Node{}
	}
	return &Node{make_(depth - 1), make_(depth - 1)}
}

func (n *Node) check() int64 {
	t := int64(1)
	if n.left != nil {
		t += n.left.check()
	}
	if n.right != nil {
		t += n.right.check()
	}
	return t
}

func main() {
	max := 18 + len(os.Args) - 1
	total := make_(max + 1).check()
	long := make_(max)
	for d := 4; d <= max; d += 2 {
		it := 1 << (max - d + 4)
		for i := 0; i < it; i++ {
			total += make_(d).check()
		}
	}
	total += long.check()
	fmt.Println(total)
}
