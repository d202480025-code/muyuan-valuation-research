'use strict';
const fs=require('fs'),assert=require('assert/strict'),M=require('../pig-cycle-lab/engine.js');require('../pig-cycle-lab/data.js');
const baseConfig=M.mergeConfig(M.DEFAULTS,{assetDepreciationMode:'cohort',terminalCapexMode:'explicit',companyGrowthMode:'flat',growthCapexPerHead:2000,growthInvestmentTiming:'one_year_before',cashflowMode:'bridge',valuationMethod:'fcfe'});
const calc=p=>M.calculate(M.mergeConfig(baseConfig,p),PIG_DATA);let checks=0;function near(x,y){assert.ok(Math.abs(x-y)<1e-8*Math.max(1,Math.abs(x),Math.abs(y)),`${x} != ${y}`);checks++;}
const base=calc({}),constant=calc({assetDepreciationMode:'constant',terminalCapexMode:'depreciation'}),growth=[{id:'flat',name:'8000万头平量',patch:{}},{id:'old_capital',name:'2%增长三次 1000元当年投资',patch:{companyGrowthMode:'rate',growthCapexPerHead:1000,growthInvestmentTiming:'same_year'}},{id:'rate_new_capital',name:'2%增长三次 2000元提前投资',patch:{companyGrowthMode:'rate'}},{id:'target9000',name:'2031年9000万头',patch:{companyGrowthMode:'target',targetHogs:9000,targetGrowthYears:4}},{id:'target10000',name:'2031年1亿头',patch:{companyGrowthMode:'target',targetHogs:10000,targetGrowthYears:4}}].map(x=>({...x,result:calc(x.patch)}));
const matrices=[];for(const price of [14,15,15.5,16,17])for(const r of [8,10,12])matrices.push({price,r,value:calc({normalPigPrice:price,discountRatePct:r}).valuation.valuePerShare});
const terminal=[0,1,2].map(g=>({g,result:calc({terminalGrowthPct:g})}));
const peak=[16,18,20].map(price=>({price,result:calc({priceMethod:'custom',customQ1:price,customQ2:price,customQ3:price,customQ4:price}),peakPE:96*(price-11.8)*.95*10/baseConfig.shares}));
const lifeSensitivity=[5,7,10,15].map(years=>({years,result:calc({oldAssetRemainingYears:years})}));
for(let i=0;i<10;i++){
 const x=base.annual[i],old=115.2*(10-i)/10;
 // Independent convolution: past maintenance / renewal payments, with fractional final biological-asset depreciation.
 let added=0;for(let k=0;k<i;k++){let age=i-k-1;added+=65*.95/10*Math.max(0,Math.min(1,10-age));added+=30*.7/2.5*Math.max(0,Math.min(1,2.5-age));}
 near(x.oldAssetDA,old);near(x.newAssetDA,added);near(x.da,old+added);
 near(x.profit+x.da,constant.annual[i].profit+constant.annual[i].da);near(x.fcfe,constant.annual[i].fcfe);
 near(x.profit,96*(x.price-x.cost)*.95);near(x.presentValue,x.fcfe/1.1**(i+1));
}
near(base.valuation.terminalFCFE,337.44+115.2-95);near(base.valuation.valuePerShare,(base.annual.reduce((t,x)=>t+x.presentValue,0)+(337.44+115.2-95)/.1/1.1**10)/baseConfig.shares);
near(base.valuation.valuePerShare-constant.valuation.valuePerShare,20.2/.1/1.1**10/baseConfig.shares);
for(const g of growth){const c=calc({...g.patch,assetDepreciationMode:'constant'});for(let i=0;i<10;i++)near(g.result.annual[i].fcfe,c.annual[i].fcfe);}
// Asset ages can alter reported profit without manufacturing cash in the same zero-marginal-tax case.
for(const l of lifeSensitivity)for(let i=0;i<10;i++)near(l.result.annual[i].fcfe,base.annual[i].fcfe);
const joint=M.PRESETS.map(x=>({id:x.id,name:x.name,result:calc(x.changes)}));
const costSensitivity=[11,11.3,11.8,12.5].map(c=>({c,result:calc({companyCost:c,longRunCost:c})}));
const funding=[];for(const p of M.PRESETS)for(const target of [8000,9000]){const r=calc({...p.changes,companyGrowthMode:target===8000?'flat':'target',targetHogs:target,targetGrowthYears:4});let balance=0,min=0;for(const a of r.annual){balance+=a.fcfe;min=Math.min(min,balance);}funding.push({scenario:p.id,target,year1FCFE:r.annual[0].fcfe,minimumOpeningCash:-min});}
const out={version:M.VERSION,baseConfig,base,constant,growth,matrices,terminal,peak,lifeSensitivity,joint,costSensitivity,funding,independentChecks:checks};
fs.writeFileSync(__dirname+'/cohort_results.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({checks,version:M.VERSION,flat:base.valuation,growth:growth.map(x=>({id:x.id,value:x.result.valuation.valuePerShare,added:x.result.growth.valueAddedPerShare})),constantValue:constant.valuation.valuePerShare},null,2));
