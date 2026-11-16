#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#define N 2000000
static bool flags[N];
static int64_t sieve(bool *f) {
    for (int64_t i = 0; i < N; i++) f[i] = true;
    f[0] = false; f[1] = false;
    for (int64_t p = 2; p * p < N; p++)
        if (f[p]) for (int64_t m = p * p; m < N; m += p) f[m] = false;
    int64_t count = 0;
    for (int64_t i = 0; i < N; i++) if (f[i]) count++;
    return count;
}
int main(int argc, char **argv) {
    (void)argv;
    int64_t total = 0;
    for (int r = 0; r < 300 + argc - 1; r++) total += sieve(flags);
    printf("%lld\n", (long long)total);
    return 0;
}
