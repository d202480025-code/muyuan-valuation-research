'use strict';
const assert=require('node:assert/strict');const M=require('../engine.js');require('../data.js');
const p=M.mergeConfig(M.DEFAULTS,{companyGrowthMode:'flat',growthCapexPerHead:2000,growthInvestmentTiming:'one_year_before'});
const r=M.calculate(p,PIG_DATA);let checks=0;function eq(a,b){assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b)));checks++;}
let wc=70,pv=0;for(let i=0;i<10;i++){const a=r.annual[i],price=i===0?r.summary.annualPrice:i===1?(r.summary.annualPrice+15.5)/2:15.5,ni=96*(price-11.8)*.95,newWC=96*price*.05,fcfe=ni+115.2-95-(newWC-wc);eq(a.cost,11.8);eq(a.profit,ni);eq(a.fcfe,fcfe);eq(a.presentValue,fcfe/1.1**(i+1));pv+=fcfe/1.1**(i+1);wc=newWC;}
eq(r.valuation.terminalFCFE,337.44);eq(r.valuation.valuePerShare,(pv+337.44/.1/1.1**10)/p.shares);eq(r.valuation.valuePerShare,58.1532790643764);
assert.equal(M.PARAMS.length,131);checks++;assert.ok(M.PARAMS.every(p=>!p.key.startsWith('advantage')));checks++;
const g=M.calculate(M.mergeConfig(p,{companyGrowthMode:'target',targetHogs:9000,targetGrowthYears:4}),PIG_DATA);eq(g.valuation.valuePerShare,61.22621241421078);eq(g.annual.reduce((s,a)=>s+a.growthCapex,0),200);eq(g.annual[0].growthCapex,(8000*(9000/8000)**.25-8000)*.2);
eq(96*(16-11.8)+96*1.2-95,96*(16-11.2)+96*.6-95);
const main=M.calculate(M.mergeConfig(p,{priceMethod:'custom',customQ1:20,customQ2:20,customQ3:20,customQ4:20,normalPigPrice:15.5,normalEarningsMode:'firstyear',valuationMethod:'pe'}),PIG_DATA);eq(main.summary.year1Profit,747.84);eq(main.valuation.valuePerShare,129.54105309376422);
console.log(checks+' revised independent accounting and formula checks passed.');
