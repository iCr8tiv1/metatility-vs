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

const SIMULATION_MODELS = {
  saas: { label: 'SaaS / Subscription', unitLabel: 'account', fields: [
    ['months','Months',24,1,60,1],['startingUnits','Starting accounts',0,0,1000000,1],['newUnitsPerMonth','New accounts / month',10,0,1000000,1],['revenuePerUnit','Monthly revenue / account',300,0,10000000,1],['attritionPct','Monthly churn %',2,0,95,0.1],['acquisitionCost','CAC / new account',500,0,10000000,1],['grossMarginPct','Gross margin %',80,0,100,1],['fixedMonthlyCost','Fixed monthly operating cost',10000,0,100000000,100]
  ]},
  platform: { label: 'Platform / Freemium', unitLabel: 'user', fields: [
    ['months','Months',24,1,60,1],['startingUsers','Starting active users',0,0,100000000,1],['newUsersPerMonth','New users / month',500,0,100000000,1],['userChurnPct','Monthly user churn %',4,0,95,0.1],['paidConversionPct','Paid conversion %',8,0,100,0.1],['revenuePerPaidUser','Monthly revenue / paid user',35,0,1000000,1],['userAcquisitionCost','Acquisition cost / new user',8,0,1000000,0.1],['grossMarginPct','Gross margin %',82,0,100,1],['fixedMonthlyCost','Fixed monthly operating cost',25000,0,100000000,100]
  ]},
  marketplace: { label: 'Marketplace', unitLabel: 'buyer', fields: [
    ['months','Months',24,1,60,1],['startingBuyers','Starting active buyers',0,0,100000000,1],['newBuyersPerMonth','New buyers / month',100,0,100000000,1],['buyerChurnPct','Monthly buyer churn %',5,0,95,0.1],['transactionsPerBuyer','Transactions / buyer / month',1.5,0,1000,0.1],['gmvPerTransaction','GMV / transaction',500,0,10000000,1],['takeRatePct','Marketplace take rate %',12,0,100,0.1],['variableCostPct','Variable cost as % of platform revenue',18,0,100,0.1],['buyerAcquisitionCost','CAC / new buyer',60,0,1000000,1],['fixedMonthlyCost','Fixed monthly operating cost',30000,0,100000000,100]
  ]},
  service: { label: 'Service Business', unitLabel: 'client', fields: [
    ['months','Months',24,1,60,1],['startingClients','Starting active clients',0,0,1000000,1],['newClientsPerMonth','New clients / month',4,0,1000000,1],['clientChurnPct','Monthly client churn %',3,0,95,0.1],['projectsPerClient','Projects / client / month',1,0,100,0.1],['averageProjectRevenue','Average project revenue',5000,0,100000000,100],['directCostPct','Direct delivery cost %',55,0,100,1],['clientAcquisitionCost','CAC / new client',1000,0,10000000,10],['monthlyProjectCapacity','Delivery capacity / month',30,0,1000000,1],['fixedMonthlyCost','Fixed monthly operating cost',25000,0,100000000,100]
  ]},
  licensing: { label: 'Licensing / Royalty', unitLabel: 'licensee', fields: [
    ['months','Months',36,1,60,1],['startingLicensees','Starting licensees',0,0,1000000,1],['newLicenseesPerMonth','New licensees / month',2,0,1000000,1],['licenseeChurnPct','Monthly licensee churn %',1.5,0,95,0.1],['annualLicenseFee','Annual license fee / licensee',24000,0,100000000,100],['monthlyRoyaltyPerLicensee','Monthly royalty / licensee',1000,0,100000000,100],['salesCostPerLicensee','Sales/acquisition cost / new licensee',5000,0,100000000,100],['grossMarginPct','Gross margin %',90,0,100,1],['fixedMonthlyCost','Fixed monthly operating cost',20000,0,100000000,100]
  ]},
  asset: { label: 'Asset-Heavy / Infrastructure', unitLabel: 'asset', fields: [
    ['months','Months',36,1,60,1],['startingAssets','Starting deployed assets',0,0,1000000,1],['newAssetsPerMonth','New assets deployed / month',2,0,1000000,1],['assetAttritionPct','Monthly asset attrition %',0.5,0,95,0.1],['utilizationPct','Utilization %',65,0,100,1],['revenuePerActiveAsset','Monthly revenue / utilized asset',5000,0,100000000,100],['variableCostPerActiveAsset','Monthly variable cost / utilized asset',1500,0,100000000,100],['capexPerNewAsset','Capex / new asset',50000,0,1000000000,100],['fixedMonthlyCost','Fixed monthly operating cost',30000,0,100000000,100]
  ]},
  commerce: { label: 'Commerce / Product Sales', unitLabel: 'customer', fields: [
    ['months','Months',24,1,60,1],['startingCustomers','Starting active customers',0,0,100000000,1],['newCustomersPerMonth','New customers / month',100,0,100000000,1],['customerChurnPct','Monthly customer churn %',12,0,95,0.1],['ordersPerCustomer','Orders / customer / month',1.2,0,100,0.1],['averageOrderValue','Average order value',150,0,10000000,1],['grossMarginPct','Gross margin %',45,0,100,1],['customerAcquisitionCost','CAC / new customer',40,0,1000000,1],['fixedMonthlyCost','Fixed monthly operating cost',20000,0,100000000,100]
  ]},
  generic: { label: 'Generic Recurring Unit', unitLabel: 'unit', fields: [
    ['months','Months',24,1,60,1],['startingUnits','Starting active units',0,0,100000000,1],['newUnitsPerMonth','New units / month',10,0,100000000,1],['revenuePerUnit','Monthly revenue / unit',300,0,10000000,1],['attritionPct','Monthly attrition %',2,0,95,0.1],['acquisitionCost','Acquisition cost / new unit',500,0,10000000,1],['grossMarginPct','Gross margin %',75,0,100,1],['fixedMonthlyCost','Fixed monthly operating cost',10000,0,100000000,100]
  ]}
};

