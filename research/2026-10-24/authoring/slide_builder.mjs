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
    xAxis:{textStyle:{fontSize:c.categories.length>6?18:20,fill:C.ink},line:{fill:C.line,width:1},majorGridlines:null},
    yAxis:{numberFormatCode:'0.0',textStyle:{fontSize:19,fill:C.muted},majorGridlines:{fill:C.line,width:1},min:0},
    dataLabels:{showValue:c.type==='bar',position:'outEnd',numberFormatCode:'0.00',textStyle:{fontSize:19,fill:C.ink}},
    lineOptions:{smooth:false}});
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
    text(s,'cover-duration','行业篇26页 / 企业篇23页 / 附录6页   约58分钟',74,585,1110,42,23,'#E6BB70');
  }else{
    text(s,'title',d.title,64,45,1150,82,43,C.ink,true);
    if(d.kind==='table')table(s,d.content,{...(d.title.includes('报告、网页与脚本对应')?{widths:[.28,.43,.29]}:d.title.includes('FCFF与FCFE')?{widths:[.26,.37,.37]}:{}),h:d.content.length>8?428:396,size:d.title.includes('报告、网页与脚本对应')?20:d.title.includes('FCFF与FCFE')?23:d.content[0].length===4?22:undefined});
    if(d.kind==='chart')chart(s,d.content);
    if(d.kind==='annual'){
      const a=data.annual;table(s,[['年份','公司价','基础成本','利润','D&A','维护','ΔNWC','FCFE'],...a.map(x=>[x.year,...['price','cost','profit','da','sustainingCapex','deltaNwc','fcfe'].map(k=>x[k].toFixed(2))])],{h:440,widths:[.10,.12,.12,.14,.12,.12,.14,.14],size:20});
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
    text(s,'takeaway',d.point,64,596,1150,58,d.point.length>50?23:25,C.teal,true);
    text(s,'source',d.refs,64,668,1070,27,15,C.muted);
    text(s,'page',String(d.number).padStart(2,'0'),1150,662,64,34,18,C.muted);
  }
  s.speakerNotes.text=(d.appendix?'查阅附录，不计入主讲时长。\n':`建议时间 ${d.timeStart}—${d.timeEnd}。\n`)+d.notes+'\n\n来源：'+d.refs+'\n'+d.citations.map(x=>x.title+' '+x.url).join('\n')+(d.pause?`\n演示与停顿预留约${d.pause}秒。`:'');
}
return {slides:presentation.slides.items.length};

}



