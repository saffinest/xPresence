// Is xPresence's edge just recency? Scores gol.gg's PrioScore and presence with the same recency weighting
// xPresence uses, on the same 31 rolling tests as rolling2.js (26 domestic patches + 5 international events,
// 150-day window). Scoring is unchanged: per-action likelihood of the real choice among available champions,
// beta fitted on the last 30 days of training.
// PrioScore's and presence's half-lives are picked leave-one-out: for each test, the h with the best pooled
// score on the other 30 tests. Writes prio_recency.json (copy to data/).  Usage: node prio_recency.js
const E=require('./engine.js'); const fs=require('fs');
const A=JSON.parse(fs.readFileSync('all_games.json'));
const WT={ban1:1,ban2:.5,FP1:1,SP1:.9,SP2:.9,FP2:.75,FP3:.75,SP3:.6,SP4:.45,FP4:.35,FP5:.35,SP5:.25,unknown:.63};
const GOL={FP1:1,SP1:1,SP2:1,FP2:.5,FP3:.5,SP3:.5,SP4:.5,FP4:1/3,FP5:1/3,SP5:1/3,unknown:.61};
const FPS=['FP1','FP2','FP3','FP4','FP5'],SPS=['SP1','SP2','SP3','SP4','SP5'];
const ORD={ban1:0,FP1:6,SP1:7,SP2:8,FP2:9,FP3:10,SP3:11,ban2:12,SP4:16,FP4:17,FP5:18,SP5:19,unknown:6};
const ok=c=>c!=null&&c!==255;
const INTL=new Set(['FST','MSI','WLDs']);
// ---- prep (same as rolling2.js) ----
const games=A.rows.map(r=>{const acts=[];
  [[r.A,r.bA,0],[r.B,r.bB,1]].forEach(([t,b,side])=>b.forEach((c,j)=>{if(!ok(c))return;const slot=j<3?'ban1':'ban2';acts.push({c,t,kind:'ban',slot,w:WT[slot],gw:1,ord:j<3?j*2+side:12+(j-3)*2+(1-side)});}));
  const add=(c,t,slot)=>{if(ok(c))acts.push({c,t,kind:'pick',slot,w:WT[slot],gw:GOL[slot],ord:ORD[slot]});};
  if(!r.known){r.pA.forEach(c=>add(c,r.A,'unknown'));r.pB.forEach(c=>add(c,r.B,'unknown'));}
  else{const fpT=r.fp===0?r.A:r.B,spT=r.fp===0?r.B:r.A,fpP=r.fp===0?r.pA:r.pB,spP=r.fp===0?r.pB:r.pA;fpP.forEach((c,j)=>add(c,fpT,FPS[j]));spP.forEach((c,j)=>add(c,spT,SPS[j]));}
  acts.sort((a,b)=>a.ord-b.ord);
  return {sid:r.sid,lg:r.lg,year:r.year,st:r.st,gn:r.gn,day:r.day,pt:r.pt,ptr:r.pt,patch:r.patch,A:r.A,B:r.B,winner:r.win===0?r.A:r.B,known:r.known,acts,picks:new Set([...r.pA,...r.pB].filter(ok)),intl:INTL.has(r.lg)};});
const bs={};games.forEach(g=>(bs[g.sid]=bs[g.sid]||[]).push(g));
Object.values(bs).forEach(l=>{l.sort((a,b)=>a.gn-b.gn);const used=new Set(),w={},tl={};l.forEach(g=>tl[g.winner]=(tl[g.winner]||0)+1);const need=Math.max(...Object.values(tl));
  l.forEach(g=>{g.used=new Set(used);g.picks.forEach(c=>used.add(c));const wa=w[g.A]||0,wb=w[g.B]||0;g.pressure=l.length>1&&need>1&&wa===need-1&&wb===need-1;w[g.winner]=(w[g.winner]||0)+1;});});
