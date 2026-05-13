const clamp = (value, min = -1, max = 1) => Math.max(min, Math.min(max, value));
const fmt = (value, digits = 2) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const plain = (value, digits = 2) => value.toFixed(digits);
const deg = (radValue) => radValue * (180 / Math.PI);
const rad = (degValue) => degValue * (Math.PI / 180);
const labels = ["A", "B", "C"];
const colors = ["#126a5a", "#b34a36", "#315fb8"];
const planes = [
  { name: "T/R", x: "T", y: "R", note: "pass vs repeatability" },
  { name: "T/V", x: "T", y: "V", note: "pass vs reference fit" },
  { name: "R/V", x: "R", y: "V", note: "stability vs comparability" },
];

const toolLibrary = [
  { name: "Clean pass", T: 0.72, R: 0.18, V: 0.22 },
  { name: "Pyrrhic pass", T: 0.78, R: -0.58, V: 0.08 },
  { name: "Orthogonal drift", T: 0.44, R: 0.15, V: -0.52 },
];

const demoScenarios = [
  {
    title: "Support policy answers",
    cases: [
      {
        name: "Cited policy answer",
        T: 0.76,
        R: 0.64,
        V: 0.70,
        text: "Follows the refund policy, cites the eligibility rule, and stays stable across paraphrases.",
      },
      {
        name: "Keyword answer",
        T: 0.82,
        R: 0.34,
        V: -0.46,
        text: "Repeats benchmark terms and looks plausible, but drifts from the actual customer context.",
      },
      {
        name: "Cautious refusal",
        T: -0.32,
        R: 0.72,
        V: 0.60,
        text: "Refuses because a required policy field is missing; stable and comparable, but not a pass.",
      },
    ],
  },
  {
    title: "Code generation",
    cases: [
      {
        name: "Functional patch",
        T: 0.68,
        R: 0.58,
        V: 0.62,
        text: "Passes the target tests and preserves the surrounding API assumptions.",
      },
      {
        name: "Brittle patch",
        T: 0.74,
        R: -0.42,
        V: 0.18,
        text: "Passes the visible test but fails under small input or environment perturbations.",
      },
      {
        name: "Wrong benchmark",
        T: 0.36,
        R: 0.40,
        V: -0.70,
        text: "Optimizes a neighboring task; the result is consistent, but the comparison frame is wrong.",
      },
    ],
  },
  {
    title: "Research claims",
    cases: [
      {
        name: "Replicated claim",
        T: 0.70,
        R: 0.78,
        V: 0.66,
        text: "Multiple independent checks support the claim within the same reference frame.",
      },
      {
        name: "Fragile claim",
        T: 0.62,
        R: -0.62,
        V: 0.44,
        text: "The claim works under one setup, but collapses when wording or sampling changes.",
      },
      {
        name: "Incomparable claim",
        T: -0.24,
        R: 0.46,
        V: -0.64,
        text: "The evidence is coherent, but it answers a shifted question.",
      },
    ],
  },
];

const defaultState = {
  mode: "tool",
  active: 0,
  focusAxis: null,
  dark: false,
  addVectors: false,
  demoScenario: 0,
  cube: { yaw: -32, pitch: 22, dragging: false, x: 0, y: 0 },
  tool: structuredClone(toolLibrary.slice(0, 1)),
};

const storageKey = "vec3-workbench-state-v2";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      cube: { ...defaultState.cube, ...(saved.cube || {}), dragging: false, x: 0, y: 0 },
      tool: Array.isArray(saved.tool) && saved.tool.length ? saved.tool.slice(0, 3) : structuredClone(defaultState.tool),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    const { dragging, x, y, ...cube } = state.cube;
    localStorage.setItem(storageKey, JSON.stringify({ ...state, cube }));
  } catch {
    // Storage is optional; the tool still works without persistence.
  }
}

const state = loadState();

