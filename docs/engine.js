/* Pig Cycle Lab — pure calculation engine. Units and assumptions are public in docs/model.md. */
(function (root) {
  'use strict';
  const VERSION = '1.3.0';
  const PARAMS = [];
  function num(key,label,group,value,min,max,step,unit,description,extra) {
    PARAMS.push(Object.assign({key,label,group,type:'number',default:value,min,max,step,unit,description,evidence:'assumption',sourceIds:[]},extra||{}));
  }
  function sel(key,label,group,value,options,description,extra) {
    PARAMS.push(Object.assign({key,label,group,type:'select',default:value,options:options.map(o=>({value:o[0],label:o[1]})),description,evidence:'assumption',sourceIds:[]},extra||{}));
  }
  function bool(key,label,group,value,description,extra) {
    PARAMS.push(Object.assign({key,label,group,type:'boolean',default:value,description,evidence:'assumption',sourceIds:[]},extra||{}));
  }
  function txt(key,label,group,value,maxLength,description,extra) {
    PARAMS.push(Object.assign({key,label,group,type:'text',default:value,maxLength,description,evidence:'assumption',sourceIds:[]},extra||{}));
  }
  const A={advanced:true};
  sel('priceMethod','猪价路线','路线选择','demand',[['demand','供需平衡与需求弹性'],['capacity','有效产能与历史振幅'],['cost','长期边际成本中枢'],['custom','自填季度猪价']],'各路线是条件推演；共享输入使它们不是统计独立证据。');
  sel('valuationMethod','估值路线','路线选择','fcfe',[['fcfe','周期路径 · 股权现金流'],['pe','正常利润 · PE'],['ev_ebitda','EV / EBITDA'],['roe_pb','正常 ROE · PB']],'先选择经营路径，再选择估值表达；不可把不同方法简单平均视作置信区间。');
  sel('priceSeries','全国猪价口径','价格锚点','mara',[['mara','农业农村部集贸生猪价'],['ndrc','发改委全国生猪出场价']],'历史振幅只使用相同价格口径。2026-08 两种价格分别为 11.36 和 11.01 元/kg。',{evidence:'observed',sourceIds:['mara_202608','ndrc_202608']});
  sel('anchorMode','价格锚方式','价格锚点','observed',[['observed','2026-08 同期观测锚'],['policy','政策保有量 + 成本中枢'],['custom','自行设定基期锚']],'政策锚是你对合理利润的假设，并非政府承诺的猪价。');
  num('baseSows','自定锚点母猪','价格锚点',3990,1000,6000,1,'万头','仅自定锚使用。观测锚按所选滞后从真实/插值母猪序列取值。',A);
  num('baseHogPrice','自定锚点活猪价','价格锚点',11.36,3,60,.01,'元/kg','仅自定锚使用。',A);
  num('baseRetailPrice','基期猪肉零售价','价格锚点',21,5,100,.1,'元/kg','MARA 2026-08 同表为21。NDRC活猪路线仍跨统计体系，传导系数并未估计。',{...A,evidence:'observed',sourceIds:['mara_202608']});
  num('policySows','政策正常保有量','价格锚点',3750,2000,5000,10,'万头','数量管理锚，不是对行业利润率或猪价的保证。',{...A,evidence:'observed',sourceIds:['policy_2026']});
  num('sowQ2','2026-06 能繁母猪','能繁与时滞',3780,1500,5500,1,'万头','已披露季度值；修改后成为用户反事实输入。',{evidence:'observed',sourceIds:['sow_202606']});
  num('sowQ3','2026-09 能繁母猪','能繁与时滞',3602,1500,5500,1,'万头','已披露季度值；修改后成为用户反事实输入。',{evidence:'observed',sourceIds:['sow_202609']});
  num('q4DepletionPct','2026 Q4 去化','能繁与时滞',(1-3602/3780)*100,-20,30,.1,'%','默认延续Q3环比去化：Q4末=Q3末×(1−去化率)。负数表示补栏。',{evidence:'derived',sourceIds:['sow_202606','sow_202609']});
  num('sowChange2027Pct','2027 母猪年变化','能繁与时滞',0,-30,30,.5,'%','从2026-12起按复合月速率变化；影响8–12个月后的出栏。',A);
  num('lagMonths','固定传导时滞','能繁与时滞',10,8,12,1,'月','10个月为生物学近似，不是所有母猪变化恰好10个月后等幅影响价格。');
  sel('lagMode','时滞形态','能繁与时滞','fixed',[['fixed','固定8–12个月之一'],['distributed','8–12个月分布']],'分布权重10/20/40/20/10%，是演示核而非已估计参数。',A);
  sel('capacityMetric','产能计量','生产效率','tonnage',[['tonnage','母猪 × MSY × 出栏重'],['msy','母猪 × MSY'],['heads','仅母猪头数']],'全国供给应关注有效猪肉产出。这里只在屠宰率不变时用活重近似吨肉。');
  sel('productivityMode','未来效率路径','生产效率','bounded',[['bounded','有上限的 PSY + 成活结构'],['direct','直接设定 MSY'],['flat','效率不变']],'直接MSY模式已包含繁殖/成活结构，不再重复乘PSY或成活率。');
  num('psyBase','基期 PSY','生产效率',23.4,12,40,.1,'头/母猪/年','2025年样本加权经产母猪PSY参考，不是全国全部能繁母猪MSY。',{evidence:'observed',sourceIds:['psy_cn_2025']});
  num('psyCeiling','PSY 情景上限','生产效率',32,15,45,.1,'头/年','上限为可编辑情景，不是生物极限；国际先进/均值口径分别披露。');
  num('psyGapClosurePct','每年缩小效率差距','生产效率',6,0,50,.5,'%','每年弥合与上限差距的6%，不是PSY每年增长6%。');
  num('survivalBase','基期断奶后成活','生产效率',95,60,100,.1,'%', '仅有上限PSY模式使用。',A);
  num('survivalTarget','一年后断奶后成活','生产效率',95,60,100,.1,'%', '与基期之比进入有效MSY；直接MSY模式忽略。',A);
  num('commercialBase','基期商品化比例','生产效率',95,50,100,.1,'%', '剔除留种等非商品猪部分；示意，非全国已知值。',A);
  num('commercialTarget','一年后商品化比例','生产效率',95,50,100,.1,'%', '不再另扣重复损耗。',A);
  num('activeSowRatioBase','基期有效经产占比','生产效率',85,50,100,.1,'%', '把样本经产PSY映射至全部能繁口径所需的结构假设。',A);
  num('activeSowRatioTarget','一年后有效经产占比','生产效率',85,50,100,.1,'%', '淘汰低效母猪可能改善结构；改善幅度须有证据。',A);
  num('msyBase','基期直接 MSY','生产效率',18,8,35,.1,'头/年','全国月度真MSY未取得；默认仅演示。',{...A,showWhen:{key:'productivityMode',value:'direct'}});
  num('msyTarget','一年后直接 MSY','生产效率',18.4,8,35,.1,'头/年','直接MSY已含断奶后存活、留种和分母结构。',{...A,showWhen:{key:'productivityMode',value:'direct'}});
  num('nationalWeightBase','基期全国出栏重','生产效率',120,80,160,1,'kg','未将上市公司体重当全国均值；120kg为归一化假设。',A);
  num('nationalWeightTarget','一年后全国出栏重','生产效率',120,80,160,1,'kg','重量增加会抵消母猪头数下降；这里只改变相对供给。',A);
  sel('historicalCycle','历史振幅校准','历史映射','median',[['median','同口径可比去化阶段中位数'],['manual','手动振幅系数']],'周期条目由数据文件动态加入。两轮峰谷阶段不等于两个完整谷到谷周期，更不是固定时滞因果系数。');
  num('historicalMsyGrowthPct','历史周期 MSY 年增速','历史映射',2,-5,10,.1,'%','缺乏全国历史月MSY，以明确情景重算各周期有效去化；不是伪造历史事实。');
  num('historicalWeightChangePct','每个历史周期体重变化','历史映射',0,-20,30,.5,'%','吨肉模式使用的周期累计变化假设；一值用于所有周期，只宜做敏感性。',A);
  num('manualBeta','手动价格振幅系数 β','历史映射',3,0.1,20,.1,'倍','P=P0×有效供给比^(−β)。手动数值不代表回归所得。',{...A,showWhen:{key:'historicalCycle',value:'manual'}});
  bool('includeASF','允许纳入非瘟特殊期','历史映射',false,'非瘟同时改变存活、需求、调运和统计口径；不可把异常振幅当普通周期。',A);
  sel('demandForm','逆需求函数','供需与需求','constant',[['constant','常弹性（幂函数）'],['linear','局部线性']],'两种函数形状是模型风险对照，不是概率上下界。');
  num('demandElasticity','需求价格弹性绝对值','供需与需求',.374,.1,1.5,.01,'','USDA对中国家庭年度猪肉需求的估计，仅作先验；不是月度活猪弹性。',{evidence:'observed',sourceIds:['usda_elasticity']});
  num('demandTrendPct','需求年变化','供需与需求',-1,-10,10,.25,'%','固定价格下的外生需求变化；不要再把同一需求下降计入弹性。');
  num('importSharePct','基期进口占可用供给','供需与需求',2,0,20,.25,'%','统一吨肉/消费口径所需的占比情景；默认2%不是精确实时份额。',A);
  num('importsGrowthPct','进口年变化','供需与需求',0,-80,100,1,'%','本版外生给定，未模拟进口对国内外价差的反应。',A);
  num('retailPassThrough','零售→活猪绝对价差斜率','供需与需求',.75,0,1.5,.05,'','活猪变化=λ×零售价变化；0.75不是75%的百分比传导。');
  sel('costBasis','必要产能成本依据','完全成本','manual',[['manual','调查参照后，自定必要产能成本'],['technical','神农结构的技术敏感性演示']],'地区调查均值不等于全国成本分位；先在成本与成长页面核对样本、重量和经营方式，再决定需要保留的产能成本。');
  num('marginalFullCost','必要产能完全成本判断','完全成本',14.9,5,30,.05,'元/kg','14.9是参考地区调查量级的演示判断，不是调查直接识别的全国边际。附加权益回报前，须确认该成本未含同一资本的正常回报。',{showWhen:{key:'costBasis',value:'manual'}});
  txt('costReference','成本判断依据','完全成本','地区调查仅作参照；全国必要边际由使用者判断',500,'可记录调查名称、期次、经营方式、调整项及选择理由。',{showWhen:{key:'costBasis',value:'manual'}});
  sel('marginalTier','技术参数组合（非调查分位）','完全成本','C',[['A','A · 更高效率演示'],['B','B · 神农结构校准'],['C','C · 技术组合 C'],['D','D · 技术组合 D'],['E','E · 技术组合 E'],['custom','自定技术参数']],'A—E没有全国样本权重，也不是已调查得到的效率层级。仅用来拆解PSY、料肉比和利用率怎样影响成本。',{...A,showWhen:{key:'costBasis',value:'technical'}});
  num('feedPricePct','饲料价格指数','完全成本',100,50,180,1,'%','相对神农2025H1校准期；100并不宣称当前饲料价格未变化。');
  num('equityPerHead','每年一头产能对应权益','完全成本',1000,0,5000,50,'元/头','资本回报按权益要求计算，避免在已含利息完全成本上再加全部资本成本。');
  num('normalEquityReturnPct','权益合理回报要求','完全成本',10,0,25,.5,'%','可编辑要求回报，不是政策保证；每kg回报=每头权益×回报率/120。');
  num('customPsy','自定效率 PSY','完全成本',26,12,40,.5,'头/年','仅自定效率档使用。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  num('customFcr','自定料肉比','完全成本',2.65,1.8,4,.05,'','按生物料肉比定义，模型另计死亡猪耗料。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  num('customSurvival','自定成活率','完全成本',93,60,100,.5,'%','断奶后至商品出栏。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  num('customUtilization','自定产能利用率','完全成本',85,40,100,1,'%','固定成本摊薄的情景。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  num('customDays','自定饲养天数指数','完全成本',1.04,.8,1.5,.01,'倍','相对校准期。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  num('customLabor','自定人工单价指数','完全成本',1.03,.5,2,.01,'倍','相对校准期。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  num('customHealth','自定动保强度指数','完全成本',1.1,.5,3,.05,'倍','相对校准期。',{...A,showWhen:{key:'marginalTier',value:'custom'}});
  for(let q=1;q<=4;q++) {
    num('customQ'+q,'自定 Q'+q+' 猪价','季度与季节', [12,14,16,16][q-1],3,60,.1,'元/kg','仅自填季度路线使用。');
    num('seasonQ'+q,'Q'+q+' 季节相对调整','季度与季节',0,-30,30,.5,'%','四季因子归一化为均值1；再重标价格，使年度均价保持原值。自填价不叠加。',A);
  }
  num('hogsPerYear','首年商品猪销量','牧原经营',8000,1000,15000,100,'万头','2026公司指引7500–8100万头；此处是2027情景，不含仔猪直接相加。',{sourceIds:['my_2025']});
  num('companyWeight','公司商品猪出栏重','牧原经营',120,90,150,1,'kg','利润测算独立于全国供给体重；必须保持商品猪销量口径。');
  num('companyCost','首年养殖完全成本','牧原经营',11.8,8,20,.1,'元/kg','已含折旧及期间费用的模拟完全成本，不能再重复减相同费用。',{sourceIds:['my_202608','my_cost_scope']});
  num('realizedPriceDelta','公司售价相对全国价差','牧原经营',0,-3,3,.05,'元/kg','地区、重量、品种、渠道导致公司价与全国价不同。',A);
  num('attributionPct','养殖利润归母折算','牧原经营',95,0,100,.5,'%','税费、少数股东等的综合演示折算；不是已审计有效税率。',A);
  num('otherProfit','其他业务归母利润','牧原经营',0,-100,100,1,'亿元','只填抵销内部交易后的增量利润，避免屠宰收入/毛利重复加总。',A);
  sel('companyGrowthMode','公司销量成长路径','牧原经营','rate',[['flat','首年规模持续经营'],['target','设定终点销量与达成年数'],['rate','复合增速与持续年数（旧版）']],'公司增长可以来自份额提升；每条路径仍须支付增长投资。旧版2%×3年保留以便对照，不是公司指引。');
  num('targetHogs','成长终点商品猪销量','牧原经营',9000,1000,20000,100,'万头','从首年销量按复合路径达到此值；9000是情景，不是公司目标。',{showWhen:{key:'companyGrowthMode',value:'target'}});
  num('targetGrowthYears','达到终点所需增长年数','牧原经营',4,1,15,1,'年','首年2027之后的增长次数。4年意味着2031年达到终点，之后保持。',{showWhen:{key:'companyGrowthMode',value:'target'}});
  num('industryHogsBase','2025全国出栏参照','牧原经营',71973,40000,100000,100,'万头','仅用于长期市场份额校验，不代替能繁与供需价格路线。',{...A,evidence:'observed',sourceIds:['NBS_2025_HOG_GROWTH']});
  num('industryHogsTrendPct','长期全国出栏年变化','牧原经营',0,-5,5,.25,'%','从2025参照递推；0仅为固定市场规模的校验，不是2027供给预测。',A);
  num('volumeGrowthPct','显性销量年增长','牧原经营',2,-20,20,.5,'%','旧版复合增速路径使用。增长需配套扩产资本支出与营运资金。',{...A,showWhen:{key:'companyGrowthMode',value:'rate'}});
  num('volumeGrowthYears','销量增长持续','牧原经营',3,0,10,1,'年','从第二预测年起计算的增长年数。',{...A,showWhen:{key:'companyGrowthMode',value:'rate'}});
  num('volumeCap','商品猪销量上限','牧原经营',10000,1000,20000,100,'万头','产能/市场份额情景，不代表公司指引。',A);
  sel('normalPriceMode','长期猪价中枢','跨周期路径','manual',[['manual','手动设定'],['cost','采用所选边际效率正常价']],'短期价格路线与长期中枢分开；长远价格受成本、竞争和正常资本回报约束。');
  num('normalPigPrice','长期全国猪价','跨周期路径',15.5,8,30,.1,'元/kg','名义恒定中枢情景；不把2027高点永久化。');
  num('longRunCost','修复后公司完全成本','跨周期路径',11.8,8,20,.1,'元/kg','与长期猪价使用同一名义货币口径。');
  num('recoveryYears','回到正常经营所需','跨周期路径',3,1,8,1,'年','首年为2027；第二年开始线性回归，第N年达到正常。');
  num('explicitYears','显性预测期','跨周期路径',10,5,20,1,'年','终值从显性期结束后的下一年起。',A);
  sel('cashflowMode','股权现金流计算','资本与现金流','bridge',[['bridge','利润 + 折旧 − 再投资 − 净还债'],['ratio','利润 × 现金转化率（简化）']],'两种路线互斥；桥接模式不再乘现金转化率。');
  num('cashConversionPct','简化现金转化率','资本与现金流',80,0,150,5,'%','仅简化路线；亏损年份机械同比放大/缩小并不等于真实现金流，须重点复核。',{showWhen:{key:'cashflowMode',value:'ratio'}});
  num('daPerKg','归母同口径折旧摊销','资本与现金流',1.2,0,3,.05,'元/kg','模型假设。不能把集团折旧总额未经口径调整全部加回养殖归母利润。');
  num('maintenanceCapex','首年固定资产维护更新','资本与现金流',65,0,250,5,'亿元','公司2026公开口径约60–70亿元；这里向2027延伸，随后随销量变化。',{sourceIds:['my_202605']});
  num('otherSustainingCapex','首年其他必要再投资','资本与现金流',30,0,200,5,'亿元','繁殖生物资产更新、未包含租赁等的占位情景；需与折旧/费用口径逐项对齐。');
  num('growthCapexPerHead','每新增年销量的增长投资','资本与现金流',1000,0,5000,100,'元/头','1000为旧版演示值。项目每设计产能投资须除预期利用率后换成每新增销量投资；新研究案例用2000并另计营运资金。0须证明无新增投入可承接。',A);
  sel('growthInvestmentTiming','增长投资支付时点','资本与现金流','same_year',[['same_year','新增销量当年支付（旧版）'],['one_year_before','新增销量前一年支付']],'前一年投资更符合建设先于产出的顺序；首年规模视为已经形成，不重复支付历史建造成本。',A);
  num('workingCapitalPct','经营营运资金/收入','资本与现金流',5,0,30,1,'%','营运资金口径剔除现金与有息债。',A);
  num('openingWorkingCapital','期初经营营运资金','资本与现金流',70,0,500,5,'亿元','演示假设；首年以期末需求减期初计算变动。',A);
  num('annualNetRepayment','前期每年净还债','资本与现金流',0,0,200,5,'亿元','0表示滚动再融资保持债务不变。当前版不支持新增净借款，避免无后续利息/偿还的融资增值。',A);
  num('repaymentYears','净还债持续年数','资本与现金流',3,0,10,1,'年','只在桥接模式显性期扣减；负融资需与增长/财务风险一致。',A);
  sel('terminalCapexMode','终值维护资本支出','资本与现金流','depreciation',[['depreciation','与折旧相等'],['explicit','保持显性期维护水平']],'默认不给折旧高于维护支出的永久红利；显式模式须证明资产寿命和替换成本可持续。',A);
  num('discountRatePct','股权要求回报','估值参数',10,4,25,.5,'%','各经营情景默认共用10%，可单独做敏感性；此为权益折现率，不是WACC。');
  num('terminalGrowthPct','终值名义增长','估值参数',0,0,5,.25,'%','增长需要按g/ROE留存再投资。价格成本固定的显性期与终值增长属混合简化，均可改为0。');
  num('terminalROEPct','终值新增权益回报','估值参数',15,3,35,.5,'%','用于留存率=g/ROE；并非用高回报无成本增长。',A);
  num('extraCash','模型外可分配非经营现金','估值参数',0,0,500,5,'亿元','仅FCFE/PE加回，且不得已在利润或现金桥中计入。EV净债与PB账面已含现金，不再次加回。',A);
  num('shares','估值股本','估值参数',57.72996144,40,80,.01,'亿股','2026-09-30总股本；扣库存股约57.0136亿股。可转债摊薄需同时调整债和利息。',{evidence:'observed',sourceIds:['my_shares']});
  num('marketPrice','待反推的市场价','估值参数',0,0,200,.1,'元/股','0表示不反推；这里没有联网实时股价，输入必须注明自己观察的日期。');
  num('normalPE','正常利润 PE','估值参数',10,3,30,.5,'倍','演示倍数；并非声称牧原或美国纯养殖公司历史中位PE为10。',A);
  sel('normalEarningsMode','PE采用利润口径','估值参数','operating',[['firstyear','首年情景利润（高位外推）'],['operating','修复后正常经营'],['terminal','期末价差 按当前销量'],['roe','正常ROE × 当前归母权益']],'可与PB统一正常经营假设；PE和PB差异不能只是盈利输入不一致。',A);
  num('evEbitdaMultiple','正常 EV/EBITDA','估值参数',6,2,15,.25,'倍','资本密集行业应检查维护/扩产投资；集团可比结构不同。',A);
  num('netDebt','企业价值法使用净债','估值参数',627.99268,0,1500,10,'亿元','2026H1广义有息债减现金等价物；仅EV法扣一次，FCFE不再扣。',{...A,evidence:'derived',sourceIds:['my_h1']});
  num('annualInterest','正常年度净利息','估值参数',25,0,100,1,'亿元','EBITDA从归母净利润还原时需同口径利息/税/少数股东；此为简化情景。',A);
  num('interestDebt','期初有息债本金','资本与现金流',764.28374,1,1500,10,'亿元','H1广义有息债参考。净还债后次年按不变平均利率减少利息；不得用净债替代本金。',{...A,evidence:'derived',sourceIds:['my_h1']});
  sel('ebitdaMode','EV法 EBITDA 口径','估值参数','model',[['model','养殖模拟 + 独立其他 EBITDA'],['manual','自填集团正常 EBITDA']],'归母利润折算比例不是集团税率；不据此倒推其他业务EBITDA。',A);
  num('evDaPerKg','EV法养殖折旧摊销','估值参数',1.3,0,3,.05,'元/kg','集团/养殖税前口径情景；与FCFE归母D&A分别输入。',A);
  num('otherEbitda','其他业务正常 EBITDA','估值参数',0,-100,200,1,'亿元','已抵销内部交易与对应总部费用的其他分部EBITDA；不从otherProfit/归母折算倒推。',A);
  num('groupEbitda','自填集团正常 EBITDA','估值参数',450,-100,1500,10,'亿元','仅自填EBITDA模式；450为演示输入，不是已披露业绩。',{...A,showWhen:{key:'ebitdaMode',value:'manual'}});
  num('bookEquity','归母账面权益','估值参数',801.86617,100,2500,10,'亿元','2026H1归母权益；不是可直接清算变现的价值。',{...A,evidence:'observed',sourceIds:['my_h1']});
  num('normalROEPct','正常 ROE','估值参数',20,0,80,.5,'%','PB独立输入；PE选择ROE口径时也使用。很高的长期ROE需要持续竞争优势证据。',A);
  num('minorityValue','非控股权益价值','估值参数',.28577,0,100,.1,'亿元','EV转归母股权时扣除；默认用H1账面值近似市场价值。',{...A,evidence:'derived',sourceIds:['my_h1']});

  // Auxiliary inputs never change the selected price route or invalidate the main model.
  const AUX={auxiliary:true};
  num('futuresQuote','期货合约报价','期货与基差',0,0,100000,5,'元/吨','用户录入的指定合约价格；0表示未配置，网站不提供实时行情。',AUX);
  num('futuresBasis','地区与品质基差','期货与基差',0,-100,100,.05,'元/kg','基差定义为现货减期货；正值加到期货价，负值从期货价扣除。',AUX);
  txt('futuresObservedDate','报价观察日期','期货与基差','',10,'填写真实有效的YYYY-MM-DD日期；日期由用户提供，网站未联网核验。',AUX);
  txt('futuresContract','期货合约代码','期货与基差','',8,'填写LHYYMM，例如LH2701；月份为01、03、05、07、09、11。',AUX);
  sel('futuresQuoteType','期货报价类型','期货与基差','settlement',[['settlement','结算价'],['close','收盘价'],['user','自填参考价']],'明确记录报价口径；所有价格均由用户输入。',AUX);
  txt('futuresBasisScope','基差地区与品质口径','期货与基差','',80,'说明地区、出栏重量与品质等适用范围；不能将单一交割口径直接称为全国均价。',AUX);
  txt('futuresQuoteSource','期货报价来源','期货与基差','',240,'记录公开网址、资料名称或截图出处，作为纯文本保存；网站未核验来源。',AUX);
  num('pigletPurchasePrice','仔猪买入价','外购仔猪育肥',300,0,10000,10,'元/每头买入','演示输入，需按实际仔猪重量、品质和成交条件修改。',AUX);
  num('pigletGrowCost','预期后续完整成本','外购仔猪育肥',1100,0,20000,10,'元/每头买入','按每头买入仔猪计的后续完全成本，已含死亡猪耗费；不要再重复加死亡损失。',AUX);
  num('pigletTargetProfit','目标利润','外购仔猪育肥',100,0,10000,10,'元/每头买入','在补偿买入价和后续完整成本之外，希望每头买入仔猪取得的利润。',AUX);
  num('pigletSurvivalPct','买入后成活率','外购仔猪育肥',95,.1,100,.1,'%','从买入仔猪至商品猪出售的成活比例；死亡猪耗费已包含在后续完整成本中。',AUX);
  num('pigletSaleWeight','存活猪出栏体重','外购仔猪育肥',120,1,300,1,'kg/出售猪','按最终存活并售出的每头商品猪计算。',AUX);
  num('pigletExpectedSalePrice','假设出栏售价','外购仔猪育肥',0,0,100,.1,'元/kg','用户自填的未来活猪售价；0表示只测保本和目标利润门槛，不测预期利润。',AUX);

  const DEFAULTS=Object.fromEntries(PARAMS.map(p=>[p.key,p.default]));
  const PRESETS=[
    {id:'base',name:'正常修复',description:'Q4延续Q3去化，效率温和改善，需求略降。',logic:'2027修复不代表高价永久持续；3年回归中枢，后续成本按基础成本输入保持。',conditions:'无新增重大疫病/政策/需求冲击；均为条件假设。',changes:{},probability:null},
    {id:'slow',name:'缓慢修复',description:'去化放缓，出栏重量回升，需求仍弱。',logic:'短期供给收缩部分被效率和重量抵消，4年修复。长期中枢与折现率不随之自动恶化。',conditions:'Q4去化约为Q3一半、全国体重123kg。',changes:{q4DepletionPct:DEFAULTS.q4DepletionPct/2,psyGapClosurePct:8,demandTrendPct:-1.5,nationalWeightTarget:123,companyCost:12.1,recoveryYears:4},probability:null},
    {id:'stress',name:'低谷延长',description:'Q4停止去化，效率提高与重猪压制价格。',logic:'允许出现数年低利润/亏损，5年修复；应检查现金缺口，不能把低谷无限延长。',conditions:'Q4母猪不降、需求年降2%、全国体重124kg；不是所有冲击都叠加。',changes:{q4DepletionPct:0,psyGapClosurePct:12,demandTrendPct:-2,nationalWeightTarget:124,companyCost:12.5,recoveryYears:5},probability:null},
    {id:'strong',name:'偏强修复',description:'去化更快，效率改善较慢，需求稳定。',logic:'更高短期价差转化为有限年度现金流，随后回归相同中枢。',conditions:'Q4去化6%、全国体重119kg；并不假定融资成本降低或永久高价。',changes:{q4DepletionPct:6,psyGapClosurePct:3,demandTrendPct:0,nationalWeightTarget:119,companyCost:11.5,recoveryYears:3},probability:null}
  ];
  const pct=x=>x/100;
  const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const median=a=>{const b=a.slice().sort((x,y)=>x-y);return b.length?(b[Math.floor((b.length-1)/2)]+b[Math.ceil((b.length-1)/2)])/2:null;};
  const lerp=(a,b,t)=>a+(b-a)*t;
  const idx=s=>{const a=s.split('-').map(Number);return a[0]*12+a[1]-1;};
  const month=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0');
  const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
  const labels={fcfe:'周期路径 · FCFE',pe:'正常利润 · PE',ev_ebitda:'正常 EV/EBITDA',roe_pb:'正常 ROE · PB'};
  function mergeConfig(base,patch) {
    const out=Object.assign({},DEFAULTS);
    for(const x of [base,patch]) if(x&&typeof x==='object'&&!Array.isArray(x)) {
      for(const p of PARAMS) if(Object.prototype.hasOwnProperty.call(x,p.key)) out[p.key]=x[p.key];
    }
    return out;
  }
  function validate(input,data) {
    const c=mergeConfig(DEFAULTS,input), errors=[],warnings=[];
    for(const p of PARAMS) {
      if(p.auxiliary)continue;
      const v=c[p.key];
      if(p.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<p.min||v>p.max)) errors.push({key:p.key,message:p.label+'须为 '+p.min+' 至 '+p.max+' 的有限数字。'});
      if(p.type==='boolean'&&typeof v!=='boolean') errors.push({key:p.key,message:p.label+'须为布尔值。'});
      if(p.type==='text'&&(typeof v!=='string'||v.length>p.maxLength||CONTROL_TEXT.test(v)))errors.push({key:p.key,message:p.label+'须为不含换行或控制字符、最多'+p.maxLength+'字的文本。'});
      if(p.type==='select'&&!p.options.some(o=>o.value===v)) {
        const ok=p.key==='historicalCycle'&&data&&Array.isArray(data.cycles)&&data.cycles.some(x=>x.id===v);
        if(!ok) errors.push({key:p.key,message:p.label+'选项不存在。'});
      }
    }
    for(const k of ['lagMonths','explicitYears','recoveryYears','volumeGrowthYears','targetGrowthYears','repaymentYears']) if(!Number.isInteger(c[k])) errors.push({key:k,message:'月份/年数须为整数。'});
    if(c.discountRatePct<=c.terminalGrowthPct) errors.push({key:'terminalGrowthPct',message:'折现率必须大于终值增长率。'});
    if(c.terminalROEPct<=c.terminalGrowthPct) errors.push({key:'terminalROEPct',message:'终值新增权益回报须大于增长率，避免超过100%的留存要求。'});
    if(c.productivityMode==='bounded'&&c.psyCeiling<c.psyBase) errors.push({key:'psyCeiling',message:'有上限的改善路径要求上限不低于基期PSY；下降情景请使用直接MSY。'});
    if(c.volumeCap<c.hogsPerYear) errors.push({key:'volumeCap',message:'销量上限不能小于首年销量。'});
    if(c.companyGrowthMode==='target'&&c.targetHogs>c.volumeCap)errors.push({key:'targetHogs',message:'成长终点不能超过设定的销量上限。'});
    if(c.companyGrowthMode==='target'&&c.targetHogs<c.hogsPerYear)errors.push({key:'targetHogs',message:'成长终点应不低于首年销量；收缩需另行处理闲置资产与关停费用。'});
    if(c.companyGrowthMode==='target'&&c.targetGrowthYears>=c.explicitYears)errors.push({key:'targetGrowthYears',message:'成长终点须在显性期内达到，避免把未完成的增长投资留在终值之外。'});
    if(c.companyGrowthMode==='rate'&&c.volumeGrowthYears>=c.explicitYears)errors.push({key:'volumeGrowthYears',message:'复合增长须在显性期内结束，避免终值遗漏剩余增长投资。'});
    if(c.recoveryYears>=c.explicitYears) errors.push({key:'recoveryYears',message:'显性期须长于修复期，至少留一年展示修复后的正常经营。'});
    if(c.repaymentYears>c.explicitYears) errors.push({key:'repaymentYears',message:'还债年数不能超过显性预测期，否则终值会漏掉未完成的计划还债。'});
    if(c.annualNetRepayment*c.repaymentYears>c.interestDebt) errors.push({key:'annualNetRepayment',message:'计划净还债总额超过期初有息债本金；请调整还债额或年数。'});
    if(c.capacityMetric==='heads') warnings.push({key:'capacityMetric',message:'仅母猪头数忽略MSY/体重变化，不能把机械去化等同猪肉供给同比下降。'});
    if(c.anchorMode==='policy') warnings.push({key:'anchorMode',message:'政策保有量与正常价构成假设锚；政府目标本身不能推出精确猪价或保证合理利润。'});
    if(c.priceMethod==='cost') warnings.push({key:'priceMethod',message:'成本路线给长期再生产价格，不是2027季度现货预测，也不是短期价格下限。'});
    if(c.costBasis==='manual'&&(c.priceMethod==='cost'||c.normalPriceMode==='cost'||c.anchorMode==='policy'))warnings.push({key:'marginalFullCost',message:'必要成本是使用者判断。地区样本均值与山东标准化预算不能直接识别全国边际，也不能自动证明大多数产能可获合理利润。'});
    if(c.priceMethod==='demand') warnings.push({key:'demandElasticity',message:'默认弹性来自家庭年度零售需求，移植到月度供给/活猪价格只作敏感性演示；尚未通过滚动样本外检验。'});
    if(c.priceSeries==='ndrc'&&c.priceMethod==='demand') warnings.push({key:'priceSeries',message:'NDRC出场价与MARA零售价并非同一调查样本，需另行估计跨渠道价格传导。'});
    if(c.priceMethod==='capacity') warnings.push({key:'historicalCycle',message:'峰谷振幅包含需求、饲料、疫病和体重等共同变化；它不是净化后的因果弹性。'});
    if(c.cashflowMode==='ratio') warnings.push({key:'cashflowMode',message:'利润×转化率省略营运资金、更新资本支出和净融资时点；负利润时期尤其不能视作实际现金流。'});
    if(c.terminalCapexMode==='explicit') warnings.push({key:'terminalCapexMode',message:'永久维持低于折旧的再投资需长期资产更新证据，否则会虚增终值。'});
    if(c.terminalGrowthPct>0) warnings.push({key:'terminalGrowthPct',message:'终值增长已扣g/ROE的再投资；显性期价格成本名义固定，仍需检查长期通胀/规模口径一致。'});
    return {errors,warnings};
  }
  const CONTROL_TEXT=/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
  function auxiliaryInputErrors(c,group,structuralOnly) {
    const errors=[];
    for(const p of PARAMS.filter(p=>p.auxiliary&&(!group||p.group===group))) {
      const v=c[p.key];
      if(p.type==='text') {
        if(typeof v!=='string')errors.push({key:p.key,message:p.label+'须为文本字符串；未填写时使用空字符串。'});
        else if(v.length>p.maxLength)errors.push({key:p.key,message:p.label+'不能超过'+p.maxLength+'个字符。'});
        else if(CONTROL_TEXT.test(v))errors.push({key:p.key,message:p.label+'不能含控制字符或换行符。'});
      }
      if(p.type==='number') {
        // null is an explicit, serializable unfinished numeric draft, never a zero.
        const ok=structuralOnly?(v===null||(typeof v==='number'&&Number.isFinite(v))):(typeof v==='number'&&Number.isFinite(v)&&v>=p.min&&v<=p.max);
        if(!ok)errors.push({key:p.key,message:structuralOnly?p.label+'须为有限数字或未填写的null。':p.label+'须为 '+p.min+' 至 '+p.max+' 的有限数字。'});
      }
      if(p.type==='select'&&!p.options.some(o=>o.value===v))errors.push({key:p.key,message:p.label+'选项不存在。'});
    }
    return errors;
  }
  function isCalendarDate(s) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
    const [y,m,d]=s.split('-').map(Number),leap=y%400===0||(y%4===0&&y%100!==0);
    return y>=1&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
  }
  function crossChecks(input) {
    const c=mergeConfig(DEFAULTS,input),fErrors=auxiliaryInputErrors(c,'期货与基差',false),fWarnings=[];
    const clean=k=>typeof c[k]==='string'?c[k].trim():'';
    const metadata={observedDate:clean('futuresObservedDate'),contract:clean('futuresContract').toUpperCase(),quoteType:c.futuresQuoteType,basisScope:clean('futuresBasisScope'),quoteSource:clean('futuresQuoteSource'),quote:c.futuresQuote,basis:c.futuresBasis,inputStatus:'user_input'};
    const configured=c.futuresQuote!==0;
    if(configured) {
      const requireField=(key,value,ok,message)=>{if(!fErrors.some(e=>e.key===key)&&(!value||!ok))fErrors.push({key,message});};
      requireField('futuresObservedDate',metadata.observedDate,isCalendarDate(metadata.observedDate),'报价日期须填写真实有效的YYYY-MM-DD日历日期。');
      requireField('futuresContract',metadata.contract,/^LH\d{2}(01|03|05|07|09|11)$/.test(metadata.contract),'合约须为LHYYMM，且月份为01、03、05、07、09、11。');
      requireField('futuresBasisScope',metadata.basisScope,true,'请填写基差所对应的地区与品质口径。');
      requireField('futuresQuoteSource',metadata.quoteSource,true,'请填写报价来源，保留可复核的出处。');
      fWarnings.push({key:'futuresQuote',message:'这是用户输入的单一合约市场对照，未联网核验；合约月份不等于季度均价，不自动回写猪价或估值。'});
    }
    let referencePrice=null;
    if(configured&&!fErrors.length) {
      referencePrice=c.futuresQuote/1000+c.futuresBasis;
      if(!Number.isFinite(referencePrice)||referencePrice<=0) {
        fErrors.push({key:'futuresBasis',message:'基差调整后的活猪参考价须大于0，请核对元/吨与元/kg及基差正负号。'});
        referencePrice=null;
      }
    }
    const futures={configured,valid:configured&&fErrors.length===0,referencePrice,errors:fErrors,warnings:fWarnings,metadata};
    const pErrors=auxiliaryInputErrors(c,'外购仔猪育肥',false),pWarnings=[{key:'pigletGrowCost',message:'这是外购仔猪育肥的补栏回报门槛，不是未来猪价预测。后续完整成本按每头买入仔猪计且已含死亡猪耗费；目标利润也按每头买入仔猪计。'}];
    let breakEvenPrice=null,requiredPrice=null,expectedProfit=null;
    if(!pErrors.length) {
      const saleKg=pct(c.pigletSurvivalPct)*c.pigletSaleWeight,totalCost=c.pigletPurchasePrice+c.pigletGrowCost;
      breakEvenPrice=totalCost/saleKg;
      requiredPrice=(totalCost+c.pigletTargetProfit)/saleKg;
      expectedProfit=c.pigletExpectedSalePrice===0?null:c.pigletExpectedSalePrice*saleKg-totalCost;
    }
    return {futures,piglet:{valid:pErrors.length===0,breakEvenPrice,requiredPrice,expectedProfit,errors:pErrors,warnings:pWarnings}};
  }
  const TIERS={A:[31,2.4,96,95,.97,.98,.95],B:[29,2.45,95,90,1,1,1],C:[26,2.65,93,85,1.04,1.03,1.1],D:[23,2.85,90,80,1.08,1.06,1.25],E:[20,3.05,86,70,1.15,1.1,1.5]};
  function costs(c) {
    const normalReturn=c.equityPerHead*pct(c.normalEquityReturnPct)/120;
    if(c.costBasis==='manual')return {components:[{name:'必要产能成本判断',value:c.marginalFullCost}],fullCost:c.marginalFullCost,normalReturn,normalPrice:c.marginalFullCost+normalReturn,tier:'调查参照后的自定判断',headCost:c.marginalFullCost*120,parameters:{},basis:'manual',reference:c.costReference};
    const t=c.marginalTier==='custom'?[c.customPsy,c.customFcr,c.customSurvival,c.customUtilization,c.customDays,c.customLabor,c.customHealth]:TIERS[c.marginalTier];
    const [psy,fcr,sp,up,days,labor,health]=t,s=sp/100,u=up/100, sf=.95/s, fixed=.9/u*days*sf;
    const mortality=(1+.5*(1-s)/s)/(1+.5*.05/.95);
    const components=[{name:'仔猪',value:2.9*(.25+.75*29/psy)*sf},{name:'饲料',value:6.7*fcr/2.45*mortality*c.feedPricePct/100},{name:'动保',value:.3*health*sf},{name:'人工',value:1.5*(.3+.7*fixed)*labor},{name:'折旧',value:.2*fixed},{name:'总部费用',value:.8*fixed}];
    const fullCost=components.reduce((s,x)=>s+x.value,0);
    return {components,fullCost,normalReturn,normalPrice:fullCost+normalReturn,tier:c.marginalTier,headCost:fullCost*120,parameters:{psy,fcr,survival:sp,utilization:up},basis:'technical',reference:'神农2025H1成本结构；A—E技术参数非调查分位'};
  }
  function sowPath(c,data) {
    const points=new Map();
    for(const h of (data.history||[])) if(h.sows>0&&h.sowsUnit!=='index'&&idx(h.month)<=idx('2025-12')) points.set(idx(h.month),h.sows);
    for(const [m,s] of [['2025-10',3990],['2025-12',3961],['2026-03',3904],['2026-06',c.sowQ2],['2026-09',c.sowQ3],['2026-12',c.sowQ3*(1-pct(c.q4DepletionPct))]]) points.set(idx(m),s);
    const keys=[...points.keys()].sort((a,b)=>a-b),last=idx('2026-12');
    return function(i) {
      if(points.has(i)) return {value:points.get(i),status:i<=idx('2026-09')?'observed_or_user_override':'scenario'};
      if(i>last) return {value:points.get(last)*Math.pow(1+pct(c.sowChange2027Pct),(i-last)/12),status:'scenario'};
      for(let j=1;j<keys.length;j++) if(i>keys[j-1]&&i<keys[j]) return {value:lerp(points.get(keys[j-1]),points.get(keys[j]),(i-keys[j-1])/(keys[j]-keys[j-1])),status:'interpolated_scenario'};
      return {value:null,status:'unavailable'};
    };
  }
  function productivity(c,k) {
    const y=k/12,t=clamp(y,0,1);
    let r=1;
    if(c.productivityMode==='direct') r=Math.pow(c.msyTarget/c.msyBase,t);
    if(c.productivityMode==='bounded') {
      const psy=c.psyCeiling-(c.psyCeiling-c.psyBase)*Math.pow(1-pct(c.psyGapClosurePct),y);
      r=psy/c.psyBase*Math.pow(c.survivalTarget/c.survivalBase,t)*Math.pow(c.commercialTarget/c.commercialBase,t)*Math.pow(c.activeSowRatioTarget/c.activeSowRatioBase,t);
    }
    return {msyRatio:c.capacityMetric==='heads'?1:r,weightRatio:c.capacityMetric==='tonnage'?Math.pow(c.nationalWeightTarget/c.nationalWeightBase,t):1};
  }
  function calibration(c,data) {
    const rows=(data.cycles||[]).map(x=>{
      const sowChange=x.sowEnd/x.sowStart-1,years=x.elapsedYears==null?(idx(x.endMonth)-idx(x.startMonth))/12:x.elapsedYears;
      const e=(x.sowEnd/x.sowStart)*(c.capacityMetric==='heads'?1:Math.pow(1+pct(c.historicalMsyGrowthPct),years))*(c.capacityMetric==='tonnage'?1+pct(c.historicalWeightChangePct):1);
      const priceChange=x.priceHigh/x.priceLow-1,beta=e>0&&e<1&&priceChange>0?Math.log(1+priceChange)/-Math.log(e):null;
      const validNums=[x.sowStart,x.sowEnd,x.priceLow,x.priceHigh,years].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0);
      let note=x.limitations||'';if(Array.isArray(note))note=note.join('；');
      const seriesOK=!x.priceSeries||x.priceSeries===c.priceSeries,asf=(x.regime||'').toLowerCase()==='asf';
      const illConditioned=e>.98;
      let eligible=(x.eligible!==false||(asf&&c.includeASF))&&seriesOK&&validNums&&beta!==null&&!illConditioned&&(!asf||c.includeASF);
      if(!seriesOK)note+='；价格口径不同';if(asf&&!c.includeASF)note+='；非瘟期默认排除';if(beta===null)note+='；有效产能未收缩或数据不足，不能反推正振幅系数';
      if(illConditioned&&e<1)note+='；有效去化不足2%，振幅系数分母接近零，排除自动校准。可用手动β单独研究，不截断伪装。';
      return {id:x.id,label:x.label,beta,sowChange,effectiveChange:e-1,priceChange,eligible,note,priceSeries:x.priceSeries,regime:x.regime};
    });
    let beta,selected;
    if(c.historicalCycle==='manual'){beta=c.manualBeta;selected=[];}
    else if(c.historicalCycle==='median'){selected=rows.filter(x=>x.eligible);beta=median(selected.map(x=>x.beta));}
    else {selected=rows.filter(x=>x.id===c.historicalCycle&&x.eligible);beta=selected.length?selected[0].beta:null;}
    return {label:c.historicalCycle==='manual'?'用户指定振幅':c.historicalCycle==='median'?'同价序列可比去化阶段中位数':'指定历史阶段',beta,cycles:rows,selectedCount:selected.length,note:'历史MSY与体重修正是用户情景，缺失真MSY未插值。峰谷选点与固定10个月错位检验分别呈现；样本少，不能给统计置信区间。有效去化不足2%排除自动校准，这是数值稳定性规则，不是经济规律。'};
  }
  function pricePath(c,data,cost,cal) {
    const get=sowPath(c,data),baseMonth=idx('2026-08');
    const lagged=(i)=>{
      if(c.lagMode==='fixed')return get(i-c.lagMonths);
      const w=[.1,.2,.4,.2,.1],v=w.map((ww,j)=>({w:ww,...get(i-(j+8))}));
      return {value:v.every(x=>x.value!==null)?v.reduce((s,x)=>s+x.w*x.value,0):null,status:v.every(x=>x.status==='observed_or_user_override')?'observed_or_user_override':'weighted_scenario'};
    };
    const laggedBase=lagged(baseMonth),actualBase=laggedBase.value,baseSows=c.anchorMode==='policy'?c.policySows:c.anchorMode==='custom'?c.baseSows:actualBase;
    const basePrice=c.anchorMode==='policy'?cost.normalPrice:c.anchorMode==='custom'?c.baseHogPrice:(c.priceSeries==='mara'?11.36:11.01);
    const baseRetail=c.anchorMode==='policy'&&c.retailPassThrough>0?c.baseRetailPrice+(basePrice-(c.priceSeries==='mara'?11.36:11.01))/c.retailPassThrough:c.baseRetailPrice;
    const out=[];
    for(let m=1;m<=12;m++) {
      const mi=idx('2027-'+String(m).padStart(2,'0')),k=mi-baseMonth,lag=lagged(mi),prod=productivity(c,k),effectiveCapacityRatio=lag.value/baseSows*prod.msyRatio*prod.weightRatio;
      const importShare=pct(c.importSharePct),total=(1-importShare)*effectiveCapacityRatio+importShare*Math.pow(1+pct(c.importsGrowthPct),k/12),demand=Math.pow(1+pct(c.demandTrendPct),k/12),z=total/demand;
      let p;
      if(c.priceMethod==='cost')p=cost.normalPrice;
      else if(c.priceMethod==='custom')p=c['customQ'+Math.ceil(m/3)];
      else if(c.priceMethod==='capacity')p=cal.beta==null?null:basePrice*Math.pow(effectiveCapacityRatio,-cal.beta);
      else {const retail=c.demandForm==='constant'?baseRetail*Math.pow(z,-1/c.demandElasticity):baseRetail*(1+(1-z)/c.demandElasticity);p=basePrice+c.retailPassThrough*(retail-baseRetail);}
      out.push({month:month(mi),sourceMonth:c.lagMode==='fixed'?month(mi-c.lagMonths):month(mi-12)+' 至 '+month(mi-8),sows:lag.value,msyRatio:prod.msyRatio,weightRatio:prod.weightRatio,effectiveCapacityRatio,price:p,status:lag.status,demandRatio:demand,totalSupplyRatio:total,baseSows,basePrice,baseRetail,baseStatus:c.anchorMode==='observed'?laggedBase.status:'user_assumption'});
    }
    if(c.priceMethod!=='custom'&&out.every(x=>Number.isFinite(x.price))) {
      const oldMean=avg(out.map(x=>x.price)),f=[1,2,3,4].map(q=>1+pct(c['seasonQ'+q])),fmean=avg(f);
      out.forEach((x,i)=>{x.price*=f[Math.floor(i/3)]/fmean;});
      const newMean=avg(out.map(x=>x.price));out.forEach(x=>{x.price*=oldMean/newMean;});
    }
    return out;
  }
  function companyVolume(c,i) {
    if(c.companyGrowthMode==='flat')return c.hogsPerYear;
    if(c.companyGrowthMode==='target')return c.hogsPerYear*Math.pow(c.targetHogs/c.hogsPerYear,Math.min(i,c.targetGrowthYears)/c.targetGrowthYears);
    return Math.min(c.volumeCap,c.hogsPerYear*Math.pow(1+pct(c.volumeGrowthPct),Math.min(i,c.volumeGrowthYears)));
  }
  function valuePath(c,monthly,cost,normalOverride) {
    const normal=normalOverride==null?(c.normalPriceMode==='cost'?cost.normalPrice:c.normalPigPrice):normalOverride;
    const firstPrice=avg(monthly.map(x=>x.price)),annual=[],r=pct(c.discountRatePct),g=pct(c.terminalGrowthPct),a=pct(c.attributionPct),N=c.explicitYears;
    let prevVolume=c.hogsPerYear,prevWC=c.openingWorkingCapital;
    const companyNormal=normal+c.realizedPriceDelta,initialMargin=companyNormal-c.longRunCost;
    const terminalMargin=initialMargin;
    for(let i=0;i<N;i++) {
      const volume=companyVolume(c,i),kg=volume*c.companyWeight/10000;
      const repair=i===0?0:c.recoveryYears===1?1:clamp(i/(c.recoveryYears-1),0,1);
      const price=i===0?firstPrice+c.realizedPriceDelta:lerp(firstPrice+c.realizedPriceDelta,companyNormal,repair);
      let unitCost=lerp(c.companyCost,c.longRunCost,repair);
      const debtOpening=c.interestDebt-c.annualNetRepayment*Math.min(i,c.repaymentYears);
      const interestSaving=c.cashflowMode==='bridge'?c.annualInterest*(1-debtOpening/c.interestDebt):0;
      unitCost-=interestSaving/kg;
      const profit=kg*(price-unitCost)*a+c.otherProfit,da=kg*c.daPerKg,sustainingCapex=(c.maintenanceCapex+c.otherSustainingCapex)*volume/c.hogsPerYear;
      const capacityAddition=c.growthInvestmentTiming==='one_year_before'?Math.max(0,companyVolume(c,i+1)-volume):Math.max(0,volume-prevVolume);
      const growthCapex=capacityAddition*c.growthCapexPerHead/10000,revenue=kg*price,workingCapital=revenue*pct(c.workingCapitalPct),deltaNwc=workingCapital-prevWC;
      const netBorrowing=i<c.repaymentYears?-c.annualNetRepayment:0;
      const fcfe=c.cashflowMode==='ratio'?profit*pct(c.cashConversionPct):profit+da-sustainingCapex-growthCapex-deltaNwc+netBorrowing;
      const industryHogs=c.industryHogsBase*Math.pow(1+pct(c.industryHogsTrendPct),i+2),marketSharePct=volume/industryHogs*100;
      annual.push({year:2027+i,volume,weight:c.companyWeight,price,cost:unitCost,profit,da,sustainingCapex,growthCapex,deltaNwc,netBorrowing,fcfe,presentValue:fcfe/Math.pow(1+r,i+1),workingCapital,debtOpening,interestSaving,industryHogs,marketSharePct,capacityAddition});
      prevVolume=volume;prevWC=workingCapital;
    }
    const last=annual[N-1],terminalDebt=c.interestDebt-c.annualNetRepayment*Math.min(N,c.repaymentYears);
    const terminalInterestSaving=c.cashflowMode==='bridge'?c.annualInterest*(1-terminalDebt/c.interestDebt):0;
    const terminalProfit=(last.profit+(terminalInterestSaving-last.interestSaving)*a)*(1+g),terminalDA=last.da*(1+g),terminalMaintenance=c.terminalCapexMode==='depreciation'?terminalDA:last.sustainingCapex*(1+g);
    const terminalReinvestment=Math.max(0,terminalProfit)*g/pct(c.terminalROEPct);
    const terminalFCFE=(c.cashflowMode==='ratio'?terminalProfit*pct(c.cashConversionPct):terminalProfit+terminalDA-terminalMaintenance)-terminalReinvestment;
    const terminalValue=terminalFCFE/(r-g),terminalPresentValue=terminalValue/Math.pow(1+r,N),fcfeEquity=annual.reduce((s,x)=>s+x.presentValue,0)+terminalPresentValue+c.extraCash;
    // Multiples use today's productive scale with NORMAL earnings, not a peak quarter.
    const normalKg=c.hogsPerYear*c.companyWeight/10000,operatingNormalProfit=normalKg*initialMargin*a+c.otherProfit;
    const normalProfit=c.normalEarningsMode==='firstyear'?annual[0].profit:c.normalEarningsMode==='roe'?pct(c.normalROEPct)*c.bookEquity:c.normalEarningsMode==='terminal'?normalKg*terminalMargin*a+c.otherProfit:operatingNormalProfit,normalEps=normalProfit/c.shares,impliedROE=operatingNormalProfit/c.bookEquity;
    const pe=normalProfit>0?normalProfit*c.normalPE+c.extraCash:null;
    // Simplified bridge. All nonfarm profit / noncontrolling / tax effects require same-scope reconciliation.
    const ebitda=c.ebitdaMode==='manual'?c.groupEbitda:normalKg*initialMargin+c.annualInterest+normalKg*c.evDaPerKg+c.otherEbitda,ev=ebitda>0?ebitda*c.evEbitdaMultiple:null,evEquity=ev==null?null:ev-c.netDebt-c.minorityValue;
    const pb=(pct(c.normalROEPct)-g)/(r-g),roeEquity=pb>=0?c.bookEquity*pb:null;
    const values={fcfe:fcfeEquity,pe,ev_ebitda:evEquity,roe_pb:roeEquity},equityValue=values[c.valuationMethod];
    const details=c.valuationMethod==='fcfe'?[{label:'显性期现金流现值',value:annual.reduce((s,x)=>s+x.presentValue,0),unit:'亿元'},{label:'终值现金流（已扣增长再投资）',value:terminalFCFE,unit:'亿元'},{label:'终值现值',value:terminalPresentValue,unit:'亿元'},{label:'终值增长再投资',value:terminalReinvestment,unit:'亿元'},{label:'期末单位价差',value:terminalMargin,unit:'元/kg'}]:c.valuationMethod==='pe'?[{label:'正常归母利润',value:normalProfit,unit:'亿元'},{label:'正常PE',value:c.normalPE,unit:'倍'}]:c.valuationMethod==='ev_ebitda'?[{label:'同口径模拟EBITDA',value:ebitda,unit:'亿元'},{label:'企业价值',value:ev,unit:'亿元'},{label:'减：净债',value:c.netDebt,unit:'亿元'},{label:'减：非控股权益价值',value:c.minorityValue,unit:'亿元'}]:[{label:'正常ROE',value:c.normalROEPct,unit:'%'},{label:'推导PB=(ROE−g)/(r−g)',value:pb,unit:'倍'},{label:'归母净资产',value:c.bookEquity,unit:'亿元'},{label:'经营模型隐含正常ROE',value:impliedROE*100,unit:'%'}];
    return {annual,normalPrice:normal,terminalMargin,valuation:{method:c.valuationMethod,label:labels[c.valuationMethod],valuePerShare:equityValue==null?null:equityValue/c.shares,equityValue,enterpriseValue:c.valuationMethod==='ev_ebitda'?ev:null,terminalValue,terminalPresentValue,terminalShare:fcfeEquity>0?terminalPresentValue/fcfeEquity:null,normalProfit,normalEps,impliedROE,details,terminalFCFE},alternatives:Object.entries(values).map(([id,v])=>({id,label:labels[id],valuePerShare:v==null?null:v/c.shares,applicable:v!==null&&v>=0,note:id==='fcfe'?'已计利息成本及净融资；不再扣净债':id==='ev_ebitda'?'集团口径/资本强度须另行核对；只在此扣净债':id==='roe_pb'?'稳态ROE与经营模型ROE须一致；长期ROE及账面资本需保持一致':'正常盈利倍数为用户输入，非自动历史中位数'}))};
  }
  function reverse(c,monthly,cost) {
    if(c.marketPrice<=0)return null;
    const cfg=mergeConfig(c,{valuationMethod:'fcfe'}),f=p=>valuePath(cfg,monthly,cost,p).valuation.valuePerShare;
    let lo=3,hi=40; if(f(lo)>c.marketPrice||f(hi)<c.marketPrice)return null;
    for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(f(mid)<c.marketPrice)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  }
  function growthAttribution(c,monthly,cost,current) {
    const flat=valuePath(mergeConfig(c,{companyGrowthMode:'flat',valuationMethod:'fcfe'}),monthly,cost);
    const selectedValuePerShare=current.alternatives.find(x=>x.id==='fcfe').valuePerShare;
    const r=pct(c.discountRatePct),pvDiff=key=>current.annual.reduce((s,x,i)=>s+(x[key]-flat.annual[i][key])/Math.pow(1+r,i+1),0);
    const growthCapexPV=current.annual.reduce((s,x,i)=>s+x.growthCapex/Math.pow(1+r,i+1),0);
    const bridge=c.cashflowMode==='bridge';
    return {selectedValuePerShare,flatValuePerShare:flat.valuation.valuePerShare,valueAddedPerShare:selectedValuePerShare-flat.valuation.valuePerShare,capitalConstrained:bridge,method:c.cashflowMode,profitPV:pvDiff('profit'),daPV:bridge?pvDiff('da'):null,sustainingCapexPV:bridge?pvDiff('sustainingCapex'):null,growthCapexPV:bridge?growthCapexPV:null,workingCapitalPV:bridge?pvDiff('deltaNwc'):null,terminalValuePV:current.valuation.terminalPresentValue-flat.valuation.terminalPresentValue,firstVolume:current.annual[0].volume,lastVolume:current.annual.at(-1).volume,lastSharePct:current.annual.at(-1).marketSharePct,capacityReference2025:8216,note:bridge?'仅隔离销量路径与其配套资本的增量FCFE价值；各路径共用单位价格与基础成本路径。固定市场规模的份额校验不是全国供给预测。':'简化现金转化率未按输入逐项扣扩产资本和营运资金；此处不能称资本约束后的增长净现值。请切换逐项现金桥。'};
  }
  function calculate(input,data) {
    data=data||root.PIG_DATA||{};
    const c=mergeConfig(DEFAULTS,input),check=validate(c,data),cost=costs(check.errors.length?DEFAULTS:c),cal=check.errors.length?{label:'输入无效',beta:null,cycles:[],note:''}:calibration(c,data);
    if(check.errors.length)return {valid:false,config:c,...check,summary:{},monthly:[],quarterly:[],annual:[],cost,calibration:cal,valuation:{details:[]},alternatives:[],diagnostics:{},assumptions:[]};
    const monthly=pricePath(c,data,cost,cal);
    if(monthly.some(x=>!Number.isFinite(x.price)||x.price<=0)) {
      check.errors.push({key:'priceMethod',message:c.priceMethod==='capacity'?'当前无可用同口径去化阶段系数，请选手动β或另一价格路线。':'该组合产生非正或不可计算的猪价，不能用于利润估值；请检查弹性、锚和供给参数。'});
      return {valid:false,config:c,...check,summary:{},monthly,quarterly:[],annual:[],cost,calibration:cal,valuation:{details:[]},alternatives:[],diagnostics:{},assumptions:[]};
    }
    const v=valuePath(c,monthly,cost),annual=v.annual,valuation=v.valuation,quarterly=[];
    const growth=growthAttribution(c,monthly,cost,v);
    for(let q=0;q<4;q++){const rows=monthly.slice(q*3,q*3+3),p=avg(rows.map(x=>x.price)),profit=c.hogsPerYear*c.companyWeight/10000/4*(p+c.realizedPriceDelta-c.companyCost)*pct(c.attributionPct)+c.otherProfit/4;quarterly.push({quarter:'2027 Q'+(q+1),sows:avg(rows.map(x=>x.sows)),price:p,profit,cashflow:c.cashflowMode==='ratio'?profit*pct(c.cashConversionPct):null});}
    if(monthly.some(x=>x.sows<.92*c.policySows))check.warnings.push({key:'q4DepletionPct',message:'投影能繁低于政策正常保有量92%。政策与补栏反馈可能使直线去化外推失效；这不是模型自动证明的高价。'});
    if(annual.some(x=>x.fcfe<0))check.warnings.push({key:'cashflowMode',message:'显性期存在负股权现金流。须安排备用现金/融资/缩减资本支出；本版未自动补入稀释或破产重组。'});
    if(c.annualNetRepayment>0)check.warnings.push({key:'annualNetRepayment',message:c.cashflowMode==='bridge'?'净还债在年末进行，次年按期初平均利率降低利息成本；权益折现率仍固定，未模拟杠杆变化对应的风险回报。':'简化转化率模式不计算净还债与利息节约；请切桥接模式检查资本约束。'});
    if(c.extraCash>0)check.warnings.push({key:'extraCash',message:'模型外现金只加到FCFE/PE；EV净债与PB账面已含现金，未重复加回。若现金创造的收益已进利润，还需先剔除。'});
    if(valuation.valuePerShare!==null&&valuation.valuePerShare<0)check.warnings.push({key:'valuationMethod',message:'原始持续经营股权现值为负；此时应转入融资/重组分析，不能解读为股票负价格。'});
    if(valuation.terminalShare>.7)check.warnings.push({key:'terminalGrowthPct',message:'终值占FCFE股权现值超过70%，估值主要依赖长期盈利和再投资假设。'});
    if(Math.abs(valuation.impliedROE*100-c.normalROEPct)>5)check.warnings.push({key:'normalROEPct',message:'独立PB路线的正常ROE与经营模型隐含ROE相差超过5个百分点；方法差异可能只是输入不一致。'});
    if(c.priceMethod==='capacity'&&cal.selectedCount<3&&c.historicalCycle!=='manual')check.warnings.push({key:'historicalCycle',message:'可比去化阶段少于3个。不能把月数当独立周期样本，也不能由此给可靠事件概率。'});
    if(c.anchorMode==='policy'&&c.priceMethod==='demand')check.warnings.push({key:'baseRetailPrice',message:'政策假设锚实际零售价为'+monthly[0].baseRetail.toFixed(2)+'元/kg，按观测零售锚+(政策活猪价−观测活猪价)/λ推导；这不是观测值。λ=0时猪价不随零售变动。'});
    if(c.lagMode==='distributed')check.warnings.push({key:'lagMode',message:'预测把8–12月母猪数量算术加权；研究相关检验采用对数加权，两者不能称作同一已验证模型。基期产能含缺失月插值。'});
    if(growth.lastVolume>8216&&c.growthCapexPerHead===0)check.warnings.push({key:'growthCapexPerHead',message:'销量终点超过2025披露的8216万头年产能，而增长投资设为0；须证明技术改造/产能口径变化可以承接，不能默认免费扩产。'});
    const historical=(data.history||[]).filter(x=>x.priceSeries===c.priceSeries&&Number.isFinite(x.price)&&x.month>='2016-01');
    const annualPrice=avg(monthly.map(x=>x.price));
    const assumptions=PARAMS.filter(p=>p.type!=='select'||p.key==='priceMethod'||p.key==='valuationMethod').map(p=>({label:p.label,value:c[p.key],unit:p.unit||'',evidence:c[p.key]===p.default?p.evidence:'assumption',sourceIds:p.sourceIds}));
    return {valid:true,config:c,...check,summary:{annualPrice,q4Price:quarterly[3].price,normalPrice:v.normalPrice,year1Profit:annual[0].profit,year1Cashflow:annual[0].fcfe,valuePerShare:valuation.valuePerShare,terminalShare:valuation.terminalShare,impliedNormalPrice:reverse(c,monthly,cost)},monthly,quarterly,annual,cost,valuation,growth,alternatives:v.alternatives,calibration:cal,crossChecks:crossChecks(c),diagnostics:{historyRank:historical.length?historical.filter(x=>x.price<=annualPrice).length/historical.length:null,historyN:historical.length,historyYears:[...new Set(historical.map(x=>x.month.slice(0,4)))].length,probabilityNote:'历史位置只是月价分位；月序列自相关且跨疫病/统计制度。主观权重不是预测成功率。',normalPriceSource:c.normalPriceMode==='cost'?'必要产能成本判断 + 权益回报':'用户设定长期猪价'},assumptions};
  }
  function serialize(config) {
    const c=mergeConfig(DEFAULTS,config),auxErrors=auxiliaryInputErrors(c,null,true);
    if(auxErrors.length)throw new Error(auxErrors.map(x=>x.message).join(' '));
    const s=JSON.stringify({version:VERSION,config:c});
    return (typeof Buffer!=='undefined'?Buffer.from(s,'utf8').toString('base64'):btoa(unescape(encodeURIComponent(s)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function deserialize(s,data) {
    if(typeof s!=='string'||s.length>30000||!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('分享配置格式不正确。');
    const b=s.replace(/-/g,'+').replace(/_/g,'/'),raw=typeof Buffer!=='undefined'?Buffer.from(b,'base64').toString('utf8'):decodeURIComponent(escape(atob(b)));
    const obj=JSON.parse(raw);if(!obj||![VERSION,'1.2.0','1.1.0','1.0.0'].includes(obj.version)||!obj.config||typeof obj.config!=='object'||Array.isArray(obj.config))throw new Error('配置版本不兼容。');
    const retired=['advantageRetentionPct','advantageFadeClock','advantageFadeStartYear'];if(obj.version!==VERSION){for(const k of retired)delete obj.config[k];}const known=new Set(PARAMS.map(p=>p.key));for(const k of Object.keys(obj.config))if(!known.has(k))throw new Error('配置包含未知字段：'+k);
    const migrated=Object.assign({},obj.config);
    if(obj.version!==VERSION){if(!Object.hasOwn(migrated,'costBasis'))migrated.costBasis='technical';if(!Object.hasOwn(migrated,'companyGrowthMode'))migrated.companyGrowthMode='rate';if(!Object.hasOwn(migrated,'growthInvestmentTiming'))migrated.growthInvestmentTiming='same_year';}
    const c=mergeConfig(DEFAULTS,migrated),v=validate(c,data||root.PIG_DATA),errors=v.errors.concat(auxiliaryInputErrors(c,null,true));if(errors.length)throw new Error(errors.map(x=>x.message).join(' '));return c;
  }
  function csv(result) {
    const q=v=>{let s=v==null?'':String(v);if(typeof v==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const rows=[['猪周期研究台',VERSION,'截至2026-10-24','全部结果是条件情景'],['参数','值','单位','证据类型']];
    (result.assumptions||[]).forEach(x=>rows.push([x.label,x.value,x.unit,x.evidence]));
    rows.push([],['月份','对应母猪月份','母猪万头','MSY比','体重比','有效产能比','猪价元kg','状态']);
    (result.monthly||[]).forEach(x=>rows.push([x.month,x.sourceMonth,x.sows,x.msyRatio,x.weightRatio,x.effectiveCapacityRatio,x.price,x.status]));
    rows.push([],['年份','商品猪万头','重量kg','实现价元kg','成本元kg','归母利润亿元','折旧亿元','维持投资亿元','增长投资亿元','营运资金增加亿元','净借款亿元','FCFE亿元','现值亿元']);
    (result.annual||[]).forEach(x=>rows.push([x.year,x.volume,x.weight,x.price,x.cost,x.profit,x.da,x.sustainingCapex,x.growthCapex,x.deltaNwc,x.netBorrowing,x.fcfe,x.presentValue]));
    rows.push([],['估值方法','每股元']);(result.alternatives||[]).forEach(x=>rows.push([x.label,x.valuePerShare]));
    if(result.growth){const g=result.growth;rows.push([],['销量成长归因（同样价格成本路径）','值','单位'],['是否逐项扣增长资本',g.capitalConstrained,''],['成长归因限制',g.note,''],['销量持平FCFE每股值',g.flatValuePerShare,'元/股'],['所选成长路径FCFE每股值',g.selectedValuePerShare,'元/股'],['销量成长增加价值',g.valueAddedPerShare,'元/股'],['增长资本支出现值',g.growthCapexPV,'亿元'],['增量经营营运资金现值',g.workingCapitalPV,'亿元'],['新增利润现值',g.profitPV,'亿元'],['增量终值现值',g.terminalValuePV,'亿元']);rows.push([],['年份','商品猪销量万头','行业出栏校验万头','近似份额%']);(result.annual||[]).forEach(x=>rows.push([x.year,x.volume,x.industryHogs,x.marketSharePct]));}
    const c=mergeConfig(DEFAULTS,result.config),checks=result.crossChecks||crossChecks(c),f=checks.futures,p=checks.piglet;
    rows.push([],['期货与基差：用户输入，非实时行情','值','单位'],['是否配置',f.configured,''],['辅助计算有效',f.valid,''],['期货合约报价',c.futuresQuote,'元/吨'],['地区与品质基差：现货减期货',c.futuresBasis,'元/kg'],['报价观察日期',f.metadata.observedDate,'YYYY-MM-DD'],['期货合约代码',f.metadata.contract,''],['报价类型',f.metadata.quoteType,'settlement/close/user'],['基差地区与品质口径',f.metadata.basisScope,''],['报价来源',f.metadata.quoteSource,'纯文本'],['基差调整后的市场对照价',f.referencePrice,'元/kg']);
    f.errors.forEach(x=>rows.push(['期货对照校验错误',x.message,'']));f.warnings.forEach(x=>rows.push(['期货对照说明',x.message,'']));
    rows.push([],['外购仔猪育肥：条件回报门槛','值','单位'],['辅助计算有效',p.valid,'']);
    PARAMS.filter(x=>x.group==='外购仔猪育肥').forEach(x=>rows.push([x.label,c[x.key],x.unit]));
    rows.push(['保本出栏价',p.breakEvenPrice,'元/kg'],['含目标利润所需出栏价',p.requiredPrice,'元/kg'],['假设售价下预期利润',p.expectedProfit,'元/每头买入仔猪']);
    p.errors.forEach(x=>rows.push(['仔猪育肥校验错误',x.message,'']));p.warnings.forEach(x=>rows.push(['仔猪育肥说明',x.message,'']));
    return '\uFEFF'+rows.map(r=>r.map(q).join(',')).join('\r\n');
  }
  const API={VERSION,PARAMS,DEFAULTS,PRESETS,mergeConfig,validate,calculate,serialize,deserialize,csv,costs,productivity,calibration,crossChecks,companyVolume};
  root.PigCycleModel=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:this);