function inferModel(type = '') {
  const t = String(type).toLowerCase();
  if (t.includes('market')) return 'marketplace';
  if (t.includes('saas') || t.includes('subscription')) return 'saas';
  if (t.includes('service')) return 'service';
  if (t.includes('licens') || t.includes('royalt') || t.includes('asset / licens')) return 'licensing';
  if (t.includes('asset') || t.includes('infrastructure')) return 'asset';
  if (t.includes('commerce') || t.includes('product')) return 'commerce';
  if (t.includes('platform') || t.includes('data / intelligence')) return 'platform';
  return 'generic';
}

function starterAssumptions(modelType) {
  const common = [
    ['Target users experience the problem frequently enough to change behavior.', 'Problem', 5, 1, 1],
    ['The proposed solution is materially better than the current alternative.', 'Solution', 4, 1, 2]
  ];
  const specific = {
    saas: [
      ['The buyer will pay enough recurring revenue to support acquisition and service costs.', 'Economics', 5, 1, 2],
      ['Customers will retain long enough for lifetime gross profit to exceed acquisition cost.', 'Retention', 5, 1, 2],
      ['A repeatable channel can acquire qualified accounts at an acceptable CAC.', 'Distribution', 5, 1, 2]
    ],
    platform: [
      ['The platform can acquire enough active users to create repeated utility.', 'Adoption', 5, 1, 2],
      ['A meaningful share of active users will convert to monetized behavior.', 'Economics', 5, 1, 2],
      ['User acquisition and retention can compound faster than platform operating cost.', 'Distribution', 5, 1, 2]
    ],
    marketplace: [
      ['The marketplace can reach sufficient buyer and supply liquidity in a narrow starting market.', 'Liquidity', 5, 1, 2],
      ['Participants will accept a take rate large enough to support marketplace operations.', 'Economics', 5, 1, 2],
      ['Demand can be acquired without transaction contribution being consumed by CAC.', 'Distribution', 5, 1, 2]
    ],
    service: [
      ['Direct delivery cost leaves enough gross profit to support overhead and owner/operator economics.', 'Economics', 5, 1, 2],
      ['Delivery capacity can grow without quality collapsing or founder dependency increasing.', 'Operations', 5, 1, 2],
      ['Qualified clients can be acquired consistently at an acceptable cost.', 'Distribution', 4, 1, 2]
    ],
    licensing: [
      ['The licensed asset, IP, or data creates enough economic value to command recurring fees.', 'Economics', 5, 1, 2],
      ['Licensees will renew because switching or replacement destroys meaningful value.', 'Retention', 5, 1, 2],
      ['The licensor can protect and enforce the differentiated asset or rights being sold.', 'Defensibility', 5, 1, 2]
    ],
    asset: [
      ['Utilization will be high enough for each deployed asset to earn an acceptable return on capital.', 'Economics', 5, 1, 2],
      ['Capital requirements can be financed without constraining growth or destroying returns.', 'Capital', 5, 1, 2],
      ['Operational uptime and maintenance requirements can be controlled at scale.', 'Operations', 5, 1, 2]
    ],
    commerce: [
      ['Gross profit per order and repeat purchase behavior can absorb customer acquisition cost.', 'Economics', 5, 1, 2],
      ['Customers will repurchase frequently enough to create attractive lifetime value.', 'Retention', 5, 1, 2],
      ['The product can be distributed at scale without margin erosion from channels or fulfillment.', 'Distribution', 5, 1, 2]
    ],
    generic: [
      ['The economic buyer will pay enough to support the business model.', 'Economics', 5, 1, 2],
      ['A repeatable distribution channel can reach qualified buyers.', 'Distribution', 5, 1, 2]
    ]
  };
  return [...common, ...(specific[modelType] || specific.generic)];
}

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
  unitLabel: 'user',
  modelType: 'platform',
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
  concept.modelType ||= inferModel(concept.type);
  concept.unitLabel ||= SIMULATION_MODELS[concept.modelType]?.unitLabel || 'unit';
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

