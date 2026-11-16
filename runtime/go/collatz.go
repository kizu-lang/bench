package main

import (
	"fmt"
	"os"
)

func main() {
	var total int64
	limit := int64(6000000 + len(os.Args) - 1)
	for n := int64(1); n < limit; n++ {
		x := n
		var steps int64
		for x != 1 {
			if x%2 == 0 {
				x = x / 2
			} else {
				x = 3*x + 1
			}
			steps++
		}
		total += steps
	}
	fmt.Println(total)
}
