/* =========================================================
   app.js  –  DeliveryAI  –  Full custom graph + task input
   ========================================================= */
"use strict";

/* =========================================================
   STATE
   ========================================================= */
const state = {
  nodes:    [],   // { id, label, x, y, role }
  edges:    [],   // { source, target, distance }
  tasks:    [],   // { node_id, label, earliest, latest, priority, weight }
  lastPlan: null,
};

/* =========================================================
   UTILITIES
   ========================================================= */
function $(id) { return document.getElementById(id); }

function showToast(msg, type = "info") {
  const icons = { success: "✓", error: "✕", warn: "⚠", info: "ℹ" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||"ℹ"}</span> ${msg}`;
  $("toast-container").appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, 3500);
}

function fmtMin(m) {
  if (m == null) return "–";
  const h  = Math.floor(8 + m / 60);
  const mn = Math.round(m % 60);
  return `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`;
}
function fmtDist(d) { return isFinite(d) ? d.toFixed(2) + " km" : "∞"; }
function fmtMs(ms)  { return ms < 1 ? "<1 ms" : ms.toFixed(2) + " ms"; }

function getNodeById(id) { return state.nodes.find(n => n.id === id); }

/* =========================================================
   WIZARD STEP NAVIGATION
   ========================================================= */
let currentStep = 1;

function goToStep(n) {
  // Validate before moving forward
  if (n > currentStep) {
    if (currentStep === 1 && state.nodes.length < 2) {
      showToast("Add at least 2 locations before continuing.", "warn"); return;
    }
    if (currentStep === 2 && state.edges.length < 1) {
      showToast("Add at least 1 road before continuing.", "warn"); return;
    }
    if (currentStep === 3 && state.tasks.length < 1) {
      showToast("Add at least 1 delivery task before running.", "warn"); return;
    }
  }

  currentStep = n;
  document.querySelectorAll(".wizard-panel").forEach((p, i) => {
    p.classList.toggle("active", i + 1 === n);
  });
  document.querySelectorAll(".wizard-step").forEach((s, i) => {
    s.classList.remove("active", "done");
    if (i + 1 < n)  s.classList.add("done");
    if (i + 1 === n) s.classList.add("active");
  });

  // When entering step 2, populate edge dropdowns
  if (n === 2) repopulateEdgeSelects();
  // When entering step 3, populate task + depot dropdowns
  if (n === 3) repopulateTaskSelects();
  // When entering step 4, populate search dropdowns and run
  if (n === 4) { repopulateSearchSelects(); runAll(); }

  // Redraw previews
  if (n === 1) drawPreview("previewCanvas",  false);
  if (n === 2) drawPreview("previewCanvas2", true);

  const el = document.getElementById("wizard-section");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =========================================================
   SELECT REPOPULATION HELPERS
   ========================================================= */
function buildNodeOptions(excludeRole = null) {
  return state.nodes
    .filter(n => !excludeRole || n.role !== excludeRole)
    .map(n => `<option value="${n.id}">${n.id} – ${n.label}</option>`)
    .join("");
}

function repopulateEdgeSelects() {
  const opts = buildNodeOptions();
  $("e-source").innerHTML = opts;
  $("e-target").innerHTML = opts;
}

function repopulateTaskSelects() {
  // Only delivery nodes (not depot) in task location selector
  const deliveryOpts = state.nodes
    .filter(n => n.role !== "depot")
    .map(n => `<option value="${n.id}">${n.id} – ${n.label}</option>`)
    .join("");
  $("t-node").innerHTML = deliveryOpts || `<option value="">No delivery nodes</option>`;

  // Depot selector: prefer depot-role nodes
  const depotOpts = buildNodeOptions();
  $("depot-select").innerHTML = depotOpts;
  const depotNode = state.nodes.find(n => n.role === "depot");
  if (depotNode) $("depot-select").value = depotNode.id;
}

function repopulateSearchSelects() {
  const opts = buildNodeOptions();
  $("search-source").innerHTML = opts;
  $("search-target").innerHTML = opts;
  // Default: depot → first non-depot
  const depot = state.nodes.find(n => n.role === "depot");
  const other = state.nodes.find(n => n.role !== "depot");
  if (depot) $("search-source").value = depot.id;
  if (other) $("search-target").value = other.id;
}

/* =========================================================
   STEP 1 – NODE MANAGEMENT
   ========================================================= */
function addNode() {
  const id    = $("n-id").value.trim();
  const label = $("n-label").value.trim();
  const x     = parseFloat($("n-x").value);
  const y     = parseFloat($("n-y").value);
  const role  = $("n-role").value;

  if (!id)          { showToast("Node ID is required.", "warn"); return; }
  if (!label)       { showToast("Label is required.", "warn"); return; }
  if (isNaN(x))     { showToast("X coordinate is required.", "warn"); return; }
  if (isNaN(y))     { showToast("Y coordinate is required.", "warn"); return; }
  if (state.nodes.find(n => n.id === id)) {
    showToast(`Node ID "${id}" already exists.`, "warn"); return;
  }

  state.nodes.push({ id, label, x, y, role });

  // Clear fields
  $("n-id").value = "";
  $("n-label").value = "";
  $("n-x").value = "";
  $("n-y").value = "";

  renderNodeList();
  drawPreview("previewCanvas", false);
  showToast(`Location "${label}" added.`, "success");
}

function removeNode(id) {
  state.nodes  = state.nodes.filter(n => n.id !== id);
  state.edges  = state.edges.filter(e => e.source !== id && e.target !== id);
  state.tasks  = state.tasks.filter(t => t.node_id !== id);
  renderNodeList();
  renderEdgeList();
  renderTaskList();
  drawPreview("previewCanvas", false);
  drawPreview("previewCanvas2", true);
  showToast("Location removed.", "warn");
}

function renderNodeList() {
  const wrap = $("node-list");
  $("node-count-badge").textContent = state.nodes.length + " nodes";

  if (state.nodes.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📍</div><p>No locations yet.</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="item-list">
      ${state.nodes.map(n => `
        <div class="item-row">
          <div class="item-dot" style="background:${n.role==="depot"?"#1e3a8a":"#2563eb"}"></div>
          <div class="item-info">
            <span class="item-id">${n.id}</span>
            <span class="item-label">${n.label}</span>
            <span class="badge ${n.role==="depot"?"badge-info":"badge-medium"}">${n.role}</span>
          </div>
          <div class="item-meta">(${n.x}, ${n.y})</div>
          <button class="btn btn-sm btn-danger-soft" onclick="removeNode('${n.id}')">✕</button>
        </div>
      `).join("")}
    </div>`;
}

