import {monthlySummary,payslipSummary,validDate} from './domain.js';

export function validMonth(month) {
 return typeof month==='string'&&/^\d{4}-\d{2}$/.test(month)&&validDate(`${month}-01`);
}
export function shiftMonth(month,offset) {
 if(!validMonth(month)||!Number.isInteger(offset))throw new Error('月份无效');
 const [year,number]=month.split('-').map(Number);
 const index=year*12+number-1+offset;
 const next=`${String(Math.floor(index/12)).padStart(4,'0')}-${String((index%12+12)%12+1).padStart(2,'0')}`;
 if(!validMonth(next))throw new Error('月份超出支持范围');
 return next;
}
export function monthlyComparison(data,baseMonth,targetMonth,adjusted=false) {
 if(!validMonth(baseMonth)||!validMonth(targetMonth))throw new Error('月份请填写 YYYY-MM，例如2026-10');
 const summaries=[baseMonth,targetMonth].map(month=>monthlySummary(data.records,month,data.monthlyLeave?.[month]??0,true));
 const pays=[baseMonth,targetMonth].map(month=>payslipSummary(data,month));
 const row=(id,label,unit,values)=>{
  const [base,target]=values.map(value=>Math.round(value*100)/100);
  const delta=Math.round((target-base)*100)/100;
  return {id,label,unit,base,target,delta,percent:base>0?Math.round(delta/base*1000)/10:null};
 };
 const hours=summaries.map(summary=>adjusted?summary.remaining:summary.raw);
 const sections=[
  {title:'出勤与调休',rows:[
   row('total','实际总工时','小时',summaries.map(s=>s.total)),
   row('recordDays','已记录天数','天',summaries.map(s=>s.entries.length)),
   row('workDays','有工时天数','天',summaries.map(s=>s.entries.filter(e=>e.record.total>0).length)),
   row('restDays','休息天数（0h）','天',summaries.map(s=>s.entries.filter(e=>e.record.total===0).length)),
   row('leave','填报调休','小时',summaries.map(s=>s.leave)),
   row('appliedLeave','实际抵扣调休','小时',summaries.map(s=>s.applied))
  ]},
  {title:adjusted?'倍率工时 · 调休后':'倍率工时 · 原始',rows:[
   ...['正常工时','1.5 倍工时','2 倍工时','3 倍工时'].map((label,i)=>row('hours'+i,label,'小时',hours.map(h=>h[i]))),
   row('overtimeHours','加班工时合计','小时',hours.map(h=>h.slice(1).reduce((a,b)=>a+b,0)))
  ]},
  {title:'工资组成 · 调休后',rows:[
   row('overtimePay','加班工资','元',pays.map(p=>p.overtime)),
   row('income','自定义收入','元',pays.map(p=>p.income)),
   row('deductions','自定义扣款','元',pays.map(p=>p.deductions)),
   row('netPay','实发合计','元',pays.map(p=>p.total))
  ]}
 ];
 return {baseMonth,targetMonth,adjusted,sections,emptyMonths:summaries.flatMap((s,i)=>s.entries.length?[]:[[baseMonth,targetMonth][i]]),excess:summaries.map(s=>s.excess)};
}
export function comparisonCsv(comparison) {
 const cell=value=>`"${String(value).replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')}"`;
 const rows=[['分类','指标','单位',`基准月 ${comparison.baseMonth}`,`对比月 ${comparison.targetMonth}`,'增减（对比月－基准月）','变化百分比（基准>0）'],
  ...comparison.sections.flatMap(section=>section.rows.map(row=>[section.title,row.label,row.unit,row.base,row.target,row.delta,row.percent===null?'—':`${row.percent}%`]))];
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
