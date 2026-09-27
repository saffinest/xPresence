// ---- Fearless draft priority engine: weighted score + add-ons + Plackett–Luce ----
const WT = {
  ban1: 1.00, ban2: 0.50,
  FP1: 1.00, SP1: 0.90, SP2: 0.90, FP2: 0.75, FP3: 0.75, SP3: 0.60,
  SP4: 0.45, FP4: 0.35, FP5: 0.35, SP5: 0.25, unknown: 0.63
};
const GOL = { FP1: 1, SP1: 1, SP2: 1, FP2: .5, FP3: .5, SP3: .5, SP4: .5, FP4: 1/3, FP5: 1/3, SP5: 1/3, unknown: 0.61 };
const FP_SLOTS = ['FP1','FP2','FP3','FP4','FP5'], SP_SLOTS = ['SP1','SP2','SP3','SP4','SP5'];
// draft order: ban phase 1 (A,B alternating), picks FP1 SP1 SP2 FP2 FP3 SP3, ban phase 2 (B,A alternating), picks SP4 FP4 FP5 SP5
const ORDER = { ban1: 0, FP1: 6, SP1: 7, SP2: 8, FP2: 9, FP3: 10, SP3: 11, ban2: 12, SP4: 16, FP4: 17, FP5: 18, SP5: 19, unknown: 6 };

function decodeRows(b64) {
  const bin = atob(b64), n = bin.length / 32, rows = [];
  for (let i = 0; i < n; i++) {
    const b = k => bin.charCodeAt(i * 32 + k);
    const arr = k => [0,1,2,3,4].map(j => b(k + j));
    rows.push({ sid: (b(0) << 8) | b(1), lg: b(2), st: b(3), gn: b(4), day: b(5), pt: b(6), A: b(7), B: b(8),
      win: b(9), fp: b(10), known: b(11) === 1, bA: arr(12), bB: arr(17), pA: arr(22), pB: arr(27) });
  }
  return rows;
}

function prepGames(D) {
  const skip = new Set(D.C.map((n, i) => (n === 'No ban' || n === '') ? i : -1).filter(i => i >= 0));
  const ok = c => c !== 255 && !skip.has(c);
  const ptRank = new Map(D.PT.map((p, i) => [i, p]).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true })).map(([i], r) => [i, r]));
  const games = decodeRows(D.B64).map(r => {
    const acts = [];
    [[r.A, r.bA, 0], [r.B, r.bB, 1]].forEach(([t, b, side]) => b.forEach((c, j) => {
      if (!ok(c)) return;
      const slot = j < 3 ? 'ban1' : 'ban2';
      // phase 1: A0 B0 A1 B1 A2 B2 (orders 0-5); phase 2: B3 A3 B4 A4 (orders 12-15)
      const ord = j < 3 ? j * 2 + side : 12 + (j - 3) * 2 + (1 - side);
      acts.push({ c, t, kind: 'ban', slot, w: WT[slot], gw: 1, ord });
    }));
    const addPick = (c, t, slot, ord) => { if (ok(c)) acts.push({ c, t, kind: 'pick', slot, w: WT[slot], gw: GOL[slot], ord }); };
    if (!r.known) {
      r.pA.forEach(c => addPick(c, r.A, 'unknown', 6));
      r.pB.forEach(c => addPick(c, r.B, 'unknown', 6));
    } else {
      const fpT = r.fp === 0 ? r.A : r.B, spT = r.fp === 0 ? r.B : r.A;
      const fpP = r.fp === 0 ? r.pA : r.pB, spP = r.fp === 0 ? r.pB : r.pA;
      fpP.forEach((c, j) => addPick(c, fpT, FP_SLOTS[j], ORDER[FP_SLOTS[j]]));
      spP.forEach((c, j) => addPick(c, spT, SP_SLOTS[j], ORDER[SP_SLOTS[j]]));
    }
    acts.sort((a, b) => a.ord - b.ord);
    return { sid: r.sid, lg: r.lg, st: r.st, gn: r.gn, day: r.day, pt: r.pt, ptr: ptRank.get(r.pt), A: r.A, B: r.B,
      winner: r.win === 0 ? r.A : r.B, known: r.known, acts, picks: new Set([...r.pA, ...r.pB].filter(ok)) };
  });
  const bySeries = {};
  games.forEach(g => (bySeries[g.sid] = bySeries[g.sid] || []).push(g));
  Object.values(bySeries).forEach(list => {
    list.sort((a, b) => a.gn - b.gn);
    const used = new Set(), wins = {};
    const tally = {}; list.forEach(g => tally[g.winner] = (tally[g.winner] || 0) + 1);
    const need = Math.max(...Object.values(tally)); // wins needed to take the series
    list.forEach(g => {
      g.used = new Set(used); g.picks.forEach(c => used.add(c));
      const wa = wins[g.A] || 0, wb = wins[g.B] || 0;
      g.pressure = list.length > 1 && need > 1 && wa === need - 1 && wb === need - 1; // deciding game: both teams one win away
      g.seriesLen = list.length;
      wins[g.winner] = (wins[g.winner] || 0) + 1;
    });
  });
  const champs = [...new Set(games.flatMap(g => g.acts.map(a => a.c)))];
  return { games, champs, ptRank };
}