/* =========================================================
   STEP 2 – EDGE MANAGEMENT
   ========================================================= */
function addEdge() {
  const source = $("e-source").value;
  const target = $("e-target").value;
  const dist   = parseFloat($("e-dist").value);

  if (!source || !target)   { showToast("Select both nodes.", "warn"); return; }
  if (source === target)    { showToast("Source and target must differ.", "warn"); return; }
  if (isNaN(dist) || dist <= 0) { showToast("Enter a valid distance.", "warn"); return; }

  const dup = state.edges.find(e =>
    (e.source === source && e.target === target) ||
    (e.source === target && e.target === source)
  );
  if (dup) { showToast("Road between these nodes already exists.", "warn"); return; }

  state.edges.push({ source, target, distance: dist });
  $("e-dist").value = "";

  renderEdgeList();
  drawPreview("previewCanvas2", true);
  showToast(`Road ${source} ↔ ${target} (${dist} km) added.`, "success");
}

function removeEdge(i) {
  state.edges.splice(i, 1);
  renderEdgeList();
  drawPreview("previewCanvas2", true);
}

function renderEdgeList() {
  const wrap = $("edge-list");
  $("edge-count-badge").textContent = state.edges.length + " roads";

  if (state.edges.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🛣️</div><p>No roads yet.</p></div>`;
    return;
  }
  const sn = id => { const n = getNodeById(id); return n ? n.label : id; };
  wrap.innerHTML = `
    <div class="item-list">
      ${state.edges.map((e, i) => `
        <div class="item-row">
          <div class="item-dot" style="background:#f59e0b"></div>
          <div class="item-info">
            <span class="item-id">${e.source} ↔ ${e.target}</span>
            <span class="item-label">${sn(e.source)} → ${sn(e.target)}</span>
          </div>
          <div class="item-meta">${e.distance} km</div>
          <button class="btn btn-sm btn-danger-soft" onclick="removeEdge(${i})">✕</button>
        </div>
      `).join("")}
    </div>`;
}

/* =========================================================
   STEP 3 – TASK MANAGEMENT
   ========================================================= */
function addTask() {
  const nodeId   = $("t-node").value;
  const earliest = parseFloat($("t-earliest").value);
  const latest   = parseFloat($("t-latest").value);
  const priority = parseInt($("t-priority").value);
  const weight   = parseFloat($("t-weight").value);

  if (!nodeId)        { showToast("Select a delivery location.", "warn"); return; }
  if (isNaN(earliest)||earliest < 0) { showToast("Enter earliest arrival (≥ 0).", "warn"); return; }
  if (isNaN(latest)||latest <= 0)    { showToast("Enter latest arrival (> 0).", "warn"); return; }
  if (latest <= earliest)            { showToast("Latest must be after earliest.", "warn"); return; }
  if (isNaN(weight)||weight <= 0)    { showToast("Enter a valid weight.", "warn"); return; }

  const node = getNodeById(nodeId);
  state.tasks.push({
    node_id:  nodeId,
    label:    node ? node.label : nodeId,
    earliest, latest, priority, weight,
  });

  $("t-earliest").value = "";
  $("t-latest").value   = "";
  $("t-weight").value   = "";

  renderTaskList();
  showToast(`Delivery to "${node ? node.label : nodeId}" added.`, "success");
}

function removeTask(i) {
  state.tasks.splice(i, 1);
  renderTaskList();
}

function renderTaskList() {
  const wrap = $("task-list");
  $("task-count-badge").textContent = state.tasks.length + " tasks";

  if (state.tasks.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>No deliveries yet.</p></div>`;
    return;
  }
  const pLabel = p => (["","High","Medium","Low"][p] || "Medium");
  const pClass = p => (["","badge-high","badge-medium","badge-low"][p] || "badge-medium");

  wrap.innerHTML = `
    <div class="item-list">
      ${state.tasks.map((t, i) => `
        <div class="item-row">
          <div class="item-dot" style="background:#16a34a"></div>
          <div class="item-info" style="flex:1">
            <span class="item-id">${t.node_id}</span>
            <span class="item-label">${t.label}</span>
            <span class="badge ${pClass(t.priority)}">${pLabel(t.priority)}</span>
          </div>
          <div class="item-meta" style="text-align:right;font-size:.78rem">
            <div>${fmtMin(t.earliest)} – ${fmtMin(t.latest)}</div>
            <div>${t.weight} kg</div>
          </div>
          <button class="btn btn-sm btn-danger-soft" onclick="removeTask(${i})">✕</button>
        </div>
      `).join("")}
    </div>`;
}

