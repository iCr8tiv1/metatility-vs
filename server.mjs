import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3100);
const STORE = process.env.VS_STORE_PATH || join(tmpdir(), 'metatility-vs-store.json');
const ROOT = new URL('.', import.meta.url);
const uid = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

const EVIDENCE = {
  E0: { score: 0, factor: 0.10, label: 'Founder opinion' },
  E1: { score: 1, factor: 0.25, label: 'Secondary research' },
  E2: { score: 2, factor: 0.40, label: 'Customer statement' },
  E3: { score: 3, factor: 0.55, label: 'Behavioral intent' },
  E4: { score: 4, factor: 0.70, label: 'Commitment' },
  E5: { score: 5, factor: 0.85, label: 'Transaction' },
  E6: { score: 6, factor: 1.00, label: 'Repeated behavior' }
};

const SCORE_DIMENSIONS = [
  ['problem', 'Problem severity', 12, 'How painful, frequent, costly, or consequential is the problem?'],
  ['customer', 'Customer clarity', 7, 'Can you identify the buyer/user precisely?'],
  ['utility', 'Utility', 10, 'Does the concept create materially useful outcomes?'],
  ['function', 'Function', 8, 'Can it reliably perform the job it exists to do?'],
  ['aesthetics', 'Aesthetics / coherence', 5, 'Is the experience, brand, and system coherent enough to earn attention and trust?'],
  ['market', 'Market opportunity', 10, 'Is there enough reachable demand to support the ambition?'],
  ['willingness', 'Willingness to pay', 12, 'Will the economic buyer exchange real value for the outcome?'],
  ['distribution', 'Distribution', 10, 'Can customers be reached repeatedly at acceptable cost?'],
  ['economics', 'Unit economics', 10, 'Can revenue, margin, retention, and acquisition economics work together?'],
  ['defensibility', 'Defensibility', 6, 'Does advantage compound through data, network, workflow, IP, brand, or switching cost?'],
  ['feasibility', 'Feasibility', 5, 'Can the concept be built and delivered with available technology, capital, and constraints?'],
  ['operator', 'Operator fit', 5, 'Can the right operator/team execute this model consistently?']
].map(([key, label, weight, principle]) => ({ key, label, weight, principle }));

const defaultScores = () => Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d.key, { score: 3, evidenceLevel: 'E0', note: '' }]));

const demoConcept = {
  id: 'concept_demo',
  name: 'Sample Platform Concept',
  type: 'Platform',
  stage: 'Idea / Thesis',
  status: 'Exploring',
  oneLiner: 'A demonstration concept used to test Metatility VS.',
  problem: 'A fragmented workflow creates avoidable time, cost, and information loss.',
  customer: 'A clearly defined professional or business user.',
  solution: 'A focused platform that consolidates the highest-value workflow.',
  businessModel: 'Recurring subscription with optional transaction revenue.',
  distribution: 'Direct outreach, partnerships, and workflow-driven referrals.',
  advantage: 'Structured data, embedded workflow, and accumulated institutional learning.',
  whyNow: 'Technology and buyer behavior make the workflow easier to consolidate than before.',
  objective: 'Determine whether the concept deserves additional time, capital, and operator attention.',
  unitLabel: 'customer',
  createdAt: new Date().toISOString()
};

const seed = {
  concepts: [demoConcept],
  scorecards: [{ conceptId: demoConcept.id, dimensions: defaultScores(), updatedAt: new Date().toISOString() }],
  assumptions: [
    ['a1', 'The target customer experiences the problem frequently enough to change behavior.', 'Problem', 5, 1, 1, 'E0'],
    ['a2', 'The buyer will pay enough to support attractive unit economics.', 'Economics', 5, 1, 2, 'E0'],
    ['a3', 'The concept can reach qualified customers through a repeatable channel.', 'Distribution', 5, 1, 2, 'E0'],
    ['a4', 'The proposed solution is materially better than current alternatives or doing nothing.', 'Solution', 4, 1, 2, 'E0'],
    ['a5', 'The concept can be delivered without operational complexity overwhelming gross margin.', 'Operations', 4, 2, 2, 'E1']
  ].map(([id, title, category, impactIfFalse, confidence, testCost, evidenceLevel]) => ({
    id, conceptId: demoConcept.id, title, category, impactIfFalse, confidence, testCost, evidenceLevel, status: 'unknown'
  })),
  experiments: [],
  evidence: [],
  decisions: [],
  events: []
};

