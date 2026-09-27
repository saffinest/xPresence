const M=require('./rolerun.js');const E=require('./engine.js');const fs=require('fs');
const {games,U,nU,uIdx,tests,roleProfile,buildRoleChoices,fitW,simRole}=M;
const RN=['top','jng','mid','bot','sup'];
const acc={plain:RN.map(()=>({pred:0,act:0,n:0})),hard:RN.map(()=>({pred:0,act:0,n:0}))};
const band={plain:RN.map(()=>({pred:0,act:0,n:0})),hard:RN.map(()=>({pred:0,act:0,n:0}))};
tests.forEach((T,ti)=>{const train=games.filter(g=>g.day<T.start&&g.day>=T.start-150);if(train.length<200)return;
  const md=Math.max(...train.map(g=>g.day));const wf=g=>Math.pow(.5,(md-g.day)/5);const pi=roleProfile(train);
  const gP=E.fitPL(E.buildChoices(train,U),nU,wf,1,60);const tP=E.plTakeRate(gP,3000);
  const gR=fitW(buildRoleChoices(train,pi,{mode:'hard'}),wf,1,60,gP);const tR=simRole(gR,pi,{sims:2000}).take;
  const main=pi.map(p=>p.indexOf(Math.max(...p)));
  T.test.filter(g=>g.gn===1).forEach(g=>{const tk=new Set(g.acts.map(a=>uIdx.get(a.c)));
    for(let c=0;c<nU;c++){const y=tk.has(c)?1:0;[['plain',tP],['hard',tR]].forEach(([k,t])=>{const a=acc[k][main[c]];a.pred+=t[c];a.act+=y;a.n++;
      if(t[c]>=.3&&t[c]<.5){const b=band[k][main[c]];b.pred+=t[c];b.act+=y;b.n++;}});}});
  process.stdout.write(ti+' ');});
console.log();
for(const k of ['plain','hard']){console.log(k);RN.forEach((r,i)=>{const a=acc[k][i],b=band[k][i];console.log(`  ${r}: predicted takes per G1 ${(a.pred/1855).toFixed(2)}, actual ${(a.act/1855).toFixed(2)} | 30-50% band: pred ${(b.pred/b.n*100).toFixed(1)}% act ${(b.act/b.n*100).toFixed(1)}% n=${b.n}`);});}
fs.writeFileSync('rolebias.json',JSON.stringify({acc,band}));