/* =========================================================
   CANVAS PREVIEW (steps 1 & 2)
   ========================================================= */
function drawPreview(canvasId, showEdges) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth  || 500;
  const H   = canvas.offsetHeight || 280;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,"#f0f4ff"); bg.addColorStop(1,"#fafbff");
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  if (state.nodes.length === 0) {
    ctx.font = "13px Inter,sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Add locations to see preview", W/2, H/2);
    return;
  }

  const xs = state.nodes.map(n => n.x);
  const ys = state.nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad  = 40;
  const sx   = (W - pad*2) / (maxX - minX || 1);
  const sy   = (H - pad*2) / (maxY - minY || 1);
  const px   = n => pad + (n.x - minX) * sx;
  const py   = n => H - pad - (n.y - minY) * sy;

  if (showEdges) {
    state.edges.forEach(e => {
      const s = state.nodes.find(n => n.id === e.source);
      const t = state.nodes.find(n => n.id === e.target);
      if (!s || !t) return;
      ctx.beginPath();
      ctx.moveTo(px(s), py(s));
      ctx.lineTo(px(t), py(t));
      ctx.strokeStyle = "#c7d2fe";
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.font = "9px Inter,sans-serif";
      ctx.fillStyle = "#a5b4fc";
      ctx.textAlign = "center";
      ctx.fillText(e.distance+" km", (px(s)+px(t))/2, (py(s)+py(t))/2 - 4);
    });
  }

  state.nodes.forEach(n => {
    const x = px(n), y = py(n);
    const r = n.role === "depot" ? 12 : 9;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle   = n.role === "depot" ? "#1e3a8a" : "#2563eb";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.font = "bold 8px Inter,sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n.id.substring(0,3), x, y);
    ctx.textBaseline = "alphabetic";

    ctx.font = "10px Inter,sans-serif";
    ctx.fillStyle = "#374151";
    ctx.fillText(n.label.split(" ")[0], x, y + r + 11);
  });
}