function n(input, key, fallback) { const v = Number(input[key]); return Number.isFinite(v) ? v : fallback; }
function bounded(v, min, max) { return Math.max(min, Math.min(max, v)); }

function simulationDiagnostics(modelType, b) {
  if (modelType === 'saas') {
    const gm = b.revenuePerUnit * (b.grossMarginPct / 100);
    const monthlyChurn = Math.max(0.001, b.attritionPct / 100);
    const ltv = gm / monthlyChurn;
    const payback = gm > 0 ? b.acquisitionCost / gm : null;
    return [
      ['Gross profit / account / month', gm],
      ['Approx. gross-profit LTV', ltv],
      ['Approx. LTV / CAC', b.acquisitionCost > 0 ? ltv / b.acquisitionCost : null],
      ['CAC payback months', payback]
    ];
  }
  if (modelType === 'platform') {
    const effectiveArpu = (b.paidConversionPct / 100) * b.revenuePerPaidUser;
    const gpUser = effectiveArpu * (b.grossMarginPct / 100);
    return [
      ['Effective revenue / active user / month', effectiveArpu],
      ['Gross profit / active user / month', gpUser],
      ['Paid conversion %', b.paidConversionPct],
      ['User acquisition payback months', gpUser > 0 ? b.userAcquisitionCost / gpUser : null]
    ];
  }
  if (modelType === 'marketplace') {
    const gmvBuyer = b.transactionsPerBuyer * b.gmvPerTransaction;
    const revenueBuyer = gmvBuyer * (b.takeRatePct / 100);
    const gpBuyer = revenueBuyer * (1 - b.variableCostPct / 100);
    return [
      ['GMV / active buyer / month', gmvBuyer],
      ['Platform revenue / active buyer / month', revenueBuyer],
      ['Contribution / active buyer / month', gpBuyer],
      ['CAC payback months', gpBuyer > 0 ? b.buyerAcquisitionCost / gpBuyer : null]
    ];
  }
  if (modelType === 'service') {
    const gpProject = b.averageProjectRevenue * (1 - b.directCostPct / 100);
    const theoreticalRevenue = b.monthlyProjectCapacity * b.averageProjectRevenue;
    return [
      ['Gross profit / project', gpProject],
      ['Monthly revenue at stated capacity', theoreticalRevenue],
      ['Direct delivery cost %', b.directCostPct],
      ['CAC / gross profit on one project', gpProject > 0 ? b.clientAcquisitionCost / gpProject : null]
    ];
  }
  if (modelType === 'licensing') {
    const rev = b.annualLicenseFee / 12 + b.monthlyRoyaltyPerLicensee;
    const gp = rev * (b.grossMarginPct / 100);
    return [
      ['Revenue / licensee / month', rev],
      ['Gross profit / licensee / month', gp],
      ['Sales cost payback months', gp > 0 ? b.salesCostPerLicensee / gp : null],
      ['Monthly licensee churn %', b.licenseeChurnPct]
    ];
  }
  if (modelType === 'asset') {
    const contribution = b.revenuePerActiveAsset - b.variableCostPerActiveAsset;
    const utilizedContribution = contribution * (b.utilizationPct / 100);
    return [
      ['Contribution / utilized asset / month', contribution],
      ['Expected contribution / deployed asset / month', utilizedContribution],
      ['Simple capex payback months', utilizedContribution > 0 ? b.capexPerNewAsset / utilizedContribution : null],
      ['Utilization %', b.utilizationPct]
    ];
  }
  if (modelType === 'commerce') {
    const gpOrder = b.averageOrderValue * (b.grossMarginPct / 100);
    const gpCustomer = gpOrder * b.ordersPerCustomer;
    return [
      ['Gross profit / order', gpOrder],
      ['Gross profit / active customer / month', gpCustomer],
      ['CAC payback months', gpCustomer > 0 ? b.customerAcquisitionCost / gpCustomer : null],
      ['Orders / customer / month', b.ordersPerCustomer]
    ];
  }
  const gm = b.revenuePerUnit * (b.grossMarginPct / 100);
  return [['Gross profit / active unit / month', gm], ['CAC payback months', gm > 0 ? b.acquisitionCost / gm : null]];
}

