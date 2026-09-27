const E=require('./engine.js'); const fs=require('fs');
const A=JSON.parse(fs.readFileSync('all_games.json'));
const WT={ban1:1,ban2:.5,FP1:1,SP1:.9,SP2:.9,FP2:.75,FP3:.75,SP3:.6,SP4:.45,FP4:.35,FP5:.35,SP5:.25,unknown:.63};
const GOL={FP1:1,SP1:1,SP2:1,FP2:.5,FP3:.5,SP3:.5,SP4:.5,FP4:1/3,FP5:1/3,SP5:1/3,unknown:.61};
const FPS=['FP1','FP2','FP3','FP4','FP5'],SPS=['SP1','SP2','SP3','SP4','SP5'];
const ORD={ban1:0,FP1:6,SP1:7,SP2:8,FP2:9,FP3:10,SP3:11,ban2:12,SP4:16,FP4:17,FP5:18,SP5:19,unknown:6};
const ok=c=>c!=null&&c!==255;
const INTL=new Set(['FST','MSI','WLDs']);
// ---- prep (same logic as engine.prepGames) ----
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
// ---- tests ----
const tests=[];
const dom=games.filter(g=>!g.intl);
const patches=[...new Set(dom.map(g=>g.pt))].sort((a,b)=>a-b);
patches.forEach(p=>{const te=dom.filter(g=>g.pt===p); if(te.length<40) return; const start=Math.min(...te.map(g=>g.day));
  tests.push({label:'patch '+te[0].patch, kind:'domestic', test:te, start});});
[['FST',2025],['MSI',2025],['WLDs',2025],['FST',2026],['MSI',2026]].forEach(([lg,y])=>{const te=games.filter(g=>g.lg===lg&&g.year===y);const start=Math.min(...te.map(g=>g.day));tests.push({label:`${lg} ${y}`,kind:'international',test:te,start});});
const WINDOW=150;
const BINS=[[0,.05],[.05,.15],[.15,.3],[.3,.5],[.5,.7],[.7,.9],[.9,1.01]];
const agg={domestic:BINS.map(([a,b])=>({a,b,n:0,pred:0,hit:0})),international:BINS.map(([a,b])=>({a,b,n:0,pred:0,hit:0}))};
const top10={domestic:[0,0],international:[0,0]};
const t0=Date.now();
tests.forEach((T,ti)=>{
  const train=games.filter(g=>g.day<T.start&&g.day>=T.start-WINDOW); if(train.length<200) return;
  const md=Math.max(...train.map(g=>g.day));
  const gam=E.fitPL(E.buildChoices(train,U),nU,g=>Math.pow(.5,(md-g.day)/5),1,60);
  const take=E.plTakeRate(gam,3000);
  const g1=T.test.filter(g=>g.gn===1);
  const bins=agg[T.kind];
  const ord=[...U.keys()].sort((a,b)=>take[b]-take[a]).slice(0,10).map(i=>U[i]);
  g1.forEach(g=>{const taken=new Set(g.acts.map(a=>a.c));U.forEach((c,i)=>{const p=take[i];const bn=bins.find(x=>p>=x.a&&p<x.b);bn.n++;bn.pred+=p;if(taken.has(c))bn.hit++;});
    top10[T.kind][0]+=ord.filter(c=>taken.has(c)).length; top10[T.kind][1]++;});
  console.log(`${ti+1}/${tests.length} ${T.label} g1 ${g1.length} ${((Date.now()-t0)/1000).toFixed(0)}s`);
});
const out={half:5,tests:tests.length,bins:{},top10:{}};
for(const k of ['domestic','international']){out.bins[k]=agg[k].filter(b=>b.n>0).map(b=>({a:b.a,b:Math.min(b.b,1),n:b.n,pred:+(b.pred/b.n).toFixed(4),act:+(b.hit/b.n).toFixed(4)}));out.top10[k]={perG1:+(top10[k][0]/top10[k][1]).toFixed(2),g1:top10[k][1]};}
fs.writeFileSync('calib5.json',JSON.stringify(out));console.log(JSON.stringify(out,null,1));