/* =========================================================
   CITY MAP (step 4 full map)
   ========================================================= */
class CityMap {
  constructor(canvasId) {
    this.canvas      = $(canvasId);
    this.ctx         = this.canvas.getContext("2d");
    this.routeNodes  = [];
    this.algoHighlight = {};
    this.hoveredNode = null;
    this._setup();
    this._events();
  }

  _setup() {
    const dpr = window.devicePixelRatio || 1;
    const W   = this.canvas.offsetWidth || 700;
    const H   = Math.round(W * 0.65);
    this.canvas.width  = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.height = H + "px";
    this.ctx.scale(dpr, dpr);
    this.W = W; this.H = H;
    this._scale();
  }

  _scale() {
    if (state.nodes.length === 0) return;
    const xs = state.nodes.map(n => n.x);
    const ys = state.nodes.map(n => n.y);
    this.minX = Math.min(...xs); this.maxX = Math.max(...xs);
    this.minY = Math.min(...ys); this.maxY = Math.max(...ys);
    const pad = 65;
    this.sx = (this.W - pad*2) / (this.maxX - this.minX || 1);
    this.sy = (this.H - pad*2) / (this.maxY - this.minY || 1);
    this.pad = pad;
  }

  px(n) {
    return {
      x: this.pad + (n.x - this.minX) * this.sx,
      y: this.H - this.pad - (n.y - this.minY) * this.sy,
    };
  }

