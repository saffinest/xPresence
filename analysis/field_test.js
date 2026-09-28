// Does training only on the event's own teams beat training on all six leagues? (5 international events, 5-day half-life)
const M=require('./rolerun.js');const E=require('./engine.js');
const {games,U,nU,uIdx,tests,roleProfile,buildRoleChoices,ll,fitB,mean}=M;
const f=v=>(v>=0?'+':'')+(v*100).toFixed(1)+'%';const out=[];
tests.filter(t=>t.kind==='international').forEach(T=>{
  const teams=new Set(T.test.flatMap(g=>[g.A,g.B]));
  const train=games.filter(g=>g.day<T.start&&g.day>=T.start-150);
  const md=Math.max(...train.map(g=>g.day));const wf=g=>Math.pow(.5,(md-g.day)/5);
  const pi=roleProfile(train);const chTe=buildRoleChoices(T.test,pi);
  const fit=(gs,w)=>{const g=E.fitPL(E.buildChoices(gs,U),nU,w,1,60);const x=Float64Array.from(g,Math.log);
    const cal=buildRoleChoices(gs.filter(q=>q.day>=md-30),pi).slice(-6000);const b=fitB(cal,x,false);return mean(ll(chTe,x,b,false));};
  const field=train.filter(g=>teams.has(g.A)||teams.has(g.B));
  const all=fit(train,wf), only=fit(field,wf), w2=fit(train,g=>wf(g)*((teams.has(g.A)||teams.has(g.B))?2:1)), u2=fit(train,g=>wf(g)*2), u15=fit(train,g=>wf(g)*1.5);
  out.push({label:T.label,all,only,w2,u2,u15,nField:field.length,nAll:train.length});
  console.log(T.label,'train',train.length,'field games',field.length,'field-only vs all',f(Math.exp(only-all)-1),'field x2 vs all',f(Math.exp(w2-all)-1),'all x2 (weaker prior) vs all',f(Math.exp(u2-all)-1),'x2 field vs x2 all',f(Math.exp(w2-u2)-1));});
const n=out.length;console.log('pooled field-only',f(Math.exp(mean(out.map(o=>o.only-o.all)))-1),'field x2',f(Math.exp(mean(out.map(o=>o.w2-o.all)))-1));
require('fs').writeFileSync('field_test.json',JSON.stringify(out));
