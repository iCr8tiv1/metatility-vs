import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3100);
const STORE = process.env.VS_STORE_PATH || join(tmpdir(), 'metatility-vs-store.json');
const ROOT = new URL('.', import.meta.url);

const EVIDENCE = {
  E0: { score: 0, label: 'Founder opinion' }, E1: { score: 1, label: 'Secondary research' },
  E2: { score: 2, label: 'Customer statement' }, E3: { score: 3, label: 'Behavioral intent' },
  E4: { score: 4, label: 'Commitment' }, E5: { score: 5, label: 'Transaction' },
  E6: { score: 6, label: 'Repeated behavior' }
};
const seed = {
  ventures:[{id:'venture_nolvant',name:'NOLVANT',stage:'Validation / Build',status:'Active',problem:'Manufacturer and dealer product information, quoting, ordering, and commercial workflows are fragmented.',customer:'Manufacturers and authorized dealers',thesis:'A structured product-commerce operating layer can reduce friction across manufacturer → dealer → customer workflows.',objective:'Remove the highest-consequence uncertainties before scaling product scope.'}],
  assumptions:[
    ['a1','Dealers will pay for recurring access to NOLVANT.','Economics',5,1,2,'E0'],['a2','Manufacturers will provide current structured product data.','Supply',5,2,2,'E1'],['a3','Dealers experience enough product-information friction to change behavior.','Problem',5,2,1,'E1'],['a4','Dealers want quoting and ordering inside the same product environment.','Behavior',4,2,2,'E0'],['a5','AI can materially reduce product-data maintenance labor.','Technology',3,3,2,'E1'],['a6','A manufacturer-funded revenue stream can complement dealer revenue.','Economics',4,1,3,'E0'],['a7','Dealer onboarding can be completed without high-touch implementation.','Operations',4,2,2,'E0'],['a8','The system can support global dealers without breaking the core data model.','Scalability',3,3,3,'E1']
  ].map(([id,title,category,impactIfFalse,confidence,testCost,evidenceLevel])=>({id,ventureId:'venture_nolvant',title,category,impactIfFalse,confidence,testCost,evidenceLevel,status:'unknown'})),
  experiments:[],evidence:[],decisions:[],events:[]
};
const uid=p=>`${p}_${crypto.randomUUID().slice(0,8)}`;
async function ensureStore(){if(!existsSync(STORE))await writeFile(STORE,JSON.stringify(seed,null,2));}
async function load(){await ensureStore();return JSON.parse(await readFile(STORE,'utf8'));}
async function save(s){await writeFile(STORE,JSON.stringify(s,null,2));}
const priority=a=>Math.round(((a.impactIfFalse*(6-a.confidence))/Math.max(1,a.testCost))*10)/10;
const institutionalEvent=(type,entityType,entityId,payload)=>({id:uid('evt'),schemaVersion:'1.0',sourceSystem:'metatility-vs',type,entityType,entityId,occurredAt:new Date().toISOString(),payload});
function deriveStatus(current,e){const n=EVIDENCE[e.level]?.score??0;if(e.direction==='supports'&&n>=5)return'validated';if(e.direction==='supports'&&n>=3)return'supported';if(e.direction==='contradicts'&&n>=5)return'invalidated';if(e.direction==='contradicts'&&n>=3)return'contradicted';return current==='unknown'?'testing':current;}
function ventureView(s,v){const assumptions=s.assumptions.filter(x=>x.ventureId===v.id).map(x=>({...x,priority:priority(x)})).sort((a,b)=>b.priority-a.priority);const evidence=s.evidence.filter(x=>x.ventureId===v.id),experiments=s.experiments.filter(x=>x.ventureId===v.id),decisions=s.decisions.filter(x=>x.ventureId===v.id);const validated=assumptions.filter(x=>x.status==='validated').length;const avg=assumptions.length?assumptions.reduce((n,x)=>n+Number(x.confidence||0),0)/assumptions.length:0;return{venture:v,assumptions,evidence,experiments,decisions,metrics:{validated,uncertaintyIndex:Math.round(100-(avg/5)*100),activeExperiments:experiments.filter(x=>x.status!=='completed').length}};}
function simulate(input){const months=Math.max(1,Math.min(60,Number(input.months||12)));const price=Number(input.monthlyPrice||300),newCustomers=Number(input.newCustomersPerMonth||10),churn=Number(input.monthlyChurnPct||2)/100,cac=Number(input.cac||500),fixed=Number(input.fixedMonthlyCost||5000),gm=Number(input.grossMarginPct||80)/100;let customers=Number(input.startingCustomers||0);const rows=[];for(let month=1;month<=months;month++){customers=Math.max(0,customers*(1-churn)+newCustomers);const mrr=customers*price,grossProfit=mrr*gm,acquisition=newCustomers*cac,operatingProfit=grossProfit-acquisition-fixed;rows.push({month,customers:+customers.toFixed(1),mrr:+mrr.toFixed(0),operatingProfit:+operatingProfit.toFixed(0)});}return{kind:'simulation',warning:'Illustrative model only. This is not observed evidence.',rows,summary:{endingCustomers:rows.at(-1).customers,endingMrr:rows.at(-1).mrr,endingOperatingProfit:rows.at(-1).operatingProfit}};}
const sendJson=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
async function parseBody(req){const chunks=[];for await(const c of req)chunks.push(c);const t=Buffer.concat(chunks).toString('utf8');return t?JSON.parse(t):{};}
async function api(req,res,url){const s=await load();
  if(req.method==='GET'&&url.pathname==='/api/state')return sendJson(res,200,{ventures:s.ventures.map(v=>ventureView(s,v)),evidenceLevels:EVIDENCE});
  if(req.method==='GET'&&url.pathname==='/api/is-feed')return sendJson(res,200,{schemaVersion:'1.0',sourceSystem:'metatility-vs',events:s.events});
  if(req.method==='GET'&&url.pathname==='/api/is-feed.ndjson'){res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store'});return res.end(s.events.map(x=>JSON.stringify(x)).join('\n')+(s.events.length?'\n':''));}
  if(req.method==='POST'&&url.pathname==='/api/experiments'){const x=await parseBody(req);if(!x.assumptionId||!x.hypothesis||!x.method)return sendJson(res,400,{error:'assumptionId, hypothesis, and method are required.'});const exp={id:uid('exp'),ventureId:x.ventureId||'venture_nolvant',assumptionId:x.assumptionId,hypothesis:x.hypothesis,method:x.method,successCondition:x.successCondition||'',budget:Number(x.budget||0),status:'planned',createdAt:new Date().toISOString()};s.experiments.push(exp);const a=s.assumptions.find(a=>a.id===exp.assumptionId);if(a&&a.status==='unknown')a.status='testing';s.events.push(institutionalEvent('experiment.created','experiment',exp.id,exp));await save(s);return sendJson(res,201,exp);}
  if(req.method==='POST'&&url.pathname==='/api/evidence'){const x=await parseBody(req);if(!x.assumptionId||!EVIDENCE[x.level]||!x.summary)return sendJson(res,400,{error:'assumptionId, valid evidence level, and summary are required.'});const e={id:uid('evi'),ventureId:x.ventureId||'venture_nolvant',assumptionId:x.assumptionId,experimentId:x.experimentId||null,level:x.level,direction:x.direction||'neutral',summary:x.summary,source:x.source||'Manual entry',observedAt:x.observedAt||new Date().toISOString(),createdAt:new Date().toISOString()};s.evidence.push(e);const a=s.assumptions.find(a=>a.id===e.assumptionId);if(a){a.status=deriveStatus(a.status,e);if(EVIDENCE[e.level].score>=(EVIDENCE[a.evidenceLevel]?.score??0))a.evidenceLevel=e.level;if(e.direction==='supports')a.confidence=Math.min(5,Math.max(a.confidence,Math.ceil((EVIDENCE[e.level].score+1)/1.4)));if(e.direction==='contradicts')a.confidence=Math.max(1,a.confidence-1);}if(e.experimentId){const exp=s.experiments.find(v=>v.id===e.experimentId);if(exp)exp.status='completed';}s.events.push(institutionalEvent('evidence.recorded','evidence',e.id,e));if(a)s.events.push(institutionalEvent('assumption.status_changed','assumption',a.id,{status:a.status,confidence:a.confidence,evidenceLevel:a.evidenceLevel}));await save(s);return sendJson(res,201,{evidence:e,assumption:a});}
  if(req.method==='POST'&&url.pathname==='/api/decisions'){const x=await parseBody(req);if(!x.title||!x.decision)return sendJson(res,400,{error:'title and decision are required.'});const d={id:uid('dec'),ventureId:x.ventureId||'venture_nolvant',title:x.title,decision:x.decision,rationale:x.rationale||'',evidenceIds:x.evidenceIds||[],assumptionIds:x.assumptionIds||[],reviewCondition:x.reviewCondition||'',owner:x.owner||'Metatility',createdAt:new Date().toISOString()};s.decisions.push(d);s.events.push(institutionalEvent('decision.made','decision',d.id,d));await save(s);return sendJson(res,201,d);}
  if(req.method==='POST'&&url.pathname==='/api/simulate')return sendJson(res,200,simulate(await parseBody(req)));
  if(req.method==='POST'&&url.pathname==='/api/reset'){await writeFile(STORE,JSON.stringify(seed,null,2));return sendJson(res,200,{ok:true});}
  return sendJson(res,404,{error:'Not found'});
}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url);if(url.pathname==='/health')return sendJson(res,200,{ok:true,system:'metatility-vs',version:'0.1.0'});if(url.pathname==='/'){const html=await readFile(new URL('./public/index.html',ROOT));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html);}res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');}catch(err){sendJson(res,500,{error:err instanceof Error?err.message:'Internal error'});}});
server.listen(PORT,'0.0.0.0',()=>console.log(`Metatility VS listening on ${PORT}`));