const els = {
  theoryTab: document.querySelector("#theoryTab"),
  toolTab: document.querySelector("#toolTab"),
  demoTab: document.querySelector("#demoTab"),
  themeBtn: document.querySelector("#themeBtn"),
  toolIntro: document.querySelector("#toolIntro"),
  demoIntro: document.querySelector("#demoIntro"),
  theoryView: document.querySelector("#theoryView"),
  workbenchView: document.querySelector("#workbenchView"),
  docFrame: document.querySelector("#docFrame"),
  inputTitle: document.querySelector("#inputTitle"),
  demoPicker: document.querySelector("#demoPicker"),
  inputActions: document.querySelector(".input-actions"),
  addBtn: document.querySelector("#addBtn"),
  removeBtn: document.querySelector("#removeBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  addVectorsToggle: document.querySelector("#addVectorsToggle"),
  inputStack: document.querySelector("#inputStack"),
  cube: document.querySelector("#cubeCanvas"),
  activeChip: document.querySelector("#activeChip"),
  readout: document.querySelector("#stateReadout"),
  interpretation: document.querySelector("#interpretation"),
  pairSummary: document.querySelector("#pairSummary"),
  projections: document.querySelector("#projectionGrid"),
  relations: document.querySelector("#relationsGrid"),
  inventory: document.querySelector("#mathInventory"),
};

const ctx = els.cube.getContext("2d");

function setHidden(el, hidden) {
  el.hidden = hidden;
  el.classList.toggle("hidden", hidden);
}

function items() {
  return state.mode === "tool" ? state.tool : demoScenarios[state.demoScenario].cases;
}

function vector(item) {
  return { T: item.T, R: item.R, V: item.V };
}

function magnitude(v) {
  return Math.hypot(v.T, v.R, v.V);
}

function normalize(v) {
  const mag = magnitude(v);
  if (mag < 1e-9) return null;
  return { T: v.T / mag, R: v.R / mag, V: v.V / mag };
}

function dot(a, b) {
  return a.T * b.T + a.R * b.R + a.V * b.V;
}

function cross(a, b) {
  return {
    T: a.R * b.V - a.V * b.R,
    R: a.V * b.T - a.T * b.V,
    V: a.T * b.R - a.R * b.T,
  };
}

function distance(a, b) {
  return Math.hypot(a.T - b.T, a.R - b.R, a.V - b.V);
}

function add(a, b) {
  return { T: a.T + b.T, R: a.R + b.R, V: a.V + b.V };
}

function vectorSum(list) {
  return list.map(vector).reduce((sum, v) => add(sum, v), { T: 0, R: 0, V: 0 });
}

function cumulativeVectors(list) {
  const origin = { T: 0, R: 0, V: 0 };
  const steps = [];
  let cursor = origin;
  list.map(vector).forEach((v, index) => {
    const next = add(cursor, v);
    steps.push({ from: cursor, to: next, v, index });
    cursor = next;
  });
  return { origin, steps, sum: cursor };
}

function angle(a, b) {
  const denom = magnitude(a) * magnitude(b);
  if (denom < 1e-9) return null;
  return deg(Math.acos(clamp(dot(a, b) / denom)));
}

function planeDistance(a, b, plane) {
  return Math.hypot(a[plane.x] - b[plane.x], a[plane.y] - b[plane.y]);
}

function planeAngle(a, b, plane) {
  const da = Math.hypot(a[plane.x], a[plane.y]);
  const db = Math.hypot(b[plane.x], b[plane.y]);
  if (da < 1e-9 || db < 1e-9) return null;
  const cos = (a[plane.x] * b[plane.x] + a[plane.y] * b[plane.y]) / (da * db);
  return deg(Math.acos(clamp(cos)));
}

function triangleArea3D(a, b, c) {
  const ab = { T: b.T - a.T, R: b.R - a.R, V: b.V - a.V };
  const ac = { T: c.T - a.T, R: c.R - a.R, V: c.V - a.V };
  return magnitude(cross(ab, ac)) / 2;
}

function spreadScore(list) {
  if (list.length < 2) return 0;
  const vectors = list.map(vector);
  let total = 0;
  let count = 0;
  let max = 0;
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const d = distance(vectors[i], vectors[j]);
      total += d;
      count += 1;
      max = Math.max(max, d);
    }
  }
  return { avg: total / count, max };
}

function spherical(v) {
  const rValue = magnitude(v);
  if (rValue < 1e-9) return null;
  return {
    r: rValue,
    theta: deg(Math.atan2(v.R, v.T)),
    phi: deg(Math.acos(clamp(v.V / rValue))),
  };
}

function componentCoupling(x, y) {
  if (Math.abs(x) < 0.04 || Math.abs(y) < 0.04) return "orthogonal";
  return Math.sign(x) === Math.sign(y) ? "aligned" : "anti-aligned";
}

function classify(v) {
  const low = 0.12;
  if (magnitude(v) < 0.22) return { region: "Inconclusive", action: "Keep observing", tone: "neutral" };
  if (v.T > 0.25 && v.R > 0.45 && v.V > 0.45) return { region: "Goodhart check", action: "Audit distance", tone: "warn" };
  if (v.T > 0.25 && Math.abs(v.R) <= low && Math.abs(v.V) <= low) return { region: "Clean Pass", action: "Accept", tone: "good" };
  if (v.T < -0.25 && Math.abs(v.R) <= low && Math.abs(v.V) <= low) return { region: "Clean Failure", action: "Reject", tone: "bad" };
  if (v.T > 0.25 && v.R < -0.25 && v.V < -0.25) return { region: "Paradox", action: "Audit", tone: "bad" };
  if (v.T < -0.25 && v.R < -0.25 && v.V < -0.25) return { region: "Catastrophe", action: "Diagnostic", tone: "bad" };
  if (v.T > 0.25 && v.R < -0.25) return { region: "Pyrrhic Pass", action: "Hold", tone: "warn" };
  if (v.T < -0.25 && v.R < -0.25) return { region: "Broken Failure", action: "Rollback", tone: "bad" };
  if (v.T > 0.25 && v.V < -0.25) return { region: "Orthogonal Pass", action: "Reframe", tone: "warn" };
  if (v.T < -0.25 && v.V < -0.25) return { region: "Orthogonal Fail", action: "Reframe", tone: "bad" };
  if (v.T > 0.25) return { region: "Clean Pass", action: "Accept", tone: "good" };
  if (v.T < -0.25) return { region: "Clean Failure", action: "Reject", tone: "bad" };
  return { region: "Unresolved", action: "Gather signal", tone: "neutral" };
}

