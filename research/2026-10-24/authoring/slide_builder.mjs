export function buildSlides(presentation,data){
// Callback body, loaded by the native artifact session. Tables and charts stay editable.
const C={bg:'#F8FAFC',ink:'#102C3A',muted:'#4A6271',teal:'#087F80',amber:'#A16207',blue:'#567B9F',line:'#CCD9DE',white:'#FFFFFF'};
const font='Microsoft YaHei';
function text(slide,name,value,x,y,w,h,size=28,color=C.ink,bold=false){
  const a=slide.shapes.add({geometry:'textbox',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  a.text=String(value);a.text.style={fontFamily:font,fontSize:size,color,bold,verticalAlignment:'middle',wrap:true};return a;
}
function table(slide,values,opts={}){
  const n=values.length,m=values[0].length;
  const x=opts.x??64,y=opts.y??156,w=opts.w??1152,h=opts.h??402;
  const widths=opts.widths??(m===2?[.45,.55]:m===3?[.39,.23,.38]:Array(m).fill(1/m));
  const t=slide.tables.add({rows:n,columns:m,left:x,top:y,width:w,height:h,values,columnWidths:widths.map(v=>w*v)});
  t.borders.assign({style:'solid',fill:C.line,width:1});
  t.cells.block({row:0,column:0,rowCount:n,columnCount:m}).assign({margins:{left:14,right:12,top:8,bottom:8},anchor:'center'});
  for(let r=0;r<n;r++)for(let c=0;c<m;c++){
    const cell=t.getCell(r,c);cell.fill=r===0?C.ink:r%2?C.white:'#EFF4F5';
    cell.text.style={fontFamily:font,fontSize:opts.size??(n>9?21:m>3?23:25),color:r===0?C.white:C.ink,bold:r===0};
  }
  return t;
}
function chart(slide,c,box={left:64,top:162,width:1148,height:380}){
  const colors=[C.teal,C.amber,C.blue,'#846F94'];
  const chart=slide.charts.add(c.type,{position:box,categories:c.categories,series:c.series.map((s,i)=>({...s,fill:colors[i%colors.length],line:{fill:colors[i%colors.length],width:3}})),
    hasLegend:true,legend:{position:'bottom',textStyle:{fontSize:19,fill:C.ink}},
    chartFill:C.bg,plotAreaFill:C.bg,barOptions:{direction:'column',grouping:'clustered',gapWidth:65},
    xAxis:{tickLabelPosition:'low',textStyle:{fontSize:c.categories.length>6?18:20,fill:C.ink},line:{fill:C.line,width:1},majorGridlines:null},
    yAxis:{numberFormatCode:'0.0',textStyle:{fontSize:19,fill:C.muted},majorGridlines:{fill:C.line,width:1},min:c.min??0,...(c.max==null?{}:{max:c.max})},
    dataLabels:{showValue:c.type==='bar',position:'outEnd',numberFormatCode:'0.00',textStyle:{fontSize:19,fill:C.ink}},
    lineOptions:{smooth:false}});
  if(c.categories.length===8&&c.min<0)chart.dataLabels={showValue:true,showSeriesName:false,showCategoryName:false,position:"center",numberFormatCode:"0.00",textStyle:{fontSize:19,fill:"#FFFFFF"}};
  return chart;
}
// Rebuild content in this same viewer-bound presentation.
if(data.reset)for(const s of [...presentation.slides.items])s.delete();
for(const d of data.slides.slice(data.start??0,data.end??data.slides.length)){
  const s=presentation.slides.add();s.background.fill=C.bg;
  if(d.kind==='cover'){
    s.background.fill=C.ink;
    text(s,'cover-title',d.title,70,100,1135,175,57,C.white,true);
    text(s,'cover-subtitle',d.content[0],74,330,1110,90,30,'#D1E5E8');
    text(s,'cover-date',d.content[1],74,487,1110,56,22,'#D1E5E8');
    text(s,'cover-duration','行业篇26页 / 企业篇23页 / 附录8页   约57分钟',74,585,1110,42,23,'#E6BB70');
  }else{
    text(s,'title',d.title,64,45,1150,82,43,C.ink,true);
    if(d.kind==='table')table(s,d.content,{...(d.title.includes('报告、网页与脚本对应')?{widths:[.28,.43,.29]}:d.title.includes('FCFF与FCFE')?{widths:[.26,.37,.37]}:{}),h:d.content.length>8?428:396,size:d.title.includes('报告、网页与脚本对应')?20:d.title.includes('FCFF与FCFE')?23:d.content[0].length===4?22:undefined});
    if(d.kind==='chart'){chart(s,d.content);if(d.number===39)text(s,'cash-zero-note','平量参照：增长投资=0、净借款=0；末项为最终FCFE',75,545,1100,36,21,C.muted);}
    if(d.kind==='annual'){
      const a=data.annual;table(s,[['年份','公司价','等价成本','利润','D&A','维护','ΔNWC','FCFE'],...a.map(x=>[x.year,...['price','cost','profit','da','sustainingCapex','deltaNwc','fcfe'].map(k=>x[k].toFixed(2))])],{h:440,widths:[.10,.12,.12,.14,.12,.12,.14,.14],size:20});
    }
    if(d.kind==='cost_intro'){
      table(s,d.content,{x:64,y:155,w:654,h:420,widths:[.44,.28,.28],size:24});
      chart(s,{type:'bar',categories:['仔猪','饲料','动保','人工','折旧','总部'],series:[{name:'元/头',values:[348,804,36,180,24,96]}]},{left:750,top:174,width:465,height:334});
      text(s,'cost-explanation','仔猪成本已含繁育阶段费用\n本例属于神农披露口径',772,520,430,65,22,C.muted);
    }
    if(d.kind==='text'||d.kind==='formula'){
      let y=164;
      for(let i=0;i<d.content.length;i++){
        const c=d.content[i]; const height=d.content.length>4?69:92;
        text(s,'content-'+i,c,75,y,1125,height,d.kind==='formula'&&i===0?35:d.content.length>4?27:30,i===0&&d.kind==='formula'?C.teal:C.ink,i===0&&d.kind==='formula');y+=height+11;
      }
    }
    if(d.kind==='cycle_flow'){
      const pos=[[70,170],[480,170],[890,170],[890,365],[480,365],[70,365]];
      d.content.forEach((v,i)=>{const[x,y]=pos[i];text(s,'cycle-node-'+i,v,x,y,320,110,29,C.ink,true);});
      [[410,200,'→'],[820,200,'→'],[1010,294,'↓'],[820,397,'←'],[410,397,'←'],[180,294,'↑']].forEach((a,i)=>text(s,'cycle-arrow-'+i,a[2],a[0],a[1],70,60,42,C.teal,true));
      text(s,'cycle-caption','效率、体重、资金与需求，会分别改变这条链上的不同环节',95,517,1090,45,25,C.muted);
    }
    if(d.kind==='normal_center'){
      text(s,'normal-definition',d.content[0],75,155,1120,72,33,C.teal,true);
      text(s,'normal-input',d.content[1],75,259,1120,60,30);
      text(s,'normal-return',d.content[2],75,349,1120,60,30);
      text(s,'normal-result',d.content[3],75,451,1120,90,42,C.teal,true);
    }
    if(d.kind==='price_bridge'||d.kind==='exit_flow'){
      d.content.forEach((v,i)=>{text(s,'logic-'+i,v,100,158+i*100,1090,70,29,i===0?C.teal:C.ink,i===0);if(i<3)text(s,'logic-arrow-'+i,'↓',65,218+i*100,52,43,31,C.teal);});
    }
    if(d.kind==='lag_timeline'){
      text(s,'timeline-start','母猪状态 / 生产决策',75,154,430,55,30,C.teal,true);
      text(s,'timeline-gap','约10个月 →',535,154,280,55,30,C.teal,true);
      text(s,'timeline-end','2027商品猪供给',865,154,330,55,30,C.teal,true);
      d.content.forEach((row,i)=>{text(s,'lag-origin-'+i,row[1],100,235+i*76,540,60,28);text(s,'lag-arrow-'+i,'→',690,235+i*76,90,60,34,C.teal);text(s,'lag-quarter-'+i,row[0],900,235+i*76,270,60,32,C.teal,true);});
    }
    if(d.kind==='history_derivation'){
      const mm=d.content.months;
      text(s,'history-anchor','观测锚：11.36元/kg',70,160,490,60,29,C.ink,true);
      text(s,'history-beta','历史系数β = 7.593232',70,245,490,60,28);
      text(s,'history-formula','月价 = 11.36 × E月^(-β)',70,330,510,65,30,C.teal,true);
      text(s,'history-example','12月E≈0.8853 → 月价28.65\n12个月取均值 → 20.8082',70,430,500,113,27);
      chart(s,{type:'line',categories:mm.map(x=>x.month.slice(5)),series:[{name:'历史路线月价 元/kg',values:mm.map(x=>x.price)}]},{left:615,top:166,width:590,height:382});
    }
    if(d.kind==='dual_chart'){
      chart(s,d.content[0],{left:65,top:165,width:550,height:385});chart(s,d.content[1],{left:655,top:165,width:550,height:385});
    }
    if(d.kind==='price_summary'){
      chart(s,d.content,{left:65,top:160,width:680,height:390});
      text(s,'price-20','下一部分：全年20元',795,182,410,75,32,C.teal,true);
      text(s,'price-20-basis','源报告的整值演算输入\n接近历史条件年均20.81\n不等于已证实的预测',795,294,410,165,28);
      text(s,'price-20-objects','中枢与年度均价各有所问\n三条结果不能直接平均',795,477,410,80,24,C.muted);
    }
    if(d.kind==='valuation_split'){
      chart(s,d.content,{left:65,top:160,width:700,height:385});
      text(s,'value-result','59.50元/股',825,200,380,86,47,C.teal,true);
      text(s,'value-closure','终值FCFE 357.64亿元\n现金维护更新 95亿元\n股数 57.72996144亿',825,339,380,150,27);
    }
    if(d.kind==='depreciation_path'){
      const a=d.content.annual;
      chart(s,{type:'line',categories:a.map(x=>String(x.year).slice(2)),series:[{name:'存量折旧 亿元',values:a.map(x=>x.oldAssetDA)},{name:'新增/更新折旧 亿元',values:a.map(x=>x.newAssetDA)},{name:'总折旧 亿元',values:a.map(x=>x.da)}]},{left:65,top:170,width:550,height:370});
      chart(s,{type:'line',min:11,max:12.1,categories:a.map(x=>String(x.year).slice(2)),series:[{name:'等价完全成本 元/kg（纵轴截断）',values:a.map(x=>x.cost)}]},{left:655,top:170,width:550,height:370});
    }

    text(s,'takeaway',d.point,64,596,1150,58,d.point.length>50?23:25,C.teal,true);
    const source=text(s,'source',d.sourceLine??d.refs,64,662,1085,44,14,C.muted);source.text.set([[{run:d.sourceLine??d.refs,link:{uri:'https://github.com/d202480025-code/muyuan-valuation-research/blob/main/research/2026-10-24/slide-data-ledger.md#p'+String(d.number).padStart(2,'0'),isExternal:true}}]]);
    text(s,'page',String(d.number).padStart(2,'0'),1150,662,64,34,18,C.muted);
  }
  s.speakerNotes.text=(d.appendix?'查阅附录，不计入主讲时长。\n':`建议时间 ${d.timeStart}—${d.timeEnd}。\n`)+d.notes+'\n\n数据性质与逐项依据：'+(d.provenance?.basis??'见来源')+'\n来源：'+d.refs+'\n'+d.citations.map(x=>x.title+' '+x.url).join('\n')+(d.pause?`\n演示与停顿预留约${d.pause}秒。`:'');
}
return {slides:presentation.slides.items.length};

}