const U=[...new Set(games.flatMap(g=>g.acts.map(a=>a.c)))], nU=U.length;
// ---- tests (same as rolling2.js) ----
const tests=[];
const dom=games.filter(g=>!g.intl);
const patches=[...new Set(dom.map(g=>g.pt))].sort((a,b)=>a-b);
patches.forEach(p=>{const te=dom.filter(g=>g.pt===p); if(te.length<40) return; const start=Math.min(...te.map(g=>g.day));
  tests.push({label:'patch '+te[0].patch, kind:'domestic', test:te, start});});
[['FST',2025],['MSI',2025],['WLDs',2025],['FST',2026],['MSI',2026]].forEach(([lg,y])=>{const te=games.filter(g=>g.lg===lg&&g.year===y);const start=Math.min(...te.map(g=>g.day));tests.push({label:`${lg} ${y}`,kind:'international',test:te,start});});
const WINDOW=150, HALFS=[3,5,7,10,14,21], XP_HALF=5;
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const llArr=(chs,x,b)=>chs.map(c=>{let mx=-1e9;for(const j of c.S)mx=Math.max(mx,b*x[j]);let z=0;for(const j of c.S)z+=Math.exp(b*x[j]-mx);return b*x[c.c]-mx-Math.log(z);});
const fitB=(chs,x,lo=0,hi=4)=>{for(let i=0;i<22;i++){const m1=lo+(hi-lo)/3,m2=hi-(hi-lo)/3;if(mean(llArr(chs,x,m1))<mean(llArr(chs,x,m2)))lo=m1;else hi=m2;}return (lo+hi)/2;};
const out=[]; const t0=Date.now();
tests.forEach((T,ti)=>{
  const train=games.filter(g=>g.day<T.start&&g.day>=T.start-WINDOW); if(train.length<200) return;
  const md=Math.max(...train.map(g=>g.day));
  const chTr=E.buildChoices(train,U); const recent=train.filter(g=>g.day>=md-30); const chCal=E.buildChoices(recent,U).slice(-6000);
  const chTe=E.buildChoices(T.test,U);
  const res={label:T.label,kind:T.kind,train:train.length,test:T.test.length,actions:chTe.length,m:{}};
  const rate=(name,sc)=>{const x=Float64Array.from(U,c=>Math.log((sc.get(c)||0)+0.01));const b=fitB(chCal,x);res.m[name]={ll:mean(llArr(chTe,x,b)),beta:b};};
  // PrioScore and presence per game, each game weighted w(g); dividing by the total weight keeps the per-game scale
  const weighted=wf=>{const gol=new Map(),pres=new Map();let W=0;
    train.forEach(g=>{const w=wf(g);W+=w;g.acts.forEach(a=>{gol.set(a.c,(gol.get(a.c)||0)+w*a.gw);pres.set(a.c,(pres.get(a.c)||0)+w);});});
    gol.forEach((v,c)=>gol.set(c,v/W));pres.forEach((v,c)=>pres.set(c,v/W));return {gol,pres};};
  const plain=weighted(()=>1); rate('gol',plain.gol); rate('presence',plain.pres);
  HALFS.forEach(h=>{const r=weighted(g=>Math.pow(.5,(md-g.day)/h)); rate('gol_h'+h,r.gol); rate('pres_h'+h,r.pres);});
  // xPresence as it runs today: 5-day half-life, no deciding-game weight, 60 iterations (as in engine.plRun)
  const gam=E.fitPL(chTr,nU,g=>Math.pow(.5,(md-g.day)/XP_HALF),1,60);
  const x=Float64Array.from(gam,Math.log); const b=fitB(chCal,x,0.3,2);
  res.m.xp5={ll:mean(llArr(chTe,x,b)),beta:b};
  // the site's headline scores xPresence with beta = 1 (its own probabilities, no fitted calibration); kept for comparison
  res.m.xp5_b1={ll:mean(llArr(chTe,x,1)),beta:1};
  out.push(res);
  console.log(`${ti+1}/${tests.length} ${T.label} (${T.kind}) ${((Date.now()-t0)/1000).toFixed(0)}s  gol ${res.m.gol.ll.toFixed(3)} gol_h5 ${res.m.gol_h5.ll.toFixed(3)} xp5 ${res.m.xp5.ll.toFixed(3)}`);
});
// ---- leave-one-out half-life for PrioScore and presence ----
const pooled=(rows,k)=>rows.reduce((s,r)=>s+r.actions*r.m[k].ll,0)/rows.reduce((s,r)=>s+r.actions,0);
const pickH=(rows,pre)=>HALFS.reduce((best,h)=>pooled(rows,pre+h)>pooled(rows,pre+best)?h:best,HALFS[0]);
out.forEach((r,i)=>{const others=out.filter((_,j)=>j!==i);
  const hg=pickH(others,'gol_h'), hp=pickH(others,'pres_h');
  r.m.gol_loo={...r.m['gol_h'+hg],h:hg}; r.m.pres_loo={...r.m['pres_h'+hp],h:hp};});
