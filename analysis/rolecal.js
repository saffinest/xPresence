const M=require('./rolerun.js');const E=require('./engine.js');const fs=require('fs');
const {games,U,nU,uIdx,tests,roleProfile}=M;
const RN=['top','jng','mid','bot','sup'];
const g1Loss=(take,g1)=>{let s=0,n=0;g1.forEach(g=>{const tk=new Set(g.acts.map(a=>uIdx.get(a.c)));for(let c=0;c<nU;c++){if(g.used.has(U[c]))continue;const p=Math.min(Math.max(take[c],1e-3),1-1e-3),y=tk.has(c)?1:0;s+=-(y*Math.log(p)+(1-y)*Math.log(1-p));n++;}});return s/n;};
const out=[];
tests.forEach((T,ti)=>{const train=games.filter(g=>g.day<T.start&&g.day>=T.start-150);if(train.length<200)return;
  const md=Math.max(...train.map(g=>g.day));const wf=g=>Math.pow(.5,(md-g.day)/5);const pi=roleProfile(train);
  const gP=E.fitPL(E.buildChoices(train,U),nU,wf,1,60);const tP=E.plTakeRate(gP,3000);
  // role calibration: match recency-weighted training G1 takes per role
  const tg1=train.filter(g=>g.gn===1);const actR=new Float64Array(5);let wsum=0;
  tg1.forEach(g=>{const w=wf(g);wsum+=w;g.acts.forEach(a=>{const p=pi[uIdx.get(a.c)];for(let r=0;r<5;r++)actR[r]+=w*p[r];});});
  for(let r=0;r<5;r++)actR[r]/=wsum;
  const k=new Float64Array(5).fill(1);let t=tP;
  for(let it=0;it<6;it++){const pr=new Float64Array(5);for(let c=0;c<nU;c++)for(let r=0;r<5;r++)pr[r]+=t[c]*pi[c][r];
    for(let r=0;r<5;r++)k[r]*=Math.pow(actR[r]/pr[r],1.5);
    const g2=Float64Array.from(gP,(v,c)=>{let m=0;for(let r=0;r<5;r++)m+=pi[c][r]*Math.log(k[r]);return v*Math.exp(m);});t=E.plTakeRate(g2,3000);}
  const g1=T.test.filter(g=>g.gn===1);
  const res={label:T.label,kind:T.kind,n:g1.length,plain:g1Loss(tP,g1),cal:g1Loss(t,g1),k:Array.from(k,x=>+x.toFixed(3))};
  out.push(res);console.log(ti,T.label,res.plain.toFixed(4),res.cal.toFixed(4),res.k.join(' '));});
fs.writeFileSync('rolecal.json',JSON.stringify(out));
for(const kind of ['domestic','international']){const R=out.filter(r=>r.kind===kind);const w=R.reduce((s,r)=>s+r.n,0);
  console.log(kind,'plain',(R.reduce((s,r)=>s+r.plain*r.n,0)/w).toFixed(4),'cal',(R.reduce((s,r)=>s+r.cal*r.n,0)/w).toFixed(4),'beats',R.filter(r=>r.cal<r.plain).length,'/',R.length);}
