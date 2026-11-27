(function () {
  "use strict";

  const COLORS = {
    "kizu-llvm": "#e84800",
    "kizu-llvm-opt": "#e84800",
    "kizu-check": "#e84800",
    "kizu-direct": "#1d4ed8",
    "kizu-direct-opt": "#1d4ed8",
    "rust": "#b45309",
    "rust-native": "#c96a1b",
    "rust-debug": "#b45309",
    "rust-release": "#92400e",
    "rust-check": "#b45309",
    "c-O2": "#4b5563",
    "c-O0": "#6b7280",
    "c-O3native": "#374151",
    "c-check": "#4b5563",
    "zig-fast": "#6d7a58",
    "zig-safe": "#859171",
    "zig-debug": "#6d7a58",
    "zig-check": "#6d7a58",
    "go": "#2d7a88",
    "go-nobounds": "#4e96a3",
    "go-noopt": "#4e96a3",
    "go-vet": "#2d7a88"
  };

  const PROG_SHORT = {
    fib: "fib",
    sieve: "sieve",
    matmul: "mat",
    collatz: "col",
    nbody: "nbody",
    binarytrees: "bt"
  };

  const state = {
    data: null,
    envGroup: null,
    runId: null,
    rtView: "geomean",
    rtScope: "base",
    cpSize: "m160",
    cpPhase: "cold",
    caMode: "rss",
    caSize: "m160",
    caField: "total_mb",
    hiMetric: "runtime",
    modalOpener: null,
    modalOpenedAt: 0,
    backdropDown: false
  };

  const tooltip = document.getElementById("tooltip");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalTitle = document.getElementById("modal-title");
  const modalSub = document.getElementById("modal-sub");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");

  function colorOf(name) {
    return COLORS[name] || "#6b7280";
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtSec(sec) {
    if (sec === null || sec === undefined) return "—";
    if (sec < 0.01) return (sec * 1000).toFixed(1) + "ms";
    if (sec < 1) return Math.round(sec * 1000) + "ms";
    if (sec < 10) return sec.toFixed(2) + "s";
    return sec.toFixed(1) + "s";
  }

  function fmtMb(mb) {
    if (mb === null || mb === undefined) return "—";
    if (mb < 100) return mb.toFixed(1) + " MB";
    return Math.round(mb) + " MB";
  }

  function shortKizu(str) {
    if (!str) return "—";
    const m = str.match(/kizu\s+([^\s]+)\s+\(([0-9a-f]+)/);
    if (m) return m[1] === "devel" ? m[2].slice(0, 7) : m[1];
    return str.replace(/^kizu\s+/, "");
  }

  function shortCpu(cpu) {
    if (!cpu) return "Unknown CPU";
    return cpu
      .replace(/^AMD\s+/i, "")
      .replace(/^Intel\(R\)\s+Core\(TM\)\s+/i, "")
      .replace(/\s+\d+-Core Processor/i, "")
      .replace(/\(R\)|\(TM\)|CPU\s+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function shortEnvLabel(group, sampleRun) {
    if (!group) return "Unknown";
    const gha = group.match(/^GitHub Actions\s*\(([^)]+)\)$/i);
    if (gha) {
      const tag = gha[1]
        .replace(/linux[- ]x86_64/i, "Linux x64")
        .replace(/macos[- ]arm64/i, "macOS arm64")
        .replace(/darwin[- ]arm64/i, "macOS arm64")
        .replace(/x86_64/i, "x64");
      return "GHA " + tag;
    }
    const m = (sampleRun && sampleRun.machine) || {};
    const cpu = shortCpu(m.cpu || group.replace(/\s*\([^)]*\)\s*$/, ""));
    const virt = m.virtualized ? ` · ${m.virtualized}` : "";
    if (virt) return `${cpu}${virt}`;
    const paren = group.match(/\(([^)]+)\)/);
    if (paren) {
      const bit = paren[1].replace(/x86_64/i, "x64").replace(/Darwin/i, "macOS");
      return `${cpu} · ${bit}`;
    }
    return cpu;
  }

  function shortDate(run) {
    const d = (run.machine && run.machine.date) || run.id || "";
    return d.slice(0, 10);
  }

  function hasCacheData(run) {
    return !!(run && run.compile && run.compile.cache && Object.keys(run.compile.cache).length > 0);
  }

  function envGroupsList() {
    const map = new Map();
    state.data.runs.forEach((r) => {
      if (!map.has(r.machine_group)) map.set(r.machine_group, []);
      map.get(r.machine_group).push(r);
    });
    return Array.from(map.entries()).map(([group, runs]) => ({ group, runs }));
  }

  function runsForEnv(group) {
    return state.data.runs.filter((r) => r.machine_group === group);
  }

  function currentRun() {
    if (!state.data || !state.data.runs.length) return null;
    const inEnv = runsForEnv(state.envGroup);
    return inEnv.find((r) => r.id === state.runId) || inEnv[0] || state.data.runs[0];
  }

  function sameHostRuns(run) {
    return state.data.runs
      .filter((r) => r.machine_group === run.machine_group)
      .slice()
      .sort((a, b) => ((a.machine && a.machine.date) || a.id).localeCompare((b.machine && b.machine.date) || b.id));
  }

  function sameHostAb(run) {
    return (state.data.compiler_ab || []).filter((ab) => ab.machine_group === run.machine_group);
  }

  function variantClass(name) {
    if (name.startsWith("kizu")) return "is-kizu";
    if (name.startsWith("rust")) return "is-rust";
    return "";
  }

  function showTip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    moveTip(evt);
  }

  function moveTip(evt) {
    const pad = 12;
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, evt.clientX - rect.width - pad);
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, evt.clientY - rect.height - pad);
    }
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function hideTip() {
    tooltip.hidden = true;
  }

  function bindTips(container) {
    container.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("mouseenter", (e) => showTip(e, el.getAttribute("data-tip")));
      el.addEventListener("mousemove", moveTip);
      el.addEventListener("mouseleave", hideTip);
    });
  }

  function renderSeg(el, items, activeId, onPick, accent) {
    el.innerHTML = items
      .map((it) => {
        const cls = ["seg-btn", it.id === activeId ? "active" : "", accent ? "accent-active" : ""].filter(Boolean).join(" ");
        return `<button type="button" class="${cls}" data-seg="${esc(it.id)}"${it.disabled ? " disabled" : ""}>${esc(it.label)}</button>`;
      })
      .join("");
    el.querySelectorAll("[data-seg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        onPick(btn.getAttribute("data-seg"));
      });
    });
  }

  function buildBarsHtml(rows, opts) {
    if (!rows.length) {
      return `<div class="empty-box">No measurements for this selection.</div>`;
    }
    const maxVal = Math.max(opts.minMax || 0.0001, ...rows.map((r) => r.value));
    const refPct = opts.refVal !== undefined && opts.refVal <= maxVal ? (opts.refVal / maxVal) * 100 : null;
    const html = rows
      .map((r) => {
        const pct = Math.max(0.8, Math.min(100, (r.value / maxVal) * 100));
        const refMark = refPct !== null ? `<span class="bar-ref" style="left:${refPct.toFixed(2)}%"></span>` : "";
        const sub = r.sub ? `<span class="bar-val-sub">${esc(r.sub)}</span>` : "";
        return `<div class="bar-row ${variantClass(r.name)}" data-tip="${esc(r.tip)}">
          <div class="bar-name"><span>${esc(r.name)}</span><span class="bar-dot" style="background:${colorOf(r.name)}"></span></div>
          <div class="bar-track">${refMark}<div class="bar-fill" style="width:${pct.toFixed(2)}%;background:${colorOf(r.name)}"></div></div>
          <div class="bar-val">${esc(r.label)}${sub}</div>
        </div>`;
      })
      .join("");
    return `<div class="bar-list">${html}</div>`;
  }

  function buildTrendSvg(seriesList, xLabels, opts) {
    const width = 560;
    const height = 186;
    const padL = 48;
    const padR = 18;
    const padT = 14;
    const padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const allVals = [];
    seriesList.forEach((s) =>
      s.points.forEach((v) => {
        if (v !== null && v !== undefined) allVals.push(v);
      })
    );
    if (opts.refVal !== undefined) allVals.push(opts.refVal);
    if (!allVals.length) {
      return `<div class="empty-box">No trend points recorded for this host.</div>`;
    }

    const rawMax = Math.max(...allVals);
    const rawMin = Math.min(...allVals);
    const minV = opts.zeroBase ? 0 : Math.max(0, rawMin * 0.88);
    const maxV = rawMax === minV ? rawMax * 1.2 + 0.1 : rawMax * 1.1;
    const span = Math.max(0.001, maxV - minV);

    const xAt = (i) => (xLabels.length <= 1 ? padL + plotW / 2 : padL + (i / (xLabels.length - 1)) * plotW);
    const yAt = (v) => padT + plotH - ((v - minV) / span) * plotH;

    let grid = "";
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = minV + (span * i) / ticks;
      const y = yAt(v);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#e3dfd4" stroke-width="1"/>`;
      grid += `<text x="${padL - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#66645c" font-size="10" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(opts.yFmt(v))}</text>`;
    }

    let refLine = "";
    if (opts.refVal !== undefined) {
      const ry = yAt(opts.refVal);
      refLine = `<line x1="${padL}" y1="${ry.toFixed(1)}" x2="${width - padR}" y2="${ry.toFixed(1)}" stroke="#4b5563" stroke-width="1" stroke-dasharray="4 3"/>`;
    }

    let selLine = "";
    if (opts.selectedIdx !== undefined && opts.selectedIdx >= 0 && opts.selectedIdx < xLabels.length) {
      const sx = xAt(opts.selectedIdx);
      selLine = `<line x1="${sx.toFixed(1)}" y1="${padT}" x2="${sx.toFixed(1)}" y2="${padT + plotH}" stroke="#e84800" stroke-opacity="0.28" stroke-width="1.5"/>`;
    }

    let xAxis = "";
    const labelStep = Math.max(1, Math.ceil(xLabels.length / 6));
    xLabels.forEach((lbl, i) => {
      const isLast = i === xLabels.length - 1;
      const show = i === 0 || isLast || (i % labelStep === 0 && xLabels.length - 1 - i >= Math.ceil(labelStep / 2));
      if (!show) return;
      const x = xAt(i);
      const anchor = xLabels.length > 1 && i === 0 ? "start" : xLabels.length > 1 && isLast ? "end" : "middle";
      xAxis += `<text x="${x.toFixed(1)}" y="${height - 7}" text-anchor="${anchor}" fill="#66645c" font-size="10" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(lbl)}</text>`;
    });

    let paths = "";
    seriesList.forEach((s) => {
      const coords = [];
      s.points.forEach((v, i) => {
        if (v !== null && v !== undefined) {
          coords.push([xAt(i), yAt(v), v, i]);
        }
      });
      if (coords.length >= 2) {
        const d = coords.map((c, idx) => (idx === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
        const dash = s.dashed ? ` stroke-dasharray="4 3"` : "";
        paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}"${dash}/>`;
      }
      coords.forEach(([cx, cy, v, idx]) => {
        const isSel = opts.selectedIdx === idx;
        const tip = `<strong>${esc(s.name)}</strong><br>${esc(opts.tipLabels ? opts.tipLabels[idx] : xLabels[idx])}<br>${esc(opts.yFmt(v))}`;
        if (isSel) {
          paths += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6.5" fill="none" stroke="${s.color}" stroke-opacity="0.35" stroke-width="1.5"/>`;
        }
        paths += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isSel ? 4.2 : 3.4}" fill="${s.color}" stroke="#faf9f3" stroke-width="1.3" data-tip="${esc(tip)}"/>`;
      });
    });

    return `<svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.aria || "Progression chart")}">${grid}${refLine}${selLine}${xAxis}${paths}</svg>`;
  }

  function selectEnvironment(group, targetRunId) {
    state.envGroup = group;
    const runs = runsForEnv(group);
    state.runId = targetRunId && runs.some((r) => r.id === targetRunId) ? targetRunId : (runs[0] ? runs[0].id : null);
    const run = currentRun();
    if (run) syncRunDefaults(run);
    renderEnvSwitcher();
    populateRunSelect();
    renderAll();
  }

  function renderEnvSwitcher() {
    const container = document.getElementById("env-control");
    const envs = envGroupsList();
    if (!state.envGroup && envs.length) {
      state.envGroup = envs[0].group;
    }

    if (envs.length <= 3) {
      const pills = envs
        .map((e) => {
          const on = e.group === state.envGroup;
          const label = shortEnvLabel(e.group, e.runs[0]);
          const tip = `<strong>${esc(e.group)}</strong><br>${e.runs.length} run${e.runs.length === 1 ? "" : "s"} recorded<br>Isolated host — never mixed with other environments`;
          return `<button type="button" class="env-pill${on ? " active" : ""}" aria-pressed="${on ? "true" : "false"}" data-env="${esc(e.group)}" data-tip="${esc(tip)}"><span>${esc(label)}</span><span class="env-count">${e.runs.length}</span></button>`;
        })
        .join("");
      container.innerHTML = `<div class="env-pills" role="group" aria-label="Recorded host environments">${pills}</div>`;
      container.querySelectorAll("[data-env]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const g = btn.getAttribute("data-env");
          if (g !== state.envGroup) {
            selectEnvironment(g);
          }
        });
      });
      bindTips(container);
    } else {
      const options = envs
        .map((e) => {
          const label = `${shortEnvLabel(e.group, e.runs[0])} (${e.runs.length})`;
          return `<option value="${esc(e.group)}"${e.group === state.envGroup ? " selected" : ""}>${esc(label)}</option>`;
        })
        .join("");
      container.innerHTML = `<select id="env-select" class="env-select" aria-label="Host environment">${options}</select>`;
      document.getElementById("env-select").addEventListener("change", (ev) => {
        selectEnvironment(ev.target.value);
      });
    }

    const badge = document.getElementById("iso-badge");
    const envCount = envs.length;
    badge.textContent = envCount === 1 ? "host-isolated · never mixed" : `isolated · ${envCount} envs`;
    badge.setAttribute(
      "data-tip",
      `<strong>Strict per-host isolation</strong><br>Showing only <strong>${esc(state.envGroup || "")}</strong>.<br>Different environments (GHA Linux, GHA macOS, local WSL2/macOS, Colab) are switched via Env and never mixed.`
    );
    bindTips(badge.parentElement);
  }

  function populateRunSelect() {
    const sel = document.getElementById("run-select");
    const runs = runsForEnv(state.envGroup);
    sel.innerHTML = "";
    runs.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      const rev = shortKizu(r.machine && r.machine.kizu);
      const date = shortDate(r);
      opt.textContent = rev && rev !== "—" ? `${date} · ${rev}` : r.id;
      opt.title = r.id;
      sel.appendChild(opt);
    });
    if ((!state.runId || !runs.some((r) => r.id === state.runId)) && runs.length) {
      state.runId = runs[0].id;
    }
    sel.value = state.runId || "";
  }

  function syncRunDefaults(run) {
    if (run.compile && run.compile.sizes && run.compile.sizes.length) {
      const largest = run.compile.sizes[run.compile.sizes.length - 1];
      if (!run.compile.sizes.includes(state.cpSize)) state.cpSize = largest;
      const cacheSizes = Object.keys(run.compile.cache || {});
      state.caMode = cacheSizes.length ? "cache" : "rss";
      if (cacheSizes.length) {
        if (!cacheSizes.includes(state.caSize)) state.caSize = cacheSizes[cacheSizes.length - 1];
      } else {
        state.caSize = largest;
      }
    }
    if (state.hiMetric === "ab" && sameHostAb(run).length === 0) {
      state.hiMetric = "runtime";
    }
  }

  function renderKpis(run) {
    const rt = run.runtime && run.runtime.variants;
    const cp = run.compile;
    const largest = cp && cp.sizes && cp.sizes.length ? cp.sizes[cp.sizes.length - 1] : "m160";

    let kpi1 = { label: "Runtime vs C -O2", tag: "6-bench", val: "—", cls: "accent", delta: "no runtime data" };
    if (rt && rt["kizu-llvm"]) {
      const gm = rt["kizu-llvm"].geomean;
      const dir = rt["kizu-direct"] ? `${rt["kizu-direct"].geomean.toFixed(2)}×` : "—";
      const rust = rt["rust"] ? `${rt["rust"].geomean.toFixed(2)}×` : "—";
      kpi1 = {
        label: "Runtime vs C -O2",
        tag: "kizu-llvm",
        val: `${gm.toFixed(2)}×`,
        cls: "accent",
        delta: `direct ${dir} · rust ${rust}`
      };
    }

    let kpi2 = { label: `Cold Compile (${largest})`, tag: "kizu-direct", val: "—", cls: "cobalt", delta: "no compile data" };
    const cold = cp && cp.scenarios && cp.scenarios.cold && cp.scenarios.cold[largest];
    if (cold) {
      const kd = cold["kizu-direct"] || cold["kizu-llvm"];
      const kdName = cold["kizu-direct"] ? "kizu-direct" : "kizu-llvm";
      if (kd) {
        const cmpParts = [];
        if (cold["rust-debug"]) cmpParts.push(`rust-dbg ${fmtSec(cold["rust-debug"].wall)}`);
        else if (cold["zig-debug"]) cmpParts.push(`zig-dbg ${fmtSec(cold["zig-debug"].wall)}`);
        if (cold["go"]) cmpParts.push(`go ${fmtSec(cold["go"].wall)}`);
        else if (cold["c-O2"]) cmpParts.push(`c-O2 ${fmtSec(cold["c-O2"].wall)}`);
        kpi2 = {
          label: `Cold Compile (${largest})`,
          tag: kdName,
          val: fmtSec(kd.wall),
          cls: "cobalt",
          delta: cmpParts.join(" · ") || "cold wall"
        };
      }
    }

    let kpi3 = { label: `Check / 1-fn (${largest})`, tag: "kizu-check", val: "—", cls: "", delta: "no check data" };
    const chk = cp && cp.scenarios && cp.scenarios.check && cp.scenarios.check[largest];
    const edit = cp && cp.scenarios && cp.scenarios.edit && cp.scenarios.edit[largest];
    if (chk && chk["kizu-check"]) {
      const parts = [];
      if (edit && edit["kizu-direct"]) parts.push(`1-fn ${fmtSec(edit["kizu-direct"].wall)}`);
      if (chk["rust-check"]) parts.push(`rust ${fmtSec(chk["rust-check"].wall)}`);
      else if (chk["zig-check"]) parts.push(`zig ${fmtSec(chk["zig-check"].wall)}`);
      else if (chk["go-vet"]) parts.push(`go ${fmtSec(chk["go-vet"].wall)}`);
      kpi3 = {
        label: `Check / 1-fn (${largest})`,
        tag: "kizu-check",
        val: fmtSec(chk["kizu-check"].wall),
        cls: "",
        delta: parts.join(" · ") || "type-check"
      };
    }

    let kpi4 = { label: `Cache / RSS (${largest})`, tag: "kizu", val: "—", cls: "", delta: "no cache or RSS" };
    const cacheMap = cp && cp.cache && cp.cache[largest];
    if (cacheMap && (cacheMap["kizu-direct"] || cacheMap["kizu-llvm"])) {
      const kc = cacheMap["kizu-direct"] || cacheMap["kizu-llvm"];
      const rc = cacheMap["rust-debug"] || cacheMap["rust-release"];
      const zc = cacheMap["zig-debug"];
      const delta = rc
        ? `rust target/ ${fmtMb(rc.total_mb)}`
        : zc
          ? `zig cache ${fmtMb(zc.total_mb)}`
          : `${kc.files} files`;
      kpi4 = {
        label: `Build Cache (${largest})`,
        tag: "kizu",
        val: fmtMb(kc.total_mb),
        cls: "",
        delta
      };
    } else if (cp && cp.rss_mb && (cp.rss_mb["kizu-direct"] !== undefined || cp.rss_mb["kizu-llvm"] !== undefined)) {
      const kdRss = cp.rss_mb["kizu-direct"];
      const klRss = cp.rss_mb["kizu-llvm"];
      const primary = kdRss !== undefined ? kdRss : klRss;
      const parts = [];
      if (kdRss !== undefined && klRss !== undefined) parts.push(`llvm ${fmtMb(klRss)}`);
      if (cp.rss_mb["rust-debug"] !== undefined) parts.push(`rust ${fmtMb(cp.rss_mb["rust-debug"])}`);
      else if (cp.rss_mb["zig-debug"] !== undefined) parts.push(`zig ${fmtMb(cp.rss_mb["zig-debug"])}`);
      kpi4 = {
        label: `Peak RSS (${largest})`,
        tag: "kizu-direct",
        val: fmtMb(primary),
        cls: "",
        delta: parts.join(" · ") || "cold peak RSS"
      };
    }

    const cells = [kpi1, kpi2, kpi3, kpi4];
    document.getElementById("kpi-strip").innerHTML = cells
      .map(
        (c) => `<div class="kpi-cell">
          <div class="kpi-top">
            <span class="kpi-label">${esc(c.label)}</span>
            <span class="kpi-tag">${esc(c.tag)}</span>
          </div>
          <div class="kpi-main">
            <span class="kpi-val ${c.cls}">${esc(c.val)}</span>
            <span class="kpi-delta">${esc(c.delta)}</span>
          </div>
        </div>`
      )
      .join("");
  }

  function renderRuntime(run) {
    const body = document.getElementById("body-runtime");
    const sub = document.getElementById("sub-runtime");
    const ctrlView = document.getElementById("ctrl-rt-view");
    const ctrlScope = document.getElementById("ctrl-rt-scope");

    renderSeg(
      ctrlView,
      [
        { id: "geomean", label: "Geomean" },
        { id: "matrix", label: "Per-Bench" }
      ],
      state.rtView,
      (v) => {
        state.rtView = v;
        renderRuntime(run);
      },
      false
    );

    renderSeg(
      ctrlScope,
      [
        { id: "base", label: "Base" },
        { id: "all", label: "All" }
      ],
      state.rtScope,
      (v) => {
        state.rtScope = v;
        renderRuntime(run);
      },
      false
    );

    if (!run.runtime) {
      sub.textContent = "no data";
      body.innerHTML = `<div class="empty-box">No runtime benchmark data in this run.</div>`;
      return;
    }

    const rt = run.runtime;
    const programs = state.data.programs;
    const tuned = new Set(["rust-native", "c-O3native"]);
    const allKeys = state.data.variants.filter((v) => rt.variants[v]);
    const keys = state.rtScope === "base" ? allKeys.filter((v) => !tuned.has(v)) : allKeys;
    const sortedKeys = keys.slice().sort((a, b) => rt.variants[a].geomean - rt.variants[b].geomean);

    sub.textContent = state.rtView === "geomean" ? "vs C -O2 · lower is faster" : "median ms · lower is faster";

    let contentHtml = "";
    if (state.rtView === "geomean") {
      const rows = sortedKeys.map((v) => {
        const entry = rt.variants[v];
        const gm = entry.geomean;
        const lines = programs.map((p) => {
          const cell = entry.programs[p];
          return `${p}: ${fmtSec(cell.median)} (${cell.ratio.toFixed(2)}×)`;
        });
        return {
          name: v,
          value: gm,
          label: `${gm.toFixed(2)}×`,
          sub: v === "c-O2" ? "base" : "",
          tip: `<strong>${esc(v)}</strong> · geomean ${gm.toFixed(3)}× C -O2<br>${lines.join("<br>")}`
        };
      });
      contentHtml = buildBarsHtml(rows, { refVal: 1.0, minMax: 1.2 });
    } else {
      const bestByProg = {};
      programs.forEach((p) => {
        bestByProg[p] = Math.min(...sortedKeys.map((v) => rt.variants[v].programs[p].median));
      });
      const bestGm = Math.min(...sortedKeys.map((v) => rt.variants[v].geomean));
      const trs = sortedKeys
        .map((v) => {
          const entry = rt.variants[v];
          const tds = programs
            .map((p) => {
              const c = entry.programs[p];
              const isBest = Math.abs(c.median - bestByProg[p]) < 0.0005;
              const ms = Math.round(c.median * 1000);
              const tip = `<strong>${esc(v)} · ${esc(p)}</strong><br>Median: ${(c.median * 1000).toFixed(1)}ms (${c.ratio.toFixed(2)}× C -O2)<br>Range: ${(c.min * 1000).toFixed(1)}–${(c.max * 1000).toFixed(1)}ms (${c.samples} runs)`;
              return `<td class="${isBest ? "best" : ""}" data-tip="${esc(tip)}">${ms}</td>`;
            })
            .join("");
          const gmBest = Math.abs(entry.geomean - bestGm) < 0.0005;
          return `<tr class="${variantClass(v)}">
            <td><span class="variant-inline"><span class="bar-dot" style="background:${colorOf(v)}"></span>${esc(v)}</span></td>
            ${tds}
            <td class="geo-col ${gmBest ? "best" : ""}">${entry.geomean.toFixed(2)}×</td>
          </tr>`;
        })
        .join("");

      contentHtml = `<div class="matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th>Variant</th>
              ${programs.map((p) => `<th>${esc(PROG_SHORT[p] || p)}</th>`).join("")}
              <th>Geo</th>
            </tr>
          </thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;
    }

    const rustNote = rt.variants["rust"] ? "" : `<span class="foot-pill">rust in newer runs</span>`;
    body.innerHTML = `${contentHtml}
      <div class="quad-foot">
        <div class="quad-foot-left">
          <span>${rt.min_samples}+ runs/cell &middot; spread ${(rt.spread * 100).toFixed(1)}% &middot; dashed = 1.00× C -O2</span>
        </div>
        <div class="quad-foot-right">${rustNote}</div>
      </div>`;
    bindTips(body);
  }

  function renderCompile(run) {
    const body = document.getElementById("body-compile");
    const sub = document.getElementById("sub-compile");
    const ctrlSize = document.getElementById("ctrl-cp-size");
    const ctrlPhase = document.getElementById("ctrl-cp-phase");

    if (!run.compile) {
      ctrlSize.innerHTML = "";
      ctrlPhase.innerHTML = "";
      sub.textContent = "no data";
      body.innerHTML = `<div class="empty-box">No compile-speed data in this run.</div>`;
      return;
    }

    const cp = run.compile;
    const sizes = cp.sizes || [];
    if (sizes.length && !sizes.includes(state.cpSize)) {
      state.cpSize = sizes[sizes.length - 1];
    }

    renderSeg(
      ctrlSize,
      sizes.map((sz) => ({ id: sz, label: sz })),
      state.cpSize,
      (v) => {
        state.cpSize = v;
        renderCompile(run);
      },
      false
    );

    renderSeg(
      ctrlPhase,
      [
        { id: "cold", label: "Cold" },
        { id: "edit", label: "1-fn" },
        { id: "noop", label: "Noop" },
        { id: "check", label: "Check" }
      ],
      state.cpPhase,
      (v) => {
        state.cpPhase = v;
        renderCompile(run);
      },
      true
    );

    const scData = ((cp.scenarios || {})[state.cpPhase] || {})[state.cpSize] || {};
    const ordered = state.cpPhase === "check"
      ? state.data.compile_variants.check.filter((k) => scData[k])
      : [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt].filter((k) => scData[k]);

    const kizuRef = scData["kizu-direct"] || scData["kizu-check"] || scData["kizu-llvm"];
    const rows = ordered
      .map((k) => {
        const v = scData[k];
        const ratio = kizuRef && kizuRef.wall > 0 ? v.wall / kizuRef.wall : null;
        const ratioText = ratio !== null && k !== "kizu-direct" && k !== "kizu-check" ? `${ratio.toFixed(1)}×` : "";
        return {
          name: k,
          value: v.wall,
          label: fmtSec(v.wall),
          sub: ratioText,
          tip: `<strong>${esc(k)} · ${esc(state.cpSize)} · ${esc(state.cpPhase)}</strong><br>Wall: ${v.wall.toFixed(4)}s<br>CPU: ${v.cpu.toFixed(4)}s${ratio !== null ? `<br>vs Kizu: ${ratio.toFixed(2)}×` : ""}`
        };
      })
      .sort((a, b) => a.value - b.value);

    const locBySize = { m10: "~7k LOC", m40: "~28k LOC", m160: "~113k LOC" };
    sub.textContent = `${locBySize[state.cpSize] || state.cpSize} · wall`;

    body.innerHTML = `${buildBarsHtml(rows, { minMax: 0.01 })}
      <div class="quad-foot">
        <div class="quad-foot-left">
          <span>sorted fastest first &middot; ratio vs kizu</span>
        </div>
        <div class="quad-foot-right">
          <span>${rows.length} compilers</span>
        </div>
      </div>`;
    bindTips(body);
  }

  function renderCache(run) {
    const body = document.getElementById("body-cache");
    const sub = document.getElementById("sub-cache");
    const ctrlSize = document.getElementById("ctrl-ca-size");
    const ctrlMode = document.getElementById("ctrl-ca-mode");

    if (!run.compile) {
      ctrlSize.innerHTML = "";
      ctrlMode.innerHTML = "";
      sub.textContent = "no data";
      body.innerHTML = `<div class="empty-box">No cache or RSS data in this run.</div>`;
      return;
    }

    const cp = run.compile;
    const cacheAvailable = hasCacheData(run);
    const cacheSizes = Object.keys(cp.cache || {});
    const rssSizes = Object.keys(cp.rss_by_size || {});
    const sizes = state.caMode === "cache" ? cacheSizes : (rssSizes.length ? rssSizes : cp.sizes || []);
    if (sizes.length && !sizes.includes(state.caSize)) {
      state.caSize = sizes[sizes.length - 1];
    }

    if (sizes.length > 1) {
      renderSeg(
        ctrlSize,
        sizes.map((sz) => ({ id: sz, label: sz })),
        state.caSize,
        (v) => {
          state.caSize = v;
          renderCache(run);
        },
        false
      );
    } else {
      ctrlSize.innerHTML = "";
    }

    renderSeg(
      ctrlMode,
      [
        { id: "cache", label: "Cache MB" },
        { id: "rss", label: "Peak RSS" }
      ],
      state.caMode,
      (v) => {
        state.caMode = v;
        renderCache(run);
      },
      true
    );

    const allKeys = [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt];

    if (state.caMode === "cache") {
      sub.textContent = cacheAvailable ? `${state.caSize} disk footprint` : "not in this run";
      if (!cacheAvailable) {
        const newer = state.data.runs.find((r) => hasCacheData(r));
        const switchBtn = newer
          ? `<button type="button" class="inline-btn" data-jump-env="${esc(newer.machine_group)}" data-jump-run="${esc(newer.id)}">Open ${esc(shortEnvLabel(newer.machine_group, newer))}</button>`
          : "";
        body.innerHTML = `<div class="empty-box">
          <div>Build cache size (<code>cache.json</code>) was added in newer runs.</div>
          <div class="empty-actions">
            ${switchBtn}
            <button type="button" class="inline-btn" data-show-rss="1">Show Peak RSS</button>
          </div>
        </div>
        <div class="quad-foot">
          <div class="quad-foot-left"><span class="foot-pill accent">cache added in newer runs</span></div>
          <div class="quad-foot-right"><span>KIZU_CACHE_DIR vs target/</span></div>
        </div>`;
        const rssBtn = body.querySelector("[data-show-rss]");
        if (rssBtn) {
          rssBtn.addEventListener("click", () => {
            state.caMode = "rss";
            renderCache(run);
          });
        }
        const jumpBtn = body.querySelector("[data-jump-run]");
        if (jumpBtn) {
          jumpBtn.addEventListener("click", () => {
            selectEnvironment(jumpBtn.getAttribute("data-jump-env"), jumpBtn.getAttribute("data-jump-run"));
          });
        }
        return;
      }

      const cdata = cp.cache[state.caSize] || {};
      const present = allKeys.filter((k) => cdata[k]);
      const kizuRef = cdata["kizu-direct"] || cdata["kizu-llvm"];
      const refVal = kizuRef ? kizuRef[state.caField] : null;
      const rows = present
        .map((k) => {
          const e = cdata[k];
          const val = e[state.caField];
          const ratio = refVal && refVal > 0 && k !== "kizu-direct" ? `${(val / refVal).toFixed(1)}×` : "";
          return {
            name: k,
            value: val,
            label: fmtMb(val),
            sub: ratio,
            tip: `<strong>${esc(k)} · ${esc(state.caSize)}</strong><br>Total cache: ${e.total_mb.toFixed(2)} MB<br>Project delta: ${e.project_mb.toFixed(2)} MB<br>Seed: ${e.seed_mb.toFixed(2)} MB<br>Files: ${e.files.toLocaleString()}`
          };
        })
        .sort((a, b) => a.value - b.value);

      body.innerHTML = `${buildBarsHtml(rows, { minMax: 1 })}
        <div class="quad-foot">
          <div class="quad-foot-left">
            <span>${state.caField === "project_mb" ? "project delta" : "total cache dir"} &middot; ratio vs kizu</span>
          </div>
          <div class="quad-foot-right">
            <button type="button" class="inline-btn" style="height:18px;font-size:9.5px;padding:0 6px" data-toggle-cafield="1">${state.caField === "total_mb" ? "Switch to delta" : "Switch to total"}</button>
          </div>
        </div>`;
      const fbtn = body.querySelector("[data-toggle-cafield]");
      if (fbtn) {
        fbtn.addEventListener("click", () => {
          state.caField = state.caField === "total_mb" ? "project_mb" : "total_mb";
          renderCache(run);
        });
      }
      bindTips(body);
      return;
    }

    const rssMap = (cp.rss_by_size && cp.rss_by_size[state.caSize]) || cp.rss_mb || {};
    const present = allKeys.filter((k) => rssMap[k] !== undefined);
    const kizuRef = rssMap["kizu-direct"] !== undefined ? rssMap["kizu-direct"] : rssMap["kizu-llvm"];
    const rows = present
      .map((k) => {
        const val = rssMap[k];
        const ratio = kizuRef && kizuRef > 0 && k !== "kizu-direct" ? `${(val / kizuRef).toFixed(2)}×` : "";
        return {
          name: k,
          value: val,
          label: fmtMb(val),
          sub: ratio,
          tip: `<strong>${esc(k)} · ${esc(state.caSize)} cold</strong><br>Peak RSS: ${val.toFixed(1)} MB${kizuRef ? `<br>vs kizu-direct: ${(val / kizuRef).toFixed(2)}×` : ""}`
        };
      })
      .sort((a, b) => a.value - b.value);

    sub.textContent = `${state.caSize} cold peak RSS`;
    const cacheNote = cacheAvailable ? "" : `<span class="foot-pill accent">cache added in newer runs</span>`;
    body.innerHTML = `${buildBarsHtml(rows, { minMax: 50 })}
      <div class="quad-foot">
        <div class="quad-foot-left">
          <span>cold build max RSS &middot; ratio vs kizu</span>
        </div>
        <div class="quad-foot-right">${cacheNote}</div>
      </div>`;
    bindTips(body);
  }

  function renderHistory(run) {
    const body = document.getElementById("body-history");
    const sub = document.getElementById("sub-history");
    const ctrlMetric = document.getElementById("ctrl-hi-metric");

    const runs = sameHostRuns(run);
    const abs = sameHostAb(run);

    renderSeg(
      ctrlMetric,
      [
        { id: "runtime", label: "Runtime" },
        { id: "compile", label: "Compile" },
        { id: "ab", label: "A/B", disabled: abs.length === 0 }
      ],
      state.hiMetric,
      (v) => {
        state.hiMetric = v;
        renderHistory(run);
      },
      true
    );

    if (state.hiMetric === "ab") {
      if (!abs.length) {
        sub.textContent = "same host only";
        body.innerHTML = `<div class="empty-box">No compiler A/B runs recorded for this host.</div>`;
        return;
      }
      const ab = abs[abs.length - 1];
      const xl = ab.revs.map((x) => x.rev);
      const first = ab.revs[0];
      const last = ab.revs[ab.revs.length - 1];
      const rssPct = first && last && first.rss_mb ? (((last.rss_mb - first.rss_mb) / first.rss_mb) * 100).toFixed(1) : null;
      const heapPct = first && last && first.heap_peak_mb && last.heap_peak_mb
        ? (((last.heap_peak_mb - first.heap_peak_mb) / first.heap_peak_mb) * 100).toFixed(1)
        : null;
      const wallPct = first && last && first.wall ? (((last.wall - first.wall) / first.wall) * 100).toFixed(1) : null;

      const series = [
        { name: "Max RSS", color: "#1d4ed8", points: ab.revs.map((x) => x.rss_mb), width: 2.2 },
        { name: "Heap Peak", color: "#e84800", points: ab.revs.map((x) => x.heap_peak_mb), width: 2.2 }
      ];
      sub.textContent = `${ab.revs.length} revs · ${ab.input || "compiler"}`;

      const legend = `<div class="legend-row">
        <span class="legend-item"><span class="bar-dot" style="background:#1d4ed8"></span>RSS <strong>${fmtMb(last.rss_mb)}</strong>${rssPct !== null ? ` (${rssPct}%)` : ""}</span>
        <span class="legend-item"><span class="bar-dot" style="background:#e84800"></span>Heap <strong>${fmtMb(last.heap_peak_mb)}</strong>${heapPct !== null ? ` (${heapPct}%)` : ""}</span>
        <span class="legend-item">Wall <strong>${fmtSec(last.wall)}</strong>${wallPct !== null ? ` (${wallPct}%)` : ""}</span>
      </div>`;

      body.innerHTML = `<div class="chart-box">
        ${legend}
        <div class="svg-stage">${buildTrendSvg(series, xl, { zeroBase: true, yFmt: (v) => Math.round(v) + " MB", aria: "Compiler A/B memory progression" })}</div>
      </div>
      <div class="quad-foot">
        <div class="quad-foot-left"><span>${esc(ab.id)}</span></div>
        <div class="quad-foot-right"><span class="foot-pill">same-host only</span></div>
      </div>`;
      bindTips(body);
      return;
    }

    const selIdx = runs.findIndex((r) => r.id === run.id);
    const xLabels = runs.map((r) => shortKizu(r.machine && r.machine.kizu));
    const tipLabels = runs.map((r) => `${r.id} (${shortDate(r)})`);
    const envShort = shortEnvLabel(run.machine_group, run);

    if (state.hiMetric === "runtime") {
      const candidateKeys = ["kizu-llvm", "kizu-direct", "rust", "c-O2"];
      const series = candidateKeys
        .map((k) => {
          const pts = runs.map((r) => (r.runtime && r.runtime.variants[k] ? r.runtime.variants[k].geomean : null));
          return {
            name: k,
            color: colorOf(k),
            points: pts,
            dashed: k === "c-O2",
            width: k.startsWith("kizu") ? 2.4 : 1.7
          };
        })
        .filter((s) => s.points.some((v) => v !== null));

      sub.textContent = `${runs.length} run${runs.length === 1 ? "" : "s"} · same host`;

      const legend = `<div class="legend-row">${series
        .map((s) => {
          const latest = s.points[selIdx >= 0 ? selIdx : s.points.length - 1];
          return `<span class="legend-item"><span class="bar-dot" style="background:${s.color}"></span>${esc(s.name)} <strong>${latest !== null && latest !== undefined ? latest.toFixed(2) + "×" : "—"}</strong></span>`;
        })
        .join("")}</div>`;

      body.innerHTML = `<div class="chart-box">
        ${legend}
        <div class="svg-stage">${buildTrendSvg(series, xLabels, {
          zeroBase: false,
          refVal: 1.0,
          selectedIdx: selIdx,
          tipLabels,
          yFmt: (v) => v.toFixed(2) + "×",
          aria: "Same-host runtime geomean progression"
        })}</div>
      </div>
      <div class="quad-foot">
        <div class="quad-foot-left"><span>${esc(envShort)}</span></div>
        <div class="quad-foot-right"><span class="foot-pill">hosts never mixed</span></div>
      </div>`;
      bindTips(body);
      return;
    }

    const largest = run.compile && run.compile.sizes && run.compile.sizes.length ? run.compile.sizes[run.compile.sizes.length - 1] : "m160";
    const cpKeys = ["kizu-direct", "kizu-llvm", "rust-debug", "zig-debug", "go"];
    const series = cpKeys
      .map((k) => {
        const pts = runs.map((r) => {
          const m = r.compile && r.compile.scenarios && r.compile.scenarios.cold && r.compile.scenarios.cold[largest];
          return m && m[k] ? m[k].wall : null;
        });
        return {
          name: k,
          color: colorOf(k),
          points: pts,
          width: k.startsWith("kizu") ? 2.4 : 1.6
        };
      })
      .filter((s) => s.points.some((v) => v !== null));

    sub.textContent = `${largest} cold · ${runs.length} run${runs.length === 1 ? "" : "s"}`;

    const legend = `<div class="legend-row">${series
      .slice(0, 4)
      .map((s) => {
        const latest = s.points[selIdx >= 0 ? selIdx : s.points.length - 1];
        return `<span class="legend-item"><span class="bar-dot" style="background:${s.color}"></span>${esc(s.name)} <strong>${latest !== null && latest !== undefined ? fmtSec(latest) : "—"}</strong></span>`;
      })
      .join("")}</div>`;

    body.innerHTML = `<div class="chart-box">
      ${legend}
      <div class="svg-stage">${buildTrendSvg(series, xLabels, {
        zeroBase: true,
        selectedIdx: selIdx,
        tipLabels,
        yFmt: (v) => fmtSec(v),
        aria: "Same-host compile speed progression"
      })}</div>
    </div>
    <div class="quad-foot">
      <div class="quad-foot-left"><span>${esc(envShort)}</span></div>
      <div class="quad-foot-right"><span class="foot-pill">hosts never mixed</span></div>
    </div>`;
    bindTips(body);
  }

  function openModal(title, sub, html, opener) {
    hideTip();
    state.modalOpener = opener || document.activeElement;
    state.modalOpenedAt = Date.now();
    modalTitle.textContent = title;
    modalSub.textContent = sub;
    modalBody.innerHTML = html;
    modalBackdrop.hidden = false;
    modalClose.focus();
  }

  function closeModal() {
    if (modalBackdrop.hidden) return;
    modalBackdrop.hidden = true;
    if (state.modalOpener && typeof state.modalOpener.focus === "function") {
      state.modalOpener.focus();
    }
    state.modalOpener = null;
  }

  function openMethodModal(opener) {
    const run = currentRun();
    const m = (run && run.machine) || {};
    const envs = envGroupsList();
    const fields = [
      ["Env Group", run ? run.machine_group : "—"],
      ["Runner", m.runner],
      ["Run ID", run ? run.id : "—"],
      ["Date", m.date],
      ["CPU", m.cpu],
      ["OS", m.os],
      ["Cores", m.cores],
      ["CPU Pin", m.pin],
      ["Kizu", m.kizu],
      ["Rust", m.rust],
      ["Go", m.go],
      ["Zig", m.zig],
      ["Clang", m.clang]
    ].filter(([, v]) => v && v !== "none");

    const kvHtml = fields
      .map(([k, v]) => `<div class="kv-row"><span class="kv-key">${esc(k)}</span><span class="kv-val">${esc(v)}</span></div>`)
      .join("");

    const envRows = envs
      .map(
        (e) => `<tr>
          <td><button type="button" class="run-row-btn" data-pick-env="${esc(e.group)}">${esc(e.group)}</button></td>
          <td>${e.runs.length}</td>
          <td>${esc(shortDate(e.runs[0]))}</td>
          <td>${e.group === state.envGroup ? "active" : "—"}</td>
        </tr>`
      )
      .join("");

    const html = `
      <div class="modal-section">
        <h3>Recorded Environments (${envs.length})</h3>
        <p class="modal-note">Benchmarks from different hosts (GitHub Actions Linux x86_64, GitHub Actions macOS arm64, local Linux/WSL2, Colab, etc.) are strictly isolated and never averaged or plotted together.</p>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Environment</th><th>Runs</th><th>Latest</th><th>Status</th></tr></thead>
            <tbody>${envRows}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-section">
        <h3>Methodology &amp; Fairness</h3>
        <div class="method-grid">
          <div class="method-card">
            <h4>Pinned Toolchains</h4>
            <p><code>kizu</code>, <code>zig</code>, <code>go</code>, <code>hyperfine</code>, and <code>just</code> are pinned via SHA-256 in <code>kugi.toml</code> + <code>kugi.lock</code>, paired with system <code>clang</code> and host <code>rustc</code> / <code>cargo</code>.</p>
          </div>
          <div class="method-card">
            <h4>Runtime-Sized Inputs</h4>
            <p>All 6 benchmarks add <code>argc - 1</code> to their workload so compilers cannot constant-fold answers. Every variant is verified to print identical stdout via <code>scripts/check.sh</code>.</p>
          </div>
          <div class="method-card">
            <h4>Explicit Safety &amp; CPU Flags</h4>
            <p>Baseline CPU variants: <code>kizu-llvm</code>, <code>kizu-direct</code>, <code>rust</code> (<code>-C opt-level=3</code>), <code>c-O2</code>, <code>zig-fast</code>/<code>zig-safe</code> (<code>-mcpu=baseline</code>), <code>go</code>/<code>go-nobounds</code>. Host-tuned: <code>rust-native</code> and <code>c-O3native</code>.</p>
          </div>
          <div class="method-card">
            <h4>Build Caches &amp; Host Isolation</h4>
            <p>Cold builds start with empty project caches and warm stdlib/runtime caches. Cache sizes measure exact deduplicated bytes of <code>KIZU_CACHE_DIR</code>, Rust <code>target/</code>, <code>GOCACHE</code>, <code>.zig-cache</code>, and C <code>.o</code> files. Hosts are never mixed.</p>
          </div>
        </div>
      </div>
      <div class="modal-section">
        <h3>Selected Run Environment</h3>
        <div class="kv-grid">${kvHtml}</div>
      </div>`;
    openModal("Methodology & Environments", "Strict per-host isolation and active run metadata", html, opener);
    modalBody.querySelectorAll("[data-pick-env]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectEnvironment(btn.getAttribute("data-pick-env"));
        closeModal();
      });
    });
  }

  function openRuntimeModal(opener) {
    const run = currentRun();
    if (!run || !run.runtime) return;
    const rt = run.runtime;
    const programs = state.data.programs;
    const keys = state.data.variants.filter((v) => rt.variants[v]).sort((a, b) => rt.variants[a].geomean - rt.variants[b].geomean);
    const bestByProg = {};
    programs.forEach((p) => {
      bestByProg[p] = Math.min(...keys.map((v) => rt.variants[v].programs[p].median));
    });
    const bestGm = Math.min(...keys.map((v) => rt.variants[v].geomean));

    const rows = keys
      .map((v) => {
        const entry = rt.variants[v];
        const cells = programs
          .map((p) => {
            const c = entry.programs[p];
            const best = Math.abs(c.median - bestByProg[p]) < 0.0005 ? "best" : "";
            return `<td class="${best}">${c.median.toFixed(3)}s <span class="detail-muted">(${c.ratio.toFixed(2)}×)</span></td>`;
          })
          .join("");
        const gmBest = Math.abs(entry.geomean - bestGm) < 0.0005 ? "best" : "";
        const btRss = entry.binarytrees_rss_mb !== undefined ? `${entry.binarytrees_rss_mb.toFixed(1)} MB` : "—";
        const nbRss = entry.nbody_rss_mb !== undefined ? `${entry.nbody_rss_mb.toFixed(1)} MB` : "—";
        const binKb = entry.fib_binary_kb !== undefined ? `${entry.fib_binary_kb.toFixed(0)} KB` : "—";
        return `<tr>
          <td><span class="variant-inline"><span class="bar-dot" style="background:${colorOf(v)}"></span><strong>${esc(v)}</strong></span></td>
          ${cells}
          <td class="${gmBest}">${entry.geomean.toFixed(2)}×</td>
          <td>${btRss}</td>
          <td>${nbRss}</td>
          <td>${binKb}</td>
        </tr>`;
      })
      .join("");

    let instrSection = "";
    if (rt.has_instructions) {
      const iRows = keys
        .map((v) => {
          const entry = rt.variants[v];
          const cells = programs
            .map((p) => {
              const c = entry.programs[p];
              if (c.instructions_g === null || c.instructions_g === undefined) return `<td>—</td>`;
              return `<td>${c.instructions_g.toFixed(2)}G <span class="detail-muted">(${c.instructions_ratio.toFixed(2)}×)</span></td>`;
            })
            .join("");
          return `<tr><td><span class="variant-inline"><span class="bar-dot" style="background:${colorOf(v)}"></span>${esc(v)}</span></td>${cells}</tr>`;
        })
        .join("");
      instrSection = `<div class="modal-section">
        <h3>Instruction Count (Valgrind Cachegrind)</h3>
        <p class="modal-note">Billions of executed instructions (10^9) and ratio vs C -O2.</p>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Variant</th>${programs.map((p) => `<th>${esc(p)}</th>`).join("")}</tr></thead>
            <tbody>${iRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    const html = `
      <div class="modal-section">
        <h3>Full Runtime Breakdown</h3>
        <p class="modal-note">Median wall seconds (ratio vs C -O2), peak RSS, and compiled binary size. ${rt.min_samples}+ shuffled rounds per cell; max spread ${(rt.spread * 100).toFixed(1)}%.</p>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Variant</th>${programs.map((p) => `<th>${esc(p)}</th>`).join("")}<th>Geomean</th><th>bt RSS</th><th>nbody RSS</th><th>fib bin</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      ${instrSection}`;
    openModal("Runtime Details", `${run.id} · ${run.machine_group}`, html, opener);
  }

  function openCompileModal(opener) {
    const run = currentRun();
    if (!run || !run.compile) return;
    const cp = run.compile;
    const sizes = cp.sizes || [];
    const phases = [
      ["cold", "Cold Build (from scratch)"],
      ["edit", "1-Function Edit (incremental)"],
      ["noop", "Unchanged (no-op rebuild)"],
      ["check", "Type-Check Only"]
    ];

    const sections = phases
      .map(([sc, label]) => {
        const keys = sc === "check"
          ? state.data.compile_variants.check
          : [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt];
        const present = keys.filter((k) => sizes.some((sz) => ((cp.scenarios[sc] || {})[sz] || {})[k]));
        if (!present.length) return "";
        const rows = present
          .map((k) => {
            const cells = sizes
              .map((sz) => {
                const v = ((cp.scenarios[sc] || {})[sz] || {})[k];
                if (!v) return `<td>—</td>`;
                return `<td>${v.wall.toFixed(3)}s <span class="detail-muted">/ ${v.cpu.toFixed(2)}s</span></td>`;
              })
              .join("");
            return `<tr><td><span class="variant-inline"><span class="bar-dot" style="background:${colorOf(k)}"></span>${esc(k)}</span></td>${cells}</tr>`;
          })
          .join("");
        return `<div class="modal-section">
          <h3>${esc(label)}</h3>
          <div class="table-scroll">
            <table class="detail-table">
              <thead><tr><th>Toolchain</th>${sizes.map((s) => `<th>${esc(s)} (wall / CPU)</th>`).join("")}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
      })
      .join("");

    let realSection = "";
    if (run.real && run.real.length) {
      const rRows = run.real
        .map(
          (r) => `<tr>
            <td>${esc(r.label)}</td>
            <td>${r.lines.toLocaleString()}</td>
            <td>${r.wall.toFixed(2)}s</td>
            <td>${r.cpu.toFixed(2)}s</td>
            <td>${r.lines_per_sec.toLocaleString()}</td>
          </tr>`
        )
        .join("");
      realSection = `<div class="modal-section">
        <h3>Real-World Codebases</h3>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Target</th><th>LOC</th><th>Wall</th><th>CPU</th><th>LOC / sec</th></tr></thead>
            <tbody>${rRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    openModal("Compile Speed Details", `${run.id} · ${run.machine_group}`, sections + realSection, opener);
  }

  function openCacheModal(opener) {
    const run = currentRun();
    if (!run || !run.compile) return;
    const cp = run.compile;
    const allKeys = [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt];
    const sections = [];

    const cacheSizes = Object.keys(cp.cache || {});
    if (cacheSizes.length) {
      const present = allKeys.filter((k) => cacheSizes.some((sz) => (cp.cache[sz] || {})[k]));
      const rows = present
        .map((k) => {
          const cells = cacheSizes
            .map((sz) => {
              const e = (cp.cache[sz] || {})[k];
              if (!e) return `<td>—</td>`;
              return `<td>${e.total_mb.toFixed(2)} MB <span class="detail-muted">(Δ ${e.project_mb.toFixed(2)}, ${e.files}f)</span></td>`;
            })
            .join("");
          return `<tr><td><span class="variant-inline"><span class="bar-dot" style="background:${colorOf(k)}"></span>${esc(k)}</span></td>${cells}</tr>`;
        })
        .join("");
      sections.push(`<div class="modal-section">
        <h3>Build Cache Footprint (Total MB, Project Delta, Files)</h3>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Toolchain</th>${cacheSizes.map((s) => `<th>${esc(s)}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
    } else {
      sections.push(`<div class="modal-section">
        <h3>Build Cache Footprint</h3>
        <p class="modal-note">This historical run predates <code>cache.json</code> build cache size measurements.</p>
      </div>`);
    }

    const rssSizes = Object.keys(cp.rss_by_size || {});
    if (rssSizes.length) {
      const present = allKeys.filter((k) => rssSizes.some((sz) => (cp.rss_by_size[sz] || {})[k] !== undefined));
      const rows = present
        .map((k) => {
          const cells = rssSizes
            .map((sz) => {
              const v = (cp.rss_by_size[sz] || {})[k];
              return v === undefined ? `<td>—</td>` : `<td>${v.toFixed(1)} MB</td>`;
            })
            .join("");
          return `<tr><td><span class="variant-inline"><span class="bar-dot" style="background:${colorOf(k)}"></span>${esc(k)}</span></td>${cells}</tr>`;
        })
        .join("");
      sections.push(`<div class="modal-section">
        <h3>Compiler Peak RSS (Cold Build)</h3>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Toolchain</th>${rssSizes.map((s) => `<th>${esc(s)}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`);
    }

    openModal("Cache Size & Peak RSS", `${run.id} · ${run.machine_group}`, sections.join(""), opener);
  }

  function openHistoryModal(opener) {
    const run = currentRun();
    if (!run) return;
    const runs = sameHostRuns(run);
    const abs = sameHostAb(run);

    const runRows = runs
      .map((r) => {
        const v = r.runtime ? r.runtime.variants : {};
        const kl = v["kizu-llvm"] ? `${v["kizu-llvm"].geomean.toFixed(2)}×` : "—";
        const kd = v["kizu-direct"] ? `${v["kizu-direct"].geomean.toFixed(2)}×` : "—";
        const ru = v["rust"] ? `${v["rust"].geomean.toFixed(2)}×` : "—";
        const sz = r.compile && r.compile.sizes && r.compile.sizes.length ? r.compile.sizes[r.compile.sizes.length - 1] : "m160";
        const c = (r.compile && r.compile.scenarios.cold && r.compile.scenarios.cold[sz]) || {};
        const cd = c["kizu-direct"] ? fmtSec(c["kizu-direct"].wall) : "—";
        const cl = c["kizu-llvm"] ? fmtSec(c["kizu-llvm"].wall) : "—";
        const ca = (r.compile && r.compile.cache && r.compile.cache[sz] && r.compile.cache[sz]["kizu-direct"])
          ? fmtMb(r.compile.cache[sz]["kizu-direct"].total_mb)
          : "—";
        return `<tr>
          <td><button type="button" class="run-row-btn" data-pick-run="${esc(r.id)}">${esc(r.id)}</button></td>
          <td>${esc(shortKizu(r.machine && r.machine.kizu))}</td>
          <td>${kl}</td>
          <td>${kd}</td>
          <td>${ru}</td>
          <td>${cd}</td>
          <td>${cl}</td>
          <td>${ca}</td>
        </tr>`;
      })
      .join("");

    let abSections = "";
    if (abs.length) {
      abSections = abs
        .map((ab) => {
          const base = ab.revs[0];
          const trs = ab.revs
            .map((x) => {
              const dRss = base && base.rss_mb ? (((x.rss_mb - base.rss_mb) / base.rss_mb) * 100).toFixed(1) + "%" : "—";
              return `<tr>
                <td><code>${esc(x.rev)}</code></td>
                <td>${x.wall.toFixed(2)}s</td>
                <td>${x.user.toFixed(2)}s</td>
                <td>${x.sys.toFixed(2)}s</td>
                <td>${x.rss_mb.toFixed(0)} MB <span class="detail-muted">(${dRss})</span></td>
                <td>${x.heap_peak_mb !== null ? x.heap_peak_mb.toFixed(0) + " MB" : "—"}</td>
                <td>${x.instructions_g !== null ? x.instructions_g.toFixed(2) + "G" : "—"}</td>
              </tr>`;
            })
            .join("");
          return `<div class="modal-section">
            <h3>Compiler A/B (${esc(ab.id)})</h3>
            <p class="modal-note">Input: <code>${esc(ab.input || "compiler/")}</code></p>
            <div class="table-scroll">
              <table class="detail-table">
                <thead><tr><th>Rev</th><th>Wall</th><th>User</th><th>Sys</th><th>Max RSS</th><th>Heap Peak</th><th>Instr</th></tr></thead>
                <tbody>${trs}</tbody>
              </table>
            </div>
          </div>`;
        })
        .join("");
    }

    let heapSection = "";
    if (state.data.compiler_heap && state.data.compiler_heap.length) {
      const hRows = state.data.compiler_heap
        .map(
          (h) => `<tr>
            <td>${esc(h.id)}</td>
            <td><code>${esc(h.rev)}</code></td>
            <td>${h.rss_mb !== null ? h.rss_mb.toFixed(0) + " MB" : "—"}</td>
            <td>${h.heap_peak_mb !== null ? h.heap_peak_mb.toFixed(0) + " MB" : "—"}</td>
            <td>${h.pages_peak_mb !== null ? h.pages_peak_mb.toFixed(0) + " MB" : "—"}</td>
            <td>${h.wall !== null ? h.wall.toFixed(2) + "s" : "—"}</td>
          </tr>`
        )
        .join("");
      heapSection = `<div class="modal-section">
        <h3>Compiler Heap Snapshots (Massif)</h3>
        <div class="table-scroll">
          <table class="detail-table">
            <thead><tr><th>Run</th><th>Rev</th><th>Max RSS</th><th>Heap Peak</th><th>Pages Peak</th><th>Wall</th></tr></thead>
            <tbody>${hRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    const html = `<div class="modal-section">
      <h3>Same-Host Runs (${runs.length})</h3>
      <p class="modal-note">Click any run ID to inspect it in the cockpit. Runs from different machines are strictly separated.</p>
      <div class="table-scroll">
        <table class="detail-table">
          <thead><tr><th>Run</th><th>Kizu</th><th>llvm rt</th><th>direct rt</th><th>rust rt</th><th>direct cold</th><th>llvm cold</th><th>cache</th></tr></thead>
          <tbody>${runRows}</tbody>
        </table>
      </div>
    </div>${abSections}${heapSection}`;

    openModal("Host History & Progression", run.machine_group, html, opener);
    modalBody.querySelectorAll("[data-pick-run]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.runId = btn.getAttribute("data-pick-run");
        document.getElementById("run-select").value = state.runId;
        syncRunDefaults(currentRun());
        renderAll();
        closeModal();
      });
    });
  }

  function renderAll() {
    const run = currentRun();
    if (!run) return;
    renderKpis(run);
    renderRuntime(run);
    renderCompile(run);
    renderCache(run);
    renderHistory(run);
  }

  document.getElementById("run-select").addEventListener("change", (e) => {
    state.runId = e.target.value;
    const run = currentRun();
    if (run) syncRunDefaults(run);
    renderAll();
  });

  document.getElementById("btn-method").addEventListener("click", (e) => {
    openMethodModal(e.currentTarget);
  });

  document.getElementById("iso-badge").addEventListener("click", (e) => {
    openMethodModal(e.currentTarget);
  });

  document.querySelectorAll("[data-expand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-expand");
      if (kind === "runtime") openRuntimeModal(btn);
      else if (kind === "compile") openCompileModal(btn);
      else if (kind === "cache") openCacheModal(btn);
      else if (kind === "history") openHistoryModal(btn);
    });
  });

  modalClose.addEventListener("click", closeModal);

  modalBackdrop.addEventListener("pointerdown", (e) => {
    state.backdropDown = e.target === modalBackdrop;
  });

  modalBackdrop.addEventListener("click", (e) => {
    if (Date.now() - state.modalOpenedAt < 260) return;
    if (state.backdropDown && e.target === modalBackdrop) {
      closeModal();
    }
    state.backdropDown = false;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalBackdrop.hidden) {
      closeModal();
    }
  });

  fetch("data.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      state.data = data;
      const envs = envGroupsList();
      if (envs.length) {
        selectEnvironment(envs[0].group, envs[0].runs[0] ? envs[0].runs[0].id : null);
      }
    })
    .catch((err) => {
      document.getElementById("body-runtime").innerHTML = `<div class="empty-box">Failed to load <code>data.json</code>: ${esc(err.message)}</div>`;
    });
})();