function relationLabel(ang) {
  if (ang === null) return "n/a";
  if (ang < 25) return "confirming";
  if (ang > 70 && ang < 110) return "complementary";
  if (ang > 140) return "opposed";
  return "partial overlap";
}

function relationMeaning(label) {
  const map = {
    confirming: "Similar direction; corroborates more than diversifies.",
    complementary: "Near orthogonal; covers independent epistemic ground.",
    opposed: "Contradictory direction; strong disagreement or reversal.",
    "partial overlap": "Shares some signal while diverging on at least one axis.",
    "n/a": "Needs nonzero signal in both states.",
  };
  return map[label];
}

function stateInterpretation(item, v) {
  const cls = classify(v);
  if (state.mode === "demo") {
    if (cls.region === "Goodhart check" || cls.region === "Orthogonal Pass") return "Looks useful on the visible criterion, but the reference frame is slipping.";
    if (cls.region === "Pyrrhic Pass") return "Passes while damaging repeatability; reruns or perturbations matter.";
    if (cls.region === "Clean Failure") return "Stable enough to inspect, but not a primary-criterion success.";
    if (cls.region === "Clean Pass") return "Criterion, repeatability, and reference frame are moving together.";
    return "Mixed geometry; interpretation should stay tentative.";
  }
  return `Input ${labels[state.active]} sits in ${cls.region}; the suggested action is ${cls.action.toLowerCase()}.`;
}

function activePair() {
  const list = items();
  if (list.length < 2) return null;
  if (state.active === 0) return [0, 1];
  return [0, state.active];
}

function renderInputs() {
  const list = items();
  const readonly = state.mode === "demo";
  els.inputTitle.textContent = readonly ? "Demo cases" : "TRV inputs";
  setHidden(els.demoPicker, !readonly);
  setHidden(els.inputActions, readonly);
  setHidden(els.addBtn, readonly);
  setHidden(els.removeBtn, readonly);
  setHidden(els.resetBtn, readonly);
  els.addBtn.disabled = list.length >= 3;
  els.removeBtn.disabled = list.length <= 1;

  els.demoPicker.innerHTML = demoScenarios
    .map((scenario, index) => `<button class="${index === state.demoScenario ? "active" : ""}" type="button" data-scenario="${index}">${scenario.title}</button>`)
    .join("");

  els.inputStack.innerHTML = list
    .map((item, index) => {
      const active = index === state.active ? "active" : "";
      const lock = readonly ? "disabled" : "";
      const text = readonly ? `<p class="case-text">${item.text}</p>` : "";
      const title = readonly ? item.name : `Input ${labels[index]}`;
      return `
        <article class="input-card ${active}" data-index="${index}">
          <button class="select-btn" type="button" data-index="${index}">
            <span style="background:${colors[index]}">${labels[index]}</span>
            <strong>${title}</strong>
          </button>
          ${text}
          ${["T", "R", "V"]
            .map(
              (axis) => `
              <label class="slider-row ${state.focusAxis === axis && index === state.active ? "focused" : ""}" data-index="${index}" data-axis-label="${axis}">
                <span>${axis}</span>
                <input type="range" min="-1" max="1" step="0.01" value="${item[axis]}" data-index="${index}" data-axis="${axis}" ${lock} />
                <output>${fmt(item[axis])}</output>
              </label>`,
            )
            .join("")}
        </article>`;
    })
    .join("");
}

function renderReadout() {
  const item = items()[state.active];
  const v = vector(item);
  const cls = classify(v);
  const sph = spherical(v);
  const unit = normalize(v);
  const pair = {
    TR: componentCoupling(v.T, v.R),
    TV: componentCoupling(v.T, v.V),
    RV: componentCoupling(v.R, v.V),
  };
  els.activeChip.textContent = `${labels[state.active]} · ${cls.region}`;
  els.activeChip.className = `chip ${cls.tone}`;
  els.readout.innerHTML = `
    ${metricCard("T", fmt(v.T), "truthness", "T")}
    ${metricCard("R", fmt(v.R), "reliability", "R")}
    ${metricCard("V", fmt(v.V), "validity", "V")}
    ${metricCard("|v|", plain(magnitude(v)), "signal strength")}
    ${metricCard("unit", unit ? `(${plain(unit.T, 1)}, ${plain(unit.R, 1)}, ${plain(unit.V, 1)})` : "n/a", "direction")}
    ${metricCard("spherical", sph ? `r ${plain(sph.r)}, θ ${plain(sph.theta, 0)}°, φ ${plain(sph.phi, 0)}°` : "n/a", "orientation")}
    ${metricCard("TR", pair.TR, "T/R coupling")}
    ${metricCard("TV", pair.TV, "T/V coupling")}
    ${metricCard("RV", pair.RV, "R/V coupling")}
  `;
  els.interpretation.innerHTML = `<strong>${cls.action}</strong><span>${stateInterpretation(item, v)}</span>`;
}