async function ensureStore() {
  if (!existsSync(STORE)) await writeFile(STORE, JSON.stringify(seed, null, 2));
}
async function load() {
  await ensureStore();
  const s = JSON.parse(await readFile(STORE, 'utf8'));
  // v0.1 migration: convert ventures to concepts if an old preview store exists.
  if (!s.concepts && s.ventures) {
    s.concepts = s.ventures.map((v) => ({ ...v, id: v.id.replace('venture_', 'concept_'), type: 'Business', unitLabel: 'customer' }));
    const oldId = s.ventures[0]?.id;
    const newId = s.concepts[0]?.id;
    for (const key of ['assumptions', 'experiments', 'evidence', 'decisions']) {
      for (const item of s[key] || []) {
        item.conceptId = item.conceptId || (item.ventureId === oldId ? newId : item.ventureId);
        delete item.ventureId;
      }
    }
    s.scorecards = s.concepts.map((c) => ({ conceptId: c.id, dimensions: defaultScores(), updatedAt: new Date().toISOString() }));
    delete s.ventures;
    await save(s);
  }
  s.scorecards ||= [];
  return s;
}
async function save(s) { await writeFile(STORE, JSON.stringify(s, null, 2)); }

const priority = (a) => Math.round(((a.impactIfFalse * (6 - a.confidence)) / Math.max(1, a.testCost)) * 10) / 10;
const institutionalEvent = (type, entityType, entityId, payload) => ({
  id: uid('evt'), schemaVersion: '1.1', sourceSystem: 'metatility-vs', type, entityType, entityId,
  occurredAt: new Date().toISOString(), payload
});

function deriveStatus(current, evidence) {
  const n = EVIDENCE[evidence.level]?.score ?? 0;
  if (evidence.direction === 'supports' && n >= 5) return 'validated';
  if (evidence.direction === 'supports' && n >= 3) return 'supported';
  if (evidence.direction === 'contradicts' && n >= 5) return 'invalidated';
  if (evidence.direction === 'contradicts' && n >= 3) return 'contradicted';
  return current === 'unknown' ? 'testing' : current;
}

function scorecardView(s, conceptId) {
  let sc = s.scorecards.find((x) => x.conceptId === conceptId);
  if (!sc) {
    sc = { conceptId, dimensions: defaultScores(), updatedAt: new Date().toISOString() };
    s.scorecards.push(sc);
  }
  let raw = 0;
  let adjusted = 0;
  let evidenceCoverage = 0;
  const dimensions = SCORE_DIMENSIONS.map((d) => {
    const v = sc.dimensions[d.key] || { score: 3, evidenceLevel: 'E0', note: '' };
    const normalized = Math.max(1, Math.min(5, Number(v.score || 1))) / 5;
    const factor = EVIDENCE[v.evidenceLevel]?.factor ?? 0.1;
    raw += normalized * d.weight;
    adjusted += normalized * d.weight * factor;
    evidenceCoverage += d.weight * factor;
    return { ...d, ...v, contribution: +(normalized * d.weight).toFixed(1), adjustedContribution: +(normalized * d.weight * factor).toFixed(1) };
  });
  const rawScore = Math.round(raw);
  const evidenceAdjustedScore = Math.round(adjusted);
  const evidenceCoveragePct = Math.round(evidenceCoverage);
  const structuralLabel = rawScore >= 80 ? 'Strong architecture' : rawScore >= 65 ? 'Promising architecture' : rawScore >= 50 ? 'Mixed architecture' : 'Weak architecture';
  const evidenceLabel = evidenceCoveragePct >= 70 ? 'Evidence-rich' : evidenceCoveragePct >= 45 ? 'Developing evidence' : 'Mostly hypothesis';
  return { dimensions, rawScore, evidenceAdjustedScore, evidenceCoveragePct, structuralLabel, evidenceLabel, updatedAt: sc.updatedAt };
}