function simulate(input) {
  const modelType = SIMULATION_MODELS[input.modelType] ? input.modelType : 'generic';
  const model = SIMULATION_MODELS[modelType];
  const months = bounded(n(input, 'months', model.fields.find((f) => f[0] === 'months')?.[2] || 24), 1, 60);
  const b = Object.fromEntries(model.fields.map(([key, , fallback]) => [key, n(input, key, fallback)]));
  b.months = months;
  const scenarios = [
    { name: 'Conservative', demand: 0.70, price: 0.90, attrition: 1.30, cac: 1.30, marginDelta: -8, conversion: 0.80, utilization: 0.85 },
    { name: 'Base', demand: 1, price: 1, attrition: 1, cac: 1, marginDelta: 0, conversion: 1, utilization: 1 },
    { name: 'Upside', demand: 1.30, price: 1.10, attrition: 0.70, cac: 0.80, marginDelta: 5, conversion: 1.15, utilization: 1.10 }
  ];

  const results = scenarios.map((sc) => {
    let cumulativeCash = 0; let breakEvenMonth = null; let capitalDeployed = 0; const rows = [];
    let units = b.startingUnits || b.startingUsers || b.startingBuyers || b.startingClients || b.startingLicensees || b.startingAssets || b.startingCustomers || 0;
    for (let month = 1; month <= months; month++) {
      let revenue = 0, operatingProfit = 0, extra = {}, acquisitionSpend = 0, freeCash = 0;
      if (modelType === 'saas' || modelType === 'generic') {
        const newUnits = b.newUnitsPerMonth * sc.demand; const churn = bounded((b.attritionPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - churn) + newUnits);
        revenue = units * b.revenuePerUnit * sc.price;
        const grossProfit = revenue * bounded((b.grossMarginPct + sc.marginDelta) / 100, 0, 1);
        acquisitionSpend = newUnits * b.acquisitionCost * sc.cac;
        operatingProfit = grossProfit - acquisitionSpend - b.fixedMonthlyCost; freeCash = operatingProfit;
      } else if (modelType === 'platform') {
        const newUsers = b.newUsersPerMonth * sc.demand; const churn = bounded((b.userChurnPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - churn) + newUsers);
        const paidUsers = units * bounded((b.paidConversionPct * sc.conversion) / 100, 0, 1);
        revenue = paidUsers * b.revenuePerPaidUser * sc.price;
        const grossProfit = revenue * bounded((b.grossMarginPct + sc.marginDelta) / 100, 0, 1);
        acquisitionSpend = newUsers * b.userAcquisitionCost * sc.cac;
        operatingProfit = grossProfit - acquisitionSpend - b.fixedMonthlyCost; freeCash = operatingProfit; extra = { paidUsers: +paidUsers.toFixed(1) };
      } else if (modelType === 'marketplace') {
        const newBuyers = b.newBuyersPerMonth * sc.demand; const churn = bounded((b.buyerChurnPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - churn) + newBuyers);
        const transactions = units * b.transactionsPerBuyer * sc.demand;
        const gmv = transactions * b.gmvPerTransaction * sc.price;
        revenue = gmv * (b.takeRatePct / 100);
        const contribution = revenue * (1 - bounded(b.variableCostPct / 100, 0, 1));
        acquisitionSpend = newBuyers * b.buyerAcquisitionCost * sc.cac;
        operatingProfit = contribution - acquisitionSpend - b.fixedMonthlyCost; freeCash = operatingProfit; extra = { transactions: +transactions.toFixed(1), gmv: +gmv.toFixed(0) };
      } else if (modelType === 'service') {
        const newClients = b.newClientsPerMonth * sc.demand; const churn = bounded((b.clientChurnPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - churn) + newClients);
        const demandedProjects = units * b.projectsPerClient * sc.demand; const capacity = b.monthlyProjectCapacity; const projects = Math.min(demandedProjects, capacity);
        revenue = projects * b.averageProjectRevenue * sc.price;
        const grossProfit = revenue * (1 - bounded((b.directCostPct - sc.marginDelta) / 100, 0, 1));
        acquisitionSpend = newClients * b.clientAcquisitionCost * sc.cac;
        operatingProfit = grossProfit - acquisitionSpend - b.fixedMonthlyCost; freeCash = operatingProfit; extra = { projects: +projects.toFixed(1), capacityUtilizationPct: capacity > 0 ? +((projects / capacity) * 100).toFixed(1) : null };
      } else if (modelType === 'licensing') {
        const newLicensees = b.newLicenseesPerMonth * sc.demand; const churn = bounded((b.licenseeChurnPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - churn) + newLicensees);
        const monthlyRevenuePer = (b.annualLicenseFee / 12 + b.monthlyRoyaltyPerLicensee) * sc.price;
        revenue = units * monthlyRevenuePer;
        const grossProfit = revenue * bounded((b.grossMarginPct + sc.marginDelta) / 100, 0, 1);
        acquisitionSpend = newLicensees * b.salesCostPerLicensee * sc.cac;
        operatingProfit = grossProfit - acquisitionSpend - b.fixedMonthlyCost; freeCash = operatingProfit;
      } else if (modelType === 'asset') {
        const newAssets = b.newAssetsPerMonth * sc.demand; const attrition = bounded((b.assetAttritionPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - attrition) + newAssets);
        const utilization = bounded((b.utilizationPct * sc.utilization) / 100, 0, 1); const activeAssets = units * utilization;
        revenue = activeAssets * b.revenuePerActiveAsset * sc.price;
        const variableCost = activeAssets * b.variableCostPerActiveAsset;
        operatingProfit = revenue - variableCost - b.fixedMonthlyCost;
        const capex = newAssets * b.capexPerNewAsset; capitalDeployed += capex; freeCash = operatingProfit - capex; extra = { activeAssets: +activeAssets.toFixed(1), capex: +capex.toFixed(0), capitalDeployed: +capitalDeployed.toFixed(0) };
      } else if (modelType === 'commerce') {
        const newCustomers = b.newCustomersPerMonth * sc.demand; const churn = bounded((b.customerChurnPct * sc.attrition) / 100, 0, 0.95);
        units = Math.max(0, units * (1 - churn) + newCustomers);
        const orders = units * b.ordersPerCustomer * sc.demand; revenue = orders * b.averageOrderValue * sc.price;
        const grossProfit = revenue * bounded((b.grossMarginPct + sc.marginDelta) / 100, 0, 1);
        acquisitionSpend = newCustomers * b.customerAcquisitionCost * sc.cac;
        operatingProfit = grossProfit - acquisitionSpend - b.fixedMonthlyCost; freeCash = operatingProfit; extra = { orders: +orders.toFixed(1) };
      }
      cumulativeCash += freeCash; if (breakEvenMonth === null && operatingProfit >= 0) breakEvenMonth = month;
      rows.push({ month, units: +units.toFixed(1), revenue: +revenue.toFixed(0), operatingProfit: +operatingProfit.toFixed(0), freeCash: +freeCash.toFixed(0), cumulativeCash: +cumulativeCash.toFixed(0), ...extra });
    }
    const last = rows.at(-1);
    return { name: sc.name, summary: { endingUnits: last.units, endingMonthlyRevenue: last.revenue, endingOperatingProfit: last.operatingProfit, cumulativeCash: last.cumulativeCash, breakEvenMonth, ...(last.gmv !== undefined ? { endingGMV: last.gmv } : {}), ...(last.paidUsers !== undefined ? { endingPaidUsers: last.paidUsers } : {}), ...(last.capacityUtilizationPct !== undefined ? { endingCapacityUtilizationPct: last.capacityUtilizationPct } : {}), ...(last.capitalDeployed !== undefined ? { capitalDeployed: last.capitalDeployed } : {}), ...(last.orders !== undefined ? { endingOrders: last.orders } : {}) }, rows };
  });
  return { kind: 'simulation', modelType, modelLabel: model.label, unitLabel: model.unitLabel, warning: 'Illustrative scenario model only. Simulation output is never treated as observed evidence.', input: b, months, diagnostics: simulationDiagnostics(modelType, b), scenarios: results };
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
  const modelType = view.concept.modelType || inferModel(view.concept.type);
  if (modelType === 'marketplace') {
    if (low('distribution', 3)) findings.push({ severity: 'high', title: 'Marketplace liquidity risk', detail: 'Marketplaces fail before network effects matter when either side cannot be concentrated enough to create reliable transaction liquidity.' });
    if (low('defensibility', 3)) findings.push({ severity: 'medium', title: 'Network effect not yet demonstrated', detail: 'A marketplace is not defensible merely because it has two sides. Advantage must strengthen as participation and transaction history accumulate.' });
  }
  if (modelType === 'saas' && low('economics', 3)) findings.push({ severity: 'high', title: 'Recurring revenue does not guarantee good SaaS economics', detail: 'Retention, gross margin, CAC, and expansion must work together; subscription pricing alone does not create software-quality economics.' });
  if (modelType === 'platform' && low('utility', 3)) findings.push({ severity: 'high', title: 'Platform breadth may be ahead of core utility', detail: 'Platforms should earn expansion by first owning a high-frequency job or workflow.' });
  if (modelType === 'service' && (low('operator', 3) || low('function', 3))) findings.push({ severity: 'medium', title: 'Delivery system may not scale', detail: 'Service businesses often fail economically when quality depends on founder judgment or labor that cannot be standardized.' });
  if (modelType === 'licensing' && low('defensibility', 3)) findings.push({ severity: 'high', title: 'Licensing needs protectable differentiated value', detail: 'If the licensed asset, data, rights, or IP can be easily substituted, renewal economics and pricing power weaken quickly.' });
  if (modelType === 'asset' && (low('economics', 3) || low('feasibility', 3))) findings.push({ severity: 'high', title: 'Capital intensity needs explicit return discipline', detail: 'Asset-heavy models should be judged on utilization, cash yield, payback, maintenance, financing, and downside residual value—not revenue growth alone.' });
  if (modelType === 'commerce' && low('economics', 3)) findings.push({ severity: 'high', title: 'Commerce margin may be consumed by acquisition and fulfillment', detail: 'Gross margin, repeat purchase, returns, fulfillment, and CAC must be modeled together.' });

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
    return sendJson(res, 200, { concepts, evidenceLevels: EVIDENCE, scoreDimensions: SCORE_DIMENSIONS, simulationModels: SIMULATION_MODELS });
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
      objective: x.objective || 'Determine whether this concept deserves more resources.', modelType: SIMULATION_MODELS[x.modelType] ? x.modelType : inferModel(x.type), unitLabel: x.unitLabel || SIMULATION_MODELS[SIMULATION_MODELS[x.modelType] ? x.modelType : inferModel(x.type)]?.unitLabel || 'unit', createdAt: new Date().toISOString()
    };
    s.concepts.push(c);
    s.scorecards.push({ conceptId: c.id, dimensions: defaultScores(), updatedAt: new Date().toISOString() });
    const starters = starterAssumptions(c.modelType);
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
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, system: 'metatility-vs', version: '0.3.0' });
    if (url.pathname === '/') {
      const html = await readFile(new URL('./public/index.html', ROOT));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  } catch (err) { sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal error' }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Metatility VS listening on ${PORT}`));
