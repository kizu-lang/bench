import re, sys
p = sys.argv[1]
t = open(p).read()
def inc(m): return m.group(1) + str(int(m.group(2)) + 1)
t = re.sub(r'(x ?% ?|@rem\(x, )(\d+)', inc, t, count=1)
open(p, 'w').write(t)