function conceptView(s, concept) {
  const assumptions = (s.assumptions || []).filter((x) => x.conceptId === concept.id).map((x) => ({ ...x, priority: priority(x) })).sort((a, b) => b.priority - a.priority);
  const evidence = (s.evidence || []).filter((x) => x.conceptId === concept.id);
  const experiments = (s.experiments || []).filter((x) => x.conceptId === concept.id);
  const decisions = (s.decisions || []).filter((x) => x.conceptId === concept.id);
  const validated = assumptions.filter((x) => x.status === 'validated').length;
  const avg = assumptions.length ? assumptions.reduce((n, x) => n + Number(x.confidence || 0), 0) / assumptions.length : 0;
  const criticalUnknowns = assumptions.filter((x) => x.impactIfFalse >= 4 && !['validated', 'invalidated'].includes(x.status)).length;
  return {
    concept, assumptions, evidence, experiments, decisions,
    scorecard: scorecardView(s, concept.id),
    metrics: {
      validated,
      uncertaintyIndex: assumptions.length ? Math.round(100 - (avg / 5) * 100) : 100,
      activeExperiments: experiments.filter((x) => x.status !== 'completed').length,
      criticalUnknowns
    }
  };
}

function simulate(input) {
  const months = Math.max(1, Math.min(60, Number(input.months || 24)));
  const base = {
    startingUnits: Number(input.startingUnits || 0),
    newUnitsPerMonth: Number(input.newUnitsPerMonth || 10),
    revenuePerUnit: Number(input.revenuePerUnit || 300),
    attritionPct: Number(input.attritionPct || 2),
    acquisitionCost: Number(input.acquisitionCost || 500),
    grossMarginPct: Number(input.grossMarginPct || 75),
    fixedMonthlyCost: Number(input.fixedMonthlyCost || 10000)
  };
  const scenarios = [
    { name: 'Conservative', newMult: 0.70, revenueMult: 0.90, attritionMult: 1.30, cacMult: 1.30, marginDelta: -8 },
    { name: 'Base', newMult: 1, revenueMult: 1, attritionMult: 1, cacMult: 1, marginDelta: 0 },
    { name: 'Upside', newMult: 1.30, revenueMult: 1.10, attritionMult: 0.70, cacMult: 0.80, marginDelta: 5 }
  ];
  const results = scenarios.map((sc) => {
    let units = base.startingUnits;
    let cumulativeCash = 0;
    let breakEvenMonth = null;
    const rows = [];
    for (let month = 1; month <= months; month++) {
      const newUnits = base.newUnitsPerMonth * sc.newMult;
      const attrition = Math.min(0.95, (base.attritionPct * sc.attritionMult) / 100);
      const revenuePerUnit = base.revenuePerUnit * sc.revenueMult;
      const gm = Math.max(0, Math.min(1, (base.grossMarginPct + sc.marginDelta) / 100));
      const cac = base.acquisitionCost * sc.cacMult;
      units = Math.max(0, units * (1 - attrition) + newUnits);
      const revenue = units * revenuePerUnit;
      const grossProfit = revenue * gm;
      const acquisitionSpend = newUnits * cac;
      const operatingProfit = grossProfit - acquisitionSpend - base.fixedMonthlyCost;
      cumulativeCash += operatingProfit;
      if (breakEvenMonth === null && operatingProfit >= 0) breakEvenMonth = month;
      rows.push({ month, units: +units.toFixed(1), revenue: +revenue.toFixed(0), operatingProfit: +operatingProfit.toFixed(0), cumulativeCash: +cumulativeCash.toFixed(0) });
    }
    return { name: sc.name, summary: { endingUnits: rows.at(-1).units, endingMonthlyRevenue: rows.at(-1).revenue, endingOperatingProfit: rows.at(-1).operatingProfit, cumulativeCash: rows.at(-1).cumulativeCash, breakEvenMonth }, rows };
  });
  return { kind: 'simulation', warning: 'Illustrative scenario model only. Simulation output is never treated as observed evidence.', input: base, months, scenarios: results };
}

