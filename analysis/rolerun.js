// Role-aware xPresence: rolling tests vs plain xPresence (5-day half-life)
const E=require('./engine.js'); const fs=require('fs');
const A=JSON.parse(fs.readFileSync('all_games_roles.json'));
const GOL={FP1:1,SP1:1,SP2:1,FP2:.5,FP3:.5,SP3:.5,SP4:.5,FP4:1/3,FP5:1/3,SP5:1/3,unknown:.61};
const FPS=['FP1','FP2','FP3','FP4','FP5'],SPS=['SP1','SP2','SP3','SP4','SP5'];
const ORD={ban1:0,FP1:6,SP1:7,SP2:8,FP2:9,FP3:10,SP3:11,ban2:12,SP4:16,FP4:17,FP5:18,SP5:19,unknown:6};
const ok=c=>c!=null&&c!==255;
const INTL=new Set(['FST','MSI','WLDs']);
const games=A.rows.map(r=>{const acts=[];
  [[r.A,r.B,r.bA,0],[r.B,r.A,r.bB,1]].forEach(([t,o,b,side])=>b.forEach((c,j)=>{if(!ok(c))return;const slot=j<3?'ban1':'ban2';acts.push({c,t,o,kind:'ban',slot,gw:1,ord:j<3?j*2+side:12+(j-3)*2+(1-side)});}));
  const add=(c,t,o,slot,r)=>{if(ok(c))acts.push({c,t,o,kind:'pick',slot,gw:GOL[slot],ord:ORD[slot],r});};
  const rA=r.rA||[],rB=r.rB||[];
  if(!r.known){r.pA.forEach((c,j)=>add(c,r.A,r.B,'unknown',rA[j]));r.pB.forEach((c,j)=>add(c,r.B,r.A,'unknown',rB[j]));}
  else{const fpA=r.fp===0;const fpT=fpA?r.A:r.B,spT=fpA?r.B:r.A,fpP=fpA?r.pA:r.pB,spP=fpA?r.pB:r.pA,fpR=fpA?rA:rB,spR=fpA?rB:rA;
    fpP.forEach((c,j)=>add(c,fpT,spT,FPS[j],fpR[j]));spP.forEach((c,j)=>add(c,spT,fpT,SPS[j],spR[j]));}
  acts.sort((a,b)=>a.ord-b.ord);
  return {sid:r.sid,lg:r.lg,year:r.year,gn:r.gn,day:r.day,pt:r.pt,patch:r.patch,A:r.A,B:r.B,winner:r.win===0?r.A:r.B,known:r.known,acts,picks:new Set([...r.pA,...r.pB].filter(ok)),intl:INTL.has(r.lg)};});
const bs={};games.forEach(g=>(bs[g.sid]=bs[g.sid]||[]).push(g));
Object.values(bs).forEach(l=>{l.sort((a,b)=>a.gn-b.gn);const used=new Set();l.forEach(g=>{g.used=new Set(used);g.picks.forEach(c=>used.add(c));});});
const U=[...new Set(games.flatMap(g=>g.acts.map(a=>a.c)))], nU=U.length, uIdx=new Map(U.map((c,i)=>[c,i]));
const tests=[];
const dom=games.filter(g=>!g.intl);
[...new Set(dom.map(g=>g.pt))].sort((a,b)=>a-b).forEach(p=>{const te=dom.filter(g=>g.pt===p); if(te.length<40) return; tests.push({label:'patch '+te[0].patch,kind:'domestic',test:te,start:Math.min(...te.map(g=>g.day))});});
[['FST',2025],['MSI',2025],['WLDs',2025],['FST',2026],['MSI',2026]].forEach(([lg,y])=>{const te=games.filter(g=>g.lg===lg&&g.year===y);tests.push({label:`${lg} ${y}`,kind:'international',test:te,start:Math.min(...te.map(g=>g.day))});});

// ---- role profiles: pi[c][r], smoothed toward 0.2 with kappa pseudo-picks ----
function roleProfile(train,kappa=2){const cnt=Array.from({length:nU},()=>new Float64Array(5));
  train.forEach(g=>g.acts.forEach(a=>{if(a.kind==='pick'&&a.r!=null)cnt[uIdx.get(a.c)][a.r]++;}));
  return cnt.map(v=>{const n=v.reduce((s,x)=>s+x,0);return Float64Array.from(v,x=>(x+kappa*.2)/(n+kappa));});}

