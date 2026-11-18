# The kizu checkout the recipes build from.
kizu := env("KIZU_CHECKOUT", "../kizu")

default:
    @just --list

# Every language and the real code into results/LABEL/. REUSE=<label> remeasures only kizu.
compare label:
    scripts/all.sh {{label}} {{kizu}}

# The compiler at each REV building the last REV's compiler/, side by side, into results/LABEL/ (Linux).
ab label +revs:
    MASSIF=1 scripts/compiler-ab.sh {{kizu}} results/{{label}} {{revs}}

# What the compiler at REV holds on the heap at its peak, into results/LABEL/ (Linux). DROP="fn..." to subtract.
heap label rev input="":
    scripts/heap.sh {{kizu}} results/{{label}} {{rev}} {{input}}
