'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=__dirname,M=require('../pig-cycle-lab/engine.js');require('../pig-cycle-lab/data.js');const D=globalThis.PIG_DATA;
const config=M.mergeConfig(M.DEFAULTS,{companyGrowthMode:'flat',growthCapexPerHead:2000,growthInvestmentTiming:'one_year_before',cashflowMode:'bridge',valuationMethod:'fcfe'});
function calc(p={}){let r=M.calculate(M.mergeConfig(config,p),D);assert.equal(r.valid,true,JSON.stringify(r.errors));return r;}
let checks=0;function near(a,b){assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b)));checks++;}
const base=calc(),costPrice=calc({priceMethod:'cost'}),historyPrice=calc({priceMethod:'capacity'});
const matrices=[];for(let price of [14,15,15.5,16,17])for(let r of [8,10,12])matrices.push({price,r,value:calc({normalPigPrice:price,discountRatePct:r}).valuation.valuePerShare});
const growth=[{id:'flat',name:'8000万头平量',patch:{}},{id:'old_capital',name:'2%增长三次 1000元当年投资',patch:{companyGrowthMode:'rate',growthCapexPerHead:1000,growthInvestmentTiming:'same_year'}},{id:'rate_new_capital',name:'2%增长三次 2000元提前投资',patch:{companyGrowthMode:'rate'}},{id:'target9000',name:'2031年9000万头',patch:{companyGrowthMode:'target',targetHogs:9000,targetGrowthYears:4}},{id:'target10000',name:'2031年1亿头',patch:{companyGrowthMode:'target',targetHogs:10000,targetGrowthYears:4}}].map(g=>({...g,result:calc(g.patch)}));
const joint=M.PRESETS.map(p=>({id:p.id,name:p.name,patch:p.changes,result:calc(p.changes)}));
const peak=[16,18,20].map(p=>({price:p,result:calc({priceMethod:'custom',customQ1:p,customQ2:p,customQ3:p,customQ4:p}),peakPE:96*(p-11.8)*.95*10/config.shares}));
const capital=[1500,2000,2500].map(k=>({k,result:calc({companyGrowthMode:'target',targetHogs:9000,targetGrowthYears:4,growthCapexPerHead:k})}));
const terminal=[0,1,2].map(g=>({g,result:calc({terminalGrowthPct:g})}));
const costSensitivity=[11,11.3,11.8,12.5].map(c=>({c,result:calc({companyCost:c,longRunCost:c})}));
const funding=[];for(let p of M.PRESETS)for(let target of [8000,9000]){let r=calc({...p.changes,companyGrowthMode:target===8000?'flat':'target',targetHogs:target,targetGrowthYears:4});let running=0,min=0;for(let a of r.annual){running+=a.fcfe;min=Math.min(min,running);}funding.push({scenario:p.id,name:p.name,target,year1FCFE:r.annual[0].fcfe,growthCapex:r.annual[0].growthCapex,minimumOpeningCash:-min});}
// Independent annual accounting and DCF, without calling the engine's valuation helpers.
let priorWC=70,pv=0;
for(let i=0;i<10;i++){let a=base.annual[i],price=i===0?base.summary.annualPrice:i===1?(base.summary.annualPrice+15.5)/2:15.5;
let ni=96*(price-11.8)*.95,da=115.2,nwc=96*price*.05,fcfe=ni+da-95-(nwc-priorWC);near(a.cost,11.8);near(a.profit,ni);near(a.da,da);near(a.fcfe,fcfe);near(a.presentValue,fcfe/1.1**(i+1));pv+=fcfe/1.1**(i+1);priorWC=nwc;}
near(base.valuation.terminalFCFE,337.44);near(base.valuation.valuePerShare,(pv+337.44/.1/1.1**10)/config.shares);
for(let p of M.PARAMS)assert.ok(!p.key.startsWith('advantage'));checks++;
for(let a of base.annual)near(a.cost,11.8);
for(let g of growth){let r=g.result;near(r.growth.valueAddedPerShare,r.valuation.valuePerShare-base.valuation.valuePerShare);for(let a of r.annual)near(a.cost,11.8);}
near(growth.find(x=>x.id==='target9000').result.annual.reduce((s,a)=>s+a.growthCapex,0),200);
const mainConfig=M.mergeConfig(config,{priceMethod:'custom',customQ1:20,customQ2:20,customQ3:20,customQ4:20,valuationMethod:'pe',normalPriceMode:'manual',normalPigPrice:15.5,normalPE:10,normalEarningsMode:'firstyear'});
const main=M.calculate(mainConfig,D);near(main.summary.year1Profit,747.84);near(main.valuation.valuePerShare,747.84*10/config.shares);
const out={version:M.VERSION,asOf:'2026-10-24',config,base,costPrice,historyPrice,mainConfig,main,matrices,growth,joint,peak,capital,terminal,costSensitivity,funding,independentChecks:checks};
fs.writeFileSync(path.join(root,'results_valuation.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({version:M.VERSION,base:base.summary,growth:growth.map(x=>({id:x.id,value:x.result.valuation.valuePerShare,added:x.result.growth.valueAddedPerShare})),joint:joint.map(x=>({id:x.id,value:x.result.valuation.valuePerShare})),peak:peak.map(x=>({price:x.price,PE:x.peakPE,DCF:x.result.valuation.valuePerShare})),checks},null,2));