// ---- choices with per-option role weights ----
// mode: 'hard' = teams' filled roles known exactly; 'soft' = roles inferred from champions' profiles
function buildRoleChoices(gs,pi,{eps=.03,lam=.6,mode='hard'}={}){
  const out=[];
  gs.forEach(g=>{
    const base=U.map((c,i)=>i).filter(i=>!g.used.has(U[i]));
    const taken=new Set(); const open={}; open[g.A]=Float64Array.from([1,1,1,1,1]); open[g.B]=Float64Array.from([1,1,1,1,1]);
    const roleAware=g.known;
    g.acts.forEach(a=>{
      const ci=uIdx.get(a.c); if(g.used.has(a.c)) return;
      const S=base.filter(i=>!taken.has(i)); if(!S.includes(ci)) return;
      let w=null;
      if(roleAware&&a.slot!=='unknown'){
        const op=a.kind==='pick'?open[a.t]:open[a.o];
        w=new Float32Array(S.length);
        for(let k=0;k<S.length;k++){const p=pi[S[k]];let s=0;for(let r=0;r<5;r++)s+=p[r]*op[r];
          w[k]=a.kind==='pick'?eps+s:(1-lam)+lam*s;}
      }
      out.push({c:ci,S:Int16Array.from(S),w,pos:S.indexOf(ci),g,kind:a.kind,slot:a.slot});
      if(a.slot!=='unknown'){taken.add(ci);
        if(a.kind==='pick'){const op=open[a.t];
          if(mode==='hard'&&a.r!=null)op[a.r]=0; else {const p=pi[ci];for(let r=0;r<5;r++)op[r]*=(1-p[r]);}}}
    });
  });
  return out;
}
function fitW(ch,wf,alpha=1,iters=60,init){
  const gam=init?Float64Array.from(init):new Float64Array(nU).fill(1), W=new Float64Array(nU), wa=ch.map(c=>wf(c.g)), den=new Float64Array(nU);
  ch.forEach((c,k)=>W[c.c]+=wa[k]);
  for(let it=0;it<iters;it++){den.fill(0);
    for(let k=0;k<ch.length;k++){const {S,w}=ch[k];let D=0;
      if(w){for(let j=0;j<S.length;j++)D+=gam[S[j]]*w[j];const q=wa[k]/D;for(let j=0;j<S.length;j++)den[S[j]]+=q*w[j];}
      else{for(let j=0;j<S.length;j++)D+=gam[S[j]];const q=wa[k]/D;for(let j=0;j<S.length;j++)den[S[j]]+=q;}}
    for(let c=0;c<nU;c++)gam[c]=(W[c]+alpha)/(den[c]+alpha);}
  return gam;
}
// mean log-lik per action at temperature b on log strength (role weight enters untempered)
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function ll(ch,x,b,useW=true){return ch.map(c=>{const {S,w}=c;let mx=-1e9;const v=new Float64Array(S.length);
  for(let j=0;j<S.length;j++){v[j]=b*x[S[j]]+(useW&&w?Math.log(w[j]):0);if(v[j]>mx)mx=v[j];}
  let z=0;for(let j=0;j<S.length;j++)z+=Math.exp(v[j]-mx);return v[c.pos]-mx-Math.log(z);});}
function fitB(ch,x,useW,lo=.2,hi=2.5){for(let i=0;i<22;i++){const m1=lo+(hi-lo)/3,m2=hi-(hi-lo)/3;if(mean(ll(ch,x,m1,useW))<mean(ll(ch,x,m2,useW)))lo=m1;else hi=m2;}return (lo+hi)/2;}

// ---- fresh Game 1 simulation with role constraints ----
const SEQ=[['b',0],['b',1],['b',0],['b',1],['b',0],['b',1],['p',0],['p',1],['p',1],['p',0],['p',0],['p',1],['b',1],['b',0],['b',1],['b',0],['p',1],['p',0],['p',0],['p',1]];
function simRole(gam,pi,{eps=.03,lam=.6,sims=3000,b=1}={}){
  let s=987654321;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return (s+.5)/0x80000000;};
  const g=Float64Array.from(gam,v=>Math.pow(v,b)), hit=new Float64Array(nU), pickR=Array.from({length:nU},()=>new Float64Array(5)), ban=new Float64Array(nU);
  const w=new Float64Array(nU);
  for(let t=0;t<sims;t++){const avail=new Uint8Array(nU).fill(1);const open=[[1,1,1,1,1],[1,1,1,1,1]];
    for(const [k,team] of SEQ){const op=k==='p'?open[team]:open[1-team];let Z=0;
      for(let c=0;c<nU;c++){if(!avail[c]){w[c]=0;continue;}const p=pi[c];let sr=0;for(let r=0;r<5;r++)sr+=p[r]*op[r];
        w[c]=g[c]*(k==='p'?eps+sr:(1-lam)+lam*sr);Z+=w[c];}
      let u=rnd()*Z,c=0;for(;c<nU-1;c++){u-=w[c];if(u<=0)break;} while(!avail[c])c--;
      avail[c]=0;hit[c]++;
      if(k==='p'){const p=pi[c];let Zr=0;const q=[0,0,0,0,0];for(let r=0;r<5;r++){q[r]=p[r]*open[team][r];Zr+=q[r];}
        let rr=0;if(Zr>0){let v=rnd()*Zr;for(;rr<4;rr++){v-=q[rr];if(v<=0)break;}}else{rr=open[team].indexOf(1);if(rr<0)rr=0;}
        open[team][rr]=0;pickR[c][rr]++;} else ban[c]++;}}
  return {take:Array.from(hit,h=>h/sims),pickR:pickR.map(v=>Array.from(v,x=>x/sims)),ban:Array.from(ban,x=>x/sims)};
}
module.exports={games,U,nU,uIdx,tests,roleProfile,buildRoleChoices,fitW,ll,fitB,simRole,mean};
if(require.main!==module) return;

