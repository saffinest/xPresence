// Worlds 2026 check, following data/worlds-test-plan-2026.md (frozen Oct 9, 2026).
// Usage: node worlds_check.js <dir with data3.json snapshot5.json snapshot3.json patch_adj.json> <worlds.json> <stages.json|-> <out.json>
// Frozen inputs are only read, never written.
const fs = require('fs'), path = require('path');
const [DIR, WFILE, SFILE, OUT] = process.argv.slice(2);
const E = require(path.resolve(DIR, 'engine.js'));
const rj = f => JSON.parse(fs.readFileSync(path.resolve(DIR, f)));
const D = rj('data3.json'), S5 = rj('snapshot5.json'), S3 = rj('snapshot3.json'), PATCH = rj('patch_adj.json');
const W = JSON.parse(fs.readFileSync(WFILE));
const STAGES = SFILE && SFILE !== '-' ? JSON.parse(fs.readFileSync(SFILE)) : null; // [{name, from:'YYYY-MM-DD', to:'YYYY-MM-DD'}]
const nz = s => String(s).toLowerCase().replace(/[^a-z]/g, '');

// ---- unified champion index: summer indices first, Worlds-only champions appended ----
const C = D.C.slice(), idx = new Map();
C.forEach((n, i) => { if (n && n !== 'No ban' && !idx.has(nz(n))) idx.set(nz(n), i); });
const cid = n => { if (!n) return null; const k = nz(n); if (!idx.has(k)) { idx.set(k, C.length); C.push(n); } return idx.get(k); };
const skip = new Set(D.C.map((n, i) => (!n || n === 'No ban') ? i : -1).filter(i => i >= 0));

// ---- summer training games (frozen data, same prep as the dashboard) ----
const P = E.prepGames(D), summer = P.games, maxDay = Math.max(...summer.map(g => g.day));

// ---- Worlds games in the same structure ----
const WT = E.WT, GOL = { FP1: 1, SP1: 1, SP2: 1, FP2: .5, FP3: .5, SP3: .5, SP4: .5, FP4: 1/3, FP5: 1/3, SP5: 1/3, unknown: .61 };
const FPS = ['FP1','FP2','FP3','FP4','FP5'], SPS = ['SP1','SP2','SP3','SP4','SP5'];
const ORD = { ban1: 0, FP1: 6, SP1: 7, SP2: 8, FP2: 9, FP3: 10, SP3: 11, ban2: 12, SP4: 16, FP4: 17, FP5: 18, SP5: 19, unknown: 6 };
const stageOf = r => { if (!STAGES) return 'All'; const d = r.date.slice(0, 10); const s = STAGES.find(s => d >= s.from && d <= s.to); return s ? s.name : 'Unassigned'; };
const tgames = W.rows.map(r => {
  const acts = [];
  [[r.A, r.bA, 0], [r.B, r.bB, 1]].forEach(([t, b, side]) => b.forEach((n, j) => { const c = cid(n); if (c == null) return; const slot = j < 3 ? 'ban1' : 'ban2';
    acts.push({ c, t, kind: 'ban', slot, w: WT[slot], gw: 1, ord: j < 3 ? j * 2 + side : 12 + (j - 3) * 2 + (1 - side) }); }));
  const add = (n, t, slot) => { const c = cid(n); if (c != null) acts.push({ c, t, kind: 'pick', slot, w: WT[slot], gw: GOL[slot], ord: ORD[slot] }); };
  if (!r.known) { r.pA.forEach(n => add(n, r.A, 'unknown')); r.pB.forEach(n => add(n, r.B, 'unknown')); }
  else { const fA = r.fp === 0; (fA ? r.pA : r.pB).forEach((n, j) => add(n, fA ? r.A : r.B, FPS[j])); (fA ? r.pB : r.pA).forEach((n, j) => add(n, fA ? r.B : r.A, SPS[j])); }
  acts.sort((a, b) => a.ord - b.ord);
  return { gid: r.gid, sid: r.sid, gn: r.game, stage: stageOf(r), date: r.date, acts, picks: new Set(acts.filter(a => a.kind === 'pick').map(a => a.c)) };
});
const bySeries = {}; tgames.forEach(g => (bySeries[g.sid] = bySeries[g.sid] || []).push(g));
Object.values(bySeries).forEach(l => { l.sort((a, b) => a.gn - b.gn); const used = new Set(); l.forEach(g => { g.used = new Set(used); g.picks.forEach(c => used.add(c)); }); });
const nAll = C.length, U = [...Array(nAll).keys()].filter(i => !skip.has(i));
const newChamps = C.slice(D.C.length);