function renderPairSummary() {
  const list = items();
  if (list.length < 2) {
    els.pairSummary.innerHTML = `
      ${summaryCard("Inputs", "1 active", "Add another TRV to compare geometry.")}
      ${summaryCard(state.addVectors ? "Resultant Σ" : "Vectors", state.addVectors ? "n/a" : "1 shown", state.addVectors ? "Needs at least two vectors." : "Toggle on to show head-to-tail addition.")}
      ${summaryCard("Spread", "n/a", "Needs at least two vectors.")}`;
    return;
  }
  const pair = activePair();
  const a = vector(list[pair[0]]);
  const b = vector(list[pair[1]]);
  const sum = vectorSum(list);
  const spread = spreadScore(list);
  const ang = angle(a, b);
  const label = relationLabel(ang);
  els.pairSummary.innerHTML = `
    ${summaryCard(`${labels[pair[0]]}-${labels[pair[1]]}`, `d ${plain(distance(a, b))} · ${ang === null ? "n/a" : `${plain(ang, 0)}°`}`, relationMeaning(label))}
    ${summaryCard("Dot", plain(dot(a, b)), "Positive aligns, negative opposes, near zero complements.")}
    ${
      state.addVectors
        ? summaryCard("Resultant Σ", `(${plain(sum.T)}, ${plain(sum.R)}, ${plain(sum.V)})`, "Head-to-tail vector sum of the active evidence set.")
        : summaryCard("Vectors", `${list.length} shown`, "Toggle on to show head-to-tail addition and resultant.")
    }
    ${summaryCard("Spread", `avg ${plain(spread.avg)} · max ${plain(spread.max)}`, "Higher means more diverse or contradictory coverage.")}`;
}

function summaryCard(label, value, note) {
  return `<div class="summary-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

function metricCard(label, value, note, axis = "") {
  const focus = axis && state.focusAxis === axis ? "focused" : "";
  return `<button class="metric ${focus}" type="button" data-metric-axis="${axis}"><span>${label}</span><strong>${value}</strong><small>${note}</small></button>`;
}

function renderProjections() {
  const list = items();
  els.projections.innerHTML = planes.map((plane) => projectionSvg(plane, list)).join("");
}

function projectionSvg(plane, list) {
  const size = 224;
  const pad = 25;
  const chain = cumulativeVectors(list);
  const extentValues = [
    1,
    ...list.flatMap((item) => [Math.abs(item[plane.x]), Math.abs(item[plane.y])]),
    ...(state.addVectors
      ? chain.steps.flatMap((step) => [Math.abs(step.from[plane.x]), Math.abs(step.from[plane.y]), Math.abs(step.to[plane.x]), Math.abs(step.to[plane.y])])
      : []),
  ];
  const domain = Math.max(...extentValues) * 1.08;
  const map = (value) => pad + ((value + domain) / (domain * 2)) * (size - pad * 2);
  const project = (item) => ({ x: map(item[plane.x]), y: size - map(item[plane.y]) });
  const origin = project(chain.origin);
  const pts = list.map(project);
  const sumPoint = state.addVectors && list.length >= 2 ? project(chain.sum) : null;
  const pair = activePair();
  const annotations = pair
    ? projectionAnnotation(plane, list[pair[0]], list[pair[1]], pts[pair[0]], pts[pair[1]])
    : `<span>one vector</span><strong>${state.addVectors ? "resultant n/a" : "addition off"}</strong><small>${state.addVectors ? "Add a second input to show head-to-tail addition." : "Toggle on to add vectors head-to-tail."}</small>`;
  const axisTick = domain > 1.12 ? `<text x="${pad}" y="${size - pad + 18}">±${plain(domain, 1)}</text>` : "";
  const defs = colors
    .map(
      (color, index) => `
        <marker id="arrow-${plane.x}${plane.y}-${index}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"></path>
        </marker>`,
    )
    .join("") + `
        <marker id="arrow-${plane.x}${plane.y}-sum" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--amber)"></path>
        </marker>`;
  const vectors = pts
    .map((p, index) => {
      const active = index === state.active ? "active-vector" : "";
      return `
        <line class="origin-vector ${active}" data-index="${index}" x1="${origin.x}" y1="${origin.y}" x2="${p.x}" y2="${p.y}" style="stroke:${colors[index]}" marker-end="url(#arrow-${plane.x}${plane.y}-${index})"></line>
        <line class="vector-hit" data-index="${index}" x1="${origin.x}" y1="${origin.y}" x2="${p.x}" y2="${p.y}"></line>
        <text x="${p.x + 9}" y="${p.y - 8}">${labels[index]}</text>`;
    })
    .join("");
  const addChain = state.addVectors
    ? chain.steps
        .map((step, index) => {
          const a = project(step.from);
          const b = project(step.to);
          return `<line class="add-vector" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke:${colors[index]}" marker-end="url(#arrow-${plane.x}${plane.y}-${index})"></line>`;
        })
        .join("")
    : "";
  const sumVector = sumPoint
    ? `<line class="sum-vector" x1="${origin.x}" y1="${origin.y}" x2="${sumPoint.x}" y2="${sumPoint.y}" marker-end="url(#arrow-${plane.x}${plane.y}-sum)"></line><text x="${sumPoint.x + 8}" y="${sumPoint.y + 14}">Σ</text>`
    : "";
  return `
    <div class="projection">
      <div><strong>${plane.name}</strong><span>${plane.note}</span></div>
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${plane.name} projection">
        <defs>${defs}</defs>
        <rect x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}"></rect>
        <line x1="${pad}" y1="${origin.y}" x2="${size - pad}" y2="${origin.y}"></line>
        <line x1="${origin.x}" y1="${pad}" x2="${origin.x}" y2="${size - pad}"></line>
        <text x="${size - pad - 12}" y="${size / 2 - 8}">${plane.x}</text>
        <text x="${size / 2 + 8}" y="${pad + 14}">${plane.y}</text>
        ${axisTick}${addChain}${sumVector}${vectors}
      </svg>
      <div class="projection-note">${annotations}</div>
    </div>`;
}

