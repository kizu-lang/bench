#include <stdio.h>
#include <stdint.h>
#define S 200
static double a[S * S], b[S * S], c[S * S];
static void matmul(const double *x, const double *y, double *z) {
    for (int64_t i = 0; i < S; i++)
        for (int64_t j = 0; j < S; j++) {
            double sum = 0.0;
            for (int64_t k = 0; k < S; k++) sum += x[i * S + k] * y[k * S + j];
            z[i * S + j] = sum;
        }
}
int main(int argc, char **argv) {
    (void)argv;
    for (int64_t i = 0; i < S * S; i++) { a[i] = (double)(i % 7) * 0.5; b[i] = (double)(i % 5) * 0.25; }
    double total = 0.0;
    for (int r = 0; r < 150 + argc - 1; r++) { a[r] = a[r] + 1.0; matmul(a, b, c); total += c[(r % 40) * 1000 + r % 200]; }
    printf("%lld\n", (long long)total);
    return 0;
}