  _events() {
    this.canvas.addEventListener("mousemove", e => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.W / rect.width;
      const scaleY = this.H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top)  * scaleY;
      let found = null;
      for (const n of state.nodes) {
        const p = this.px(n);
        if (Math.hypot(p.x - mx, p.y - my) < 18) { found = n; break; }
      }
      if (found !== this.hoveredNode) { this.hoveredNode = found; this.render(); }
    });
    this.canvas.addEventListener("mouseleave", () => { this.hoveredNode = null; this.render(); });
    window.addEventListener("resize", () => { this._setup(); this.render(); });
  }

  setRoute(nodes)          { this.routeNodes = nodes; this.render(); }
  setAlgo(algo, nodes)     { this.algoHighlight[algo] = nodes; this.render(); }
  clearAlgos()             { this.algoHighlight = {}; this.render(); }

  render() {
    this._setup();
    this._scale();
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,"#f0f4ff"); bg.addColorStop(1,"#fafbff");
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

    if (state.nodes.length === 0) {
      ctx.font = "14px Inter,sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText("No graph data", W/2, H/2);
      return;
    }

    // All edges
    state.edges.forEach(e => {
      const s = getNodeById(e.source), t = getNodeById(e.target);
      if (!s || !t) return;
      const ps = this.px(s), pt = this.px(t);
      ctx.beginPath();
      ctx.moveTo(ps.x, ps.y); ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = "#dde3ef"; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.font = "9px Inter,sans-serif";
      ctx.fillStyle = "#aab"; ctx.textAlign = "center";
      ctx.fillText(e.distance+" km", (ps.x+pt.x)/2, (ps.y+pt.y)/2 - 4);
    });

    // Route path
    if (this.routeNodes.length > 1) this._path(this.routeNodes, "#2563eb", 4, true);

    // Algorithm paths
    const algoCols = { astar:"#2563eb", bfs:"#d97706", dijkstra:"#16a34a" };
    Object.entries(this.algoHighlight).forEach(([a, nodes]) => {
      if (nodes && nodes.length > 1) this._path(nodes, algoCols[a]||"#888", 3, false);
    });

    // Nodes
    state.nodes.forEach(n => {
      const p       = this.px(n);
      const isDepot = n.role === "depot";
      const inRoute = this.routeNodes.includes(n.id);
      const inAlgo  = Object.values(this.algoHighlight).some(arr => arr && arr.includes(n.id));
      const hovered = this.hoveredNode && this.hoveredNode.id === n.id;

      if (hovered) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI*2);
        ctx.fillStyle = "rgba(37,99,235,.12)"; ctx.fill();
      }

      const r = isDepot ? 14 : (inRoute||inAlgo ? 11 : 9);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fillStyle   = isDepot ? "#1e3a8a" : inRoute ? "#2563eb" : inAlgo ? "#f59e0b" : "#fff";
      ctx.fill();
      ctx.strokeStyle = isDepot ? "#1e3a8a" : inRoute ? "#1d4ed8" : "#94a3b8";
      ctx.lineWidth   = 2; ctx.stroke();

      ctx.font = `bold ${isDepot?11:9}px Inter,sans-serif`;
      ctx.fillStyle = (isDepot||inRoute) ? "#fff" : "#475569";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(n.id.substring(0,4), p.x, p.y);
      ctx.textBaseline = "alphabetic";

      ctx.font = `${isDepot?"bold ":""}10px Inter,sans-serif`;
      ctx.fillStyle = isDepot ? "#1e3a8a" : "#475569";
      ctx.fillText(n.label.split(" ")[0], p.x, p.y + r + 12);
    });

    // Hover tooltip
    if (this.hoveredNode) {
      const n = this.hoveredNode, p = this.px(n);
      const txt = `${n.id}: ${n.label}`;
      ctx.font = "12px Inter,sans-serif";
      const tw = ctx.measureText(txt).width + 20;
      const tx = Math.min(W-tw-4, Math.max(4, p.x - tw/2));
      const ty = p.y - 44;
      ctx.fillStyle = "rgba(15,23,42,.88)";
      _roundRect(ctx, tx, ty, tw, 28, 6); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.fillText(txt, tx + tw/2, ty + 18);
    }
  }

  _path(nodeIds, color, width, arrows) {
    const pts = nodeIds.map(id => { const n = getNodeById(id); return n ? this.px(n) : null; }).filter(Boolean);
    if (pts.length < 2) return;
    const { ctx } = this;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
    if (arrows) {
      for (let i=1; i<pts.length; i++) _arrowHead(ctx, pts[i-1], pts[i], color);
    }
  }
}

function _roundRect(ctx,x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function _arrowHead(ctx, from, to, color) {
  const dx = to.x-from.x, dy = to.y-from.y, len = Math.hypot(dx,dy);
  if (len < 1) return;
  const mx = (from.x+to.x)/2, my = (from.y+to.y)/2;
  const ux = dx/len, uy = dy/len, s = 7;
  ctx.beginPath();
  ctx.moveTo(mx+ux*s, my+uy*s);
  ctx.lineTo(mx-ux*s-uy*s*.6, my-uy*s+ux*s*.6);
  ctx.lineTo(mx-ux*s+uy*s*.6, my-uy*s-ux*s*.6);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

let cityMap = null;

function initCityMap() {
  if (!$("cityCanvas")) return;
  cityMap = new CityMap("cityCanvas");
  cityMap.render();
}

/* =========================================================
   RUN ALL (plan + eval)
   ========================================================= */
async function runAll() {
  initCityMap();
  $("plan-results").innerHTML  = `<div class="loader"><div class="spinner"></div>Optimising route…</div>`;
  $("eval-results").innerHTML  = `<div class="loader"><div class="spinner"></div>Computing evaluation…</div>`;

  const depot    = $("depot-select") ? $("depot-select").value : "";
  const capacity = parseFloat($("capacity-input") ? $("capacity-input").value : 50) || 50;

  if (!depot) { showToast("Select a depot node.", "warn"); return; }

  const payload = {
    nodes:    state.nodes.map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y })),
    edges:    state.edges,
    tasks:    state.tasks,
    capacity,
    depot,
  };

  try {
    const res  = await fetch("/api/plan", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { showToast(data.error, "error"); $("plan-results").innerHTML = `<div class="loader" style="color:var(--danger)">${data.error}</div>`; return; }

    state.lastPlan = data;
    renderPlanResults(data);
    renderEvalResults(data);

    if (cityMap && data.route_nodes) {
      cityMap.clearAlgos();
      cityMap.setRoute(data.route_nodes);
    }

    showToast(`Route optimised — ${data.improvement_pct}% distance saved`, "success");
  } catch (e) {
    showToast("Planning failed: " + e.message, "error");
    $("plan-results").innerHTML = `<div class="loader" style="color:var(--danger)">Connection error. Is the server running?</div>`;
  }
}