function projectionAnnotation(plane, a, b, pa, pb) {
  const ang = planeAngle(a, b, plane);
  const dist = planeDistance(a, b, plane);
  const mx = (pa.x + pb.x) / 2;
  const my = (pa.y + pb.y) / 2;
  const meaning = ang === null ? "Projection needs nonzero plane signal." : `${relationLabel(ang)} in this plane.`;
  return `
    <span>${labels[activePair()[0]]}-${labels[activePair()[1]]}: d ${plain(dist)}, angle ${ang === null ? "n/a" : `${plain(ang, 0)}°`}</span>
    <strong>${meaning}</strong>
    <small>${state.addVectors ? "Σ shows the head-to-tail vector sum." : "Addition is off; vectors are shown independently."}</small>
    <em style="left:${mx}px; top:${my}px">d ${plain(dist)}</em>`;
}

function renderRelations() {
  const list = items();
  const pairs = list.length < 2 ? [] : list.flatMap((_, i) => list.slice(i + 1).map((__, j) => [i, i + j + 1]));
  if (!pairs.length) {
    els.relations.innerHTML = `<article class="relation empty"><strong>Relations + topology</strong><p>Add a second input to calculate pair geometry; add a third for triangle/set coverage.</p></article>`;
    return;
  }
  els.relations.innerHTML = pairs
    .map(([aIndex, bIndex]) => {
      const a = vector(list[aIndex]);
      const b = vector(list[bIndex]);
      const c = cross(a, b);
      const ang = angle(a, b);
      const label = relationLabel(ang);
      const planeBits = planes
        .map((plane) => {
          const pAng = planeAngle(a, b, plane);
          return `<span>${plane.name}: d ${plain(planeDistance(a, b, plane))}, ${pAng === null ? "n/a" : `${plain(pAng, 0)}°`}</span>`;
        })
        .join("");
      return `
        <article class="relation ${aIndex === state.active || bIndex === state.active ? "active" : ""}">
          <div><strong>${labels[aIndex]} ↔ ${labels[bIndex]}</strong><span>${label}</span></div>
          <dl>
            <dt>dot</dt><dd>${plain(dot(a, b))}</dd>
            <dt>angle</dt><dd>${ang === null ? "n/a" : `${plain(ang, 0)}°`}</dd>
            <dt>distance</dt><dd>${plain(distance(a, b))}</dd>
            <dt>cross</dt><dd>(${plain(c.T)}, ${plain(c.R)}, ${plain(c.V)})</dd>
          </dl>
          <p>${relationMeaning(label)}</p>
          <div class="plane-bits">${planeBits}</div>
        </article>`;
    })
    .join("");
}

function trendSummary(list) {
  if (list.length < 2) return "n/a";
  const vectors = list.map(vector);
  const magDelta = magnitude(vectors.at(-1)) - magnitude(vectors[0]);
  const turns = vectors.slice(1).map((v, index) => angle(vectors[index], v) ?? 0);
  const totalTurn = turns.reduce((sum, value) => sum + value, 0);
  if (magDelta > 0.18 && totalTurn < 35) return "clean convergence";
  if (Math.abs(magDelta) <= 0.18 && totalTurn >= 35) return "epistemic reallocation";
  if (magDelta > 0.18 && totalTurn >= 35) return "drift";
  if (totalTurn >= 95) return "cyclic risk";
  return "weak trajectory";
}