// ---- summary: pooled gain vs plain PrioScore, per kind ----
const gain=(rows,k,base='gol')=>Math.exp(pooled(rows,k)-pooled(rows,base))-1;
const beats=(rows,k,base)=>rows.filter(r=>r.m[k].ll>r.m[base].ll).length;
const models=['presence',...HALFS.map(h=>'gol_h'+h),'gol_loo',...HALFS.map(h=>'pres_h'+h),'pres_loo','xp5','xp5_b1'];
const kinds=['domestic','international'];
const summary={halfs:HALFS,models:{},xpVsRecencyPrio:{},looChoices:{}};
kinds.forEach(kd=>{const rows=out.filter(r=>r.kind===kd);
  summary.models[kd]=Object.fromEntries(models.map(k=>[k,{gain:+gain(rows,k).toFixed(4),beatsGol:beats(rows,k,'gol'),tests:rows.length}]));
  // against PrioScore at whichever fixed half-life suits it best in hindsight (the hardest version to beat) too
  summary.xpVsRecencyPrio[kd]=Object.fromEntries(['xp5','xp5_b1'].map(k=>[k,{gain:+gain(rows,k,'gol_loo').toFixed(4),beats:beats(rows,k,'gol_loo'),tests:rows.length,
    gainVsBestFixed:+Math.min(...HALFS.map(h=>gain(rows,k,'gol_h'+h))).toFixed(4)}]));
  summary.looChoices[kd]={gol:rows.map(r=>r.m.gol_loo.h),pres:rows.map(r=>r.m.pres_loo.h)};});
fs.writeFileSync('prio_recency.json',JSON.stringify({window:WINDOW,xpHalf:XP_HALF,summary,tests:out}));
const f=v=>(v>=0?'+':'')+(v*100).toFixed(1)+'%';
console.log('\nPooled gain vs plain PrioScore (tests won vs plain PrioScore)');
console.log('model'.padEnd(12)+kinds.map(k=>k.padStart(22)).join(''));
models.forEach(k=>console.log(k.padEnd(12)+kinds.map(kd=>{const s=summary.models[kd][k];return `${f(s.gain)} (${s.beatsGol}/${s.tests})`.padStart(22);}).join('')));
kinds.forEach(kd=>['xp5','xp5_b1'].forEach(k=>{const s=summary.xpVsRecencyPrio[kd][k];console.log(`${kd} ${k}: vs recency-weighted PrioScore (leave-one-out h): ${f(s.gain)}, won ${s.beats} of ${s.tests}; vs best fixed h in hindsight: ${f(s.gainVsBestFixed)}`);}));
console.log('\nLeave-one-out half-life picked for PrioScore:',JSON.stringify(summary.looChoices));