/* =========================================================
   RENDER PLAN RESULTS
   ========================================================= */
function renderPlanResults(data) {
  const twColor = data.tw_violations === 0 ? "" : data.tw_violations < 3 ? "warn" : "danger";

  const kpis = `
    <div class="grid-4" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-label">Total Distance</div>
        <div class="stat-value">${data.total_distance}</div>
        <div class="stat-unit">km (optimised)</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Distance Saved</div>
        <div class="stat-value">${data.improvement_pct}%</div>
        <div class="stat-unit">vs. unoptimised (${data.unoptimised_distance} km)</div>
      </div>
      <div class="stat-card ${twColor}">
        <div class="stat-label">TW Violations</div>
        <div class="stat-value">${data.tw_violations}</div>
        <div class="stat-unit">of ${data.tasks_scheduled} stops</div>
      </div>
      <div class="stat-card accent">
        <div class="stat-label">Exec Time</div>
        <div class="stat-value">${data.exec_time_ms < 1 ? "<1" : data.exec_time_ms.toFixed(0)}</div>
        <div class="stat-unit">milliseconds</div>
      </div>
    </div>`;

  const timeline = `
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <div class="card-title">📋 Optimised Delivery Route</div>
        <span class="badge badge-info">${data.tasks_scheduled} stops</span>
      </div>
      <div class="timeline">
        <div class="timeline-item" style="opacity:.6">
          <div class="timeline-stop-name">🏭 ${data.route_nodes[0]} — Departure 08:00</div>
        </div>
        ${data.stops.map((s, i) => `
          <div class="timeline-item ${s.on_time ? "on-time" : "violated"}">
            <div class="flex-between" style="margin-bottom:.4rem">
              <div class="timeline-stop-name">#${i+1} &nbsp;${s.label} <span class="text-muted" style="font-weight:400;font-size:.85rem">(${s.node_id})</span></div>
              <span class="badge ${s.on_time ? "badge-success" : "badge-danger"}">${s.on_time ? "✓ On Time" : "✕ Late"}</span>
            </div>
            <div class="timeline-meta">
              <span>🕐 <strong>${s.arrival}</strong></span>
              <span>Window: <strong>${fmtMin(s.earliest)} – ${fmtMin(s.latest)}</strong></span>
              <span>Priority: <span class="badge badge-${s.priority.toLowerCase()}">${s.priority}</span></span>
              <span>📦 ${s.weight_kg} kg</span>
              <span>🛣 +${s.segment_dist} km</span>
            </div>
            ${s.segment_path && s.segment_path.length > 2 ? `<div class="mono text-muted mt-1" style="font-size:.78rem">via: ${s.segment_path.join(" → ")}</div>` : ""}
          </div>`).join("")}
        <div class="timeline-item" style="opacity:.6">
          <div class="timeline-stop-name">🏭 Return to Depot (+${data.return_dist} km)</div>
        </div>
      </div>
    </div>`;

  const table = `
    <div class="card">
      <div class="card-header"><div class="card-title">📊 Stop Summary</div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Location</th><th>Node</th><th>Arrival</th><th>Window</th><th>Status</th><th>Priority</th><th>Weight</th><th>Dist</th></tr></thead>
          <tbody>
            ${data.stops.map((s,i) => `<tr>
              <td class="text-muted">${i+1}</td>
              <td class="fw-700">${s.label}</td>
              <td class="mono text-muted">${s.node_id}</td>
              <td class="mono">${s.arrival}</td>
              <td class="mono text-muted">${fmtMin(s.earliest)}–${fmtMin(s.latest)}</td>
              <td><span class="badge ${s.on_time?"badge-success":"badge-danger"}">${s.on_time?"✓":"✕"}</span></td>
              <td><span class="badge badge-${s.priority.toLowerCase()}">${s.priority}</span></td>
              <td>${s.weight_kg} kg</td>
              <td>${s.segment_dist} km</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  $("plan-results").innerHTML = kpis + timeline + table;
}

