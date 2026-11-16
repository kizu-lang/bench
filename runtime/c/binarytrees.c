#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
typedef struct Node { struct Node *left, *right; } Node;
static Node *make(int depth) {
    Node *n = malloc(sizeof *n);
    if (depth == 0) { n->left = n->right = NULL; }
    else { n->left = make(depth - 1); n->right = make(depth - 1); }
    return n;
}
static void release(Node *n) { if (n->left) release(n->left); if (n->right) release(n->right); free(n); }
static int64_t check(const Node *n) {
    int64_t t = 1;
    if (n->left) t += check(n->left);
    if (n->right) t += check(n->right);
    return t;
}
int main(int argc, char **argv) {
    (void)argv;
    int max = 18 + argc - 1;
    Node *s = make(max + 1);
    int64_t total = check(s);
    release(s);
    Node *l = make(max);
    for (int d = 4; d <= max; d += 2) {
        int64_t it = (int64_t)1 << (max - d + 4);
        for (int64_t i = 0; i < it; i++) { Node *t = make(d); total += check(t); release(t); }
    }
    total += check(l);
    release(l);
    printf("%lld\n", (long long)total);
    return 0;
}