// ---- frozen model scores (log scale, over the unified index) ----
const ADJ = new Float64Array(nAll).fill(1);
PATCH.changes.forEach(([n, , d]) => { const k = nz(n); if (!idx.has(k)) return; ADJ[idx.get(k)] *= Math.pow(PATCH.factor, d === 'buff' ? 1 : d === 'nerf' ? -1 : 0); });
const thetaFrom = snap => { const th = new Float64Array(nAll).fill(NaN); Object.entries(snap.champs).forEach(([n, v]) => { const k = nz(n); if (idx.has(k)) th[idx.get(k)] = v.plTheta; });
  const mn = Math.min(...[...th].filter(Number.isFinite)); return { th: th.map(v => Number.isFinite(v) ? v : mn), floor: mn }; }; // unseen champions get the weakest frozen strength
const t5 = thetaFrom(S5), t3 = thetaFrom(S3);
const take = (snap, key) => { const a = new Float64Array(nAll); Object.entries(snap.champs).forEach(([n, v]) => { const k = nz(n); if (idx.has(k)) a[idx.get(k)] = v[key] || 0; }); return a; };
const champsSummer = P.champs;
const st = E.rawStats(summer, champsSummer), nS = summer.length;
const prio = new Float64Array(nAll), pres = new Float64Array(nAll), prioRec = new Float64Array(nAll);
st.forEach((v, c) => { prio[c] = v.gol / nS; pres[c] = (v.p + v.b) / nS; });
{ let Wt = 0; summer.forEach(g => { const w = Math.pow(0.5, (maxDay - g.day) / 5); Wt += w; g.acts.forEach(a => prioRec[a.c] += w * a.gw); }); for (let i = 0; i < nAll; i++) prioRec[i] /= Wt; }
const lg = a => Float64Array.from(a, v => Math.log(v + 0.01));
const MODELS = {
  xp_adj:   { name: 'Patch-adjusted xPresence (main)', x: Float64Array.from(t5.th, (v, i) => v + Math.log(ADJ[i])), beta: 'one', take: take(S5, 'plTakeAdj') },
  xp5:      { name: 'xPresence, unadjusted (5-day)', x: t5.th, beta: 'one', take: take(S5, 'plTake') },
  xp10:     { name: 'Old 10-day baseline', x: t3.th, beta: 'one', take: take(S3, 'plTake') },
  gol:      { name: "gol.gg's PrioScore", x: lg(prio), beta: 'fit' },
  gol_rec5: { name: 'PrioScore with 5-day recency', x: lg(prioRec), beta: 'fit' },
  presence: { name: 'Presence', x: lg(pres), beta: 'fit', take: pres },
};

// ---- scoring ----
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const llArr = (chs, x, b) => chs.map(c => { let mx = -1e9; for (const j of c.S) mx = Math.max(mx, b * x[j]); let z = 0; for (const j of c.S) z += Math.exp(b * x[j] - mx); return b * x[c.c] - mx - Math.log(z); });
const fitB = (chs, x, lo = 0, hi = 4) => { for (let i = 0; i < 40; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (mean(llArr(chs, x, m1)) < mean(llArr(chs, x, m2))) lo = m1; else hi = m2; } return (lo + hi) / 2; };
const chCal = E.buildChoices(summer.filter(g => g.day >= maxDay - 30), U).slice(-6000);
const chTe = E.buildChoices(tgames, U);
const gIdx = new Map(tgames.map((g, i) => [g, i]));
Object.values(MODELS).forEach(m => { m.b = m.beta === 'one' ? 1 : fitB(chCal, m.x); m.ll = llArr(chTe, m.x, m.b); });
const xpFit = fitB(chCal, MODELS.xp_adj.x, 0.2, 2.5); const llXpFit = llArr(chTe, MODELS.xp_adj.x, xpFit);