// ---- run ----
const WINDOW=150, H=5, VARIANTS=[{name:'hard',mode:'hard',eps:.03,lam:.6},{name:'hard_lam0',mode:'hard',eps:.03,lam:0},{name:'hard_lam9',mode:'hard',eps:.03,lam:.9},{name:'soft',mode:'soft',eps:.03,lam:.6},{name:'hard_eps10',mode:'hard',eps:.1,lam:.6}];
const out=[];const t0=Date.now();
const g1Stats=(take,g1)=>{let lossSum=0,br=0,n=0;g1.forEach(g=>{const tk=new Set(g.acts.map(a=>uIdx.get(a.c)));for(let c=0;c<nU;c++){if(g.used.has(U[c]))continue;const p=Math.min(Math.max(take[c],1e-3),1-1e-3),y=tk.has(c)?1:0;lossSum+=-(y*Math.log(p)+(1-y)*Math.log(1-p));br+=(p-y)**2;n++;}});return {logloss:lossSum/n,brier:br/n};};
tests.forEach((T,ti)=>{
  const train=games.filter(g=>g.day<T.start&&g.day>=T.start-WINDOW); if(train.length<200) return;
  const md=Math.max(...train.map(g=>g.day)); const wf=g=>Math.pow(.5,(md-g.day)/H);
  const recent=train.filter(g=>g.day>=md-30);
  const pi=roleProfile(train);
  const res={label:T.label,kind:T.kind,test:T.test.length,m:{}};
  // plain xPresence (no role weights)
  const gP=E.fitPL(E.buildChoices(train,U),nU,wf,1,60);
  const xP=Float64Array.from(gP,Math.log);
  const chTe0=buildRoleChoices(T.test,pi,{mode:'hard'}), chCal0=buildRoleChoices(recent,pi,{mode:'hard'}).slice(-6000);
  const bP=fitB(chCal0,xP,false);
  res.m.plain={ll:mean(ll(chTe0,xP,bP,false)),beta:bP};
  const st=E.rawStats(train,U); const xg=Float64Array.from(U,c=>Math.log(st.get(c).gol/train.length+0.01));
  const bg=fitB(chCal0,xg,false,0,4); res.m.gol={ll:mean(ll(chTe0,xg,bg,false))};
  const takeP=E.plTakeRate(gP,3000);
  const g1=T.test.filter(g=>g.gn===1);
  res.m.plain.g1=g1Stats(takeP,g1);
  // pick-only and ban-only splits for plain
  const split=(ch,x,b,useW)=>{const v=ll(ch,x,b,useW);const pk=[],bn=[];ch.forEach((c,i)=>(c.kind==='pick'?pk:bn).push(v[i]));return {pick:mean(pk),ban:mean(bn)};};
  res.m.plain.split=split(chTe0,xP,bP,false);
  let init=gP;
  VARIANTS.forEach(V=>{
    const chTr=buildRoleChoices(train,pi,V), chTe=buildRoleChoices(T.test,pi,V), chCal=buildRoleChoices(recent,pi,V).slice(-6000);
    const gR=fitW(chTr,wf,1,60,init); const x=Float64Array.from(gR,Math.log);
    const b=fitB(chCal,x,true);
    const r={ll:mean(ll(chTe,x,b,true)),beta:b,split:split(chTe,x,b,true)};
    if(V.name==='hard'||V.name==='soft'){const sim=simRole(gR,pi,{eps:V.eps,lam:V.lam,sims:2000});r.g1=g1Stats(sim.take,g1);
      if(V.name==='hard'){const simB=simRole(gR,pi,{eps:V.eps,lam:V.lam,sims:2000,b});r.g1b=g1Stats(simB.take,g1);}}
    res.m[V.name]=r;
  });
  out.push(res); fs.writeFileSync('role_roll.json',JSON.stringify(out));
  const f=v=>(v>=0?'+':'')+(v*100).toFixed(1)+'%';
  console.log(`${ti+1}/${tests.length} ${T.label} ${((Date.now()-t0)/1000).toFixed(0)}s plain→gol ${f(Math.exp(res.m.plain.ll-res.m.gol.ll)-1)} hard→plain ${f(Math.exp(res.m.hard.ll-res.m.plain.ll)-1)} soft→plain ${f(Math.exp(res.m.soft.ll-res.m.plain.ll)-1)} G1 logloss plain ${res.m.plain.g1.logloss.toFixed(4)} hard ${res.m.hard.g1.logloss.toFixed(4)} hardβ ${res.m.hard.g1b.logloss.toFixed(4)}`);
});