function renderInventory() {
  const list = items();
  const active = vector(list[state.active]);
  const sph = spherical(active);
  const unit = normalize(active);
  const pair = activePair();
  const pairA = pair ? vector(list[pair[0]]) : null;
  const pairB = pair ? vector(list[pair[1]]) : null;
  const groups = [
    {
      title: "1. State Space",
      rows: [
        ["Region", classify(active).region, "Named cube partition; maps state to next action."],
        ["Axis completeness", "full", "T, R, and V are present; no partial-state caveat."],
        ["Signal gate", magnitude(active) < 0.22 ? "below gate" : "classifiable", "Low magnitude means inconclusive regardless of sign."],
      ],
    },
    {
      title: "2. Trigonometry",
      rows: [
        ["Magnitude |v|", plain(magnitude(active)), "Definitiveness of signal, not goodness."],
        ["Unit direction", unit ? `(${plain(unit.T, 1)}, ${plain(unit.R, 1)}, ${plain(unit.V, 1)})` : "n/a", "Direction after removing strength."],
        ["Spherical", sph ? `r ${plain(sph.r)}, θ ${plain(sph.theta, 0)}°, φ ${plain(sph.phi, 0)}°` : "n/a", "Separates T/R orientation from V elevation."],
        ["TR coupling", componentCoupling(active.T, active.R), "Pyrrhic risk when T/R are anti-aligned."],
        ["TV coupling", componentCoupling(active.T, active.V), "Goodhart or frame drift when T/V are anti-aligned."],
        ["RV coupling", componentCoupling(active.R, active.V), "Stability can diverge from comparability."],
        ["Angular velocity", trendSummary(list), "Approximation from ordered inputs; stronger with real history."],
      ],
    },
    {
      title: "3. Cross-Instance Geometry",
      rows: [
        ["Dot product", pair ? plain(dot(pairA, pairB)) : "n/a", "Agreement if positive, contradiction if negative."],
        ["3D angle", pair ? `${plain(angle(pairA, pairB) ?? 0, 0)}°` : "n/a", "Distinguishes confirming, complementary, opposed."],
        ["3D distance", pair ? plain(distance(pairA, pairB)) : "n/a", "How far apart states are in full Vec3."],
        ["Resultant Σ vector", state.addVectors && list.length > 1 ? `(${plain(vectorSum(list).T)}, ${plain(vectorSum(list).R)}, ${plain(vectorSum(list).V)})` : "off", "Toggle Add vectors to compute the head-to-tail sum."],
        ["Spread score", list.length > 1 ? `avg ${plain(spreadScore(list).avg)}, max ${plain(spreadScore(list).max)}` : "n/a", "Separates redundant states from diverse coverage."],
        ["Cross product", pair ? `(${plain(cross(pairA, pairB).T)}, ${plain(cross(pairA, pairB).R)}, ${plain(cross(pairA, pairB).V)})` : "n/a", "Direction neither pair directly explores."],
        ["Triangle area", list.length === 3 ? plain(triangleArea3D(vector(list[0]), vector(list[1]), vector(list[2]))) : "n/a", "Diversity covered by three observations."],
      ],
    },
    {
      title: "4. Linear Algebra of Actions",
      rows: [
        ["Action matrix M", "n/a", "Needs observed before/after action transforms."],
        ["Off-diagonal coupling", "n/a", "Would show cross-axis side effects of an action."],
        ["Eigenvectors", "n/a", "Would reveal stable or amplifying inquiry modes."],
        ["Determinant", "n/a", "Would show expansion, contraction, or dimensional collapse."],
        ["Commutator", "n/a", "Requires two action matrices; indicates path dependence."],
      ],
    },
    {
      title: "5. Differential and Field Structure",
      rows: [
        ["Velocity ΔVec3", list.length > 1 ? deltaText(vector(list[0]), vector(list.at(-1))) : "n/a", "Trend from first to latest input."],
        ["Jacobian", "n/a", "Needs per-action deltas across observations."],
        ["Hessian", "n/a", "Needs second-order perturbation evidence."],
        ["Curl", "n/a", "Needs closed-loop action tests."],
        ["Path integral", list.length > 1 ? plain(pathLength(list.map(vector))) : "n/a", "Accumulated movement along the ordered path."],
      ],
    },
    {
      title: "6. Complex T+iR",
      rows: [
        ["z", `${plain(active.T)} ${active.R >= 0 ? "+" : "-"} ${plain(Math.abs(active.R))}i`, "T/R plane as phase-bearing complex value."],
        ["|z|", plain(Math.hypot(active.T, active.R)), "Strength in the T/R plane."],
        ["arg(z)", `${plain(deg(Math.atan2(active.R, active.T)), 0)}°`, "Phase of criterion vs repeatability."],
        ["Residue / poles", "n/a", "Requires a formal complex map over a trajectory."],
        ["Spectral analysis", "n/a", "Requires longer sampled history."],
      ],
    },
  ];
  els.inventory.innerHTML = groups
    .map(
      (group) => `
      <section class="math-group">
        <h3>${group.title}</h3>
        <div class="math-group-grid">
          ${group.rows.map(([name, value, note]) => `<div class="math-item"><span>${name}</span><strong>${value}</strong><small>${note}</small></div>`).join("")}
        </div>
      </section>`,
    )
    .join("");
}

