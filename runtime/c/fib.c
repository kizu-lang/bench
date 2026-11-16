#include <stdio.h>
#include <stdint.h>
static int64_t fib(int64_t n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }
int main(int argc, char **argv) { (void)argv; printf("%lld\n", (long long)fib(42 + argc - 1)); return 0; }
