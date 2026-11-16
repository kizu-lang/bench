import os, sys, shutil
# gen.py OUT MODULES FUNCS
out, M, F = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
shutil.rmtree(out, ignore_errors=True)
def w(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(s)

# body shared shape: struct with two fields, loop with branch, call previous
def kizu_mod(i):
    s = f"struct Acc{i} {{\n    a: i64,\n    b: i64,\n}}\n\n"
    for j in range(F):
        prev = f"g{j-1}(x)" if j else "x"
        vis = "pub " if j == F-1 else ""
        s += f"""{vis}fn g{j}(x: i64) -> i64 {{
    var s = Acc{i} {{ a: x, b: {j} }};
    var k = 0;
    while k < 10 {{
        if k % 2 == 0 {{
            s.a = s.a + s.b * k;
        }} else {{
            s.b = s.b - s.a / (k + 1);
        }}
        k = k + 1;
    }}
    return s.a + s.b + {prev} % 7;
}}

"""
    return s
def go_mod(i):
    s = f"package m{i}\n\ntype acc{i} struct {{\n\ta int64\n\tb int64\n}}\n\n"
    for j in range(F):
        prev = f"g{j-1}(x)" if j else "x"
        name = "Last" if j == F-1 else f"g{j}"
        s += f"""func {name}(x int64) int64 {{
\ts := acc{i}{{a: x, b: {j}}}
\tvar k int64 = 0
\tfor k < 10 {{
\t\tif k%2 == 0 {{
\t\t\ts.a = s.a + s.b*k
\t\t}} else {{
\t\t\ts.b = s.b - s.a/(k+1)
\t\t}}
\t\tk = k + 1
\t}}
\treturn s.a + s.b + {prev}%7
}}

"""
    return s
def zig_mod(i):
    s = f"const Acc{i} = struct {{\n    a: i64,\n    b: i64,\n}};\n\n"
    for j in range(F):
        prev = f"g{j-1}(x)" if j else "x"
        vis = "pub " if j == F-1 else ""
        s += f"""{vis}fn g{j}(x: i64) i64 {{
    var s = Acc{i}{{ .a = x, .b = {j} }};
    var k: i64 = 0;
    while (k < 10) {{
        if (@rem(k, 2) == 0) {{
            s.a = s.a + s.b * k;
        }} else {{
            s.b = s.b - @divTrunc(s.a, k + 1);
        }}
        k = k + 1;
    }}
    return s.a + s.b + @rem({prev}, 7);
}}

"""
    return s
def c_mod(i):
    s = f'#include <stdint.h>\n#include "m{i}.h"\n\nstruct acc{i} {{\n    int64_t a;\n    int64_t b;\n}};\n\n'
    for j in range(F):
        s += f"static int64_t g{j}(int64_t x);\n"
    s += "\n"
    for j in range(F):
        prev = f"g{j-1}(x)" if j else "x"
        s += f"""static int64_t g{j}(int64_t x) {{
    struct acc{i} s = {{ .a = x, .b = {j} }};
    int64_t k = 0;
    while (k < 10) {{
        if (k % 2 == 0) {{
            s.a = s.a + s.b * k;
        }} else {{
            s.b = s.b - s.a / (k + 1);
        }}
        k = k + 1;
    }}
    return s.a + s.b + {prev} % 7;
}}

"""
    s += f"int64_t m{i}_last(int64_t x) {{ return g{F-1}(x); }}\n"
    return s

# kizu
k = f"{out}/kizu"
w(f"{k}/kizu.toml", '[package]\nname = "app"\nversion = "0.1.0"\n\n[modules]\npaths = ["src"]\n')
main = "".join(f"import app::m{i};\n" for i in range(M)) + "\nfn main() -> void {\n    var total = 0;\n"
main += "".join(f"    total = total + m{i}::g{F-1}({i});\n" for i in range(M)) + "    print(total);\n    return;\n}\n"
w(f"{k}/src/main.kizu", main)
for i in range(M): w(f"{k}/src/m{i}/m{i}.kizu", kizu_mod(i))
# go
g = f"{out}/go"
w(f"{g}/go.mod", "module app\n\ngo 1.24\n")
main = 'package main\n\nimport (\n\t"fmt"\n' + "".join(f'\t"app/m{i}"\n' for i in range(M)) + ")\n\nfunc main() {\n\tvar total int64 = 0\n"
main += "".join(f"\ttotal = total + m{i}.Last({i})\n" for i in range(M)) + "\tfmt.Println(total)\n}\n"
w(f"{g}/main.go", main)
for i in range(M): w(f"{g}/m{i}/m{i}.go", go_mod(i))
# zig
z = f"{out}/zig"
main = 'const std = @import("std");\n' + "".join(f'const m{i} = @import("m{i}.zig");\n' for i in range(M))
main += "\npub fn main() void {\n    var total: i64 = 0;\n" + "".join(f"    total = total + m{i}.g{F-1}({i});\n" for i in range(M))
main += '    std.debug.print("{d}\\n", .{total});\n}\n'
w(f"{z}/main.zig", main)
for i in range(M): w(f"{z}/m{i}.zig", zig_mod(i))
# c
c = f"{out}/c"
main = "#include <stdio.h>\n#include <stdint.h>\n" + "".join(f'#include "m{i}.h"\n' for i in range(M))
main += "\nint main(void) {\n    int64_t total = 0;\n" + "".join(f"    total = total + m{i}_last({i});\n" for i in range(M))
main += '    printf("%lld\\n", (long long)total);\n    return 0;\n}\n'
w(f"{c}/main.c", main)
for i in range(M):
    w(f"{c}/m{i}.h", f"#include <stdint.h>\nint64_t m{i}_last(int64_t x);\n")
    w(f"{c}/m{i}.c", c_mod(i))
objs = " ".join(["main.o"] + [f"m{i}.o" for i in range(M)])
w(f"{c}/Makefile", f"CFLAGS = -O0\nOBJS = {objs}\napp: $(OBJS)\n\t$(CC) -o app $(OBJS)\n%.o: %.c\n\t$(CC) $(CFLAGS) -c $< -o $@\n")