function deltaText(a, b) {
  return `(${fmt(b.T - a.T)}, ${fmt(b.R - a.R)}, ${fmt(b.V - a.V)})`;
}

function pathLength(vectors) {
  return vectors.slice(1).reduce((sum, v, index) => sum + distance(vectors[index], v), 0);
}

function rotatePoint(v) {
  const rect = els.cube.getBoundingClientRect();
  const yaw = rad(state.cube.yaw);
  const pitch = rad(state.cube.pitch);
  const x1 = v.T * Math.cos(yaw) - v.V * Math.sin(yaw);
  const z1 = v.T * Math.sin(yaw) + v.V * Math.cos(yaw);
  const y1 = -v.R * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = -v.R * Math.sin(pitch) + z1 * Math.cos(pitch);
  const scale = 170 / (2.8 + z2);
  return { x: rect.width / 2 + x1 * scale, y: rect.height / 2 + y1 * scale, z: z2 };
}

function drawCube() {
  const dpr = window.devicePixelRatio || 1;
  const rect = els.cube.getBoundingClientRect();
  els.cube.width = Math.round(rect.width * dpr);
  els.cube.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = getCss("--canvas");
  ctx.fillRect(0, 0, rect.width, rect.height);

  const corners = [];
  for (const T of [-1, 1]) for (const R of [-1, 1]) for (const V of [-1, 1]) corners.push({ T, R, V });
  const projected = corners.map(rotatePoint);
  ctx.strokeStyle = getCss("--cube-line");
  ctx.lineWidth = 1.4;
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      const diff = ["T", "R", "V"].filter((axis) => corners[i][axis] !== corners[j][axis]).length;
      if (diff === 1) line(projected[i], projected[j]);
    }
  }

  drawAxes();
  drawVectors3D();
}

function drawAxes() {
  const axes = [
    [{ T: -1.15, R: 0, V: 0 }, { T: 1.15, R: 0, V: 0 }, "T"],
    [{ T: 0, R: -1.15, V: 0 }, { T: 0, R: 1.15, V: 0 }, "R"],
    [{ T: 0, R: 0, V: -1.15 }, { T: 0, R: 0, V: 1.15 }, "V"],
  ];
  axes.forEach(([from, to, label]) => {
    const a = rotatePoint(from);
    const b = rotatePoint(to);
    ctx.strokeStyle = state.focusAxis === label ? getCss("--ink") : getCss("--axis");
    ctx.lineWidth = state.focusAxis === label ? 2.2 : 1.2;
    line(a, b);
    ctx.fillStyle = getCss("--ink");
    ctx.font = "800 13px Inter, system-ui";
    ctx.fillText(label, b.x + 8, b.y + 4);
  });
}

function drawVectors3D() {
  const list = items();
  if (state.addVectors && list.length >= 2) {
    const chain = cumulativeVectors(list);
    const origin = rotatePoint(chain.origin);
    const sum = rotatePoint(chain.sum);

    ctx.save();
    ctx.setLineDash([7, 6]);
    chain.steps.forEach((step) => {
      const from = rotatePoint(step.from);
      const to = rotatePoint(step.to);
      drawArrow(from, to, colors[step.index], 2, 0.64);
    });
    ctx.restore();

    drawArrow(origin, sum, getCss("--amber"), 4, 0.92);
    ctx.fillStyle = getCss("--ink");
    ctx.font = "900 13px Inter, system-ui";
    ctx.fillText("Σ", sum.x + 10, sum.y + 14);
  }
  list
    .map((item, index) => ({ ...rotatePoint(vector(item)), index }))
    .sort((a, b) => a.z - b.z)
    .forEach((p) => {
      const origin = rotatePoint({ T: 0, R: 0, V: 0 });
      if (p.index === state.active) {
        drawArrow(origin, p, getCss("--ink"), 5.4, 0.42);
      }
      drawArrow(origin, p, colors[p.index], p.index === state.active ? 3.6 : 2.1, p.index === state.active ? 0.9 : 0.52);
      ctx.fillStyle = getCss("--ink");
      ctx.font = "900 13px Inter, system-ui";
      ctx.fillText(labels[p.index], p.x + 12, p.y - 10);
    });
}