// ---------- game weights (depth / recency / pressure) ----------
function gameWeights(games, champs, cfg, topByPatch) {
  const maxDay = Math.max(...games.map(g => g.day));
  const w = new Map();
  games.forEach(g => {
    let f = 1;
    if (cfg.depth && topByPatch) {
      const top = topByPatch.get(g.ptr);
      if (top && top.size) { let left = 0; top.forEach(c => { if (!g.used.has(c)) left++; }); f *= left / top.size; }
    }
    if (cfg.recency && cfg.half > 0) f *= Math.pow(0.5, (maxDay - g.day) / cfg.half);
    if (cfg.pressure && g.pressure) f *= cfg.pmult;
    w.set(g, f);
  });
  return w;
}

// core weighted score. cfg: {team, shrink, k} ; gw: Map game->weight
function score(games, champs, cfg, gw) {
  const nC = champs.length, idx = new Map(champs.map((c, i) => [c, i]));
  const num = new Float64Array(nC), den = new Float64Array(nC);
  const tNum = new Map(), tDen = new Map();
  const tArr = (m, t) => { if (!m.has(t)) m.set(t, new Float64Array(nC)); return m.get(t); };
  games.forEach(g => {
    const fg = gw ? gw.get(g) : 1;
    const dA = cfg.team ? tArr(tDen, g.A) : null, dB = cfg.team ? tArr(tDen, g.B) : null;
    for (let i = 0; i < nC; i++) {
      if (g.used.has(champs[i])) continue;
      den[i] += fg;
      if (cfg.team) { dA[i] += fg; dB[i] += fg; }
    }
    g.acts.forEach(a => {
      if (g.used.has(a.c)) return;
      const i = idx.get(a.c); if (i === undefined) return;
      num[i] += fg * a.w;
      if (cfg.team) tArr(tNum, a.t)[i] += fg * a.w;
    });
  });
  const out = new Map();
  champs.forEach((c, i) => {
    if (cfg.team) {
      let sum = 0, nt = 0;
      tDen.forEach((d, t) => { if (d[i] > 0) { sum += (tNum.has(t) ? tNum.get(t)[i] : 0) / d[i]; nt++; } });
      out.set(c, nt ? 2 * sum / nt : 0);
    } else out.set(c, den[i] > 0 ? num[i] / den[i] : 0);
  });
  if (cfg.shrink) {
    let sn = 0, sd = 0;
    champs.forEach((c, i) => { sn += out.get(c) * den[i]; sd += den[i]; });
    const pbar = sd ? sn / sd : 0;
    champs.forEach((c, i) => out.set(c, (out.get(c) * den[i] + cfg.k * pbar) / (den[i] + cfg.k)));
  }
  return out;
}

function topByPatchFor(games, champs, topN, ptRanks) {
  // top tier for each patch = top N by base score on the previous patch (first patch falls back to itself)
  const byP = new Map();
  ptRanks.forEach(r => {
    const prev = games.filter(g => g.ptr === r - 1);
    const src = prev.length >= 10 ? prev : games.filter(g => g.ptr === r);
    const s = score(src, champs, {});
    byP.set(r, new Set([...s.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(e => e[0])));
  });
  return byP;
}

// ---------- Plackett–Luce ----------
function buildChoices(games, universe) {
  const uIdx = new Map(universe.map((c, i) => [c, i]));
  const choices = []; // {c: idx, S: Int16Array, g}
  games.forEach(g => {
    const base = universe.filter(c => !g.used.has(c));
    const taken = new Set();
    const unknownPool = () => base.filter(c => !g.acts.some(a => a.slot === 'ban1' && a.c === c));
    g.acts.forEach(a => {
      if (!uIdx.has(a.c) || g.used.has(a.c)) return;
      let S;
      if (a.slot === 'unknown') S = unknownPool();
      else S = base.filter(c => !taken.has(c));
      if (S.includes(a.c)) choices.push({ c: uIdx.get(a.c), S: Int16Array.from(S.map(c => uIdx.get(c))), g });
      if (a.slot !== 'unknown') taken.add(a.c);
    });
  });
  return choices;
}

function fitPL(choices, nU, weightOf, alpha = 1, iters = 60, init) {
  const gam = init ? Float64Array.from(init) : new Float64Array(nU).fill(1);
  const W = new Float64Array(nU), wa = choices.map(ch => weightOf ? weightOf(ch.g) : 1);
  choices.forEach((ch, k) => W[ch.c] += wa[k]);
  const den = new Float64Array(nU);
  for (let it = 0; it < iters; it++) {
    den.fill(0);
    for (let k = 0; k < choices.length; k++) {
      const S = choices[k].S; let D = 0;
      for (let j = 0; j < S.length; j++) D += gam[S[j]];
      const q = wa[k] / D;
      for (let j = 0; j < S.length; j++) den[S[j]] += q;
    }
    for (let c = 0; c < nU; c++) gam[c] = (W[c] + alpha) / (den[c] + alpha);
  }
  return gam;
}

// probability each champion is picked or banned in a fresh Game 1 draft (20 sequential PL draws)
function plTakeRate(gam, sims = 3000, draws = 20) {
  const n = gam.length, lg = Array.from(gam, g => Math.log(g)), hits = new Float64Array(n);
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s + 0.5) / 0x80000000; };
  const key = new Float64Array(n), ord = Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < sims; t++) {
    for (let i = 0; i < n; i++) key[i] = lg[i] - Math.log(-Math.log(rnd()));
    ord.sort((a, b) => key[b] - key[a]);
    for (let i = 0; i < Math.min(draws, n); i++) hits[ord[i]]++;
  }
  return Array.from(hits, h => h / sims);
}