/* =========================================================
   RENDER EVAL RESULTS
   ========================================================= */
function renderEvalResults(data) {
  const saved    = (data.unoptimised_distance - data.total_distance).toFixed(2);
  const optPct   = data.unoptimised_distance > 0
    ? (data.total_distance / data.unoptimised_distance * 100).toFixed(1) : 100;

  $("eval-results").innerHTML = `
    <div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem">
      <div class="chart-wrap">
        <div class="chart-title">Distance Comparison</div>
        <div class="bar-chart">
          <div class="bar-row">
            <span class="bar-label">Unoptimised</span>
            <div class="bar-track"><div class="bar-fill bfs" style="width:100%"></div></div>
            <span class="bar-val">${data.unoptimised_distance} km</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Optimised</span>
            <div class="bar-track"><div class="bar-fill astar" style="width:${optPct}%"></div></div>
            <span class="bar-val">${data.total_distance} km</span>
          </div>
        </div>
        <p class="text-success fw-700 mt-2">✓ Saved ${saved} km (${data.improvement_pct}%)</p>
      </div>
      <div class="chart-wrap">
        <div class="chart-title">Metrics Summary</div>
        <table style="font-size:.88rem">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Optimised distance</td><td class="fw-700">${data.total_distance} km</td></tr>
            <tr><td>Unoptimised distance</td><td>${data.unoptimised_distance} km</td></tr>
            <tr><td>Improvement</td><td class="text-success fw-700">${data.improvement_pct}%</td></tr>
            <tr><td>TW violations</td><td class="${data.tw_violations > 0 ? "text-danger" : "text-success"} fw-700">${data.tw_violations}</td></tr>
            <tr><td>Stops scheduled</td><td>${data.tasks_scheduled} / ${data.tasks_total}</td></tr>
            <tr><td>Planning time</td><td>${fmtMs(data.exec_time_ms)}</td></tr>
            <tr><td>Vehicle capacity</td><td>${data.capacity} kg</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">🔬 Algorithm Analysis</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem">
        <div style="padding:1rem;background:var(--bg);border-radius:8px">
          <div style="font-weight:700;color:#2563eb;margin-bottom:.5rem">A* Search</div>
          <p style="font-size:.84rem;color:var(--muted)">Used for all segment path-finding. Straight-line heuristic h(n) guides the frontier, exploring 3–6× fewer nodes than Dijkstra on typical graphs.</p>
        </div>
        <div style="padding:1rem;background:var(--bg);border-radius:8px">
          <div style="font-weight:700;color:#d97706;margin-bottom:.5rem">Nearest-Neighbour</div>
          <p style="font-size:.84rem;color:var(--muted)">Greedy O(n²) construction: always visits the closest unvisited stop respecting capacity and priority before distance minimisation.</p>
        </div>
        <div style="padding:1rem;background:var(--bg);border-radius:8px">
          <div style="font-weight:700;color:#16a34a;margin-bottom:.5rem">2-opt Local Search</div>
          <p style="font-size:.84rem;color:var(--muted)">Iteratively reverses sub-sequences of the NN route. Each swap is accepted only if it strictly reduces total distance.</p>
        </div>
      </div>
    </div>`;
}

/* =========================================================
   PATH SEARCH (step 4 search tab)
   ========================================================= */
