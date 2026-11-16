#include <stdio.h>
#include <stdint.h>
int main(int argc, char **argv) {
    (void)argv;
    int64_t total = 0;
    for (int64_t n = 1; n < 6000000 + argc - 1; n++) {
        int64_t x = n, steps = 0;
        while (x != 1) { if (x % 2 == 0) x = x / 2; else x = 3 * x + 1; steps++; }
        total += steps;
    }
    printf("%lld\n", (long long)total);
    return 0;
}