function drawArrow(from, to, color, width = 2, alpha = 1) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const ux = dx / length;
  const uy = dy / length;
  const headLength = Math.min(16, Math.max(8, length * 0.18));
  const headWidth = headLength * 0.62;
  const base = { x: to.x - ux * headLength, y: to.y - uy * headLength };
  const left = { x: base.x - uy * headWidth, y: base.y + ux * headWidth };
  const right = { x: base.x + uy * headWidth, y: base.y - ux * headWidth };

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  line(from, { x: to.x - ux * headLength * 0.72, y: to.y - uy * headLength * 0.72 });
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function line(a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function render() {
  document.documentElement.dataset.theme = state.dark ? "dark" : "light";
  els.themeBtn.textContent = state.dark ? "☀" : "☾";
  els.themeBtn.setAttribute("aria-label", state.dark ? "Switch to light theme" : "Switch to dark theme");
  els.addVectorsToggle.setAttribute("aria-pressed", String(state.addVectors));
  els.addVectorsToggle.textContent = state.addVectors ? "Adding vectors" : "Add vectors";
  els.theoryTab.classList.toggle("active", state.mode === "theory");
  els.toolTab.classList.toggle("active", state.mode === "tool");
  els.demoTab.classList.toggle("active", state.mode === "demo");
  setHidden(els.toolIntro, state.mode !== "tool");
  setHidden(els.demoIntro, state.mode !== "demo");
  setHidden(els.theoryView, state.mode !== "theory");
  setHidden(els.workbenchView, state.mode === "theory");
  if (state.mode === "theory") {
    saveState();
    return;
  }
  state.active = Math.min(state.active, items().length - 1);
  renderInputs();
  renderReadout();
  renderPairSummary();
  renderProjections();
  renderRelations();
  renderInventory();
  drawCube();
  saveState();
}

function setMode(mode) {
  state.mode = mode;
  state.active = 0;
  state.focusAxis = null;
  render();
}

function addInput() {
  if (state.tool.length >= 3) return;
  state.tool.push(structuredClone(toolLibrary[state.tool.length]));
  state.active = state.tool.length - 1;
  render();
}

function removeInput() {
  if (state.tool.length <= 1) return;
  state.tool.splice(state.active, 1);
  state.active = Math.max(0, state.active - 1);
  render();
}

function resetTool() {
  state.tool = structuredClone(toolLibrary.slice(0, 1));
  state.active = 0;
  state.focusAxis = null;
  render();
}

els.inputStack.addEventListener("input", (event) => {
  const input = event.target;
  const index = Number(input.dataset.index);
  if (!Number.isFinite(index) || state.mode !== "tool") return;
  if (input.dataset.axis) {
    state.active = index;
    state.focusAxis = input.dataset.axis;
    state.tool[index][input.dataset.axis] = Number(input.value);
    input.closest(".slider-row")?.querySelector("output").replaceChildren(fmt(Number(input.value)));
    renderReadout();
    renderPairSummary();
    renderProjections();
    renderRelations();
    renderInventory();
    drawCube();
  }
});

els.inputStack.addEventListener("click", (event) => {
  const axisLabel = event.target.closest("[data-axis-label]");
  const indexed = event.target.closest("[data-index]");
  if (!indexed) return;
  state.active = Number(indexed.dataset.index);
  state.focusAxis = axisLabel?.dataset.axisLabel ?? null;
  render();
});

els.readout.addEventListener("click", (event) => {
  const metric = event.target.closest("[data-metric-axis]");
  if (!metric) return;
  state.focusAxis = metric.dataset.metricAxis || null;
  render();
});

els.projections.addEventListener("click", (event) => {
  const vectorEl = event.target.closest("[data-index]");
  if (!vectorEl) return;
  state.active = Number(vectorEl.dataset.index);
  state.focusAxis = null;
  render();
});

els.demoPicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scenario]");
  if (!button) return;
  state.demoScenario = Number(button.dataset.scenario);
  state.active = 0;
  state.focusAxis = null;
  render();
});

els.theoryTab.addEventListener("click", () => setMode("theory"));
els.toolTab.addEventListener("click", () => setMode("tool"));
els.demoTab.addEventListener("click", () => setMode("demo"));
els.themeBtn.addEventListener("click", () => {
  state.dark = !state.dark;
  render();
});
els.addVectorsToggle.addEventListener("click", () => {
  state.addVectors = !state.addVectors;
  render();
});
els.addBtn.addEventListener("click", addInput);
els.removeBtn.addEventListener("click", removeInput);
els.resetBtn.addEventListener("click", resetTool);

document.addEventListener("click", (event) => {
  const doc = event.target.closest("[data-doc-src]");
  const mode = event.target.closest("[data-mode-link]");
  if (doc) {
    els.docFrame.src = doc.dataset.docSrc;
    document.querySelectorAll("[data-doc-src]").forEach((button) => {
      button.classList.toggle("active", button === doc);
    });
  }
  if (mode) setMode(mode.dataset.modeLink);
});

els.cube.addEventListener("pointerdown", (event) => {
  state.cube.dragging = true;
  state.cube.x = event.clientX;
  state.cube.y = event.clientY;
  els.cube.setPointerCapture(event.pointerId);
});

els.cube.addEventListener("pointermove", (event) => {
  if (!state.cube.dragging) return;
  state.cube.yaw += (event.clientX - state.cube.x) * 0.35;
  state.cube.pitch = clamp(state.cube.pitch + (event.clientY - state.cube.y) * 0.25, -72, 72);
  state.cube.x = event.clientX;
  state.cube.y = event.clientY;
  drawCube();
});

els.cube.addEventListener("pointerup", () => {
  state.cube.dragging = false;
});

window.addEventListener("resize", drawCube);
render();