function redTeam(view) {
  const findings = [];
  const byKey = Object.fromEntries(view.scorecard.dimensions.map((d) => [d.key, d]));
  const low = (key, threshold = 3) => Number(byKey[key]?.score || 0) <= threshold;
  const weakEvidence = (key) => (EVIDENCE[byKey[key]?.evidenceLevel]?.score ?? 0) <= 1;
  if (low('problem', 2)) findings.push({ severity: 'high', title: 'Problem may be too weak', detail: 'A business cannot compensate indefinitely for a problem customers do not urgently value.' });
  if (low('willingness', 2)) findings.push({ severity: 'high', title: 'Monetization is structurally uncertain', detail: 'Willingness to pay is currently too weak for the proposed business to carry much capital.' });
  if (low('distribution', 2)) findings.push({ severity: 'high', title: 'Distribution risk', detail: 'A strong product with no repeatable path to customers is not yet a strong business.' });
  if (low('economics', 2)) findings.push({ severity: 'high', title: 'Unit economics risk', detail: 'The current economic structure needs redesign or stronger evidence before scaling.' });
  if (low('defensibility', 2) && view.concept.type === 'Platform') findings.push({ severity: 'medium', title: 'Platform without compounding advantage', detail: 'Platforms become more durable when data, workflow, network effects, or switching costs strengthen with use.' });
  if (low('utility', 2) || low('function', 2)) findings.push({ severity: 'high', title: 'AFU mismatch', detail: 'Aesthetics cannot rescue weak utility or function. Improve the job-to-be-done before polishing the surface.' });
  const highScoreLowProof = view.scorecard.dimensions.filter((d) => d.score >= 4 && weakEvidence(d.key));
  if (highScoreLowProof.length >= 3) findings.push({ severity: 'medium', title: 'Confidence outruns evidence', detail: `${highScoreLowProof.length} highly rated dimensions are still supported only by opinion or secondary research.` });
  if (view.metrics.criticalUnknowns >= 4) findings.push({ severity: 'medium', title: 'Too many critical unknowns', detail: `${view.metrics.criticalUnknowns} high-consequence assumptions remain unresolved.` });
  if (!findings.length) findings.push({ severity: 'low', title: 'No obvious structural failure detected', detail: 'That is not validation. Continue replacing assumptions with observed behavior.' });
  return findings;
}

const sendJson = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
async function parseBody(req) { const chunks = []; for await (const c of req) chunks.push(c); const t = Buffer.concat(chunks).toString('utf8'); return t ? JSON.parse(t) : {}; }

