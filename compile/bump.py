import re
import sys

p = sys.argv[1]
with open(p, encoding="utf-8") as f:
    t = f.read()


def inc(m):
    return m.group(1) + str(int(m.group(2)) + 1)


t = re.sub(r"(x ?% ?|@rem\(x, )(\d+)", inc, t, count=1)
with open(p, "w", encoding="utf-8") as f:
    f.write(t)