// ---------- series context ----------
function seriesContext(games, champs) {
  const out = new Map(champs.map(c => [c, { series: 0, g1: 0, sumFirst: 0, pressurePicks: 0, picks: 0 }]));
  const bySeries = {};
  games.forEach(g => (bySeries[g.sid] = bySeries[g.sid] || []).push(g));
  Object.values(bySeries).forEach(list => {
    if (list.length < 2) return;
    const first = new Map();
    list.sort((a, b) => a.gn - b.gn).forEach(g => g.picks.forEach(c => { if (!first.has(c)) first.set(c, g.gn); }));
    first.forEach((gn, c) => { const o = out.get(c); if (!o) return; o.series++; o.sumFirst += gn; if (gn === 1) o.g1++; });
  });
  games.forEach(g => g.acts.forEach(a => { if (a.kind !== 'pick') return; const o = out.get(a.c); if (!o) return; o.picks++; if (g.pressure) o.pressurePicks++; }));
  return out;
}

function rawStats(games, champs) {
  const st = new Map();
  champs.forEach(c => st.set(c, { p: 0, b: 0, w: 0, gol: 0, avail: 0, teams: new Set() }));
  games.forEach(g => {
    champs.forEach(c => { if (!g.used.has(c)) st.get(c).avail++; });
    g.acts.forEach(a => {
      const s = st.get(a.c); if (!s) return; s.gol += a.gw; s.teams.add(a.t);
      if (a.kind === 'pick') { s.p++; if (a.t === g.winner) s.w++; } else s.b++;
    });
  });
  return st;
}

function rankMap(m) {
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const r = new Map(); arr.forEach(([c], i) => r.set(c, i + 1)); return r;
}

function filterGames(P, filt) {
  return P.games.filter(g => filt.lgs.has(g.lg) && (filt.st === 'all' || g.st === +filt.st) && (filt.pt === 'all' || g.pt === +filt.pt));
}

// cfg: {topN,k,half,pmult,useDepth,useShrink,useTeam,useRecency,usePressure, pl:bool}
function computeAll(P, filt, cfg) {
  const games = filterGames(P, filt);
  const touched = new Set(games.flatMap(g => g.acts.map(a => a.c)));
  const champs = P.champs.filter(c => touched.has(c));
  const ptRanks = [...new Set(games.map(g => g.ptr))];
  // depth top tier uses the previous patch within the same league / stage selection (ignores the patch filter)
  const depthPool = P.games.filter(g => filt.lgs.has(g.lg) && (filt.st === 'all' || g.st === +filt.st));
  const topByPatch = topByPatchFor(depthPool, champs, Math.min(cfg.topN, champs.length), ptRanks);
  const W = o => gameWeights(games, champs, o, topByPatch);
  const one = { half: cfg.half, pmult: cfg.pmult };
  const base = score(games, champs, {});
  const depth = score(games, champs, {}, W({ ...one, depth: true }));
  const shrink = score(games, champs, { shrink: true, k: cfg.k });
  const team = score(games, champs, { team: true });
  const recency = score(games, champs, {}, W({ ...one, recency: true }));
  const pressure = score(games, champs, {}, W({ ...one, pressure: true }));
  const mixW = W({ ...one, depth: cfg.useDepth, recency: cfg.useRecency, pressure: cfg.usePressure });
  const mix = score(games, champs, { shrink: cfg.useShrink, k: cfg.k, team: cfg.useTeam }, mixW);
  const st = rawStats(games, champs);
  const ctx = seriesContext(games, champs);
  let pl = null, plTake = null;
  if (cfg.pl) {
    const choices = buildChoices(games, champs);
    const wOf = (cfg.useRecency || cfg.usePressure) ? (g => {
      let f = 1; const maxDay = cfg._maxDay ?? Math.max(...games.map(x => x.day));
      if (cfg.useRecency && cfg.half > 0) f *= Math.pow(0.5, (maxDay - g.day) / cfg.half);
      if (cfg.usePressure && g.pressure) f *= cfg.pmult; return f; }) : null;
    const gam = fitPL(choices, champs.length, wOf, 1, 50);
    plTake = new Map(champs.map((c, i) => [c, 0])); const tr = plTakeRate(gam);
    pl = new Map(champs.map((c, i) => [c, Math.log(gam[i])]));
    champs.forEach((c, i) => plTake.set(c, tr[i]));
  }
  const S = { base, depth, shrink, team, recency, pressure, mix };
  const ranks = {}; Object.entries(S).forEach(([k, v]) => ranks[k] = rankMap(v));
  if (plTake) ranks.pl = rankMap(plTake);
  return { games, champs, ...S, pl, plTake, st, ctx, topByPatch, ranks };
}