const seriesOf = chTe.map(c => c.g.sid), sids = [...new Set(seriesOf)];
let seed = 20261114; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
function gainWithRange(llA, llB, mask) {
  const per = new Map(); chTe.forEach((c, k) => { if (mask && !mask(c)) return; const s = seriesOf[k]; const e = per.get(s) || [0, 0]; e[0] += llA[k] - llB[k]; e[1]++; per.set(s, e); });
  const keys = [...per.keys()]; if (!keys.length) return null;
  const tot = keys.reduce((a, s) => [a[0] + per.get(s)[0], a[1] + per.get(s)[1]], [0, 0]);
  const point = Math.exp(tot[0] / tot[1]) - 1, draws = [];
  for (let b = 0; b < 1000; b++) { let d = 0, n = 0; for (let i = 0; i < keys.length; i++) { const e = per.get(keys[Math.floor(rnd() * keys.length)]); d += e[0]; n += e[1]; } draws.push(Math.exp(d / n) - 1); }
  draws.sort((a, b) => a - b);
  return { point, lo: draws[49], hi: draws[949], actions: tot[1], series: keys.length };
}
const out = { plan: 'data/worlds-test-plan-2026.md (frozen Oct 9, 2026)', games: tgames.length, series: sids.length, actions: chTe.length,
  newChampions: newChamps, unseenRule: 'Champions not in a frozen snapshot get that snapshot\'s weakest strength; baselines use the +0.01 floor from the rolling tests.',
  dataNotes: { dropped_duplicates: W.dropped_duplicates, repeat_picks_in_series: W.repeat_picks_in_series, games_missing_picks: W.games_missing_picks, unknownFirstPick: W.rows.filter(r => !r.known).length },
  models: {}, stages: {} };
for (const [k, m] of Object.entries(MODELS)) out.models[k] = { name: m.name, beta: +m.b.toFixed(3), vsGol: k === 'gol' ? null : gainWithRange(m.ll, MODELS.gol.ll), vsGolRec: k === 'gol_rec5' ? null : gainWithRange(m.ll, MODELS.gol_rec5.ll) };
out.models.xp_adj.fittedBeta = { beta: +xpFit.toFixed(3), vsGol: gainWithRange(llXpFit, MODELS.gol.ll) };
const r = out.models.xp_adj.vsGol; out.verdict = { pass: r.point > 0 && r.lo > 0, rule: 'patch-adjusted xPresence beats PrioScore per draft action, all games pooled, and the 90% range stays above zero', point: r.point, lo: r.lo, hi: r.hi };
// stage split
const stages = [...new Set(tgames.map(g => g.stage))];
stages.forEach(s => { out.stages[s] = { games: tgames.filter(g => g.stage === s).length, models: {} };
  for (const [k, m] of Object.entries(MODELS)) if (k !== 'gol') out.stages[s].models[k] = gainWithRange(m.ll, MODELS.gol.ll, c => c.g.stage === s); });
// rank correlation with Worlds presence
const wp = new Float64Array(nAll); tgames.forEach(g => g.acts.forEach(a => wp[a.c] += 1)); for (let i = 0; i < nAll; i++) wp[i] /= tgames.length;
const rankOf = a => { const o = U.slice().sort((i, j) => a[j] - a[i]); const rk = new Map(); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && a[o[j + 1]] === a[o[i]]) j++; for (let k = i; k <= j; k++) rk.set(o[k], (i + j) / 2 + 1); i = j + 1; } return rk; };
const spearman = (a, b) => { const ra = rankOf(a), rb = rankOf(b), n = U.length, ma = mean(U.map(i => ra.get(i))), mb = mean(U.map(i => rb.get(i)));
  let num = 0, da = 0, db = 0; U.forEach(i => { const x = ra.get(i) - ma, y = rb.get(i) - mb; num += x * y; da += x * x; db += y * y; }); return num / Math.sqrt(da * db); };
