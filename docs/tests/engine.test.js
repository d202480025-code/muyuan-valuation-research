'use strict';
const assert=require('node:assert/strict');
require('../data.js');
const M=require('../engine.js');
const D=globalThis.PIG_DATA;
let passed=0;
function test(name,f){f();passed++;console.log('PASS '+name);}
function eq(a,b,t=1e-8){assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);}
function calc(p){return M.calculate(M.mergeConfig(M.DEFAULTS,p),D);}
const quotedFutures={futuresQuote:15000,futuresBasis:.5,futuresObservedDate:'2026-10-23',futuresContract:'lh2701',futuresQuoteType:'settlement',futuresBasisScope:'河南，指定交割品质，活重口径',futuresQuoteSource:'大商所公开结算价；用户录入'};
const encodeConfig=(version,config)=>Buffer.from(JSON.stringify({version,config})).toString('base64url');
test('120kg disclosure sums to 1488; no added duplicate piglet cost',()=>{const c=M.costs(M.mergeConfig(M.DEFAULTS,{costBasis:'technical',marginalTier:'B'}));eq(c.fullCost,12.4);eq(c.headCost,1488);eq(c.normalReturn,1000*.1/120);});
test('default valid and quarterly profits reconcile with year one',()=>{const r=calc({});assert.equal(r.valid,true);eq(r.quarterly.reduce((s,q)=>s+q.profit,0),r.annual[0].profit);assert.equal(r.monthly[0].sourceMonth,'2026-03');assert.equal(r.monthly[9].sourceMonth,'2026-12');eq(r.monthly[9].sows,3602*(3602/3780));});
test('万头、公斤、亿元 profit conversion',()=>{const r=calc({priceMethod:'custom',customQ1:13,customQ2:13,customQ3:13,customQ4:13,companyCost:12,hogsPerYear:8000,companyWeight:120,attributionPct:100,otherProfit:0});eq(r.summary.year1Profit,96);});
test('MSY direct mode does not multiply survival or PSY twice',()=>{const p={productivityMode:'direct',msyBase:18,msyTarget:19};const a=calc(p),b=calc({...p,survivalTarget:80,psyCeiling:40,activeSowRatioTarget:70});eq(a.summary.annualPrice,b.summary.annualPrice);});
test('future efficiency improvement reduces scarcity holding history calibration fixed',()=>{const a=calc({productivityMode:'direct',msyBase:18,msyTarget:18}),b=calc({productivityMode:'direct',msyBase:18,msyTarget:19});assert.ok(b.summary.annualPrice<a.summary.annualPrice);});
test('two post-ASF modern episodes are eligible and series not spliced',()=>{const r=calc({priceMethod:'capacity',historicalMsyGrowthPct:0});assert.equal(r.valid,true);assert.equal(r.calibration.selectedCount,2);assert.deepEqual(r.calibration.cycles.filter(c=>c.eligible).map(c=>c.priceSeries),['mara','mara']);eq(r.calibration.beta,(8.305060632003+3.6185)/2,.001);});
test('high historical MSY improvement rejects non-contracting capacity cycle',()=>{const r=calc({priceMethod:'capacity',historicalCycle:'modern_2022_2024_mara',historicalMsyGrowthPct:10});assert.equal(r.valid,false);assert.equal(r.calibration.beta,null);});
test('near-zero historical depletion cannot generate astronomical automatic beta',()=>{const r=calc({priceMethod:'capacity',historicalMsyGrowthPct:7.5});assert.ok(r.calibration.beta<30);assert.equal(r.calibration.cycles.find(x=>x.id==='modern_2022_2024_mara').eligible,false);});
test('r <= g and malformed numeric inputs give errors instead of stale output',()=>{assert.equal(calc({discountRatePct:5,terminalGrowthPct:5}).valid,false);assert.equal(calc({companyCost:'11.8'}).valid,false);assert.equal(calc({marginalTier:'unknown'}).valid,false);assert.equal(calc({hogsPerYear:NaN}).valid,false);});
test('growth requires explicit capital spending',()=>{const r=calc({volumeGrowthPct:5,volumeGrowthYears:2,growthCapexPerHead:1000});eq(r.annual[1].growthCapex,40);assert.ok(r.annual[1].fcfe<r.annual[1].profit+r.annual[1].da);});
test('net borrowing cannot manufacture equity value without a debt service path',()=>{assert.equal(calc({annualNetRepayment:-100}).valid,false);const r=calc({annualNetRepayment:20});eq(r.annual[0].interestSaving,0);eq(r.annual[1].interestSaving,25*20/M.DEFAULTS.interestDebt);});
test('other EBITDA is independent of farming attribution and model outside cash not double-added to EV/PB',()=>{const a=calc({otherProfit:10,attributionPct:0,extraCash:0}),b=calc({otherProfit:10,attributionPct:0,extraCash:100});eq(a.alternatives.find(x=>x.id==='ev_ebitda').valuePerShare,b.alternatives.find(x=>x.id==='ev_ebitda').valuePerShare);eq(a.alternatives.find(x=>x.id==='roe_pb').valuePerShare,b.alternatives.find(x=>x.id==='roe_pb').valuePerShare);assert.ok(a.alternatives.find(x=>x.id==='ev_ebitda').valuePerShare<100);});
test('FCFE never subtracts net debt again; EV method does exactly once',()=>{const a=calc({netDebt:500}),b=calc({netDebt:600});eq(a.summary.valuePerShare,b.summary.valuePerShare);const ea=a.alternatives.find(x=>x.id==='ev_ebitda'),eb=b.alternatives.find(x=>x.id==='ev_ebitda');eq(ea.valuePerShare-eb.valuePerShare,100/M.DEFAULTS.shares);});
test('terminal all sustaining capital defaults to D&A, no perpetual maintenance windfall',()=>{const r=calc({terminalGrowthPct:0});eq(r.valuation.terminalFCFE,r.annual.at(-1).profit);});
test('terminal growth reinvestment deducted',()=>{const r=calc({terminalGrowthPct:2,terminalROEPct:15});eq(r.valuation.terminalFCFE,r.annual.at(-1).profit*1.02*(1-.02/.15));});
test('last explicit year-end repayment saves interest in first terminal year',()=>{const r=calc({annualNetRepayment:50,repaymentYears:10,explicitYears:10,terminalGrowthPct:0});eq(r.valuation.terminalFCFE,r.annual.at(-1).profit+25*50/M.DEFAULTS.interestDebt*.95);});
test('negative normalized earnings make PE unavailable',()=>{const r=calc({normalPigPrice:10,longRunCost:12});assert.equal(r.alternatives.find(x=>x.id==='pe').applicable,false);});
test('consistent zero-growth PE and ROE-PB agree at PE=1/r',()=>{const r=calc({normalEarningsMode:'roe',normalROEPct:20,normalPE:10,discountRatePct:10,terminalGrowthPct:0});eq(r.alternatives.find(x=>x.id==='pe').valuePerShare,r.alternatives.find(x=>x.id==='roe_pb').valuePerShare);});
test('one-year recovery does not rewrite first-year cost or quarterly profit',()=>{const r=calc({priceMethod:'custom',customQ1:13,customQ2:13,customQ3:13,customQ4:13,recoveryYears:1,companyCost:12.5});eq(r.annual[0].cost,12.5);eq(r.annual[0].profit,r.quarterly.reduce((s,q)=>s+q.profit,0));});
test('recovery and repayment beyond explicit horizon rejected',()=>{assert.equal(calc({recoveryYears:5,explicitYears:5}).valid,false);assert.equal(calc({repaymentYears:10,explicitYears:5}).valid,false);});
test('seasonality alters quarterly shape but preserves annual mean',()=>{const a=calc({}),b=calc({seasonQ1:-10,seasonQ4:10});eq(a.summary.annualPrice,b.summary.annualPrice);assert.notEqual(a.summary.q4Price,b.summary.q4Price);});
test('import/export hash roundtrip validates all parameters',()=>{const c=M.mergeConfig(M.DEFAULTS,{priceMethod:'capacity',historicalCycle:'modern_2022_2024_mara'});assert.deepEqual(M.deserialize(M.serialize(c),D),c);assert.throws(()=>M.deserialize('!!!',D));const hostile=Buffer.from(JSON.stringify({version:M.VERSION,config:{__proto__:null,evil:123}})).toString('base64url');assert.throws(()=>M.deserialize(hostile,D));});
test('reverse DCF recovers the given normal price',()=>{const r=calc({}),back=calc({marketPrice:r.summary.valuePerShare});eq(back.summary.impliedNormalPrice,M.DEFAULTS.normalPigPrice,1e-7);});
test('all configured sources and data series are valid',()=>{const ids=new Set(D.sources.map(s=>s.id));for(const p of M.PARAMS)for(const id of p.sourceIds)assert.ok(ids.has(id),'missing source '+id);assert.equal(D.companyHistory.length,10);assert.equal(D.history.filter(x=>x.priceSeries==='mara').length,141);assert.equal(D.historyMetadata.monthly_msy_available,false);});
test('auxiliary defaults neither invent a futures quote nor change established valuations',()=>{
  const r=calc({});assert.equal(r.crossChecks.futures.configured,false);assert.equal(r.crossChecks.futures.valid,false);assert.equal(r.crossChecks.futures.referencePrice,null);assert.deepEqual(r.crossChecks.futures.errors,[]);
  eq(r.summary.valuePerShare,60.497399193323844);eq(r.summary.annualPrice,14.355724462735962);
  const values={base:60.497399193323844,slow:53.872811137470784,stress:46.0575214301265,strong:64.46264892212254};
  for(const p of M.PRESETS)eq(calc(p.changes).summary.valuePerShare,values[p.id]);
  assert.deepEqual(M.PARAMS.find(p=>p.key==='priceMethod').options.map(x=>x.value),['demand','capacity','cost','custom']);
});
test('futures yuan per tonne converts to yuan per kg, positive and negative basis keep their sign',()=>{
  const f=M.crossChecks(quotedFutures).futures;assert.equal(f.configured,true);assert.equal(f.valid,true);eq(f.referencePrice,15.5);assert.equal(f.metadata.contract,'LH2701');assert.equal(f.metadata.inputStatus,'user_input');
  eq(M.crossChecks({...quotedFutures,futuresBasis:-.6}).futures.referencePrice,14.4);
  const bad=M.crossChecks({...quotedFutures,futuresBasis:-20}).futures;assert.equal(bad.valid,false);assert.equal(bad.referencePrice,null);assert.ok(bad.errors.some(x=>x.key==='futuresBasis'));
});
test('complete auxiliary references do not automatically change any primary price or valuation',()=>{
  const a=calc({}),b=calc({...quotedFutures,pigletExpectedSalePrice:14});
  assert.deepEqual(a.summary,b.summary);assert.deepEqual(a.quarterly,b.quarterly);assert.deepEqual(a.annual,b.annual);assert.equal(b.config.priceMethod,'demand');
});
test('missing futures provenance stays local to the auxiliary calculator',()=>{
  const r=calc({futuresQuote:15000});assert.equal(r.valid,true);eq(r.summary.valuePerShare,60.497399193323844);assert.equal(r.crossChecks.futures.valid,false);assert.equal(r.crossChecks.futures.referencePrice,null);
  for(const k of ['futuresObservedDate','futuresContract','futuresBasisScope','futuresQuoteSource'])assert.ok(r.crossChecks.futures.errors.some(x=>x.key===k));
});
test('futures dates are real calendar dates and contracts use odd delivery months',()=>{
  for(const date of ['2024-02-29','2000-02-29','2026-10-23'])assert.equal(M.crossChecks({...quotedFutures,futuresObservedDate:date}).futures.valid,true);
  for(const date of ['2026-02-29','1900-02-29','2026-04-31','2026-13-01','0000-01-01','2026-1-01'])assert.equal(M.crossChecks({...quotedFutures,futuresObservedDate:date}).futures.valid,false,date);
  for(const contract of ['LH2701','lh2703','LH2705','LH2707','LH2709','LH2711'])assert.equal(M.crossChecks({...quotedFutures,futuresContract:contract}).futures.valid,true,contract);
  for(const contract of ['LH2702','LH2712','LH2713','LH2700','LH202701','LX2701'])assert.equal(M.crossChecks({...quotedFutures,futuresContract:contract}).futures.valid,false,contract);
});
test('invalid or empty auxiliary numeric drafts never produce stale references',()=>{
  for(const quote of [null,-1,NaN,Infinity,'15000']){const r=calc({...quotedFutures,futuresQuote:quote});assert.equal(r.valid,true);assert.equal(r.crossChecks.futures.valid,false);assert.equal(r.crossChecks.futures.referencePrice,null);}
  const r=calc({...quotedFutures,futuresBasis:null});assert.equal(r.valid,true);assert.equal(r.crossChecks.futures.valid,false);assert.equal(r.crossChecks.futures.referencePrice,null);
});
test('piglet default break-even and target prices use surviving sale kilograms',()=>{
  const p=M.crossChecks({}).piglet;assert.equal(p.valid,true);eq(p.breakEvenPrice,1400/114);eq(p.requiredPrice,1500/114);assert.equal(p.expectedProfit,null);
  eq(M.crossChecks({pigletExpectedSalePrice:14}).piglet.expectedProfit,196);
  eq(M.crossChecks({pigletExpectedSalePrice:p.requiredPrice}).piglet.expectedProfit,100);
});
test('piglet deaths reduce sale revenue denominator without charging the same mortality cost twice',()=>{
  const a=M.crossChecks({pigletSurvivalPct:100,pigletExpectedSalePrice:14}).piglet,b=M.crossChecks({pigletSurvivalPct:90,pigletExpectedSalePrice:14}).piglet;
  eq(a.breakEvenPrice,1400/120);eq(b.breakEvenPrice,1400/108);eq(a.expectedProfit,280);eq(b.expectedProfit,112);assert.ok(b.requiredPrice>a.requiredPrice);
});
test('zero survival, excessive survival, and unfinished piglet costs invalidate only piglet results',()=>{
  for(const patch of [{pigletSurvivalPct:0},{pigletSurvivalPct:101},{pigletSaleWeight:0},{pigletGrowCost:null},{pigletPurchasePrice:-10},{pigletExpectedSalePrice:null}]){
    const r=calc(patch);assert.equal(r.valid,true);const p=r.crossChecks.piglet;assert.equal(p.valid,false);assert.equal(p.breakEvenPrice,null);assert.equal(p.requiredPrice,null);assert.equal(p.expectedProfit,null);eq(r.summary.valuePerShare,60.497399193323844);
  }
});
test('auxiliary text preserves blanks but rejects nonstrings, excessive length, and control characters',()=>{
  const blanks=M.mergeConfig(M.DEFAULTS,{futuresBasisScope:'   ',futuresQuoteSource:''});assert.deepEqual(M.deserialize(M.serialize(blanks),D),blanks);
  for(const value of [42,'x'.repeat(241),'line\nline','bad\u0000source','bad\u0085source']){
    const c={...quotedFutures,futuresQuoteSource:value},r=calc(c);assert.equal(r.valid,true);assert.equal(r.crossChecks.futures.valid,false);assert.ok(r.crossChecks.futures.errors.some(x=>x.key==='futuresQuoteSource'));
    assert.throws(()=>M.serialize(c));assert.throws(()=>M.deserialize(encodeConfig(M.VERSION,c),D));
  }
});
test('1.0.0 configurations migrate with auxiliary defaults and retain existing main parameters',()=>{
  const legacy=Object.fromEntries(M.PARAMS.filter(p=>!p.auxiliary).map(p=>[p.key,M.DEFAULTS[p.key]]));legacy.companyCost=12.2;
  const c=M.deserialize(encodeConfig('1.0.0',legacy),D);assert.equal(M.VERSION,'1.3.0');assert.equal(c.companyCost,12.2);
  for(const p of M.PARAMS.filter(p=>p.auxiliary))assert.equal(c[p.key],p.default);
  assert.equal(JSON.parse(Buffer.from(M.serialize(c),'base64url').toString('utf8')).version,'1.3.0');
  assert.throws(()=>M.deserialize(encodeConfig('1.0.0',{...legacy,unknownField:1}),D));assert.throws(()=>M.deserialize(encodeConfig('9.0.0',legacy),D));
});
test('unfinished auxiliary inputs roundtrip without invalidating a legacy or current main configuration',()=>{
  const c=M.mergeConfig(M.DEFAULTS,{futuresQuote:15000,futuresObservedDate:'2026-02-30',pigletGrowCost:null});
  const back=M.deserialize(M.serialize(c),D);assert.deepEqual(back,c);const r=calc(back);assert.equal(r.valid,true);assert.equal(r.crossChecks.futures.valid,false);assert.equal(r.crossChecks.piglet.valid,false);
  assert.equal(M.deserialize(encodeConfig('1.0.0',{futuresQuote:null}),D).futuresQuote,null);
});
test('CSV includes provenance, units, validity, and auxiliary results as safe text',()=>{
  const r=calc({...quotedFutures,pigletExpectedSalePrice:14,futuresQuoteSource:'=1+1'}),s=M.csv(r);
  for(const text of ['期货与基差','2026-10-23','LH2701','settlement','河南，指定交割品质，活重口径','元/吨','外购仔猪育肥','元/每头买入仔猪','保本出栏价','含目标利润所需出栏价','196'])assert.ok(s.includes(text),text);
  assert.ok(s.includes('"\'=1+1"'));assert.ok(s.includes('"基差调整后的市场对照价","15.5","元/kg"'));
});
console.log(`${passed} meaningful calculation checks passed.`);

