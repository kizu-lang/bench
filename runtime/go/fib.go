package main

import (
	"fmt"
	"os"
)

func fib(n int64) int64 {
	if n < 2 {
		return n
	}
	return fib(n-1) + fib(n-2)
}

func main() { fmt.Println(fib(int64(42 + len(os.Args) - 1))) }
