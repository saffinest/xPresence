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
const NOTES=JSON.parse(fs.readFileSync('notes.json')), WR=JSON.parse(fs.readFileSync('wr_shift.json'));
const nm=s=>String(s).toLowerCase().replace(/[^a-z]/g,'');
const cname=A.C.map(nm);
const WRn={}; Object.entries(WR).forEach(([p,o])=>{WRn[p]={};Object.entries(o).forEach(([k,v])=>WRn[p][nm(k)]=v);});
const lab=s=>{const p=s.split('.');const mn=p[2];return `${p[1]}.${mn.length===1?+mn*10:+mn}`;};
games.forEach((g,i)=>g.plab=lab(A.rows[i].patch));
const pnum=l=>+l.split('.')[1];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const llArr=(chs,x,b)=>chs.map(c=>{let mx=-1e9;for(const j of c.S)mx=Math.max(mx,b*x[j]);let z=0;for(const j of c.S)z+=Math.exp(b*x[j]-mx);return b*x[c.c]-mx-Math.log(z);});
const dom=games.filter(g=>!g.intl&&g.year===2026);
const tests=[];
// gap tests: train stops before the PREVIOUS patch, so 2+ patches of changes must be bridged (like Worlds)
const startOf=p=>Math.min(...dom.filter(g=>g.plab===p).map(g=>g.day));
[['16.11','16.10'],['16.15','16.14'],['16.16','16.15'],['16.17','16.16']].forEach(([p,prev])=>{const te=dom.filter(g=>g.plab===p);tests.push({label:'patch '+p+' (2-patch gap)',test:te,start:startOf(prev),target:p});});
{const te=dom.filter(g=>g.plab==='16.14'); const msi=games.filter(g=>g.lg==='MSI'&&g.year===2026); tests.push({label:'patch 16.14 (3-patch gap)',test:te,start:Math.min(...msi.map(g=>g.day)),target:'16.14'});}
{const te=games.filter(g=>g.lg==='MSI'&&g.year===2026);tests.push({label:'MSI 2026',test:te,start:Math.min(...te.map(g=>g.day)),target:'16.13'});}
const results=[];
for(const T of tests){
  const train=games.filter(g=>g.day<T.start&&g.day>=T.start-150);
  const md=Math.max(...train.map(g=>g.day));
  // training's current patch = most common patch in its last 7 days
  const cnt={}; train.filter(g=>g.day>=md-7&&g.year===2026).forEach(g=>cnt[g.plab]=(cnt[g.plab]||0)+1);
  const cur=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0];
  const pts=Object.keys(NOTES).filter(p=>pnum(p)>pnum(cur)&&pnum(p)<=pnum(T.target));
  const chTr=E.buildChoices(train,U), chTe=E.buildChoices(T.test,U);
  const R={label:T.label,cur,patches:pts,actions:chTe.length,test:T.test.length,base:{}};
  for(const h of [5,10]){
    const gam=E.fitPL(chTr,nU,g=>Math.pow(.5,(md-g.day)/h)*(g.pressure?1.5:1),1,60);
    const x0=Float64Array.from(gam,Math.log);
    // per-champion features for this test
    const dirSize=U.map(()=>[]), wrd=new Float64Array(nU), inNotes=new Uint8Array(nU);
    U.forEach((c,i)=>{const k=cname[c]; pts.forEach(p=>{const n=NOTES[p][k]; if(n){inNotes[i]=1; dirSize[i].push(n);} const w=(WRn[p]||{})[k]; if(w!=null) wrd[i]+=w;});});
    R.base[h]={ll:mean(llArr(chTe,x0,1)), feats:{dirSize,wrd:Array.from(wrd),inNotes:Array.from(inNotes)}, x0:Array.from(x0), chTe};
  }
  results.push(R);
  console.log(T.label,'train cur',cur,'patches',pts.join(','),'actions',chTe.length);
}
// scoring functions: given params, compute test ll for each test
const S={small:1,medium:2,large:3};
const shift={
  none:(R,h)=>R.base[h].x0,
  flat:(R,h,m)=>R.base[h].x0.map((v,i)=>v+R.base[h].feats.dirSize[i].reduce((a,[d])=>a+(d==='buff'?1:d==='nerf'?-1:0),0)*Math.log(m)),
  tiers:(R,h,a)=>R.base[h].x0.map((v,i)=>v+R.base[h].feats.dirSize[i].reduce((s,[d,z])=>s+(d==='buff'?1:d==='nerf'?-1:0)*a*S[z],0)),
  tiers3:(R,h,w)=>R.base[h].x0.map((v,i)=>v+R.base[h].feats.dirSize[i].reduce((s,[d,z])=>s+(d==='buff'?1:d==='nerf'?-1:0)*w[z],0)),
  wrAll:(R,h,k)=>R.base[h].x0.map((v,i)=>v+k*R.base[h].feats.wrd[i]),
  wrNotes:(R,h,k)=>R.base[h].x0.map((v,i)=>v+(R.base[h].feats.inNotes[i]?k*R.base[h].feats.wrd[i]:0)),
};
const evalT=(R,h,x)=>mean(llArr(R.base[h].chTe,Float64Array.from(x),1));
const grids={flat:[1,1.1,1.25,1.5,1.75,2,2.5,3],tiers:[0,0.05,0.1,0.15,0.2,0.3,0.4,0.5],wrAll:[0,0.1,0.2,0.3,0.4,0.5,0.7,1.0],wrNotes:[0,0.1,0.2,0.3,0.4,0.5,0.7,1.0]};
const t3=[];[0,0.1,0.2,0.4].forEach(a=>[0,0.2,0.4,0.6].forEach(b=>[0,0.3,0.6,0.9].forEach(c=>{if(a<=b&&b<=c)t3.push({small:a,medium:b,large:c});})));
grids.tiers3=t3;
const out={tests:results.map(r=>({label:r.label,cur:r.cur,patches:r.patches,actions:r.actions,test:r.test})),h:{}};
for(const h of [5,10]){
  const tab={}; // method -> per-test ll at each grid value
  for(const [meth,grid] of Object.entries(grids)){ tab[meth]=grid.map(g=>results.map(R=>evalT(R,h,shift[meth](R,h,g)))); }
  const none=results.map(R=>R.base[h].ll);
  const res={};
  for(const [meth,grid] of Object.entries(grids)){
    // leave-one-test-out: pick best grid value on other tests (action-weighted), apply to held-out
    let tot=0,w=0; const picks=[];
    results.forEach((R,i)=>{ let best=0,bv=-1e9; grid.forEach((g,gi)=>{ const v=results.reduce((s,Q,j)=>j===i?s:s+(tab[meth][gi][j]-none[j])*Q.actions,0); if(v>bv){bv=v;best=gi;} }); picks.push(grid[best]); tot+=(tab[meth][best][i]-none[i])*R.actions; w+=R.actions; });
    // in-sample best
    let bi=0,bv=-1e9; grid.forEach((g,gi)=>{const v=results.reduce((s,Q,j)=>s+(tab[meth][gi][j]-none[j])*Q.actions,0); if(v>bv){bv=v;bi=gi;}});
    const perTestBest=results.map((R,i)=>+(100*(Math.exp(tab[meth][bi][i]-none[i])-1)).toFixed(2));
    res[meth]={loo:+(100*(Math.exp(tot/w)-1)).toFixed(2), looPicks:picks, best:grid[bi], inSample:+(100*(Math.exp(bv/w)-1)).toFixed(2), perTest:perTestBest};
  }
  // flat 1.5 fixed (pre-registered default)
  const fi=grids.flat.indexOf(1.5); res.flat15={perTest:results.map((R,i)=>+(100*(Math.exp(tab.flat[fi][i]-none[i])-1)).toFixed(2)), pooled:+(100*(Math.exp(results.reduce((s,R,i)=>s+(tab.flat[fi][i]-none[i])*R.actions,0)/results.reduce((s,R)=>s+R.actions,0))-1)).toFixed(2)};
  out.h[h]=res;
  console.log('\n== half-life',h); Object.entries(res).forEach(([k,v])=>console.log(k.padEnd(8),JSON.stringify(v)));
}
fs.writeFileSync('adjust_gap.json',JSON.stringify(out));
