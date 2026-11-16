package main

import (
	"fmt"
	"os"
)

const S = 200

func matmul(a, b, c *[S * S]float64) {
	for i := 0; i < S; i++ {
		for j := 0; j < S; j++ {
			sum := 0.0
			for k := 0; k < S; k++ {
				sum += a[i*S+k] * b[k*S+j]
			}
			c[i*S+j] = sum
		}
	}
}

var a, b, c [S * S]float64

func main() {
	for i := 0; i < S*S; i++ {
		a[i] = float64(i%7) * 0.5
		b[i] = float64(i%5) * 0.25
	}
	total := 0.0
	for r := 0; r < 150+len(os.Args)-1; r++ {
		a[r] = a[r] + 1.0
		matmul(&a, &b, &c)
		total += c[(r%40)*1000+r%200]
	}
	fmt.Println(int64(total))
}