async function api(req, res, url) {
  const s = await load();
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const concepts = s.concepts.map((c) => conceptView(s, c));
    return sendJson(res, 200, { concepts, evidenceLevels: EVIDENCE, scoreDimensions: SCORE_DIMENSIONS });
  }
  if (req.method === 'GET' && url.pathname === '/api/is-feed') return sendJson(res, 200, { schemaVersion: '1.1', sourceSystem: 'metatility-vs', events: s.events });
  if (req.method === 'GET' && url.pathname === '/api/is-feed.ndjson') {
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(s.events.map((x) => JSON.stringify(x)).join('\n') + (s.events.length ? '\n' : ''));
  }
  if (req.method === 'POST' && url.pathname === '/api/concepts') {
    const x = await parseBody(req);
    if (!x.name || !x.type) return sendJson(res, 400, { error: 'name and type are required.' });
    const c = {
      id: uid('concept'), name: x.name, type: x.type, stage: x.stage || 'Idea / Thesis', status: 'Exploring',
      oneLiner: x.oneLiner || '', problem: x.problem || '', customer: x.customer || '', solution: x.solution || '',
      businessModel: x.businessModel || '', distribution: x.distribution || '', advantage: x.advantage || '', whyNow: x.whyNow || '',
      objective: x.objective || 'Determine whether this concept deserves more resources.', unitLabel: x.unitLabel || 'customer', createdAt: new Date().toISOString()
    };
    s.concepts.push(c);
    s.scorecards.push({ conceptId: c.id, dimensions: defaultScores(), updatedAt: new Date().toISOString() });
    const starters = [
      ['Target users experience this problem frequently enough to change behavior.', 'Problem', 5, 1, 1],
      ['The economic buyer will pay enough to support the business model.', 'Economics', 5, 1, 2],
      ['A repeatable distribution channel can reach qualified buyers.', 'Distribution', 5, 1, 2],
      ['The proposed solution is materially better than the current alternative.', 'Solution', 4, 1, 2]
    ];
    for (const [title, category, impactIfFalse, confidence, testCost] of starters) s.assumptions.push({ id: uid('asm'), conceptId: c.id, title, category, impactIfFalse, confidence, testCost, evidenceLevel: 'E0', status: 'unknown' });
    s.events.push(institutionalEvent('concept.created', 'concept', c.id, c));
    await save(s); return sendJson(res, 201, conceptView(s, c));
  }
  if (req.method === 'POST' && url.pathname === '/api/scorecard') {
    const x = await parseBody(req);
    const c = s.concepts.find((c) => c.id === x.conceptId); if (!c) return sendJson(res, 404, { error: 'Concept not found.' });
    let sc = s.scorecards.find((z) => z.conceptId === c.id); if (!sc) { sc = { conceptId: c.id, dimensions: defaultScores(), updatedAt: new Date().toISOString() }; s.scorecards.push(sc); }
    for (const d of SCORE_DIMENSIONS) {
      if (x.dimensions?.[d.key]) {
        const v = x.dimensions[d.key];
        sc.dimensions[d.key] = { score: Math.max(1, Math.min(5, Number(v.score || 1))), evidenceLevel: EVIDENCE[v.evidenceLevel] ? v.evidenceLevel : 'E0', note: v.note || '' };
      }
    }
    sc.updatedAt = new Date().toISOString();
    s.events.push(institutionalEvent('concept.scorecard_updated', 'concept', c.id, { scorecard: scorecardView(s, c.id) }));
    await save(s); return sendJson(res, 200, conceptView(s, c));
  }
  if (req.method === 'POST' && url.pathname === '/api/assumptions') {
    const x = await parseBody(req);
    if (!x.conceptId || !x.title) return sendJson(res, 400, { error: 'conceptId and title are required.' });
    const a = { id: uid('asm'), conceptId: x.conceptId, title: x.title, category: x.category || 'General', impactIfFalse: Number(x.impactIfFalse || 3), confidence: Number(x.confidence || 1), testCost: Number(x.testCost || 2), evidenceLevel: 'E0', status: 'unknown' };
    s.assumptions.push(a); s.events.push(institutionalEvent('assumption.created', 'assumption', a.id, a)); await save(s); return sendJson(res, 201, a);
  }
  if (req.method === 'POST' && url.pathname === '/api/experiments') {
    const x = await parseBody(req); if (!x.conceptId || !x.assumptionId || !x.hypothesis || !x.method) return sendJson(res, 400, { error: 'conceptId, assumptionId, hypothesis, and method are required.' });
    const exp = { id: uid('exp'), conceptId: x.conceptId, assumptionId: x.assumptionId, hypothesis: x.hypothesis, method: x.method, successCondition: x.successCondition || '', budget: Number(x.budget || 0), status: 'planned', createdAt: new Date().toISOString() };
    s.experiments.push(exp); const a = s.assumptions.find((a) => a.id === exp.assumptionId); if (a && a.status === 'unknown') a.status = 'testing';
    s.events.push(institutionalEvent('experiment.created', 'experiment', exp.id, exp)); await save(s); return sendJson(res, 201, exp);
  }
  if (req.method === 'POST' && url.pathname === '/api/evidence') {
    const x = await parseBody(req); if (!x.conceptId || !x.assumptionId || !EVIDENCE[x.level] || !x.summary) return sendJson(res, 400, { error: 'conceptId, assumptionId, valid evidence level, and summary are required.' });
    const e = { id: uid('evi'), conceptId: x.conceptId, assumptionId: x.assumptionId, experimentId: x.experimentId || null, level: x.level, direction: x.direction || 'neutral', summary: x.summary, source: x.source || 'Manual entry', observedAt: x.observedAt || new Date().toISOString(), createdAt: new Date().toISOString() };
    s.evidence.push(e); const a = s.assumptions.find((a) => a.id === e.assumptionId);
    if (a) { a.status = deriveStatus(a.status, e); if (EVIDENCE[e.level].score >= (EVIDENCE[a.evidenceLevel]?.score ?? 0)) a.evidenceLevel = e.level; if (e.direction === 'supports') a.confidence = Math.min(5, Math.max(a.confidence, Math.ceil((EVIDENCE[e.level].score + 1) / 1.4))); if (e.direction === 'contradicts') a.confidence = Math.max(1, a.confidence - 1); }
    if (e.experimentId) { const exp = s.experiments.find((v) => v.id === e.experimentId); if (exp) exp.status = 'completed'; }
    s.events.push(institutionalEvent('evidence.recorded', 'evidence', e.id, e)); if (a) s.events.push(institutionalEvent('assumption.status_changed', 'assumption', a.id, { conceptId: a.conceptId, status: a.status, confidence: a.confidence, evidenceLevel: a.evidenceLevel }));
    await save(s); return sendJson(res, 201, { evidence: e, assumption: a });
  }
  if (req.method === 'POST' && url.pathname === '/api/decisions') {
    const x = await parseBody(req); if (!x.conceptId || !x.title || !x.decision) return sendJson(res, 400, { error: 'conceptId, title and decision are required.' });
    const d = { id: uid('dec'), conceptId: x.conceptId, title: x.title, decision: x.decision, rationale: x.rationale || '', evidenceIds: x.evidenceIds || [], assumptionIds: x.assumptionIds || [], reviewCondition: x.reviewCondition || '', owner: x.owner || 'Metatility', createdAt: new Date().toISOString() };
    s.decisions.push(d); s.events.push(institutionalEvent('decision.made', 'decision', d.id, d)); await save(s); return sendJson(res, 201, d);
  }
  if (req.method === 'POST' && url.pathname === '/api/simulate') return sendJson(res, 200, simulate(await parseBody(req)));
  if (req.method === 'GET' && url.pathname === '/api/red-team') {
    const id = url.searchParams.get('conceptId'); const c = s.concepts.find((x) => x.id === id); if (!c) return sendJson(res, 404, { error: 'Concept not found.' });
    return sendJson(res, 200, { conceptId: id, findings: redTeam(conceptView(s, c)) });
  }
  if (req.method === 'POST' && url.pathname === '/api/reset') { await writeFile(STORE, JSON.stringify(seed, null, 2)); return sendJson(res, 200, { ok: true }); }
  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, system: 'metatility-vs', version: '0.2.0' });
    if (url.pathname === '/') {
      const html = await readFile(new URL('./public/index.html', ROOT));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  } catch (err) { sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal error' }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Metatility VS listening on ${PORT}`));
