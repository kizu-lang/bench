package main

import (
	"fmt"
	"os"
)

const N = 2000000

func sieve(flags *[N]bool) int64 {
	for i := 0; i < N; i++ {
		flags[i] = true
	}
	flags[0], flags[1] = false, false
	for p := 2; p*p < N; p++ {
		if flags[p] {
			for m := p * p; m < N; m += p {
				flags[m] = false
			}
		}
	}
	var count int64
	for i := 0; i < N; i++ {
		if flags[i] {
			count++
		}
	}
	return count
}

var flags [N]bool

func main() {
	var total int64
	for r := 0; r < 300+len(os.Args)-1; r++ {
		total += sieve(&flags)
	}
	fmt.Println(total)
}
