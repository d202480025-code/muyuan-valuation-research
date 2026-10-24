#!/usr/bin/env node
'use strict';
/**
 * 价格假设矩阵。只读加载现有 engine/data，不修改生产模型。
 * 运行：node academic_work/price_assumptions.js
 * 输出：本目录 results_price.json / results_price.md。
 * 每组比较为逐项敏感性或明确标注的联合情景；不存在隐含概率。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..', 'pig-cycle-lab');
const dataPath = path.join(ROOT, 'data.js');
const enginePath = path.join(ROOT, 'engine.js');
const dataText = fs.readFileSync(dataPath, 'utf8');
const engineText = fs.readFileSync(enginePath, 'utf8');
const context = vm.createContext({});
vm.runInContext(dataText, context, { filename: dataPath });
vm.runInContext(engineText, context, { filename: enginePath });
const M = context.PigCycleModel;
const D = context.PIG_DATA;
const BASE = JSON.parse(JSON.stringify(M.DEFAULTS));
const ROUTES = ['cost', 'capacity', 'demand'];
const ROUTE_NAMES = { cost: '长期必要产能成本', capacity: '历史有效产能振幅外推', demand: '供需平衡与逆需求' };
const PARAMS = new Map(M.PARAMS.map(p => [p.key, p]));
const SOURCE_MAP = new Map(D.sources.map(s => [s.id, s]));
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const idx = s => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; };
const month = i => Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0');
const pct = x => x / 100;
const clamp = x => Math.max(0, Math.min(1, x));
const equal = (a, b, tol = 2e-10) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
const TECHNICAL_TIERS = { A: [31, 2.4, 96, 95, .97, .98, .95], B: [29, 2.45, 95, 90, 1, 1, 1], C: [26, 2.65, 93, 85, 1.04, 1.03, 1.1], D: [23, 2.85, 90, 80, 1.08, 1.06, 1.25], E: [20, 3.05, 86, 70, 1.15, 1.1, 1.5] };

// 独立复算价格模块，随后逐月对照引擎。没有调用引擎的 costs/productivity/calibration。
function replicaCost(c) {
  const normalReturn = c.equityPerHead * pct(c.normalEquityReturnPct) / 120;
  if (c.costBasis === 'manual') return { fullCost: c.marginalFullCost, normalReturn, normalPrice: c.marginalFullCost + normalReturn };
  const [psy, fcr, sp, up, days, labor, health] = c.marginalTier === 'custom' ? [c.customPsy, c.customFcr, c.customSurvival, c.customUtilization, c.customDays, c.customLabor, c.customHealth] : TECHNICAL_TIERS[c.marginalTier];
  const s = sp / 100, u = up / 100, sf = .95 / s, fixed = .9 / u * days * sf;
  const mortality = (1 + .5 * (1 - s) / s) / (1 + .5 * .05 / .95);
  const fullCost = 2.9 * (.25 + .75 * 29 / psy) * sf + 6.7 * fcr / 2.45 * mortality * c.feedPricePct / 100 + .3 * health * sf + 1.5 * (.3 + .7 * fixed) * labor + .2 * fixed + .8 * fixed;
  return { fullCost, normalReturn, normalPrice: fullCost + normalReturn };
}
function replicaCalibration(c) {
  const cycles = D.cycles.map(x => {
    const years = x.elapsedYears == null ? (idx(x.endMonth) - idx(x.startMonth)) / 12 : x.elapsedYears;
    const effectiveRatio = x.sowEnd / x.sowStart * (c.capacityMetric === 'heads' ? 1 : (1 + pct(c.historicalMsyGrowthPct)) ** years) * (c.capacityMetric === 'tonnage' ? 1 + pct(c.historicalWeightChangePct) : 1);
    const priceRatio = x.priceHigh / x.priceLow;
    const beta = effectiveRatio > 0 && effectiveRatio < 1 && priceRatio > 1 ? Math.log(priceRatio) / -Math.log(effectiveRatio) : null;
    const asf = String(x.regime).toLowerCase() === 'asf';
    const eligible = (x.eligible !== false || (asf && c.includeASF)) && (!x.priceSeries || x.priceSeries === c.priceSeries) && [x.sowStart, x.sowEnd, x.priceLow, x.priceHigh, years].every(v => Number.isFinite(v) && v > 0) && beta !== null && effectiveRatio <= .98 && (!asf || c.includeASF);
    return { id: x.id, beta, effectiveRatio, eligible };
  });
  const selected = c.historicalCycle === 'manual' ? [] : cycles.filter(x => x.eligible && (c.historicalCycle === 'median' || c.historicalCycle === x.id));
  return { beta: c.historicalCycle === 'manual' ? c.manualBeta : median(selected.map(x => x.beta)), selectedIds: selected.map(x => x.id), cycles };
}
function replicaSowPath(c) {
  const points = new Map();
  D.history.filter(h => h.sows > 0 && h.sowsUnit !== 'index' && h.month <= '2025-12').forEach(h => points.set(idx(h.month), h.sows));
  [['2025-10', 3990], ['2025-12', 3961], ['2026-03', 3904], ['2026-06', c.sowQ2], ['2026-09', c.sowQ3], ['2026-12', c.sowQ3 * (1 - pct(c.q4DepletionPct))]].forEach(([m, s]) => points.set(idx(m), s));
  const keys = [...points.keys()].sort((a, b) => a - b), dec = idx('2026-12');
  return i => {
    if (points.has(i)) return points.get(i);
    if (i > dec) return points.get(dec) * (1 + pct(c.sowChange2027Pct)) ** ((i - dec) / 12);
    for (let k = 1; k < keys.length; k++) if (i > keys[k - 1] && i < keys[k]) return points.get(keys[k - 1]) + (points.get(keys[k]) - points.get(keys[k - 1])) * (i - keys[k - 1]) / (keys[k] - keys[k - 1]);
    return null;
  };
}
function replicaProductivity(c, k) {
  const y = k / 12, t = clamp(y);
  let r = 1;
  if (c.productivityMode === 'direct') r = (c.msyTarget / c.msyBase) ** t;
  if (c.productivityMode === 'bounded') r = (c.psyCeiling - (c.psyCeiling - c.psyBase) * (1 - pct(c.psyGapClosurePct)) ** y) / c.psyBase * (c.survivalTarget / c.survivalBase) ** t * (c.commercialTarget / c.commercialBase) ** t * (c.activeSowRatioTarget / c.activeSowRatioBase) ** t;
  return { msyRatio: c.capacityMetric === 'heads' ? 1 : r, weightRatio: c.capacityMetric === 'tonnage' ? (c.nationalWeightTarget / c.nationalWeightBase) ** t : 1 };
}
function replica(c) {
  const cost = replicaCost(c), cal = replicaCalibration(c), sow = replicaSowPath(c), base = idx('2026-08');
  const lagged = i => c.lagMode === 'fixed' ? sow(i - c.lagMonths) : [8, 9, 10, 11, 12].reduce((s, l, j) => s + [.1, .2, .4, .2, .1][j] * sow(i - l), 0);
  const baseSows = c.anchorMode === 'policy' ? c.policySows : c.anchorMode === 'custom' ? c.baseSows : lagged(base);
  const observedPrice = c.priceSeries === 'mara' ? 11.36 : 11.01;
  const basePrice = c.anchorMode === 'policy' ? cost.normalPrice : c.anchorMode === 'custom' ? c.baseHogPrice : observedPrice;
  const baseRetail = c.anchorMode === 'policy' && c.retailPassThrough > 0 ? c.baseRetailPrice + (basePrice - observedPrice) / c.retailPassThrough : c.baseRetailPrice;
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const mi = idx('2027-' + String(m).padStart(2, '0')), k = mi - base, prod = replicaProductivity(c, k), sows = lagged(mi);
    const e = sows / baseSows * prod.msyRatio * prod.weightRatio;
    const totalSupplyRatio = (1 - pct(c.importSharePct)) * e + pct(c.importSharePct) * (1 + pct(c.importsGrowthPct)) ** (k / 12);
    const demandRatio = (1 + pct(c.demandTrendPct)) ** (k / 12), z = totalSupplyRatio / demandRatio;
    const retail = c.demandForm === 'constant' ? baseRetail * z ** (-1 / c.demandElasticity) : baseRetail * (1 + (1 - z) / c.demandElasticity);
    const price = c.priceMethod === 'cost' ? cost.normalPrice : c.priceMethod === 'capacity' ? (cal.beta === null ? null : basePrice * e ** (-cal.beta)) : c.priceMethod === 'custom' ? c['customQ' + Math.ceil(m / 3)] : basePrice + c.retailPassThrough * (retail - baseRetail);
    monthly.push({ month: month(mi), sows, ...prod, effectiveCapacityRatio: e, totalSupplyRatio, demandRatio, price, baseSows, basePrice, baseRetail });
  }
  if (c.priceMethod !== 'custom' && monthly.every(x => Number.isFinite(x.price))) {
    const oldMean = avg(monthly.map(x => x.price)), factors = [1, 2, 3, 4].map(q => 1 + pct(c['seasonQ' + q])), fm = avg(factors);
    monthly.forEach((x, i) => { x.price *= factors[Math.floor(i / 3)] / fm; });
    const nm = avg(monthly.map(x => x.price)); monthly.forEach(x => { x.price *= oldMean / nm; });
  }
  return { monthly, cost, cal };
}

const LIMITS = {
  common: [
    '研究截点为2026-10-24（香港时间）；2027结果是条件计算，没有赋予事件概率或统计置信度。',
    '季度为3个月算术均值，全年为12个月算术均值；不是按日数、销售头数或出栏重量加权。最大月均价也不是日度或整个周期最高价。',
    '2026季度点之间缺失月用线性插值；2026Q4及2027母猪量是情景，不冒充官方已公布值。',
    'PSY23.4是2025参考数，在本模型被作为2026-08相对效率归一化的水平；没有声称已观测到2026-08同口径全国PSY。',
    '全国活重仅在屠宰率等结构不变时作为肉量代理；未逐项建模冻品库存、出口、淘汰母猪当期供肉、二次育肥和进口内生反应。',
    '三路线共用价格锚、母猪及效率输入，结果不是彼此独立的证据，不能简单平均成置信区间。'
  ],
  cost: [
    '必要产能成本14.9元/kg与10%权益要求回报是判断，不是由政府3750万头目标统计识别出的价格。',
    '给出长期再生产条件下的中枢参照，四季相同不意味着能够预测四个季度现货，更不构成短期价格下限。',
    '按每年一头产能对应1000元权益、标准120kg换算正常资本回报；nationalWeightTarget改变不自动改这个固定120kg分母。',
    '手动成本不会随全国PSY、料价或出栏体重自动调整；技术演示采用另一组customPsy等参数，A—E不是全国成本分位。',
    '完全成本若已含同一权益资本正常回报，再附加会重复计算，使用前须统一会计成本与经济成本口径。'
  ],
  capacity: [
    'β来自事后价格峰谷与母猪去化半程振幅，不是固定8/10/12个月识别的因果供给弹性或滚动样本外合格的预测系数。',
    '默认仅两个现代MARA去化阶段；两者β的中位数不提供总体估计精度，月数不能冒充独立周期样本量。',
    '历史MSY增速是用户假设；其上调减少历史有效收缩分母，可能显著抬高β，甚至触发不足2%收缩的排除规则。',
    '未来效率上调增加供给并压低外推价；它和历史效率校准是不同方向、不同参数，不得混为一项。',
    '路线没有需求、进口、库存、成本补栏反馈；高外推价不能视为均衡价格或可靠短期预测。',
    '更改lagMonths只改变本轮供给与观测锚对应母猪月，不会把峰谷β重新估成相应固定时滞系数。'
  ],
  demand: [
    'ε=0.374来自USDA对中国家庭年度零售猪肉需求的估计；将其用于月度全国活猪供给冲击未重新估计或验证。',
    'ε=0.20与0.60为人为选定的宽敏感性网格，二者均小于1、表示需求缺乏弹性的情景，不是估计置信上下限；0.163来自另一表观消费口径，不是同一估计的下界。',
    'λ=0.75是零售每变动1元/kg所对应的活猪绝对价格变化斜率，并非75%的百分比传导率，尚无独立估计。',
    '固定价格下的需求趋势只移位需求，不应与同一需求变化导致的价格弹性重复计算。',
    '常弹性函数的大幅外推和局部线性函数给出的差异是函数形状风险，不是概率区间。',
    '进口份额2%和进口增速0是统一供给口径的情景；全国实际可用猪肉还受净出口、库存和加工流通结构影响。'
  ]
};

const rows = [];
function add(group, id, label, patch, extra = {}) {
  Object.keys(patch).forEach(k => assert.ok(PARAMS.has(k), `未知参数 ${k}`));
  rows.push({ group, id, label, design: 'one_at_a_time', requestedPatch: patch, groupBaselinePatch: {}, ...extra });
}
add('baseline', 'baseline', '当前引擎基准', {});
for (const [id, v, label] of [['zero', 0, 'Q4停止去化'], ['base', BASE.q4DepletionPct, 'Q4延续Q3比例'], ['double', BASE.q4DepletionPct * 2, 'Q4去化比例翻倍']]) add('q4_depletion', 'q4_' + id, label, { q4DepletionPct: v });
for (const v of [0, 6, 12]) add('future_psy', 'psy_gap_' + v, `每年缩小PSY差距${v}%`, { psyGapClosurePct: v }, { note: '保持23.4基期、32情景上限以及成活/商品化/有效经产结构不变。6%差距收敛对应一年PSY增长2.2051%，不是PSY增长6%。' });
for (const v of [18, 18.4, 18.9]) add('future_direct_msy', 'msy_' + String(v).replace('.', '_'), `直接MSY一年由18到${v}`, { productivityMode: 'direct', msyTarget: v }, { design: 'one_at_a_time_within_mode', groupBaselinePatch: { productivityMode: 'direct', msyTarget: 18.4 }, note: '直接MSY水平为示意；不重复乘PSY、成活率和商品化比例。18→18.9为5%提高。' });
for (const v of [120, 125, 130]) add('slaughter_weight', 'weight_' + v, `一年后全国出栏重${v}kg`, { nationalWeightTarget: v }, { note: '基期全国体重始终为120kg情景值；这是相对供给变化，不是把120/125/130当已观测全国均重。' });
for (const v of [0, -1, -2]) add('demand_trend', 'demand_' + Math.abs(v), `需求年变化${v}%`, { demandTrendPct: v });
for (const v of [.20, .374, .60]) add('demand_elasticity', 'epsilon_' + String(v).replace('.', '_'), `需求价格弹性绝对值${v}`, { demandElasticity: v }, { note: v === .374 ? '来源先验，不是本模型月度弹性估计。' : '人为设定的宽敏感性端点，不是统计估计值或置信界。' });
add('elasticity_other_estimand', 'epsilon_0_163', '表观消费另一估计口径0.163', { demandElasticity: .163 }, { design: 'alternative_estimand_stress', note: '同USDA来源的另一消费口径，仅作压力演示；不得与0.374组成同一估计的置信区间。' });
for (const v of [8, 10, 12]) add('lag', 'lag_' + v, `固定${v}个月`, { lagMode: 'fixed', lagMonths: v });
add('lag', 'lag_distributed', '8–12个月母猪数量分布滞后', { lagMode: 'distributed' }, { design: 'alternative_model', note: '先对母猪数量按10/20/40/20/10%加权，后使用非线性价格公式；不是各固定时滞价格的加权均值。基期也使用同一滞后核。' });
for (const v of ['constant', 'linear']) add('demand_function', 'demand_' + v, v === 'constant' ? '常弹性逆需求' : '局部线性逆需求', { demandForm: v }, { design: 'alternative_model' });
for (const v of [0, 2, 5]) add('historical_msy', 'history_msy_' + v, `历史阶段MSY年增长${v}%`, { historicalMsyGrowthPct: v }, { note: '只修改历史β分母，不改变本轮未来MSY路径；全部是缺失历史真MSY后的校准情景。' });
for (const [id, label] of [['median', '两段同口径β中位数'], ['modern_2021_2022_mara', '只用2021–2022去化半程'], ['modern_2022_2024_mara', '只用2022–2024去化半程']]) add('historical_episode', 'cycle_' + id, label, { historicalCycle: id }, { design: 'alternative_calibration' });
for (const v of [13, 14.9, 16]) add('manual_cost', 'cost_' + String(v).replace('.', '_'), `必要产能成本判断${v}元/kg`, { marginalFullCost: v }, { note: '三个数是必要产能成本判断的情景网格，不是已识别的全国成本分位。观测锚下不传导到另外两条路线。' });
for (const v of [5, 10, 15]) add('normal_equity_return', 'return_' + v, `每头1000元权益要求回报${v}%`, { normalEquityReturnPct: v });
for (const v of ['A', 'B', 'C', 'D', 'E']) add('technical_cost', 'technical_' + v, `技术组合${v}，非调查分位`, { costBasis: 'technical', marginalTier: v }, { design: 'one_at_a_time_within_mode', groupBaselinePatch: { costBasis: 'technical', marginalTier: 'C' }, note: '采用神农成本结构拆解的参数组合，仅用于技术敏感性；没有全国样本权重。' });
for (const v of ['observed', 'policy']) add('anchor', 'anchor_' + v, v === 'observed' ? '观测价格锚' : '政策量+成本价假设锚', { anchorMode: v }, { design: 'alternative_model', note: '政策锚同时改变母猪分母、活猪基价和零售假设基价，不能把差异解释成单一政策量的纯影响。' });
for (const v of [13, 14.9, 16]) add('policy_anchor_cost', 'policy_cost_' + String(v).replace('.', '_'), `政策锚下必要成本${v}元/kg`, { anchorMode: 'policy', marginalFullCost: v }, { design: 'one_at_a_time_within_mode', groupBaselinePatch: { anchorMode: 'policy' }, note: '在政策锚模式，成本中枢进入容量与需求路线的活猪基价；需求路线零售基价也按λ换算，属于联动假设。' });
for (const v of ['mara', 'ndrc']) add('price_series', 'series_' + v, v === 'mara' ? 'MARA同渠道观测锚' : 'NDRC出场价观测锚', { priceSeries: v }, { design: 'alternative_measurement', note: '历史校准同步只用同价序列；NDRC活猪与MARA零售21元/kg跨调查体系，不能宣称同渠道。' });
for (const v of ['heads', 'msy', 'tonnage']) add('capacity_metric', 'metric_' + v, `供给计量${v}`, { capacityMetric: v }, { design: 'alternative_model', note: 'heads同时忽略历史和未来效率修正，因此β和未来供给比一起变化；不是只去掉单个未来系数。' });
for (const v of [-5, 0, 5]) add('sows_2027', 'sows_2027_' + (v < 0 ? 'minus' : 'plus') + Math.abs(v), `2027能繁年变化${v}%`, { sowChange2027Pct: v }, { note: '从2026-12起复合月变化；十个月滞后下仅影响2027年11–12月价格，不能把全年变化立即作用于2027所有季度。' });
for (const v of [.5, .75, 1]) add('retail_transmission', 'lambda_' + String(v).replace('.', '_'), `零售→活猪绝对价格斜率${v}`, { retailPassThrough: v }, { note: 'λ单位为（活猪元/kg）/（零售元/kg），此处为未估计的传导情景。' });
for (const p of M.PRESETS) add('joint_presets', 'joint_' + p.id, p.name, clone(p.changes), { design: 'joint_scenario', probability: p.probability, conditions: p.conditions, note: p.description + ' ' + p.logic + ' companyCost和recoveryYears影响公司估值，不改变本表2027全国猪价。' });

const priceGroups = new Set(['价格锚点', '能繁与时滞', '生产效率', '历史映射', '供需与需求', '完全成本', '季度与季节']);
const priceKeys = new Set(M.PARAMS.filter(p => priceGroups.has(p.group) || ['priceMethod', 'priceSeries'].includes(p.key)).map(p => p.key));
const changed = (c, reference) => Object.keys(c).filter(k => c[k] !== reference[k]).map(k => ({ key: k, label: PARAMS.get(k)?.label || k, from: reference[k], to: c[k], unit: PARAMS.get(k)?.unit || '类别/无量纲', affects2027NationalPrice: priceKeys.has(k) }));
const refsForRow = c => {
  const set = new Set(['mara_202608', 'sow_202606', 'sow_202609', 'psy_cn_2025', 'usda_elasticity', 'policy_2026', 'oecd_model']);
  if (c.priceSeries === 'ndrc') set.add('ndrc_202608');
  if (c.costBasis === 'technical') set.add('SN_IR_20250905');
  D.history.filter(h => h.month >= '2025-08' && h.month <= '2026-09' && h.priceSeries === c.priceSeries).forEach(h => h.sourceIds.forEach(id => set.add(id)));
  const cal = replicaCalibration(c);
  D.cycles.filter(x => cal.selectedIds.includes(x.id)).forEach(x => x.sourceIds.forEach(id => set.add(id)));
  return [...set].sort();
};
let priceComparisons = 0, outputComparisons = 0;
const computeCache = new Map();
function run(patch, route) {
  const config = M.mergeConfig(BASE, { ...patch, priceMethod: route });
  const key = JSON.stringify(config);
  if (computeCache.has(key)) return clone(computeCache.get(key));
  const result = M.calculate(config, D), rep = replica(config);
  assert.equal(result.monthly.length, 12);
  for (let i = 0; i < 12; i++) {
    const a = result.monthly[i], b = rep.monthly[i];
    ['sows', 'msyRatio', 'weightRatio', 'effectiveCapacityRatio', 'totalSupplyRatio', 'demandRatio', 'baseSows', 'basePrice', 'baseRetail'].forEach(k => { equal(a[k], b[k]); outputComparisons++; });
    if (a.price === null || b.price === null) assert.equal(a.price, b.price); else { equal(a.price, b.price); priceComparisons++; }
  }
  equal(result.cost.normalPrice, rep.cost.normalPrice);
  if (result.calibration.beta === null || rep.cal.beta === null) assert.equal(result.calibration.beta, rep.cal.beta); else equal(result.calibration.beta, rep.cal.beta);
  const monthly = clone(result.monthly);
  const priceWarningKeys = new Set([...priceKeys, 'baseRetailPrice', 'historicalCycle']);
  const out = {
    route, routeName: ROUTE_NAMES[route], unit: '元/kg活猪', valid: result.valid,
    errors: clone(result.errors), warnings: clone(result.warnings.filter(x => priceWarningKeys.has(x.key))),
    quarterly: result.valid ? result.quarterly.map(q => ({ quarter: q.quarter, price: q.price, laggedSows10k: q.sows })) : [],
    annualPrice: result.valid ? result.summary.annualPrice : null,
    maximumMonthlyMean: result.valid ? Math.max(...monthly.map(x => x.price)) : null,
    maximumMonthlyMeanMonths: result.valid ? monthly.filter(x => Math.abs(x.price - Math.max(...monthly.map(y => y.price))) < 1e-10).map(x => x.month) : [],
    minimumMonthlyMean: result.valid ? Math.min(...monthly.map(x => x.price)) : null,
    cost: { fullCost: result.cost.fullCost, normalReturn: result.cost.normalReturn, normalPrice: result.cost.normalPrice, basis: result.cost.basis },
    calibration: { beta: result.calibration.beta, selectedCount: result.calibration.selectedCount, selectedIds: rep.cal.selectedIds, cycles: rep.cal.cycles },
    anchor: { month: '2026-08', mode: config.anchorMode, priceSeries: config.priceSeries, sows10k: monthly[0].baseSows, hogPrice: monthly[0].basePrice, retailPrice: monthly[0].baseRetail, status: monthly[0].baseStatus },
    sow2026December10k: config.sowQ3 * (1 - pct(config.q4DepletionPct)),
    oneYearProductivityRatio: replicaProductivity(config, 12).msyRatio,
    oneYearWeightRatio: replicaProductivity(config, 12).weightRatio,
    monthly, limitationRefs: ['common', route], sourceIds: refsForRow(config)
  };
  if (result.valid) { equal(avg(out.quarterly.map(q => q.price)), out.annualPrice); equal(avg(monthly.map(x => x.price)), out.annualPrice); }
  computeCache.set(key, out);
  return clone(out);
}
const baseline = Object.fromEntries(ROUTES.map(route => [route, run({}, route)]));
equal(baseline.cost.annualPrice, 15.73333333333334);
equal(baseline.capacity.annualPrice, 20.80817912674588);
equal(baseline.demand.annualPrice, 14.355724462735962);

const matrix = rows.map(row => {
  const config = M.mergeConfig(BASE, row.requestedPatch), groupConfig = M.mergeConfig(BASE, row.groupBaselinePatch);
  const resultsByRoute = {};
  for (const route of ROUTES) {
    const r = run(row.requestedPatch, route), groupResult = run(row.groupBaselinePatch, route);
    r.annualDeltaVsGlobalBaseline = r.annualPrice === null ? null : r.annualPrice - baseline[route].annualPrice;
    r.annualDeltaVsGroupBaseline = r.annualPrice === null || groupResult.annualPrice === null ? null : r.annualPrice - groupResult.annualPrice;
    r.quarterly.forEach((q, i) => { q.deltaVsGlobalBaseline = q.price - baseline[route].quarterly[i].price; });
    resultsByRoute[route] = r;
  }
  return { ...row, changedInputs: changed(config, BASE), changesVsGroupBaseline: changed(config, groupConfig), inputValues: Object.fromEntries([...priceKeys].map(k => [k, config[k]])), resultsByRoute };
});

// 只审计传导，不修正原引擎。为论文消除“改了参数所以所有路线都应变化”的误解。
const audit = [];
function invariant(name, patch, routes, explanation) {
  for (const route of routes) run(patch, route).monthly.forEach((x, i) => equal(x.price, baseline[route].monthly[i].price));
  audit.push({ name, passed: true, patch, testedRoutes: routes, explanation });
}
invariant('观测锚下手动成本不改变容量/需求路线', { marginalFullCost: 16 }, ['capacity', 'demand'], 'marginalFullCost只改变成本路线；anchorMode=policy时会经基价传导到另外两条路线。');
invariant('去化与需求不改变固定手动成本', { q4DepletionPct: 0, demandTrendPct: -2, nationalWeightTarget: 130, psyGapClosurePct: 12 }, ['cost'], '手动成本并未建立随生产效率变化的成本函数；固定120kg资本回报分母也不自动变。');
invariant('需求弹性与趋势不进入历史路线', { demandElasticity: .2, demandTrendPct: -2, importSharePct: 5, retailPassThrough: .5 }, ['cost', 'capacity'], '历史供给振幅映射未显式加入需求、进口或零售传导。');
invariant('历史效率只改变β，不改变未来需求路线', { historicalMsyGrowthPct: 5 }, ['cost', 'demand'], '历史效率与未来效率分属两项设定，不能用同一个“MSY提高”混称。');
invariant('手动成本下料价指数不生效', { feedPricePct: 120 }, ['cost', 'capacity', 'demand'], 'feedPricePct仅供technical成本模式使用；观测锚下另外两条路线也不受其影响。');
invariant('公司出栏重与成本不改变全国价格', { companyWeight: 130, companyCost: 12.5, recoveryYears: 5 }, ROUTES, '全国供给重量是nationalWeightTarget；公司利润重量是companyWeight。');
const seasonRun = run({ seasonQ1: -5, seasonQ2: 0, seasonQ3: 0, seasonQ4: 5 }, 'demand');
equal(seasonRun.annualPrice, baseline.demand.annualPrice);
audit.push({ name: '季节系数二次归一化不改变年度均价', passed: true, patch: { seasonQ1: -5, seasonQ4: 5 }, testedRoutes: ['demand'], explanation: '季节系数只是同一年度内重新分配价格，不增加全年价格。' });
for (const row of matrix.filter(x => x.group === 'lag')) equal(row.resultsByRoute.capacity.calibration.beta, baseline.capacity.calibration.beta);
audit.push({ name: '时滞改变不重估峰谷β', passed: true, testedRoutes: ['capacity'], explanation: 'lagMonths/lagMode作用于本轮供给及观测锚；校准函数没有使用这两个参数。必须另看严格时移历史检验。' });
const fixedQ3 = run({ sowQ3: 3700 }, 'demand'), dynamicPct = (1 - 3700 / BASE.sowQ2) * 100, recomputedQ3 = run({ sowQ3: 3700, q4DepletionPct: dynamicPct }, 'demand');
audit.push({ name: '修改Q3后默认去化率不会自动重算', passed: true, materialModelBehavior: true, fixedRateCase: { patch: { sowQ3: 3700 }, q4Rate: BASE.q4DepletionPct, decemberSows10k: fixedQ3.sow2026December10k, annualPrice: fixedQ3.annualPrice }, recomputedRuleCase: { patch: { sowQ3: 3700, q4DepletionPct: dynamicPct }, q4Rate: dynamicPct, decemberSows10k: recomputedQ3.sow2026December10k, annualPrice: recomputedQ3.annualPrice }, explanation: 'q4DepletionPct存的是数值，不是持续联动公式。若论文改变Q2/Q3仍声称“同速”，必须显式重算该参数。' });

const strictLagEvidence = D.cycles.filter(x => x.id.startsWith('modern_') && x.priceSeries === 'mara').map(x => {
  const effectiveRatio = x.sowEnd / x.sowStart * (1 + pct(BASE.historicalMsyGrowthPct)) ** x.elapsedYears;
  return { id: x.id, label: x.label, startMonth: x.startMonth, endMonth: x.endMonth, sowStart: x.sowStart, sowEnd: x.sowEnd, unit: x.unit, priceSeries: x.priceSeries, priceLow: x.priceLow, priceHigh: x.priceHigh, priceLowMonth: x.priceLowMonth, priceHighMonth: x.priceHighMonth, elapsedYears: x.elapsedYears, peakTroughBetaWithoutMsyCorrection: x.logAmplitudeCoefficient, peakTroughBetaWithAssumedMsy2Pct: Math.log(x.priceHigh / x.priceLow) / -Math.log(effectiveRatio), strictLags: x.strictLags.map(l => ({ ...clone(l), strictBetaWithAssumedMsy2Pct: Math.log(l.priceEnd / l.priceStart) / -Math.log(effectiveRatio) })), limitations: x.limitations, sourceIds: x.sourceIds };
});

const FORMULAS = [
  { id: 'F1', title: 'Q4能繁情景与月路径', expression: 'd0 = 1 − 3602/3780；S_2026-12 = S_2026-09 × (1−d)；季度间缺失月线性插值；2027-01起 S_m = S_2026-12 × (1+gS)^((m−2026-12)/12)', units: 'S：万头；d,gS：小数（输入百分数先/100）', limit: '观测季度点和插值/未来情景严格区分；修改Q2/Q3不会自动更新d。', sourceIds: ['sow_202606', 'sow_202609'] },
  { id: 'F2', title: '时滞与观测锚', expression: '固定：S̃_m=S_(m−L)；分布：S̃_m=0.1S_(m−8)+0.2S_(m−9)+0.4S_(m−10)+0.2S_(m−11)+0.1S_(m−12)；观测锚S0=S̃_2026-08', units: 'L：月；S̃：万头', limit: '先加权母猪量，再代入非线性价函数；不同L对应不同基期母猪，不能永远固定3990。分布核是人工设定。本轮数量算术加权与历史研究的对数加权相关检验不同，不能称为已经验证的同一模型。', sourceIds: [] },
  { id: 'F3', title: '未来效率与重量', expression: 'y=(m−2026-08)/12，t=min(max(y,0),1)；PSY(y)=PSYmax−(PSYmax−PSY0)(1−a)^y；rMSY=(PSY(y)/PSY0)(s1/s0)^t(c1/c0)^t(A1/A0)^t；直接MSY模式 rMSY=(MSY1/MSY0)^t；rW=(W1/W0)^t；E_m=(S̃_m/S0)rMSY·rW', units: 'PSY、MSY：头/母猪/年；W：kg/头；E、各r为比值', limit: 'PSY基值的经产母猪分母不能冒充全国全能繁MSY；结构比率均为情景。有上限PSY继续收敛；直接MSY和重量在一年后固定。heads令rMSY=rW=1，msy令rW=1。', sourceIds: ['psy_cn_2025'] },
  { id: 'F4', title: '长期成本路线', expression: 'P*=C必要产能 + K权益 × r权益 / 120；默认=14.9+1000×10%/120=15.733333元/kg', units: 'C、P*：元/kg；K：元/每年一头产能；r：小数；120：归一化kg/头', limit: 'C14.9、权益1000、10%均为判断；政策数量不能单独识别它们。120是该成本账本的固定归一化，不与全国供给重量自动联动。', sourceIds: ['SN_IR_20250905', 'USDA_ERS_CCR'] },
  { id: 'F4b', title: '可选技术成本拆解', expression: 's=成活率/100；u=利用率/100；sf=0.95/s；F=(0.9/u)×饲养天数指数×sf；H=[1+0.5(1−s)/s]/[1+0.5×0.05/0.95]；C仔猪=2.9(0.25+0.75×29/PSY)sf；C饲料=6.7(FCR/2.45)H×料价指数/100；C动保=0.3×动保指数×sf；C人工=1.5(0.3+0.7F)×人工指数；C折旧=0.2F；C总部=0.8F；C总=六项之和', units: '各C：元/kg；PSY：头/母猪/年；其余比率/指数为无量纲', limit: '2.9/6.7/0.3/1.5/0.2/0.8来自公司单期拆分；25%固定仔猪成本、半程死亡耗料及30%固定人工等是模型假设。技术档的PSY不是全国未来PSY参数，A—E也不是调查分位。全部技术档参数在置顶假设中列出。', sourceIds: ['SN_IR_20250905'] },
  { id: 'F5', title: '历史振幅系数与外推', expression: 'e_j=(S末/S初)(1+g历史MSY)^Tj(1+ΔW历史)；βj=ln(P高/P低)/[−ln(e_j)]；β=同价序列合格阶段βj中位数；P_m=P0 E_m^(−β)', units: 'β：无量纲振幅系数；T：年；历史体重为阶段累计变化，不是年增速', limit: 'e_j>0.98排除自动校准。默认仅两段现代MARA去化半程；峰谷价格时点并非统一+10个月。不是短期因果预测或可置信概率。', sourceIds: strictLagEvidence.flatMap(x => x.sourceIds) },
  { id: 'F6', title: '需求路线', expression: 'T_m=(1−u)E_m+u(1+g进口)^y；D_m=(1+g需求)^y；z=T_m/D_m；常弹性 Pr_m=Pr0 z^(−1/ε)；局部线性 Pr_m=Pr0[1+(1−z)/ε]；P_m=P0+λ(Pr_m−Pr0)', units: 'u：进口占比；g：年变化小数；Pr：零售元/kg；P：活猪元/kg；λ：绝对价格斜率；ε为需求价格弹性绝对值', limit: 'ε年度估计移植到月度，λ尚未估计；两种函数是条件模型，库存、出口、内生进口和供给反应省略。', sourceIds: ['usda_elasticity', 'mara_202608', 'oecd_model'] },
  { id: 'F7', title: '政策假设锚', expression: 'S0=policySows；P0=P*；当λ>0时 Pr0=21+(P*−当期观测活猪价)/λ', units: 'S0：万头；P、Pr：元/kg', limit: '3750是官方数量锚；将它对应P*与推导零售价是作者假设。不能同时把观测零售21和抬高后的政策活猪价称为真实同期观测。', sourceIds: ['policy_2026', 'mara_202608'] },
  { id: 'F8', title: '季度、年度与季节归一化', expression: 'P_Q=(P_m1+P_m2+P_m3)/3；P_年=Σ12 P_m/12；季节先按因子乘价，再缩放使P_年保持原均值', units: '元/kg；等月权重', limit: '季度、年度均价、最大月均价和周期日度高点是四个不同量。', sourceIds: [] }
];

const HARD_ASSUMPTIONS = [
  { id: 'A_policy', text: '政府正常保有量兼顾稳定供给、效率与调控。把它进一步视为“多数必要产能可获合理利润”的均衡，是附加假设，不能从数量目标推导唯一价格。', status: 'user_theoretical_assumption', sourceIds: ['policy_2026'] },
  { id: 'A_profit', text: '养殖主体以跨期盈利为目标，但可在当期亏损时扩张或维持生产；本轮价格模块没有求解企业补栏最优化。', status: 'theoretical_assumption', sourceIds: [] },
  { id: 'A_capital', text: '养殖主体资本有限，亏损和增长需融资。当前价格路径是外生情景，没有把融资约束自动反馈成母猪退出率。', status: 'theoretical_assumption_not_endogenized', sourceIds: [] },
  { id: 'A_biology', text: '8/10/12个月为可选近似；分布滞后核10/20/40/20/10%是人为示范，不是估计结果。', status: 'modeling_assumption', sourceIds: [] },
  { id: 'A_future', text: '未来无新增重大疫病、统计口径突变或政策反转；现有模型没有显式冲击项。', status: 'conditioning_assumption', sourceIds: [] },
  { id: 'A_weights', text: '未来全国基期体重120kg、进口占比2%、MSY结构比例均为可编辑归一化情景，不声称为精确实时全国观测。', status: 'normalization_assumption', sourceIds: [] }
];
const ledger = M.PARAMS.filter(p => priceKeys.has(p.key)).map(p => ({ key: p.key, label: p.label, group: p.group, value: BASE[p.key], unit: p.unit || '类别/无量纲', evidence: p.evidence, description: p.description, sourceIds: p.sourceIds || [], implemented: p.key === 'priceMethod' ? '逐条路线分别计算' : p.showWhen ? '有条件生效，参见showWhen与传导审计' : '见公式和路线识别限制', ...(p.showWhen ? { showWhen: p.showWhen } : {}) }));
const allIds = new Set([...ledger.flatMap(x => x.sourceIds), ...HARD_ASSUMPTIONS.flatMap(x => x.sourceIds), ...FORMULAS.flatMap(x => x.sourceIds), ...strictLagEvidence.flatMap(x => x.sourceIds), ...matrix.flatMap(row => ROUTES.flatMap(route => row.resultsByRoute[route].sourceIds))]);
const unresolved = [...allIds].filter(id => !SOURCE_MAP.has(id));
assert.equal(unresolved.length, 0, `缺来源ID：${unresolved.join(',')}`);
const flatMatrix = matrix.flatMap(row => ROUTES.map(route => {
  const r = row.resultsByRoute[route];
  return { id: row.id, group: row.group, label: row.label, design: row.design, route, changedInputs: row.changedInputs, unit: r.unit, Q1: r.quarterly[0]?.price ?? null, Q2: r.quarterly[1]?.price ?? null, Q3: r.quarterly[2]?.price ?? null, Q4: r.quarterly[3]?.price ?? null, annual: r.annualPrice, annualDelta: r.annualDeltaVsGlobalBaseline, maximumMonthlyMean: r.maximumMonthlyMean, maximumMonthlyMeanMonths: r.maximumMonthlyMeanMonths, beta: route === 'capacity' ? r.calibration.beta : null, sourceIds: r.sourceIds, limitationRefs: r.limitationRefs };
}));
const output = {
  title: '2027年猪价：假设置顶、逐项变动与联合情景的可复算矩阵',
  meta: { asOf: D.meta.asOf, timezone: D.meta.timezone, engineVersion: M.VERSION, engineReadOnlyPath: enginePath, dataReadOnlyPath: dataPath, engineSha256: sha(engineText), dataSha256: sha(dataText), scriptSha256: sha(fs.readFileSync(__filename, 'utf8')), reproduction: 'node academic_work/price_assumptions.js', method: '逐项敏感性与明确标注的联合情景；独立重写价格公式并逐月核对原引擎；未估计新统计参数。', matrixRows: matrix.length, routeRows: flatMatrix.length, probabilities: '全部未赋值；既不生成主观概率，也不将敏感性范围称作统计置信区间。' },
  assumptionsFirst: { theoreticalAndClosureAssumptions: HARD_ASSUMPTIONS, parameterLedger: ledger, technicalCostCombinations: { fieldsInOrder: ['PSY头/母猪/年', '料肉比', '成活率%', '产能利用率%', '饲养天数指数', '人工单价指数', '动保强度指数'], tiers: TECHNICAL_TIERS, status: '参数组合均为技术敏感性设定，非全国调查分位；基础公司六项拆分参见SN_IR_20250905。', engineeringAssumptions: { pigletFixedCostShare: .25, pigletReproductionRelatedShare: .75, mortalityFeedSpentFraction: .5, laborFixedShareInFormula: .3, laborUtilizationRelatedShareInFormula: .7, baseSurvival: .95, baseUtilization: .9, basePSY: 29, baseFCR: 2.45 }, referenceComponentsYuanKg: { piglet: 2.9, feed: 6.7, health: .3, labor: 1.5, depreciation: .2, headquarters: .8 } }, fullBaseConfigForReproduction: BASE, sensitivityDesign: { core: '每组未列输入均保持基准；组内模式比较提供groupBaselinePatch；联合情景另外列出全部changes。', elasticityBounds: { values: [.2, .374, .6], status: '.20/.60是判断网格；.374是年度家庭零售需求来源先验，均非本模型的月度估计置信界。' }, alternativeElasticity: { value: .163, status: '另一消费口径的来源估计，单列压力演示，非同一估计下界。' }, higherProductivity: 'bounded差距收敛12%，一年PSY增长4.410256%；direct MSY 18→18.9，一年5%。', fixedLags: [8, 10, 12], distributedWeights: { 8: .1, 9: .2, 10: .4, 11: .2, 12: .1 }, noCartesianProduct: '不是全参数笛卡尔积，避免把多个不利参数无说明叠加；另算原有四个联合情景。' } },
  units: { price: '元/kg活猪', retail: '元/kg猪肉', sows: '万头', efficiency: '头/母猪/年或相对比值，严格区分PSY与MSY', weight: 'kg/出售猪', inputPct: '百分数，计算时除100', time: '月度路径；年变化复合到月', average: '月度等权算术平均' },
  formulas: FORMULAS,
  limitations: LIMITS,
  baseline,
  matrix,
  flatMatrix,
  historicalIdentificationCheck: strictLagEvidence,
  transmissionAudit: audit,
  verification: { independentMonthlyPriceComparisons: priceComparisons, independentQuantityAndAnchorComparisons: outputComparisons, uniqueConfigurations: computeCache.size, baselineReferenceValuesPassed: true, quarterlyAnnualAggregationPassed: true, allInputsMatchActualParams: true, unresolvedSourceIds: unresolved, sourceCount: allIds.size, existingEngineAndDataNotModified: fs.readFileSync(enginePath, 'utf8') === engineText && fs.readFileSync(dataPath, 'utf8') === dataText },
  sources: [...allIds].sort().map(id => clone(SOURCE_MAP.get(id)))
};
fs.mkdirSync(__dirname, { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results_price.json'), JSON.stringify(output, null, 2) + '\n');

function f(v, digits = 4) { return v == null ? '不可计算' : Number(v).toFixed(digits); }
function inputs(row) { return Object.entries(row.requestedPatch).map(([k, v]) => `${k}=${v}`).join('；') || '全部基准'; }
const lines = [
  '# 2027年猪价假设矩阵：可复算论文附录', '',
  `研究截点：${D.meta.asOf}，${D.meta.timezone}。读取引擎 ${M.VERSION}。本附录只计算条件情景，不给预测概率。`, '',
  '## 一、先列假设', '',
  ...HARD_ASSUMPTIONS.map(x => '- ' + x.text), '',
  '所有输入以 results_price.json 的 assumptionsFirst.parameterLedger 置顶列明；未改变的参数维持引擎基准。以下每个情景同时计算三条路线，结果不是独立估计的置信区间。', '',
  '### 核心基准', '',
  '| 项目 | 数值与口径 |', '|---|---|',
  `| 2026 Q2、Q3能繁 | 3780、3602万头；Q4延续去化率${f(BASE.q4DepletionPct, 6)}%，推演年末${f(baseline.demand.sow2026December10k, 6)}万头 |`,
  '| 2026-08价格锚 | MARA活猪11.36、同表猪肉零售21.00元/kg；固定10个月对应母猪3990万头 |',
  '| 效率 | PSY23.4、情景上限32、每年缩小差距6%；一年PSY23.916，提高2.205128%；成活等结构比值保持1 |',
  '| 体重与进口 | 全国120→120kg；进口份额2%、进口增长0，均为归一化情景 |',
  '| 需求 | 固定价格下年下降1%；ε0.374；零售至活猪绝对斜率0.75 |',
  `| 历史校准 | 历史MSY年增2%、历史体重不变；两段现代MARA去化半程β中位数${f(baseline.capacity.calibration.beta, 8)} |`,
  '| 成本中枢 | 必要成本14.9元/kg＋每年一头产能1000元权益×10%/120kg＝15.733333元/kg |',
  '| 聚合 | 月均价等权聚合为季度、全年；季节调整默认0；最大月均价并非周期高点 |', '',
  '### 敏感性网格的地位', '',
  'ε=0.20与0.60是人为选定的宽网格，不是新估计值、统计置信界或经文献证明的上下限。0.163单列为另一消费口径的来源参数。未来效率较高情景采用PSY差距收敛12%，或直接MSY由18升至18.9。历史MSY、未来MSY和公司技术成本分别使用不同参数。', '',
  '### 完整价格参数账本', '',
  'observed表示该基准数值有来源，derived表示从观测计算，assumption表示情景。即使基准值有来源，将其延伸至2027也仍需满足下述模型假设。参数在其所属模式下生效，不能把非当前模式的数值重复乘入。', '',
  '| 实际字段 | 含义 | 基准值 | 单位 | 地位与来源 |', '|---|---|---|---|---|',
  ...ledger.map(p => `| ${p.key} | ${p.label} | ${typeof p.value === 'number' ? (Number.isInteger(p.value) ? p.value : f(p.value, 6)) : String(p.value).replaceAll('|', '/')} | ${p.unit} | ${p.evidence} ${p.sourceIds.map(id => `[${id}](${SOURCE_MAP.get(id).url})`).join('；')} |`), '',
  '### 可选技术成本档的全部参数', '',
  '| 技术组合 | PSY | 料肉比 | 成活率% | 利用率% | 饲养天数指数 | 人工指数 | 动保指数 |', '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...Object.entries(TECHNICAL_TIERS).map(([k, values]) => `| ${k} | ${values.join(' | ')} |`), '',
  '上述均为技术敏感性组合，没有全国样本权重。仔猪成本固定部分25%、繁殖相关部分75%、死亡猪按一半育肥耗料、人工按30%固定与70%利用率相关拆分，也均为工程假设；不由公司的六项成本披露直接识别。', '',
  '## 二、公式', ''
];
FORMULAS.forEach(x => lines.push(`### ${x.id} ${x.title}`, '', x.expression, '', `单位：${x.units}。`, '', x.limit, ''));
lines.push('## 三、基准路线', '', '| 路线 | Q1 | Q2 | Q3 | Q4 | 全年 | 最大月均价 |', '|---|---:|---:|---:|---:|---:|---:|');
ROUTES.forEach(route => { const r = baseline[route]; lines.push(`| ${ROUTE_NAMES[route]} | ${r.quarterly.map(q => f(q.price)).join(' | ')} | ${f(r.annualPrice)} | ${f(r.maximumMonthlyMean)} |`); });
lines.push('', '历史路线的高值反映峰谷振幅外推设定，并非“另一个同等可靠的预测”。需求路线Q4季均16.653657与最大月均16.794942也都不是已知周期最高价。', '', '## 四、逐组完整结果', '');
for (const group of [...new Set(matrix.map(x => x.group))]) {
  lines.push(`### ${group}`, '', '| 情景及实际输入 | 路线 | Q1 | Q2 | Q3 | Q4 | 全年 | 相对同路线全局基准 |', '|---|---|---:|---:|---:|---:|---:|---:|');
  for (const row of matrix.filter(x => x.group === group)) {
    for (const route of ROUTES) {
      const r = row.resultsByRoute[route];
      lines.push(`| ${row.label}；${inputs(row)} | ${route} | ${r.quarterly.map(q => f(q.price)).join(' | ')} | ${f(r.annualPrice)} | ${f(r.annualDeltaVsGlobalBaseline)} |`);
    }
  }
  lines.push('');
  for (const row of matrix.filter(x => x.group === group && x.note)) lines.push(`注（${row.id}）：${row.note}`, '');
}
lines.push('## 五、历史识别边界：峰谷与固定时移必须分开', '', '| 阶段 | 峰谷β，未修正MSY | 峰谷β，假定历史MSY年增2% | 严格+8月β，未修正 | 严格+10月β，未修正 | 严格+12月β，未修正 |', '|---|---:|---:|---:|---:|---:|');
strictLagEvidence.forEach(x => lines.push(`| ${x.label} | ${f(x.peakTroughBetaWithoutMsyCorrection)} | ${f(x.peakTroughBetaWithAssumedMsy2Pct)} | ${x.strictLags.map(l => f(l.logAmplitudeCoefficient)).join(' | ')} |`));
lines.push('', '严格时移端点甚至可能为负值；不能从事后价格峰谷的较大系数推断10个月后必然出现同幅价格上涨。默认β对历史效率修正及阶段选择非常敏感。改变预测lagMonths并不会重估历史β。', '', '## 六、传导审计', '');
audit.forEach(x => lines.push(`- **${x.name}**：${x.explanation}`));
lines.push('', '## 七、识别与适用限制', '');
for (const [name, items] of Object.entries(LIMITS)) { lines.push(`### ${name}`, '', ...items.map(x => '- ' + x), ''); }
lines.push('## 八、复算与来源', '', '运行 `node academic_work/price_assumptions.js` 生成完整JSON及本附录。' + `${matrix.length}个设定、${flatMatrix.length}条路线结果；独立逐月价格复算${priceComparisons}次、数量与锚点字段复算${outputComparisons}次，全部通过。`, '', `engine.js SHA-256：${sha(engineText)}`, '', `data.js SHA-256：${sha(dataText)}`, '', '所有结果行保留sourceIds；完整URL、日期、定位与来源局限见JSON末尾sources。本附录未重新抓取或扩展原有来源。核心来源如下：', '');
for (const id of ['mara_202608', 'sow_202606', 'sow_202609', 'policy_2026', 'psy_cn_2025', 'usda_elasticity', 'SN_IR_20250905', 'oecd_model']) { const s = SOURCE_MAP.get(id); lines.push(`- [${id}：${s.title}](${s.url})。${s.period || s.publicationDate || ''}；${s.locator || ''}。${s.limitations || ''}`); }
fs.writeFileSync(path.join(__dirname, 'results_price.md'), lines.join('\n') + '\n');
console.log(JSON.stringify({ output: path.join(__dirname, 'results_price.json'), summary: path.join(__dirname, 'results_price.md'), rows: matrix.length, routeRows: flatMatrix.length, verification: output.verification, baseline: Object.fromEntries(ROUTES.map(route => [route, { quarterly: baseline[route].quarterly.map(q => q.price), annual: baseline[route].annualPrice }])) }, null, 2));
