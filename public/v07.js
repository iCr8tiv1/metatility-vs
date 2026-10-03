/* Metatility VS v0.7 - Business Concept Evaluation Engine */
(function(){
  'use strict';

  function installStyles(){
    if(document.getElementById('v07-styles')) return;
    const style=document.createElement('style');
    style.id='v07-styles';
    style.textContent=`
.evalband{display:grid;grid-template-columns:1.2fr .8fr;gap:12px;margin:14px 0}
.memo{display:grid;gap:8px}.memo .line{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}.memo .line:last-child{border:0}
.sensitivity{display:grid;gap:8px}.sensrow{display:grid;grid-template-columns:140px 1fr 96px;gap:10px;align-items:center}.sensbar{height:8px;background:#edf0f3;border-radius:999px;overflow:hidden}.sensbar i{display:block;height:100%;background:#111827}
.ptable{width:100%;border-collapse:collapse;min-width:1100px}.ptable th,.ptable td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}.ptable th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.tablewrap{overflow:auto}
.intake-note{padding:10px 12px;border-left:3px solid #111827;background:#f8fafc;border-radius:6px}.scenario{grid-template-columns:repeat(4,1fr)}
.state-label{font-size:17px;font-weight:800}.logic{display:grid;gap:8px}.logic .rowline{display:grid;grid-template-columns:145px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}
@media(max-width:900px){.evalband{grid-template-columns:1fr}.sensrow{grid-template-columns:110px 1fr}.sensrow span{grid-column:2}.scenario{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.scenario{grid-template-columns:1fr}.memo .line,.logic .rowline{grid-template-columns:1fr}.sensrow{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
  }

  function installNavigation(){
    NAV.splice(0,NAV.length,
      ['overview','Overview'],['portfolio','Portfolio'],['architecture','Concept Intake'],['scorecard','Evaluation'],
      ['assumptions','Assumptions'],['experiments','Experiments'],['evidence','Evidence'],['simulator','Economics'],
      ['decisions','Decision Memo'],['isfeed','IS Feed']
    );
    nav();
    const sub=document.querySelector('.sub');
    if(sub) sub.textContent='Business Concept Evaluation Engine - v0.7';
  }

  window.conceptAssumptions=function(id){return state.assumptions.filter(x=>x.concept_id===id)};
  window.coverageFor=function(id){
    const a=conceptAssumptions(id);if(!a.length)return 0;
    return Math.round(a.reduce((n,x)=>n+(EVIDENCE[x.evidence_level]?.score||0)/6,0)/a.length*100);
  };
  window.uncertaintyFor=function(id){
    const a=conceptAssumptions(id);if(!a.length)return 100;
    return Math.max(0,Math.round(100-a.reduce((n,x)=>n+Number(x.confidence||1),0)/(a.length*5)*100));
  };
  window.adjustedFor=function(c){return Math.round(scoreDims(c)*(.35+.65*(coverageFor(c?.id)/100)))};
  window.coverage=function(){return coverageFor(current)};
  window.adjustedScore=function(){return adjustedFor(cv())};
  window.uncertainty=function(){return uncertaintyFor(current)};
  window.priority=function(a){
    const evidenceGap=7-(EVIDENCE[a.evidence_level]?.score||0);
    return Math.round((Number(a.impact_if_false||1)*(6-Number(a.confidence||1))*evidenceGap/Math.max(1,Number(a.test_cost||1)))*10)/10;
  };
  window.fatalAssumption=function(id=current){return conceptAssumptions(id).slice().sort((a,b)=>priority(b)-priority(a))[0]||null};
  window.estimateTestDays=function(a){if(!a)return null;return ({1:3,2:7,3:14,4:30,5:60})[Number(a.test_cost||2)]||14};
  window.decisionStateFor=function(c){
    if(!c)return'NO CONCEPT';
    const a=conceptAssumptions(c.id),cov=coverageFor(c.id),unc=uncertaintyFor(c.id),adj=adjustedFor(c);
    const hardContradiction=a.some(x=>['invalidated','contradicted'].includes(x.status)&&(EVIDENCE[x.evidence_level]?.score||0)>=5&&Number(x.impact_if_false)>=4);
    if(hardContradiction)return'RETHINK';
    if(!a.length||cov<15)return'DISCOVER';
    if(unc>70||cov<35)return'VALIDATE';
    if(adj>=70&&cov>=55&&unc<=45)return'INCUBATION CANDIDATE';
    if(adj<45&&cov>=35)return'RETHINK';
    return'VALIDATE';
  };
  window.decisionState=function(){return decisionStateFor(cv())};
  window.inferModel=function(v){
    const text=[v?.name,v?.type,v?.one_liner,v?.problem,v?.solution,v?.business_model,v?.distribution,v?.current_alternative].filter(Boolean).join(' ').toLowerCase();
    if(/marketplace|two[- ]sided|buyers? and sellers?|match supply|match demand/.test(text))return'marketplace';
    if(/license|licensing|royalt|intellectual property|\bip\b/.test(text))return'licensing';
    if(/saas|subscription|monthly recurring|annual recurring|recurring software/.test(text))return'saas';
    if(/freemium|network effect|social platform|user platform/.test(text))return'platform';
    if(/service|consult|agency|install|project fee|contractor/.test(text))return'service';
    if(/asset|fleet|facility|equipment|infrastructure|capex/.test(text))return'asset';
    if(/commerce|ecommerce|retail|product sales|store|inventory/.test(text))return'commerce';
    return'generic';
  };
  window.nextActionFor=function(c){
    const f=fatalAssumption(c?.id);if(!f)return'Define the first critical assumptions.';
    const running=state.experiments.find(x=>x.concept_id===c.id&&x.assumption_id===f.id&&['planned','active'].includes(x.status));
    return running?`Complete experiment: ${running.hypothesis}`:`Test: ${f.title}`;
  };

  window.seedAssumptions=function(model){
    const common=[
      ['Customers experience the stated problem strongly enough to change behavior.','Problem',5],
      ['The target customer is specific enough to identify and reach.','Customer',5],
      ['The proposed solution creates materially better utility than the current alternative.','Solution',5],
      ['Customers will make the required behavior or workflow change.','Behavior',5],
      ['The target customer segment can be reached economically.','Distribution',5],
      ['The economics can support acquisition, delivery and overhead.','Economics',5],
      ['The operating model can deliver the promise reliably.','Operations',4],
      ['The required technology can be built and maintained at acceptable cost.','Technology',4],
      ['The concept can develop an advantage that survives imitation.','Defensibility',4],
      ['The business can operate without permanent founder dependency.','Leadership',4]
    ];
    const extra={
      saas:[['Customers will pay recurring subscription fees at the proposed price.','Economics',5],['Retention will support acceptable lifetime value and payback.','Retention',5]],
      platform:[['Free usage can convert into paid behavior at useful rates.','Economics',5],['User growth can create compounding platform or network value.','Network',5]],
      marketplace:[['Supply and demand can reach liquidity in the initial market.','Liquidity',5],['Transaction volume and take rate can support acquisition costs.','Economics',5]],
      service:[['Demand can be fulfilled with acceptable delivery capacity.','Operations',5],['Project margins remain attractive after labor, rework and overhead.','Economics',5]],
      licensing:[['Licensees will pay for reusable IP, data or access.','Economics',5],['Renewal or royalty behavior can create durable recurring value.','Retention',5]],
      asset:[['Asset utilization can reach the level required for acceptable payback.','Utilization',5],['Capital intensity does not suppress return on invested capital.','Capital',5]],
      commerce:[['Customers will buy at the proposed gross margin.','Economics',5],['Repeat purchase or efficient acquisition can support growth.','Retention',4]],
      generic:[['The value exchange can become economically self-sustaining.','Economics',5],['The operating model can scale without excessive complexity.','Operations',4]]
    };
    return [...common,...(extra[model]||extra.generic)];
  };

  window.redTeam=function(){
    const c=cv(),out=[],s=state.scorecards.find(x=>x.concept_id===c?.id)?.dimensions||{},i=c?.intake||{},fatal=fatalAssumption();
    if(!c)return[];
    if(!i.current_alternative)out.push({title:'Alternative not explicit',body:'If the current workaround is unclear, the proposed improvement cannot be judged against what customers already tolerate.'});
    if(!i.behavior_change)out.push({title:'Behavior change unknown',body:'Specify what customers must start, stop, switch, learn or trust. Adoption friction often hides here.'});
    if((s['Willingness to Pay']||3)<=2)out.push({title:'Monetization risk',body:'Do not infer willingness to pay from interest. Prioritize a commitment or transaction test before more product work.'});
    if((s['Distribution']||3)<=2)out.push({title:'Distribution risk',body:'A useful product without a repeatable customer-access path is not yet a durable business. Test acquisition before scope expansion.'});
    if((s['Unit Economics']||3)<=2)out.push({title:'Economic fragility',body:'Identify which single variable - price, acquisition cost, margin, utilization or retention - causes the model to break.'});
    if((s['Defensibility']||3)<=2)out.push({title:'Weak structural advantage',body:'Ask what remains valuable after competitors copy the visible product: data, workflow position, network effects, IP, brand, distribution or cost structure.'});
    if((s['Operator Fit']||3)<=2||['High','Critical'].includes(i.founder_dependency))out.push({title:'Founder dependency',body:'Separate a business that works from a business that works only while its architect personally drives execution.'});
    if(coverage()<30)out.push({title:'Evidence deficit',body:'Most current quality is modeled rather than observed. Treat Venture Strength as a hypothesis, not a conclusion.'});
    if(fatal&&Number(fatal.impact_if_false)>=5&&Number(fatal.confidence)<=2)out.push({title:'Fatal uncertainty',body:`The current highest-priority uncertainty is: ${fatal.title}`});
    const checks={
      saas:['Retention before scale','A subscription can acquire customers and still fail if retention does not support LTV/CAC. Test repeated usage and renewal behavior.'],
      platform:['Conversion and network value','Test whether activity compounds value and whether a useful paid path exists; user count alone is not proof.'],
      marketplace:['Marketplace liquidity','Validate both sides and time-to-match. Demand without supply - or supply without demand - does not establish liquidity.'],
      service:['Capacity and delivery burden','Stress-test labor, scheduling, quality control, rework and founder involvement before assuming revenue scales.'],
      licensing:['Renewal and proprietary value','Test whether licensees pay because the asset is uniquely valuable and whether that value survives renewal.'],
      asset:['Capital efficiency','Stress-test utilization, downtime, capex and payback under a failure scenario before scaling assets.'],
      commerce:['Repeat economics','Test gross margin after fulfillment and acquisition, then determine whether repeat purchase or contribution margin supports growth.'],
      generic:['Business vs. feature','Ask whether the concept has an independent value exchange, customer-access path and economics - or is better expressed as a feature inside another system.']
    };
    const mc=checks[c.model_type]||checks.generic;out.push({title:mc[0],body:mc[1]});
    return out.slice(0,8);
  };

  window.renderOverview=function(){
    const el=$('#overview');if(!cv()){el.innerHTML=noConcept();return}
    const c=cv(),a=list('assumptions').slice().sort((x,y)=>priority(y)-priority(x)),fatal=fatalAssumption(),days=estimateTestDays(fatal);
    el.innerHTML=hero('Venture Cockpit','Separate structural attractiveness from what reality has actually proven.')+
    `<div class="metrics"><div class="card metric"><span>Venture strength</span><b>${scoreDims(c)}</b></div><div class="card metric"><span>Evidence-adjusted</span><b>${adjustedScore()}</b></div><div class="card metric"><span>Venture uncertainty</span><b>${uncertainty()}%</b></div><div class="card metric"><span>Decision state</span><b class="state-label">${esc(decisionState())}</b></div></div>
    <div class="evalband"><div class="card"><div class="row"><h2>Most dangerous assumption</h2>${fatal?pill(fatal.status):''}</div>${fatal?`<div class="assumption"><div class="score">${priority(fatal)}</div><div><b>${esc(fatal.title)}</b><div class="muted small">${esc(fatal.category)} - impact ${fatal.impact_if_false}/5 - confidence ${fatal.confidence}/5 - ${fatal.evidence_level}</div></div></div><div class="alert">Cheapest next move: test this assumption before adding scope${days?` - estimated evidence window ${days} days`:''}.</div>`:'<div class="empty">No assumptions yet.</div>'}</div>
    <div class="card"><h2>Current decision logic</h2><div class="logic"><div class="rowline"><span class="muted">Evidence coverage</span><b>${coverage()}%</b></div><div class="rowline"><span class="muted">Capital requirement</span><b>${esc(c.intake?.capital_requirement||'Not defined')}</b></div><div class="rowline"><span class="muted">Next action</span><b>${esc(nextActionFor(c))}</b></div></div></div></div>
    <div class="grid"><div class="card"><h2>Priority uncertainties</h2><div class="stack">${a.length?a.slice(0,6).map(renderAssumption).join(''):'<div class="empty">No assumptions yet.</div>'}</div></div><div class="card"><h2>Concept thesis</h2><p><b>${esc(c.one_liner||'-')}</b></p><p class="muted">${esc(c.problem||'Define the problem in Concept Intake.')}</p><div class="alert">Venture Strength describes the model. Evidence-adjusted strength discounts it until observed behavior supports the assumptions.</div></div></div>`;
  };

  window.renderPortfolio=function(){
    const el=$('#portfolio');
    el.innerHTML=hero('Portfolio Comparison','Compare concepts on structure, proof, uncertainty, capital and validation burden - not on a single vanity score.')+
    `<div class="card"><div class="row"><h2>Concepts</h2><button class="btn" onclick="openConcept()">New concept</button></div>${state.concepts.length?`<div class="tablewrap"><table class="ptable"><thead><tr><th>Concept</th><th>Archetype</th><th>Strength</th><th>Evidence-adjusted</th><th>Uncertainty</th><th>Evidence</th><th>Capital</th><th>Founder dep.</th><th>Validation window</th><th>State</th><th>Critical uncertainty</th><th></th></tr></thead><tbody>${state.concepts.map(c=>{const f=fatalAssumption(c.id);return`<tr><td><b>${esc(c.name)}</b><div class="muted small">${esc(c.type)}</div></td><td>${esc(MODEL_LABELS[c.model_type]||c.model_type)}</td><td><b>${scoreDims(c)}</b></td><td>${adjustedFor(c)}</td><td>${uncertaintyFor(c.id)}%</td><td>${coverageFor(c.id)}%</td><td>${esc(c.intake?.capital_requirement||'-')}</td><td>${esc(c.intake?.founder_dependency||'-')}</td><td>${f?estimateTestDays(f)+' days':'-'}</td><td><b>${esc(decisionStateFor(c))}</b></td><td>${esc(f?.title||'Define assumptions')}</td><td><button class="btn secondary" onclick="chooseConcept('${c.id}')">Open</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">No concepts yet.</div>'}</div>`;
  };

  window.renderArchitecture=function(){
    const c=cv(),el=$('#architecture');if(!c){el.innerHTML=noConcept();return}
    const intake=c.intake||{},suggested=inferModel({...c,...intake});
    const fields=[['current_alternative','Current alternative','How is the customer solving this today?'],['behavior_change','Behavior change required','What must the customer start, stop, or switch?'],['buyer_user','Buyer vs. user','Who buys it, and who actually uses it?'],['switching_cost','Switching friction','What makes adoption difficult?'],['operational_burden','Operational burden','What must happen behind the scenes to deliver reliably?'],['technology_dependency','Technology dependency','What technical capability must work?'],['capital_path','Capital path','What must be funded before revenue or evidence appears?'],['time_to_evidence','Fastest real-world proof','What can be tested before building the full product?']];
    el.innerHTML=hero('Concept Intake','Make the business architecture explicit before judging or simulating it.')+
    `<div class="grid"><div class="card"><form class="form" id="archForm"><div class="two"><label>Name<input name="name" value="${esc(c.name)}"></label><label>Economic archetype<select name="model_type">${Object.entries(MODEL_LABELS).map(([k,v])=>`<option value="${k}" ${k===c.model_type?'selected':''}>${v}</option>`).join('')}</select></label></div><div class="intake-note"><b>VS archetype suggestion:</b> ${esc(MODEL_LABELS[suggested]||suggested)}. This is a modeling suggestion, not evidence.</div>${[['one_liner','One-line thesis'],['problem','Problem / pain'],['customer','Target customer'],['solution','Proposed solution'],['business_model','Revenue mechanism'],['distribution','Distribution path'],['advantage','Advantage / defensibility'],['why_now','Why now?'],['objective','Current validation objective']].map(([n,l])=>`<label>${l}<textarea name="${n}">${esc(c[n])}</textarea></label>`).join('')}<h2 style="margin-bottom:0">Behavior & execution</h2>${fields.map(([n,l,p])=>`<label>${l}<textarea name="intake_${n}" placeholder="${esc(p)}">${esc(intake[n]||'')}</textarea></label>`).join('')}<div class="two"><label>Capital requirement<select name="intake_capital_requirement">${['Low','Moderate','High','Very High'].map(x=>`<option ${x===(intake.capital_requirement||'Moderate')?'selected':''}>${x}</option>`).join('')}</select></label><label>Founder dependency<select name="intake_founder_dependency">${['Low','Moderate','High','Critical'].map(x=>`<option ${x===(intake.founder_dependency||'Moderate')?'selected':''}>${x}</option>`).join('')}</select></label></div><button class="btn">Save concept architecture</button></form></div><div class="card"><h2>Architecture completeness</h2>${[['Problem',c.problem],['Customer',c.customer],['Alternative',intake.current_alternative],['Solution',c.solution],['Revenue',c.business_model],['Distribution',c.distribution],['Behavior change',intake.behavior_change],['Advantage',c.advantage],['Why now',c.why_now]].map(([l,v])=>`<div class="list row"><span>${l}</span>${v?'<span class="pill validated">defined</span>':'<span class="pill testing">missing</span>'}</div>`).join('')}<div class="alert">Missing architecture fields increase uncertainty; they do not automatically become negative evidence.</div></div></div>`;
    $('#archForm').onsubmit=saveArchitecture;
  };

  window.renderScorecard=function(){
    const c=cv(),el=$('#scorecard');if(!c){el.innerHTML=noConcept();return}
    const sc=state.scorecards.find(x=>x.concept_id===c.id)?.dimensions||{},fatal=fatalAssumption();
    el.innerHTML=hero('Business Concept Evaluation','Judge structural quality independently from proof, then direct testing toward the most consequential uncertainty.')+
    `<div class="metrics"><div class="card metric"><span>Venture strength</span><b>${scoreDims(c)}</b></div><div class="card metric"><span>Evidence-adjusted</span><b>${adjustedScore()}</b></div><div class="card metric"><span>Venture uncertainty</span><b>${uncertainty()}%</b></div><div class="card metric"><span>Decision state</span><b class="state-label">${esc(decisionState())}</b></div></div><div class="card"><div class="row"><h2>12-factor structural model</h2><span class="pill">Modeled judgment</span></div><form id="scoreForm"><div class="scoregrid">${DIMENSIONS.map(d=>`<div class="scorebox"><label>${d}<span>${Number(sc[d]||3)}/5</span></label><input name="${esc(d)}" type="range" min="1" max="5" step="1" value="${Number(sc[d]||3)}" oninput="this.previousElementSibling.lastElementChild.textContent=this.value+'/5'"></div>`).join('')}</div><button class="btn" style="margin-top:12px">Save evaluation</button></form></div><div class="grid" style="margin-top:14px"><div class="card"><h2>Fatal-assumption engine</h2>${fatal?`<div class="assumption"><div class="score">${priority(fatal)}</div><div><b>${esc(fatal.title)}</b><div class="muted small">Impact ${fatal.impact_if_false}/5 - confidence ${fatal.confidence}/5 - evidence ${fatal.evidence_level} - test cost ${fatal.test_cost}/5</div></div>${pill(fatal.status)}</div><div class="alert">Estimated fastest evidence window: ${estimateTestDays(fatal)} days. Priority rises when consequence and uncertainty are high and test cost is low.</div>`:'<div class="empty">No assumptions yet.</div>'}</div><div class="card"><h2>Red Team</h2><div class="rt">${redTeam().map(x=>`<div class="item"><b>${esc(x.title)}</b><div class="muted">${esc(x.body)}</div></div>`).join('')}</div></div></div>`;
    $('#scoreForm').onsubmit=saveScorecard;
  };

  window.simulate=function(inp,model,mult=1){
    let units=Number(inp.units||0),revenue=0,profit=0;const months=12;
    for(let m=0;m<months;m++){
      const growth=Number(inp.growth||0)/100*mult,churn=Number(inp.churn||0)/100*Math.max(.4,2-mult);
      units=Math.max(0,units*(1-churn)+(Number(inp.units||0)*growth));
      let gross=units*Number(inp.price||0);
      if(model==='platform')gross=units*(Number(inp.conversion||4)/100)*Number(inp.price||0);
      if(model==='marketplace')gross=units*Number(inp.price||0)*(Number(inp.take||12)/100);
      if(model==='asset')gross=units*(Number(inp.util||65)/100)*Number(inp.price||0);
      const gp=gross*(1-Number(inp.variable||0)/100),acquisition=Number(inp.units||0)*growth*Number(inp.cac||0),op=gp-acquisition-Number(inp.fixed||0);
      revenue+=gross;profit+=op;
    }
    const capex=model==='asset'?Number(inp.capex||0):0;
    return{ending_units:+units.toFixed(1),annual_revenue:Math.round(revenue),annual_operating_profit:Math.round(profit),annual_cash_after_capex:Math.round(profit-capex),monthly_run_rate:Math.round(revenue/12)};
  };
  window.sensitivityAnalysis=function(inp,model){
    const outcome=x=>{const r=simulate(x,model,1);return model==='asset'?r.annual_cash_after_capex:r.annual_operating_profit};
    const base=outcome(inp),keys=['price','growth','churn','cac','variable','fixed',...(model==='marketplace'?['take']:[]),...(model==='platform'?['conversion']:[]),...(model==='asset'?['util','capex']:[])];
    return keys.filter(k=>inp[k]!==undefined&&Number(inp[k])!==0).map(k=>{const low={...inp,[k]:Number(inp[k])*.8},high={...inp,[k]:Number(inp[k])*1.2};const lo=outcome(low),hi=outcome(high);return{key:k,swing:Math.max(Math.abs(lo-base),Math.abs(hi-base)),low:lo,high:hi}}).sort((a,b)=>b.swing-a.swing);
  };
  function metricLabel(k){return({price:'Revenue per unit',growth:'Growth',churn:'Churn / attrition',cac:'Acquisition cost',variable:'Variable cost',fixed:'Fixed cost',take:'Take rate',conversion:'Paid conversion',util:'Utilization',capex:'Capex'})[k]||k}
  window.scenarioCards=function(o){return `<div class="scenario">${['failure','conservative','base','upside'].map(k=>`<div class="card"><span class="pill ${k==='failure'?'invalidated':''}">${k}</span><p class="muted small">Annual revenue</p><b>$${Number(o[k]?.annual_revenue||0).toLocaleString()}</b><p class="muted small">Operating profit<br><b style="font-size:16px">$${Number(o[k]?.annual_operating_profit||0).toLocaleString()}</b></p></div>`).join('')}</div>`};
  window.renderSimulator=function(){
    const c=cv(),el=$('#simulator');if(!c){el.innerHTML=noConcept();return}
    const d=simDefaults(c.model_type),last=list('simulations')[0],sens=last?sensitivityAnalysis(last.inputs,c.model_type):[];
    el.innerHTML=hero('Economic Stress Test','Model Failure, Conservative, Base and Upside cases. Simulation remains explicitly non-evidentiary.')+
    `<div class="grid"><div class="card"><h2>${esc(MODEL_LABELS[c.model_type]||c.model_type)} inputs</h2><form class="form" id="simForm"><div class="two"><label>Starting units<input name="units" type="number" value="${d.units}"></label><label>Monthly growth %<input name="growth" type="number" step=".1" value="${d.growth}"></label></div><div class="two"><label>Revenue per unit / transaction<input name="price" type="number" step=".01" value="${d.price}"></label><label>Variable cost %<input name="variable" type="number" step=".1" value="${d.variable}"></label></div><div class="two"><label>Monthly churn / attrition %<input name="churn" type="number" step=".1" value="${d.churn}"></label><label>Acquisition cost<input name="cac" type="number" step=".01" value="${d.cac}"></label></div><label>Fixed monthly cost<input name="fixed" type="number" step=".01" value="${d.fixed}"></label>${c.model_type==='marketplace'?`<label>Take rate %<input name="take" type="number" step=".1" value="${d.take}"></label>`:''}${c.model_type==='platform'?`<label>Paid conversion %<input name="conversion" type="number" step=".1" value="${d.conversion}"></label>`:''}${c.model_type==='asset'?`<div class="two"><label>Utilization %<input name="util" type="number" step=".1" value="${d.util}"></label><label>Initial capex<input name="capex" type="number" value="${d.capex}"></label></div>`:''}<button class="btn">Run economic stress test</button></form></div><div class="card"><h2>Latest scenarios</h2><div id="simResults">${last?scenarioCards(last.outputs):'<div class="empty">Run the simulator. Results are stored as simulation records, never evidence.</div>'}</div></div></div><div class="card" style="margin-top:14px"><div class="row"><h2>Sensitivity analysis</h2><span class="pill">+/-20% input stress</span></div>${sens.length?`<div class="sensitivity">${sens.slice(0,6).map(x=>`<div class="sensrow"><b>${esc(metricLabel(x.key))}</b><div class="sensbar"><i style="width:${Math.max(8,Math.round(x.swing/(sens[0]?.swing||1)*100))}%"></i></div><span class="muted small">$${Math.round(x.swing).toLocaleString()} swing</span></div>`).join('')}</div><div class="alert">The model is currently most sensitive to <b>${esc(metricLabel(sens[0].key))}</b>. Sensitivity identifies leverage in the model; it does not validate the input.</div>`:'<div class="empty">Run a scenario to calculate economic sensitivity.</div>'}</div>`;
    $('#simForm').onsubmit=runSimulation;
  };
  window.runSimulation=async function(e){
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target));Object.keys(f).forEach(k=>f[k]=Number(f[k]));
    const outputs={failure:simulate(f,cv().model_type,.25),conservative:simulate(f,cv().model_type,.65),base:simulate(f,cv().model_type,1),upside:simulate(f,cv().model_type,1.45)};
    const [x]=await rest('vs_simulation_runs',{method:'POST',body:{concept_id:current,owner_id:user.id,model_type:cv().model_type,scenario:'custom',inputs:f,outputs,is_evidence:false}});
    state.simulations.unshift(x);renderSimulator();
  };

  window.currentDecisionMemo=function(){
    const c=cv(),fatal=fatalAssumption(),stateLabel=decisionState();
    return{state:stateLabel,strength:scoreDims(c),adjusted:adjustedScore(),uncertainty:uncertainty(),coverage:coverage(),capital:c?.intake?.capital_requirement||'Not defined',fatal:fatal?.title||'No critical assumption defined',nextAction:nextActionFor(c),rationale:`Current structural strength is ${scoreDims(c)}/100 with ${coverage()}% evidence coverage and ${uncertainty()}% venture uncertainty. ${fatal?`The highest-priority uncertainty is "${fatal.title}".`:'Critical assumptions still need to be defined.'}`,reviewCondition:fatal?`Review after new evidence materially changes "${fatal.title}" or its evidence level.`:'Review after critical assumptions and first observed evidence are recorded.'};
  };
  window.renderDecisions=function(){
    const el=$('#decisions');if(!cv()){el.innerHTML=noConcept();return}const d=list('decisions'),m=currentDecisionMemo();
    el.innerHTML=hero('Decision Memo','Convert the current model and evidence state into an explicit institutional decision - not a generic score.')+
    `<div class="grid"><div class="card"><div class="row"><h2>Current VS memo</h2><span class="pill">${esc(m.state)}</span></div><div class="memo"><div class="line"><span class="muted">Venture strength</span><b>${m.strength}/100</b></div><div class="line"><span class="muted">Evidence-adjusted</span><b>${m.adjusted}/100</b></div><div class="line"><span class="muted">Uncertainty</span><b>${m.uncertainty}%</b></div><div class="line"><span class="muted">Evidence coverage</span><b>${m.coverage}%</b></div><div class="line"><span class="muted">Capital</span><b>${esc(m.capital)}</b></div><div class="line"><span class="muted">Most dangerous assumption</span><b>${esc(m.fatal)}</b></div><div class="line"><span class="muted">Next action</span><b>${esc(m.nextAction)}</b></div></div><div class="alert">${esc(m.rationale)}</div><button class="btn" id="recordMemo">Record this memo as a decision</button></div><div class="card"><h2>Decision history</h2>${d.length?d.map(x=>`<div class="list"><b>${esc(x.title)}</b><div>${esc(x.decision)}</div><div class="muted small">${esc(x.rationale)}</div></div>`).join(''):'<div class="empty">No institutional decisions yet.</div>'}</div></div><div class="card" style="margin-top:14px"><h2>Manual decision</h2><form class="form" id="decisionForm"><label>Title<input name="title" required></label><label>Decision<textarea name="decision" required></textarea></label><label>Rationale<textarea name="rationale"></textarea></label><label>Review condition<input name="review_condition"></label><button class="btn">Record decision</button></form></div>`;
    $('#decisionForm').onsubmit=addDecision;$('#recordMemo').onclick=recordDecisionMemo;
  };
  window.recordDecisionMemo=async function(){
    const m=currentDecisionMemo();const [d]=await rest('vs_decisions',{method:'POST',body:{concept_id:current,owner_id:user.id,title:`VS evaluation - ${m.state}`,decision:`${m.state}: ${m.nextAction}`,rationale:m.rationale,review_condition:m.reviewCondition,decision_owner:'Metatility'}});
    await event('decision.made','decision',d.id,current,{});await loadState();show('decisions');
  };

  window.createConcept=async function(e){
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
    try{
      const model=f.model_type==='auto'?inferModel(f):f.model_type;
      const intake={current_alternative:f.current_alternative||'',behavior_change:f.behavior_change||'',capital_requirement:f.capital_requirement||'Moderate',founder_dependency:f.founder_dependency||'Moderate'};
      const [concept]=await rest('vs_concepts',{method:'POST',body:{owner_id:user.id,name:f.name,type:f.type,model_type:model,one_liner:f.one_liner,customer:f.customer,problem:f.problem,solution:f.solution,business_model:f.business_model||'',distribution:f.distribution||'',intake,unit_label:model==='marketplace'?'transaction':model==='service'?'project':model==='licensing'?'license':'unit'}});
      current=concept.id;const dims=Object.fromEntries(DIMENSIONS.map(d=>[d,3]));
      await rest('vs_scorecards',{method:'POST',body:{concept_id:concept.id,owner_id:user.id,dimensions:dims}});
      const seed=seedAssumptions(model).map(([title,category,impact])=>({concept_id:concept.id,owner_id:user.id,title,category,impact_if_false:impact,confidence:1,test_cost:2,evidence_level:'E0',status:'unknown'}));
      await rest('vs_assumptions',{method:'POST',body:seed});await event('concept.created','concept',concept.id,concept.id,{});
      closeConcept();e.target.reset();await loadState();show('overview');
    }catch(err){alert(err.message)}
  };
  window.saveArchitecture=async function(e){
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),intake={...(cv().intake||{})};
    Object.keys(f).filter(k=>k.startsWith('intake_')).forEach(k=>{intake[k.slice(7)]=f[k];delete f[k]});
    const model=f.model_type;await rest('vs_concepts',{method:'PATCH',query:`id=eq.${current}`,body:{...f,intake,unit_label:model==='marketplace'?'transaction':model==='service'?'project':model==='licensing'?'license':'unit',updated_at:new Date().toISOString()}});
    try{await event('concept.updated','concept',current,current,{})}catch(err){console.warn('concept update event deferred',err)}
    await loadState();show('architecture');
  };

  function installConceptModal(){
    const modal=$('#conceptModal');if(!modal)return;
    modal.innerHTML=`<div class="modalbox"><div class="modalhead"><div><h2 style="margin:0">New concept</h2><div class="muted small">Frame the business before judging it.</div></div><button class="x" id="closeConcept">x</button></div><form class="form" id="conceptForm"><div class="two"><label>Name<input name="name" required placeholder="e.g. TradeCasa Pro Network"></label><label>Concept type<select name="type"><option>Business</option><option>Platform</option><option>Product</option><option>Marketplace</option><option>Service</option><option>Infrastructure</option><option>Data / Intelligence</option><option>Licensing</option><option>Commerce</option></select></label></div><label>Economic archetype<select name="model_type"><option value="auto">Auto-detect from concept</option><option value="saas">SaaS / Subscription</option><option value="platform">Platform / Freemium</option><option value="marketplace">Marketplace</option><option value="service">Service Business</option><option value="licensing">Licensing / Royalty</option><option value="asset">Asset-Heavy / Infrastructure</option><option value="commerce">Commerce / Product Sales</option><option value="generic">Generic / Hybrid</option></select></label><label>One-line thesis<input name="one_liner" required placeholder="What is the concept in one sentence?"></label><div class="two"><label>Target customer<input name="customer" required placeholder="Who has the problem?"></label><label>Problem<input name="problem" required placeholder="What painful problem exists?"></label></div><label>Current alternative<input name="current_alternative" placeholder="How is the problem solved today?"></label><label>Solution<textarea name="solution" required placeholder="What changes for the customer?"></textarea></label><div class="two"><label>Revenue mechanism<input name="business_model" placeholder="Subscription, transaction fee, project fee, license..."></label><label>Distribution path<input name="distribution" placeholder="How will customers be reached?"></label></div><label>Behavior change required<input name="behavior_change" placeholder="What must the customer start, stop, or switch?"></label><div class="two"><label>Capital requirement<select name="capital_requirement"><option>Low</option><option selected>Moderate</option><option>High</option><option>Very High</option></select></label><label>Founder dependency<select name="founder_dependency"><option>Low</option><option selected>Moderate</option><option>High</option><option>Critical</option></select></label></div><button class="btn">Create and evaluate concept</button></form></div>`;
    $('#closeConcept').onclick=closeConcept;$('#conceptForm').onsubmit=createConcept;
  }

  function install(){
    installStyles();installNavigation();installConceptModal();
    if(user&&state){try{renderAll()}catch(err){console.warn('v0.7 render deferred',err)}}
  }

  install();
})();
