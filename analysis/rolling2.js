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
const WINDOW=150, HALFS=[2,3,4,5,7,10];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const llArr=(chs,x,b)=>chs.map(c=>{let mx=-1e9;for(const j of c.S)mx=Math.max(mx,b*x[j]);let z=0;for(const j of c.S)z+=Math.exp(b*x[j]-mx);return b*x[c.c]-mx-Math.log(z);});
const fitB=(chs,x,lo=0,hi=4)=>{for(let i=0;i<22;i++){const m1=lo+(hi-lo)/3,m2=hi-(hi-lo)/3;if(mean(llArr(chs,x,m1))<mean(llArr(chs,x,m2)))lo=m1;else hi=m2;}return (lo+hi)/2;};
const out=[]; const t0=Date.now();
tests.forEach((T,ti)=>{
  const train=games.filter(g=>g.day<T.start&&g.day>=T.start-WINDOW); if(train.length<200) return;
  const md=Math.max(...train.map(g=>g.day));
  const chTr=E.buildChoices(train,U); const recent=train.filter(g=>g.day>=md-30); const chCal=E.buildChoices(recent,U).slice(-6000);
  const chTe=E.buildChoices(T.test,U);
  const uni=mean(llArr(chTe,new Float64Array(nU),0));
  const res={label:T.label,kind:T.kind,train:train.length,test:T.test.length,actions:chTe.length,uniform:uni,m:{}};
  const feat=(m,pl)=>Float64Array.from(U,c=>pl?Math.log(m.get?m.get(c):m[U.indexOf(c)]):Math.log(((m.get(c))||0)+0.01));
  const rate=(name,sc)=>{const x=Float64Array.from(U,c=>Math.log((sc.get(c)||0)+0.01));const b=fitB(chCal,x);res.m[name]={ll:mean(llArr(chTe,x,b)),beta:b};};
  const st=E.rawStats(train,U); rate('gol',new Map(U.map(c=>[c,st.get(c).gol/train.length]))); rate('presence',new Map(U.map(c=>[c,(st.get(c).p+st.get(c).b)/train.length])));
  
  const W=h=>E.gameWeights(train,U,{recency:h>0,half:h,pressure:true,pmult:1.5},null);
  
  let init=null;
  HALFS.forEach(h=>{const wf=g=>(h>0?Math.pow(.5,(md-g.day)/h):1)*(g.pressure?1.5:1);const gam=E.fitPL(chTr,nU,wf,1,50,init);init=gam;
    const x=Float64Array.from(gam,Math.log); const b=fitB(chCal,x,0.3,2); const best=fitB(chTe,x,0.2,2);
    res.m['pl_h'+h]={ll:mean(llArr(chTe,x,b)),beta:b,ll1:mean(llArr(chTe,x,1)),betaOracle:best,llOracle:mean(llArr(chTe,x,best)),byBeta:Object.fromEntries([0.7,0.75,0.8,0.85,0.9,0.95,1.0].map(bb=>[bb,mean(llArr(chTe,x,bb))]))};});
  out.push(res); fs.writeFileSync('rolling2.json',JSON.stringify(out));
  console.log(`${ti+1}/${tests.length} ${T.label} (${T.kind}) train ${train.length} test ${T.test.length} ${((Date.now()-t0)/1000).toFixed(0)}s  gol ${res.m.gol.ll.toFixed(3)} pl5 ${res.m.pl_h5.ll1.toFixed(3)} beta* ${res.m.pl_h10.betaOracle.toFixed(2)}`);
});