for (const [k, m] of Object.entries(MODELS)) out.models[k].rankCorr = +spearman(m.x, wp).toFixed(3);
// Game 1 accuracy bins + top-10 hit rate
const g1 = tgames.filter(g => g.gn === 1); out.game1s = g1.length;
const BINS = [[0, .05], [.05, .15], [.15, .3], [.3, .5], [.5, .7], [.7, .9], [.9, 1.01]];
for (const [k, m] of Object.entries(MODELS)) {
  const top = U.slice().sort((i, j) => m.x[j] - m.x[i]).slice(0, 10); let hits = 0;
  g1.forEach(g => { const tk = new Set(g.acts.map(a => a.c)); top.forEach(c => { if (tk.has(c)) hits++; }); });
  out.models[k].top10 = { list: top.map(c => C[c]), perGame1: +(hits / Math.max(1, g1.length)).toFixed(2) };
  if (m.take) { const bins = BINS.map(([a, b]) => ({ a, b: Math.min(b, 1), n: 0, pred: 0, hit: 0 }));
    g1.forEach(g => { const tk = new Set(g.acts.map(a => a.c)); U.forEach(c => { if (g.used.has(c)) return; const p = m.take[c]; const bn = bins.find(x => p >= x.a && p < (x.b === 1 ? 1.01 : x.b)); bn.n++; bn.pred += p; if (tk.has(c)) bn.hit++; }); });
    out.models[k].calibration = bins.filter(b => b.n).map(b => ({ range: `${Math.round(b.a * 100)}-${Math.round(b.b * 100)}%`, n: b.n, predicted: +(b.pred / b.n).toFixed(3), actual: +(b.hit / b.n).toFixed(3) })); }
}
// biggest misses: frozen patch-adjusted Game 1 take rate vs actual Game 1 take rate
const changed = new Map(); PATCH.changes.forEach(([n, p, d, z]) => { const k = nz(n); if (!idx.has(k)) return; const c = idx.get(k); (changed.get(c) || changed.set(c, []).get(c)).push(`${p} ${d} (${z})`); });
const act1 = new Float64Array(nAll); g1.forEach(g => g.acts.forEach(a => act1[a.c]++)); for (let i = 0; i < nAll; i++) act1[i] /= Math.max(1, g1.length);
const miss = U.map(c => ({ champ: C[c], predicted: +MODELS.xp_adj.take[c].toFixed(3), actualG1: +act1[c].toFixed(3), worldsPresence: +wp[c].toFixed(3), diff: act1[c] - MODELS.xp_adj.take[c], patch: changed.get(c) || [] }))
  .filter(m => m.predicted >= .05 || m.actualG1 >= .05).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 15)
  .map(m => ({ ...m, diff: +m.diff.toFixed(3), explainedByPatchNotes: m.patch.some(p => (m.diff > 0 && p.includes('buff')) || (m.diff < 0 && p.includes('nerf'))) }));
out.biggestMisses = miss;
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const f = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
console.log(`Worlds check: ${out.games} games, ${out.series} series, ${out.actions} draft actions, ${out.game1s} Game 1s. New champions not in summer data: ${newChamps.join(', ') || 'none'}`);
console.log(`VERDICT: ${out.verdict.pass ? 'PASS' : 'FAIL'} — patch-adjusted xPresence vs PrioScore ${f(r.point)} (90% range ${f(r.lo)} to ${f(r.hi)})`);
for (const [k, m] of Object.entries(out.models)) console.log(`  ${m.name.padEnd(34)} β=${m.beta}  vs PrioScore ${m.vsGol ? f(m.vsGol.point) + ' [' + f(m.vsGol.lo) + ', ' + f(m.vsGol.hi) + ']' : '—'}  vs PrioScore+rec ${m.vsGolRec ? f(m.vsGolRec.point) : '—'}  rankCorr ${m.rankCorr}  top10/G1 ${m.top10.perGame1}`);
console.log(`  fitted-β xPresence (secondary): β=${out.models.xp_adj.fittedBeta.beta} vs PrioScore ${f(out.models.xp_adj.fittedBeta.vsGol.point)}`);
for (const [s, v] of Object.entries(out.stages)) console.log(`  stage ${s} (${v.games} games): main vs PrioScore ${v.models.xp_adj ? f(v.models.xp_adj.point) + ' [' + f(v.models.xp_adj.lo) + ', ' + f(v.models.xp_adj.hi) + ']' : '—'}`);
console.log('  main model Game 1 calibration:', JSON.stringify(out.models.xp_adj.calibration));
console.log('  biggest misses:', miss.slice(0, 8).map(m => `${m.champ} pred ${(m.predicted * 100).toFixed(0)}% → G1 ${(m.actualG1 * 100).toFixed(0)}%${m.patch.length ? ' [' + m.patch.join('; ') + ']' : ''}`).join(' | '));
