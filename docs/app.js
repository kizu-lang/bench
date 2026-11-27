(function () {
  "use strict";

  const COLORS = {
    "kizu-llvm": "#0f766e",
    "kizu-llvm-opt": "#0f766e",
    "kizu-direct": "#14b8a6",
    "kizu-direct-opt": "#0d9488",
    "kizu-check": "#0f766e",
    "rust": "#c2410c",
    "rust-native": "#ea580c",
    "rust-debug": "#ea580c",
    "rust-release": "#c2410c",
    "rust-check": "#c2410c",
    "c-O2": "#334155",
    "c-O0": "#64748b",
    "c-O3native": "#475569",
    "c-check": "#334155",
    "zig-fast": "#b45309",
    "zig-safe": "#d97706",
    "zig-debug": "#d97706",
    "zig-check": "#b45309",
    "go": "#0284c7",
    "go-nobounds": "#38bdf8",
    "go-noopt": "#38bdf8",
    "go-vet": "#0284c7"
  };

  const state = {
    data: null,
    runId: null,
    tab: "runtime",
    runtimeProg: "geomean",
    compileScenario: "cold",
    compileSize: "m160",
    compileGroup: "all",
    cacheSize: "m160",
    cacheMode: "total"
  };

  const tooltip = document.getElementById("tooltip");

  function colorOf(name) {
    return COLORS[name] || "#64748b";
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showTip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    moveTip(evt);
  }

  function moveTip(evt) {
    const pad = 14;
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

  function currentRun() {
    return state.data.runs.find((r) => r.id === state.runId) || state.data.runs[0];
  }

  function shortKizu(str) {
    if (!str) return "—";
    const m = str.match(/kizu\s+([^\s]+)\s+\(([0-9a-f]+)/);
    if (m) return m[1] === "devel" ? m[2].slice(0, 8) : m[1];
    return str.replace(/^kizu\s+/, "");
  }

  function buildBarSvg(rows, opts) {
    const width = 880;
    const labelW = 148;
    const rightW = 148;
    const barW = width - labelW - rightW;
    const rowH = 30;
    const topPad = 12;
    const botPad = 24;
    const height = topPad + rows.length * rowH + botPad;
    const maxVal = Math.max(opts.minMax || 0.001, ...rows.map((r) => r.value));
    const scale = (v) => (v / maxVal) * barW;

    let grid = "";
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = (maxVal * i) / ticks;
      const x = labelW + scale(val);
      grid += `<line x1="${x.toFixed(1)}" y1="${topPad}" x2="${x.toFixed(1)}" y2="${height - botPad}" stroke="#e6ebf2" stroke-width="1"/>`;
      grid += `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="#758498" font-size="11" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(opts.tickFmt(val))}</text>`;
    }

    let refLine = "";
    if (opts.refVal !== undefined && opts.refVal <= maxVal) {
      const rx = labelW + scale(opts.refVal);
      refLine = `<line x1="${rx.toFixed(1)}" y1="${topPad - 4}" x2="${rx.toFixed(1)}" y2="${height - botPad + 2}" stroke="#334155" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    }

    let bars = "";
    rows.forEach((r, idx) => {
      const y = topPad + idx * rowH;
      const w = Math.max(2, scale(r.value));
      const color = colorOf(r.name);
      bars += `<g class="bar-row" data-tip="${esc(r.tip)}">`;
      bars += `<rect class="bar-bg" x="0" y="${y}" width="${width}" height="${rowH}" fill="transparent"/>`;
      bars += `<text x="${labelW - 10}" y="${y + 19}" text-anchor="end" fill="#111827" font-size="12" font-weight="600" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(r.name)}</text>`;
      bars += `<rect x="${labelW}" y="${y + 6}" width="${w.toFixed(1)}" height="18" rx="3" fill="${color}"/>`;
      bars += `<text x="${(labelW + w + 8).toFixed(1)}" y="${y + 19}" fill="#111827" font-size="12" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(r.label)}</text>`;
      bars += `</g>`;
    });

    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.aria || "Bar chart")}">${grid}${refLine}${bars}</svg>`;
  }

  function buildLineSvg(seriesList, xLabels, opts) {
    const width = 880;
    const padL = 62;
    const padR = 26;
    const padT = 18;
    const padB = 42;
    const plotW = width - padL - padR;
    const plotH = 220;
    const height = padT + plotH + padB;
    const allVals = [];
    seriesList.forEach((s) => s.points.forEach((p) => {
      if (p !== null && p !== undefined) allVals.push(p);
    }));
    if (!allVals.length) {
      return `<div class="empty-note">No points available.</div>`;
    }
    const maxV = Math.max(...allVals) * 1.12;
    const minV = opts.zeroBase ? 0 : Math.max(0, Math.min(...allVals) * 0.85);
    const span = Math.max(0.001, maxV - minV);
    const xAt = (i) => xLabels.length <= 1 ? padL + plotW / 2 : padL + (i / (xLabels.length - 1)) * plotW;
    const yAt = (v) => padT + plotH - ((v - minV) / span) * plotH;

    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const v = minV + (span * i) / 4;
      const y = yAt(v);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#e6ebf2" stroke-width="1"/>`;
      grid += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#758498" font-size="11" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(opts.yFmt(v))}</text>`;
    }

    let xAxis = "";
    const labelStep = Math.max(1, Math.ceil(xLabels.length / 6));
    xLabels.forEach((lbl, i) => {
      const isLast = i === xLabels.length - 1;
      const show = i === 0 || isLast || (i % labelStep === 0 && xLabels.length - 1 - i >= Math.ceil(labelStep / 2));
      if (!show) return;
      const x = xAt(i);
      xAxis += `<text x="${x.toFixed(1)}" y="${height - 14}" text-anchor="middle" fill="#526072" font-size="11" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${esc(lbl)}</text>`;
    });

    let paths = "";
    seriesList.forEach((s) => {
      const coords = [];
      s.points.forEach((v, i) => {
        if (v !== null && v !== undefined) {
          coords.push([xAt(i), yAt(v), v, xLabels[i]]);
        }
      });
      if (coords.length >= 2) {
        const d = coords.map((c, idx) => (idx === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
        paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4"/>`;
      }
      coords.forEach(([cx, cy, v, xl]) => {
        const tip = `${s.name} @ ${xl}: ${opts.yFmt(v)}`;
        paths += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${s.color}" stroke="#ffffff" stroke-width="1.5" data-tip="${esc(tip)}"/>`;
      });
    });

    const legend = `<div class="legend">${seriesList.map((s) => `<span class="legend-item"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("")}</div>`;
    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.aria || "Line chart")}">${grid}${xAxis}${paths}</svg>${legend}`;
  }

  function populateRunSelect() {
    const sel = document.getElementById("run-select");
    const groups = new Map();
    state.data.runs.forEach((r) => {
      if (!groups.has(r.machine_group)) groups.set(r.machine_group, []);
      groups.get(r.machine_group).push(r);
    });
    sel.innerHTML = "";
    groups.forEach((runs, label) => {
      const og = document.createElement("optgroup");
      og.label = label;
      runs.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = `${r.id} (${shortKizu(r.machine.kizu)})`;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    if (!state.runId && state.data.runs.length) {
      state.runId = state.data.runs[0].id;
    }
    sel.value = state.runId;
  }

  function renderMeta(run) {
    const m = run.machine || {};
    const items = [
      ["Runner", m.runner],
      ["CPU", m.cpu],
      ["OS", m.os],
      ["Cores", m.cores],
      ["Pin", m.pin],
      ["Kizu", m.kizu],
      ["Rust", m.rust],
      ["Go", m.go],
      ["Zig", m.zig],
      ["Clang", m.clang],
      ["Date", m.date]
    ].filter(([, v]) => v && v !== "none");
    document.getElementById("machine-meta").innerHTML = items
      .map(([k, v]) => `<span><strong>${esc(k)}:</strong> ${esc(v)}</span>`)
      .join("");
  }

  function renderKpis(run) {
    const cards = [];
    const rt = run.runtime && run.runtime.variants;
    if (rt && rt["kizu-llvm"]) {
      const gm = rt["kizu-llvm"].geomean;
      const vsRust = rt["rust"] ? ` · rust ${rt["rust"].geomean.toFixed(2)}x` : "";
      const vsDir = rt["kizu-direct"] ? ` · direct ${rt["kizu-direct"].geomean.toFixed(2)}x` : "";
      cards.push({
        label: "Runtime Geomean (vs C -O2)",
        value: `${gm.toFixed(2)}x`,
        sub: `kizu-llvm${vsRust}${vsDir}`
      });
    }
    const cp = run.compile;
    if (cp && cp.scenarios.cold) {
      const sz = cp.sizes[cp.sizes.length - 1];
      const cold = cp.scenarios.cold[sz] || {};
      const kd = cold["kizu-direct"] || cold["kizu-llvm"];
      const rd = cold["rust-debug"];
      const zd = cold["zig-debug"];
      if (kd) {
        let sub = `${sz} cold wall`;
        if (rd) sub += ` · rust-debug ${rd.wall.toFixed(2)}s`;
        else if (zd) sub += ` · zig-debug ${zd.wall.toFixed(2)}s`;
        cards.push({
          label: "Compile Speed (kizu-direct)",
          value: `${kd.wall.toFixed(2)}s`,
          sub
        });
      }
      const cache = cp.cache && cp.cache[sz];
      if (cache && (cache["kizu-direct"] || cache["kizu-llvm"])) {
        const kc = cache["kizu-direct"] || cache["kizu-llvm"];
        const rc = cache["rust-debug"];
        const sub = rc ? `${sz} · rust target/ ${rc.total_mb.toFixed(1)} MB` : `${sz} total cache`;
        cards.push({
          label: "Build Cache Size (kizu)",
          value: `${kc.total_mb.toFixed(1)} MB`,
          sub
        });
      } else if (cp.rss_mb && (cp.rss_mb["kizu-direct"] || cp.rss_mb["kizu-llvm"])) {
        const kr = cp.rss_mb["kizu-direct"] || cp.rss_mb["kizu-llvm"];
        cards.push({
          label: "Compiler Peak RSS (kizu)",
          value: `${kr.toFixed(0)} MB`,
          sub: `${sz} cold build`
        });
      }
      const chk = cp.scenarios.check && cp.scenarios.check[sz];
      if (chk && chk["kizu-check"]) {
        const rc = chk["rust-check"];
        const zc = chk["zig-check"];
        let sub = `${sz} check`;
        if (rc) sub += ` · cargo check ${rc.wall.toFixed(2)}s`;
        else if (zc) sub += ` · zig-check ${zc.wall.toFixed(2)}s`;
        cards.push({
          label: "Type-Check Only (kizu)",
          value: `${chk["kizu-check"].wall.toFixed(2)}s`,
          sub
        });
      }
    }
    document.getElementById("kpi-row").innerHTML = cards
      .map(
        (c) =>
          `<div class="kpi-card"><div class="kpi-label">${esc(c.label)}</div><div class="kpi-value">${esc(c.value)}</div><div class="kpi-sub">${esc(c.sub)}</div></div>`
      )
      .join("");
  }

  function renderRuntime(run) {
    const panel = document.getElementById("panel-runtime");
    if (!run.runtime) {
      panel.innerHTML = `<div class="card"><div class="empty-note">No runtime data in this run.</div></div>`;
      return;
    }
    const rt = run.runtime;
    const programs = state.data.programs;
    const variantKeys = state.data.variants.filter((v) => rt.variants[v]);

    const pills = [
      `<button class="pill ${state.runtimeProg === "geomean" ? "active" : ""}" data-rt-prog="geomean">Geomean (6)</button>`,
      ...programs.map(
        (p) =>
          `<button class="pill ${state.runtimeProg === p ? "active" : ""}" data-rt-prog="${p}">${p}</button>`
      )
    ].join("");

    let rows;
    let chartOpts;
    if (state.runtimeProg === "geomean") {
      rows = variantKeys
        .map((v) => {
          const gm = rt.variants[v].geomean;
          return {
            name: v,
            value: gm,
            label: `${gm.toFixed(2)}x`,
            tip: `<strong>${v}</strong><br>Geomean vs C -O2: ${gm.toFixed(3)}x`
          };
        })
        .sort((a, b) => a.value - b.value);
      chartOpts = {
        refVal: 1.0,
        minMax: 1.2,
        tickFmt: (v) => v.toFixed(1) + "x",
        aria: "Runtime geometric mean ratio vs C -O2"
      };
    } else {
      const p = state.runtimeProg;
      rows = variantKeys
        .map((v) => {
          const cell = rt.variants[v].programs[p];
          return {
            name: v,
            value: cell.median,
            label: `${cell.median.toFixed(3)}s (${cell.ratio.toFixed(2)}x)`,
            tip: `<strong>${v} · ${p}</strong><br>Median: ${cell.median.toFixed(4)}s<br>Range: ${cell.min.toFixed(3)}s – ${cell.max.toFixed(3)}s (${cell.samples} runs)<br>vs C -O2: ${cell.ratio.toFixed(2)}x`
          };
        })
        .sort((a, b) => a.value - b.value);
      chartOpts = {
        tickFmt: (v) => v.toFixed(2) + "s",
        aria: `Runtime median seconds for ${p}`
      };
    }

    const bestByProg = {};
    programs.forEach((p) => {
      bestByProg[p] = Math.min(...variantKeys.map((v) => rt.variants[v].programs[p].median));
    });
    const bestGm = Math.min(...variantKeys.map((v) => rt.variants[v].geomean));

    const tableRows = variantKeys
      .map((v) => {
        const entry = rt.variants[v];
        const cells = programs
          .map((p) => {
            const c = entry.programs[p];
            const isBest = Math.abs(c.median - bestByProg[p]) < 0.0005;
            return `<td class="${isBest ? "best-cell" : ""}">${c.median.toFixed(3)} <span class="muted-ratio">(${c.ratio.toFixed(2)})</span></td>`;
          })
          .join("");
        const gmBest = Math.abs(entry.geomean - bestGm) < 0.0005;
        const btRss = entry.binarytrees_rss_mb !== undefined ? `${entry.binarytrees_rss_mb.toFixed(1)} MB` : "—";
        const nbRss = entry.nbody_rss_mb !== undefined ? `${entry.nbody_rss_mb.toFixed(1)} MB` : "—";
        const binKb = entry.fib_binary_kb !== undefined ? `${entry.fib_binary_kb.toFixed(0)} KB` : "—";
        return `<tr>
          <td><span class="variant-cell"><span class="swatch" style="background:${colorOf(v)}"></span>${esc(v)}</span></td>
          ${cells}
          <td class="${gmBest ? "best-cell" : ""}">${entry.geomean.toFixed(2)}x</td>
          <td>${btRss}</td>
          <td>${nbRss}</td>
          <td>${binKb}</td>
        </tr>`;
      })
      .join("");

    let instrHtml = "";
    if (rt.has_instructions) {
      const instrRows = variantKeys
        .map((v) => {
          const entry = rt.variants[v];
          const cells = programs
            .map((p) => {
              const c = entry.programs[p];
              if (c.instructions_g === null || c.instructions_g === undefined) return `<td>—</td>`;
              return `<td>${c.instructions_g.toFixed(2)}G <span class="muted-ratio">(${c.instructions_ratio.toFixed(2)})</span></td>`;
            })
            .join("");
          return `<tr><td><span class="variant-cell"><span class="swatch" style="background:${colorOf(v)}"></span>${esc(v)}</span></td>${cells}</tr>`;
        })
        .join("");
      instrHtml = `<div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Instruction Count (Valgrind Cachegrind)</h2>
            <p class="card-sub">Billions of executed instructions (10^9) and ratio vs C -O2. Independent of host CPU load.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Variant</th>${programs.map((p) => `<th>${p}</th>`).join("")}</tr></thead>
            <tbody>${instrRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    panel.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">${state.runtimeProg === "geomean" ? "Runtime Geometric Mean vs C -O2 (lower is faster)" : `Runtime: ${state.runtimeProg} (median seconds, lower is faster)`}</h2>
            <p class="card-sub">At least ${rt.min_samples} runs per cell across shuffled rounds. Max spread (max-min)/median: ${(rt.spread * 100).toFixed(1)}%.</p>
          </div>
          <div class="pill-group">${pills}</div>
        </div>
        <div class="chart-wrap">${buildBarSvg(rows, chartOpts)}</div>
      </div>
      <div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Full Runtime Breakdown</h2>
            <p class="card-sub">Median wall seconds with (ratio vs C -O2), peak RSS, and compiled binary size.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Variant</th>
                ${programs.map((p) => `<th>${p}</th>`).join("")}
                <th>Geomean</th>
                <th>bt RSS</th>
                <th>nbody RSS</th>
                <th>fib bin</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
      ${instrHtml}
    `;

    panel.querySelectorAll("[data-rt-prog]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.runtimeProg = btn.getAttribute("data-rt-prog");
        renderRuntime(run);
      });
    });
    bindTips(panel);
  }

  function renderCompile(run) {
    const panel = document.getElementById("panel-compile");
    if (!run.compile) {
      panel.innerHTML = `<div class="card"><div class="empty-note">No compile-speed data in this run.</div></div>`;
      return;
    }
    const cp = run.compile;
    const sizes = cp.sizes;
    if (!sizes.includes(state.compileSize)) {
      state.compileSize = sizes[sizes.length - 1];
    }

    const scenarios = [
      ["cold", "Cold (from scratch)"],
      ["edit", "1-Function Edit"],
      ["noop", "Unchanged (no-op)"],
      ["check", "Type-Check Only"]
    ];
    const groups = [
      ["all", "All"],
      ["noopt", "No-opt / Debug"],
      ["opt", "Opt / Release"]
    ];

    const scData = (cp.scenarios[state.compileScenario] || {})[state.compileSize] || {};
    let orderedKeys;
    if (state.compileScenario === "check") {
      orderedKeys = state.data.compile_variants.check.filter((k) => scData[k]);
    } else if (state.compileGroup === "noopt") {
      orderedKeys = state.data.compile_variants.noopt.filter((k) => scData[k]);
    } else if (state.compileGroup === "opt") {
      orderedKeys = state.data.compile_variants.opt.filter((k) => scData[k]);
    } else {
      orderedKeys = [
        ...state.data.compile_variants.noopt,
        ...state.data.compile_variants.opt
      ].filter((k) => scData[k]);
    }

    const rows = orderedKeys
      .map((k) => {
        const v = scData[k];
        return {
          name: k,
          value: v.wall,
          label: `${v.wall.toFixed(2)}s (CPU ${v.cpu.toFixed(2)}s)`,
          tip: `<strong>${k} · ${state.compileSize} · ${state.compileScenario}</strong><br>Wall median: ${v.wall.toFixed(3)}s<br>CPU median: ${v.cpu.toFixed(3)}s`
        };
      })
      .sort((a, b) => a.value - b.value);

    const tableKeys = state.compileScenario === "check"
      ? state.data.compile_variants.check
      : [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt];
    const presentKeys = tableKeys.filter((k) =>
      sizes.some((sz) => ((cp.scenarios[state.compileScenario] || {})[sz] || {})[k])
    );

    const tableRows = presentKeys
      .map((k) => {
        const cells = sizes
          .map((sz) => {
            const v = ((cp.scenarios[state.compileScenario] || {})[sz] || {})[k];
            if (!v) return `<td>—</td>`;
            return `<td>${v.wall.toFixed(2)}s <span class="muted-ratio">/ ${v.cpu.toFixed(2)}s</span></td>`;
          })
          .join("");
        return `<tr><td><span class="variant-cell"><span class="swatch" style="background:${colorOf(k)}"></span>${esc(k)}</span></td>${cells}</tr>`;
      })
      .join("");

    let realHtml = "";
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
      realHtml = `<div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Real-World Codebases</h2>
            <p class="card-sub">Self-hosting Kizu compiler vs Go <code>cmd/compile</code>.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Target</th><th>LOC (non-blank)</th><th>Wall</th><th>CPU</th><th>LOC / sec</th></tr></thead>
            <tbody>${rRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    panel.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Compile Speed — ${esc(state.compileSize)} (${esc(state.compileScenario)})</h2>
            <p class="card-sub">Generated multi-module programs: m10 (~7k LOC), m40 (~28k LOC), m160 (~113k LOC). Lower is faster.</p>
          </div>
        </div>
        <div class="controls-bar">
          <div class="pill-group">${scenarios.map(([id, lbl]) => `<button class="pill ${state.compileScenario === id ? "active" : ""}" data-cp-sc="${id}">${lbl}</button>`).join("")}</div>
          <div class="pill-group">${sizes.map((sz) => `<button class="pill ${state.compileSize === sz ? "active" : ""}" data-cp-sz="${sz}">${sz}</button>`).join("")}</div>
          ${state.compileScenario !== "check" ? `<div class="pill-group">${groups.map(([id, lbl]) => `<button class="pill ${state.compileGroup === id ? "active" : ""}" data-cp-gr="${id}">${lbl}</button>`).join("")}</div>` : ""}
        </div>
        <div class="chart-wrap">${rows.length ? buildBarSvg(rows, { tickFmt: (v) => v.toFixed(1) + "s", aria: "Compile speed bar chart" }) : `<div class="empty-note">No entries for this selection.</div>`}</div>
      </div>
      <div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Compile Speed Table (${esc(state.compileScenario)})</h2>
            <p class="card-sub">Median wall / CPU seconds across project sizes.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Toolchain</th>${sizes.map((s) => `<th>${s}</th>`).join("")}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
      ${realHtml}
    `;

    panel.querySelectorAll("[data-cp-sc]").forEach((b) =>
      b.addEventListener("click", () => {
        state.compileScenario = b.getAttribute("data-cp-sc");
        renderCompile(run);
      })
    );
    panel.querySelectorAll("[data-cp-sz]").forEach((b) =>
      b.addEventListener("click", () => {
        state.compileSize = b.getAttribute("data-cp-sz");
        renderCompile(run);
      })
    );
    panel.querySelectorAll("[data-cp-gr]").forEach((b) =>
      b.addEventListener("click", () => {
        state.compileGroup = b.getAttribute("data-cp-gr");
        renderCompile(run);
      })
    );
    bindTips(panel);
  }

  function renderCache(run) {
    const panel = document.getElementById("panel-cache");
    const cp = run.compile;
    if (!cp) {
      panel.innerHTML = `<div class="card"><div class="empty-note">No build cache or compiler memory data in this run.</div></div>`;
      return;
    }
    const cacheSizes = Object.keys(cp.cache || {});
    let cacheCard;
    if (!cacheSizes.length) {
      const m4 = state.data.runs.find((r) => r.compile && Object.keys(r.compile.cache || {}).length);
      const hint = m4 ? ` Select <strong>${esc(m4.id)}</strong> above to inspect full build cache size measurements.` : "";
      cacheCard = `<div class="card">
        <div class="card-head"><div><h2 class="card-title">Build Cache Size (MB)</h2></div></div>
        <div class="empty-note">This historical run predates build cache size recording.${hint}</div>
      </div>`;
    } else {
      if (!cacheSizes.includes(state.cacheSize)) {
        state.cacheSize = cacheSizes[cacheSizes.length - 1];
      }
      const cdata = cp.cache[state.cacheSize];
      const allKeys = [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt].filter((k) => cdata[k]);
      const field = state.cacheMode === "project" ? "project_mb" : "total_mb";
      const rows = allKeys
        .map((k) => {
          const e = cdata[k];
          const val = e[field];
          return {
            name: k,
            value: val,
            label: `${val.toFixed(2)} MB (${e.files} files)`,
            tip: `<strong>${k} · ${state.cacheSize}</strong><br>Total cache dir: ${e.total_mb.toFixed(2)} MB<br>Project delta: ${e.project_mb.toFixed(2)} MB<br>Stdlib/runtime seed: ${e.seed_mb.toFixed(2)} MB<br>Files: ${e.files.toLocaleString()}`
          };
        })
        .sort((a, b) => a.value - b.value);

      const tableRows = allKeys
        .map((k) => {
          const cells = cacheSizes
            .map((sz) => {
              const e = (cp.cache[sz] || {})[k];
              if (!e) return `<td>—</td>`;
              const v = e[field];
              return `<td>${v.toFixed(2)} MB <span class="muted-ratio">(${e.files})</span></td>`;
            })
            .join("");
          return `<tr><td><span class="variant-cell"><span class="swatch" style="background:${colorOf(k)}"></span>${esc(k)}</span></td>${cells}</tr>`;
        })
        .join("");

      cacheCard = `
        <div class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">Build Cache Size — ${esc(state.cacheSize)} (${state.cacheMode === "project" ? "Project delta" : "Total cache dir"}, MB)</h2>
              <p class="card-sub">Disk footprint after a clean cold build: Kizu cache dir, Rust <code>target/</code>, Go <code>GOCACHE</code>, Zig cache, C <code>.o</code> objects. Lower is smaller.</p>
            </div>
          </div>
          <div class="controls-bar">
            <div class="pill-group">${cacheSizes.map((sz) => `<button class="pill ${state.cacheSize === sz ? "active" : ""}" data-ca-sz="${sz}">${sz}</button>`).join("")}</div>
            <div class="pill-group">
              <button class="pill ${state.cacheMode === "total" ? "active" : ""}" data-ca-mode="total">Total cache dir</button>
              <button class="pill ${state.cacheMode === "project" ? "active" : ""}" data-ca-mode="project">Project delta (excl. seed)</button>
            </div>
          </div>
          <div class="chart-wrap">${buildBarSvg(rows, { tickFmt: (v) => v.toFixed(0) + " MB", aria: "Build cache size bar chart" })}</div>
        </div>
        <div class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">Build Cache Size Table (MB &amp; file count)</h2>
              <p class="card-sub">Measured with inode-deduplicated exact file bytes across m10 / m40 / m160.</p>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Toolchain</th>${cacheSizes.map((s) => `<th>${s}</th>`).join("")}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    const rss = cp.rss_mb || {};
    const rssKeys = [...state.data.compile_variants.noopt, ...state.data.compile_variants.opt].filter((k) => rss[k] !== undefined);
    const rssRows = rssKeys
      .map((k) => ({
        name: k,
        value: rss[k],
        label: `${rss[k].toFixed(0)} MB`,
        tip: `<strong>${k}</strong><br>Peak compiler RSS on ${cp.sizes[cp.sizes.length - 1]} cold build: ${rss[k].toFixed(1)} MB`
      }))
      .sort((a, b) => a.value - b.value);

    const rssCard = `<div class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Compiler Peak RSS — ${esc(cp.sizes[cp.sizes.length - 1])} Cold Build (MB)</h2>
          <p class="card-sub">Peak resident set size during cold build of the largest generated benchmark.</p>
        </div>
      </div>
      <div class="chart-wrap">${rssRows.length ? buildBarSvg(rssRows, { tickFmt: (v) => v.toFixed(0) + " MB", aria: "Compiler peak RSS bar chart" }) : `<div class="empty-note">No RSS data recorded.</div>`}</div>
    </div>`;

    panel.innerHTML = cacheCard + rssCard;
    panel.querySelectorAll("[data-ca-sz]").forEach((b) =>
      b.addEventListener("click", () => {
        state.cacheSize = b.getAttribute("data-ca-sz");
        renderCache(run);
      })
    );
    panel.querySelectorAll("[data-ca-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        state.cacheMode = b.getAttribute("data-ca-mode");
        renderCache(run);
      })
    );
    bindTips(panel);
  }

  function renderHistory(run) {
    const panel = document.getElementById("panel-history");
    const sameMachine = state.data.runs
      .filter((r) => r.machine_group === run.machine_group)
      .slice()
      .sort((a, b) => (a.machine.date || a.id).localeCompare(b.machine.date || b.id));

    const xLabels = sameMachine.map((r) => `${r.id.slice(0, 10)} (${shortKizu(r.machine.kizu)})`);
    const rtSeries = [
      {
        name: "kizu-llvm",
        color: colorOf("kizu-llvm"),
        points: sameMachine.map((r) => (r.runtime && r.runtime.variants["kizu-llvm"] ? r.runtime.variants["kizu-llvm"].geomean : null))
      },
      {
        name: "kizu-direct",
        color: colorOf("kizu-direct"),
        points: sameMachine.map((r) => (r.runtime && r.runtime.variants["kizu-direct"] ? r.runtime.variants["kizu-direct"].geomean : null))
      }
    ];
    const cpSeries = [
      {
        name: "kizu-direct (m160 cold)",
        color: colorOf("kizu-direct"),
        points: sameMachine.map((r) => {
          const m = r.compile && r.compile.scenarios.cold && r.compile.scenarios.cold.m160;
          return m && m["kizu-direct"] ? m["kizu-direct"].wall : null;
        })
      },
      {
        name: "kizu-llvm (m160 cold)",
        color: colorOf("kizu-llvm"),
        points: sameMachine.map((r) => {
          const m = r.compile && r.compile.scenarios.cold && r.compile.scenarios.cold.m160;
          return m && m["kizu-llvm"] ? m["kizu-llvm"].wall : null;
        })
      }
    ];

    const runTable = sameMachine
      .map((r) => {
        const v = r.runtime ? r.runtime.variants : {};
        const kl = v["kizu-llvm"] ? `${v["kizu-llvm"].geomean.toFixed(2)}x` : "—";
        const kd = v["kizu-direct"] ? `${v["kizu-direct"].geomean.toFixed(2)}x` : "—";
        const c160 = (r.compile && r.compile.scenarios.cold && r.compile.scenarios.cold.m160) || {};
        const cd = c160["kizu-direct"] ? `${c160["kizu-direct"].wall.toFixed(2)}s` : "—";
        const cl = c160["kizu-llvm"] ? `${c160["kizu-llvm"].wall.toFixed(2)}s` : "—";
        return `<tr>
          <td>${esc(r.id)}</td>
          <td>${esc(shortKizu(r.machine.kizu))}</td>
          <td>${kl}</td>
          <td>${kd}</td>
          <td>${cd}</td>
          <td>${cl}</td>
        </tr>`;
      })
      .join("");

    let abHtml = "";
    if (state.data.compiler_ab && state.data.compiler_ab.length) {
      abHtml = state.data.compiler_ab
        .map((ab) => {
          const xl = ab.revs.map((x) => x.rev);
          const memSeries = [
            { name: "Max RSS (MB)", color: "#0f766e", points: ab.revs.map((x) => x.rss_mb) },
            { name: "Massif Heap Peak (MB)", color: "#c2410c", points: ab.revs.map((x) => x.heap_peak_mb) }
          ];
          const trs = ab.revs
            .map(
              (x) => `<tr>
                <td><code>${esc(x.rev)}</code></td>
                <td>${x.wall.toFixed(2)}s</td>
                <td>${x.user.toFixed(2)}s</td>
                <td>${x.sys.toFixed(2)}s</td>
                <td>${x.rss_mb.toFixed(0)} MB</td>
                <td>${x.heap_peak_mb !== null ? x.heap_peak_mb.toFixed(0) + " MB" : "—"}</td>
                <td>${x.instructions_g !== null ? x.instructions_g.toFixed(2) + "G" : "—"}</td>
              </tr>`
            )
            .join("");
          return `<div class="card">
            <div class="card-head">
              <div>
                <h2 class="card-title">Compiler A/B Memory &amp; Speed Progression (${esc(ab.id)})</h2>
                <p class="card-sub">${esc(ab.machine_group)} · Input: <code>${esc(ab.input || "compiler/")}</code></p>
              </div>
            </div>
            <div class="chart-wrap">${buildLineSvg(memSeries, xl, { zeroBase: true, yFmt: (v) => v.toFixed(0) + " MB", aria: "Compiler A/B memory progression" })}</div>
            <div class="table-wrap" style="margin-top:14px">
              <table class="data-table">
                <thead><tr><th>Rev</th><th>Wall</th><th>User</th><th>Sys</th><th>Max RSS</th><th>Heap Peak</th><th>Instructions</th></tr></thead>
                <tbody>${trs}</tbody>
              </table>
            </div>
          </div>`;
        })
        .join("");
    }

    let heapHtml = "";
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
      heapHtml = `<div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Compiler Heap Snapshots (Massif, Linux)</h2>
            <p class="card-sub">Self-hosting compiler peak memory profiles from <code>just heap</code>.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Run</th><th>Rev</th><th>Max RSS</th><th>Heap Peak</th><th>Pages Peak</th><th>Wall</th></tr></thead>
            <tbody>${hRows}</tbody>
          </table>
        </div>
      </div>`;
    }

    panel.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Same-Machine Kizu Progression — ${esc(run.machine_group)}</h2>
            <p class="card-sub">Tracks <code>kizu-llvm</code> and <code>kizu-direct</code> across runs on this host only (${sameMachine.length} run${sameMachine.length === 1 ? "" : "s"}).</p>
          </div>
        </div>
        <div class="chart-wrap">${buildLineSvg(rtSeries, xLabels, { zeroBase: false, yFmt: (v) => v.toFixed(2) + "x", aria: "Runtime geomean progression" })}</div>
        <div class="chart-wrap" style="margin-top:16px">${buildLineSvg(cpSeries, xLabels, { zeroBase: true, yFmt: (v) => v.toFixed(2) + "s", aria: "Compile speed progression" })}</div>
        <div class="table-wrap" style="margin-top:14px">
          <table class="data-table">
            <thead><tr><th>Run</th><th>Kizu</th><th>kizu-llvm rt</th><th>kizu-direct rt</th><th>kizu-direct m160</th><th>kizu-llvm m160</th></tr></thead>
            <tbody>${runTable}</tbody>
          </table>
        </div>
      </div>
      ${abHtml}
      ${heapHtml}
    `;
    bindTips(panel);
  }

  function renderAll() {
    const run = currentRun();
    if (!run) return;
    renderMeta(run);
    renderKpis(run);
    renderRuntime(run);
    renderCompile(run);
    renderCache(run);
    renderHistory(run);
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach((b) => {
      const on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    ["runtime", "compile", "cache", "history"].forEach((id) => {
      const el = document.getElementById("panel-" + id);
      el.hidden = id !== tab;
      el.classList.toggle("active", id === tab);
    });
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.getAttribute("data-tab")));
  });

  document.getElementById("run-select").addEventListener("change", (e) => {
    state.runId = e.target.value;
    renderAll();
  });

  fetch("data.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      state.data = data;
      populateRunSelect();
      renderAll();
    })
    .catch((err) => {
      document.getElementById("panel-runtime").innerHTML = `<div class="card"><div class="empty-note">Failed to load <code>data.json</code>: ${esc(err.message)}</div></div>`;
    });
})();