// ---------- headline: Plackett–Luce with recency + deciding-game weights ----------
function plWeightFn(games, cfg) {
  const maxDay = Math.max(...games.map(g => g.day));
  return g => {
    let f = 1;
    if (cfg.half > 0) f *= Math.pow(0.5, (maxDay - g.day) / cfg.half);
    if (g.pressure && cfg.pmult && cfg.pmult !== 1) f *= cfg.pmult;
    return f;
  };
}
function plRun(P, filt, cfg, sims = 3000) {
  const games = filterGames(P, filt);
  const champs = P.champs.filter(c => games.some(g => g.acts.some(a => a.c === c)));
  if (!games.length) return { champs: [], take: [], theta: [], games: 0 };
  const choices = buildChoices(games, champs);
  const gam = fitPL(choices, champs.length, plWeightFn(games, cfg), 1, 60);
  const out = { champs, take: plTakeRate(gam, sims), theta: Array.from(gam, Math.log), gam: Array.from(gam), games: games.length };
  if (cfg.adj) { // patch-notes adjustment: champion index -> strength multiplier
    const g2 = Float64Array.from(gam, (v, i) => v * (cfg.adj[champs[i]] || 1));
    out.takeAdj = plTakeRate(g2, sims);
  }
  return out;
}
function plLeagues(P, filt, cfg) {
  return [0,1,2,3,4,5].map(lg => {
    const r = plRun(P, { ...filt, lgs: new Set([lg]) }, cfg, 1500);
    return { lg, champs: r.champs, take: r.take, games: r.games };
  });
}
// series bootstrap: resample whole series with replacement, refit (warm start), collect take rates
function plBootstrap(P, filt, cfg, base, B, onProgress) {
  const games = filterGames(P, filt);
  const champs = base.champs, n = champs.length;
  const bySeries = {}; games.forEach(g => (bySeries[g.sid] = bySeries[g.sid] || []).push(g));
  const series = Object.values(bySeries);
  const wFn = plWeightFn(games, cfg);
  const allChoices = new Map(series.map(s => [s, buildChoices(s, champs)]));
  let seed = 987654321; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  const draws = champs.map(() => []);
  for (let b = 0; b < B; b++) {
    const ch = [];
    for (let i = 0; i < series.length; i++) { const s = series[Math.floor(rnd() * series.length)]; const cs = allChoices.get(s); for (const c of cs) ch.push(c); }
    const gam = fitPL(ch, n, wFn, 1, 20, base.gam);
    const t = plTakeRate(gam, 1000);
    t.forEach((v, i) => draws[i].push(v));
    if (onProgress && ((b + 1) % 5 === 0 || b === B - 1)) onProgress(b + 1, bands(draws, base.take));
  }
  return bands(draws, base.take);
}
function bands(draws, point) {
  // 80% band centred on the full-data estimate: point ± 1.28 × bootstrap SD
  return draws.map((d, i) => { const m = d.reduce((a, b) => a + b, 0) / d.length; const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1));
    return [Math.max(0, point[i] - 1.28 * sd), Math.min(1, point[i] + 1.28 * sd)]; });
}

if (typeof module !== 'undefined') module.exports = { plRun, plLeagues, plBootstrap, filterGames, seriesContext, prepGames, computeAll, decodeRows, score, gameWeights, topByPatchFor, buildChoices, fitPL, plTakeRate, rawStats, WT };