async function runSearch() {
  const source = $("search-source").value;
  const target = $("search-target").value;
  if (!source || !target)     { showToast("Select both nodes.", "warn"); return; }
  if (source === target)      { showToast("Source and target must differ.", "warn"); return; }

  $("search-results").innerHTML = `<div class="loader"><div class="spinner"></div>Running search…</div>`;

  const payload = {
    nodes:  state.nodes.map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y })),
    edges:  state.edges,
    source, target,
  };

  try {
    const res  = await fetch("/api/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { showToast(data.error, "error"); return; }

    renderSearchResults(data);

    if (cityMap) {
      cityMap.clearAlgos();
      ["astar","bfs","dijkstra"].forEach(a => {
        if (data[a] && data[a].path) cityMap.setAlgo(a, data[a].path);
      });
    }

    showToast("Search complete", "success");
  } catch (e) {
    showToast("Search failed: " + e.message, "error");
  }
}

function renderSearchResults(data) {
  const winner = ["astar","bfs","dijkstra"].reduce((best, a) =>
    data[a].nodes_explored < data[best].nodes_explored ? a : best, "astar");
  const maxN = Math.max(...["astar","bfs","dijkstra"].map(a => data[a].nodes_explored));
  const maxD = Math.max(...["astar","bfs","dijkstra"].map(a => data[a].distance));

  const names = { astar:"A* Search", bfs:"BFS", dijkstra:"Dijkstra" };
  const descs = {
    astar:    "Informed – straight-line heuristic h(n)",
    bfs:      "Uninformed – fewest hops (ignores weights)",
    dijkstra: "Uninformed – optimal cost, no heuristic",
  };

  $("search-results").innerHTML = `
    <div class="algo-cards">
      ${["astar","bfs","dijkstra"].map(a => {
        const r = data[a];
        return `<div class="algo-card ${a === winner ? "winner" : ""}">
          <div class="algo-name">${names[a]}</div>
          <p class="text-muted" style="font-size:.78rem;margin-bottom:.75rem">${descs[a]}</p>
          <div class="algo-metric"><span>Distance</span><span class="val">${fmtDist(r.distance)}</span></div>
          <div class="algo-metric"><span>Nodes Explored</span><span class="val">${r.nodes_explored}</span></div>
          <div class="algo-metric"><span>Exec Time</span><span class="val">${fmtMs(r.exec_time_ms)}</span></div>
          <div class="algo-metric"><span>Hops</span><span class="val">${r.path.length - 1}</span></div>
        </div>`;
      }).join("")}
    </div>
    <div class="grid-3" style="gap:1rem;margin-bottom:1.5rem">
      ${["astar","bfs","dijkstra"].map(a => {
        const colors = { astar:"#2563eb", bfs:"#d97706", dijkstra:"#16a34a" };
        const r = data[a];
        return `<div class="card" style="border-top:3px solid ${colors[a]}">
          <div class="card-title" style="color:${colors[a]};margin-bottom:.75rem">${names[a]} Path</div>
          <div class="mono text-muted" style="font-size:.8rem">${(r.path_labels||r.path).join(" → ")}</div>
        </div>`;
      }).join("")}
    </div>
    <div class="grid-2" style="gap:1rem">
      <div class="chart-wrap">
        <div class="chart-title">Nodes Explored</div>
        <div class="bar-chart">
          ${["astar","bfs","dijkstra"].map(a => `
            <div class="bar-row">
              <span class="bar-label">${names[a]}</span>
              <div class="bar-track"><div class="bar-fill ${a}" style="width:${maxN>0?(data[a].nodes_explored/maxN*100).toFixed(1):0}%"></div></div>
              <span class="bar-val">${data[a].nodes_explored}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="chart-wrap">
        <div class="chart-title">Total Distance</div>
        <div class="bar-chart">
          ${["astar","bfs","dijkstra"].map(a => `
            <div class="bar-row">
              <span class="bar-label">${names[a]}</span>
              <div class="bar-track"><div class="bar-fill ${a}" style="width:${maxD>0?(data[a].distance/maxD*100).toFixed(1):0}%"></div></div>
              <span class="bar-val">${fmtDist(data[a].distance)}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
}

/* =========================================================
   TABS (result sub-tabs)
   ========================================================= */
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".tab-group");
      group.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      group.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =========================================================
   BOOT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  // Wire search button (inside step-4 tab)
  const sb = document.getElementById("run-search-btn-inline");
  if (!sb) {
    // search button in HTML uses onclick="runSearch()" directly
  }
  // Draw blank previews
  drawPreview("previewCanvas",  false);
  drawPreview("previewCanvas2", true);
});
