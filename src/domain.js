export const DEFAULT_SETTINGS = { workdays: [1,2,3,4,5], doubleWorkdays: [], threshold: 8, salaryEnabled: false, overtimeOnly: false, payslipEnabled: false, payslipItems: [], hourlyRate: 0, reminderEnabled: false, reminderTime: '18:00', reminderDays: [1,2,3,4,5] };
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}
export function units(value, max = 24) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('请输入非负数字，最多保留两位小数');
  const n = Math.round(Number(text)*100);
  if (!Number.isSafeInteger(n) || n > max*100) throw new Error(`数值不能超过 ${max}`);
  return n;
}
export function allocate(total, date, settings) {
  if (!validDate(date)) throw new Error('日期无效，请使用 YYYY-MM-DD 格式');
  const n = units(total);
  if (!settings.workdays.includes(new Date(`${date}T12:00:00`).getDay())) return [0,0,n/100,0];
  const base = Math.min(n, Math.round(settings.threshold*100));
  return (settings.doubleWorkdays??[]).includes(new Date(`${date}T12:00:00`).getDay())?[base/100,0,(n-base)/100,0]:[base/100,(n-base)/100,0,0];
}
// Empty and trailing-decimal input are valid while editing an hours field.
export function hourUnits(value) {
  const text=String(value).trim();
  if(text==='') return 0;
  if(!/^\d+(\.\d{0,2})?$/.test(text)) throw new Error('请输入非负工时，最多两位小数');
  return units(Number(text));
}
export function rebalanceHours(total, current, index, value) {
  if(!Array.isArray(current)||current.length!==4||!Number.isInteger(index)||index<0||index>3) throw new Error('工时分类无效');
  const next=current.map((h,i)=>i===index?value:String(h));
  let target, values;
  try {target=units(total);values=next.map(hourUnits);} catch {return next;}
  let difference=values.reduce((sum,h)=>sum+h,0)-target;
  if(difference>0) {
    for(const donor of [0,1,2,3]) {
      if(donor===index) continue;
      const deduction=Math.min(values[donor],difference);
      values[donor]-=deduction;difference-=deduction;
      if(difference===0) break;
    }
  } else if(difference<0) {
    // When normal hours itself is reduced, put the remainder in 1.5x hours.
    values[index===0?1:0]-=difference;
  }
  return values.map((h,i)=>i===index?value:String(h/100));
}
export function validateRecord(record) {
  if (!record || typeof record.date!=='string' || typeof record.total!=='number' || typeof record.hourlyRate!=='number') throw new Error('记录的日期或数值格式无效');
  if (!validDate(record.date)) throw new Error('日期无效');
  const total = units(record.total);
  if (!Array.isArray(record.hours) || record.hours.length !== 4) throw new Error('需要四类工时');
  if (record.hours.some(h=>typeof h!=='number')) throw new Error('工时必须是数值');
  const sum = record.hours.reduce((n,h)=>n+units(h),0);
  if (sum !== total) throw new Error('四类工时合计必须等于总工时');
  if (typeof record.salaryEnabled !== 'boolean') throw new Error('工资开关无效');
  units(record.hourlyRate,100000);
  if (typeof record.note !== 'string' || record.note.length > 500) throw new Error('备注最多500字');
  return record;
}
export function money(record, overtimeOnly = false) {
  if (!record.salaryEnabled) return 0;
  return Math.round(record.hours.reduce((s,h,i)=>s+h*[overtimeOnly?0:1,1.5,2,3][i],0)*record.hourlyRate*100)/100;
}
export function validateSettings(s) {
  if(!s || typeof s.threshold!=='number' || typeof s.hourlyRate!=='number') throw new Error('设置的数值格式无效');
  for (const key of ['workdays','reminderDays']) {
    if (!Array.isArray(s[key]) || s[key].some(x=>!Number.isInteger(x)||x<0||x>6) || new Set(s[key]).size!==s[key].length) throw new Error('星期设置无效');
  }
  if(s.doubleWorkdays!==undefined && (!Array.isArray(s.doubleWorkdays)||s.doubleWorkdays.some(d=>!Number.isInteger(d)||!s.workdays.includes(d))||new Set(s.doubleWorkdays).size!==s.doubleWorkdays.length)) throw new Error('2倍加班日必须从工作日中选择');
  units(s.threshold); units(s.hourlyRate,100000);
  if (typeof s.salaryEnabled!=='boolean'||typeof s.reminderEnabled!=='boolean') throw new Error('设置开关无效');
  if (s.overtimeOnly!==undefined && typeof s.overtimeOnly!=='boolean') throw new Error('工资计算范围无效');
  if(s.payslipEnabled!==undefined && typeof s.payslipEnabled!=='boolean') throw new Error('工资条开关无效');
  if(s.payslipItems!==undefined)validatePayslipItems(s.payslipItems);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.reminderTime)) throw new Error('提醒时间请填写 HH:mm，例如18:00');
  if (s.reminderEnabled && !s.reminderDays.length) throw new Error('至少选择一个提醒星期');
  return s;
}
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data.version!==1 || !Array.isArray(data.records) || data.records.length>50000) throw new Error('不是支持的工时备份文件');
  validateSettings(data.settings);
  const dates = new Set();
  data.records.forEach(r=>{validateRecord(r); if(dates.has(r.date)) throw new Error('备份内存在重复日期'); dates.add(r.date);});
  const monthlyLeave=validateMonthlyLeave(data.monthlyLeave===undefined?{}:data.monthlyLeave);
  return {version:1,settings:{...DEFAULT_SETTINGS,...data.settings},records:data.records,monthlyLeave,monthlyPayslips:validateMonthlyPayslips(data.monthlyPayslips===undefined?{}:data.monthlyPayslips)};
}
export function reminderDates(settings, records, now = new Date()) {
  if (!settings.reminderEnabled) return [];
  const saved = new Set(records.map(r=>r.date));
  const [hour,minute] = settings.reminderTime.split(':').map(Number);
  const result = [];
  for(let i=0;i<60;i++) {
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i,hour,minute);
    if(date>now && settings.reminderDays.includes(date.getDay()) && !saved.has(localDate(date))) result.push(date);
  }
  return result;
}
export function validateMonthlyLeave(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length>10000) throw new Error('月度调休格式无效');
  const result={};
  for (const [month,hours] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`) || typeof hours!=='number') throw new Error('调休月份或工时无效');
    units(hours,744);
    result[month]=hours;
  }
  return result;
}
export function categoryRecords(records, month, index) {
  if (!Number.isInteger(index) || index<0 || index>3) throw new Error('工时分类无效');
  return records.filter(r=>r.date.startsWith(`${month}-`) && r.hours[index]>0).sort((a,b)=>a.date.localeCompare(b.date));
}
export function monthlySummary(records, month, leave = 0, overtimeOnly = false) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw new Error('月份无效');
  let pending=units(leave,744);
  const entries=records.filter(r=>r.date.startsWith(`${month}-`)).sort((a,b)=>a.date.localeCompare(b.date)).map(record=>({record,deductions:[0,0,0,0],remaining:record.hours.map(h=>units(h)),pay:0}));
  const raw=[0,0,0,0];
  entries.forEach(entry=>entry.remaining.forEach((h,i)=>raw[i]+=h));
  // Deduct by multiplier first, then date, keeping each record's saved hourly rate.
  for (const index of [1,2,3]) {
    for (const entry of entries) {
      const deducted=Math.min(pending,entry.remaining[index]);
      entry.remaining[index]-=deducted;entry.deductions[index]+=deducted;pending-=deducted;
      if (pending===0) break;
    }
    if (pending===0) break;
  }
  const deductions=[0,0,0,0];
  for (const entry of entries) {
    entry.deductions=entry.deductions.map((h,i)=>{deductions[i]+=h;return h/100;});
    entry.remaining=entry.remaining.map(h=>h/100);
    entry.pay=money({...entry.record,hours:entry.remaining},overtimeOnly);
  }
  return {raw:raw.map(h=>h/100),deductions:deductions.map(h=>h/100),remaining:raw.map((h,i)=>(h-deductions[i])/100),leave,applied:(units(leave,744)-pending)/100,excess:pending/100,total:raw.reduce((a,b)=>a+b,0)/100,pay:entries.reduce((sum,e)=>sum+Math.round(e.pay*100),0)/100,entries};
}
export function saveMonthlyLeave(month, value, records, current = {}) {
  const leave=units(value,744)/100;
  const summary=monthlySummary(records,month,leave);
  if (summary.excess>0) throw new Error(`调休工时不能超过本月加班工时 ${Number(summary.raw.slice(1).reduce((a,b)=>a+b,0).toFixed(2))} 小时`);
  const next={...current};
  if (leave===0) delete next[month]; else next[month]=leave;
  return next;
}
export function validatePayslipItems(items) {
  if(!Array.isArray(items)||items.length>100) throw new Error('工资条最多100项');
  const ids=new Set();
  return items.map(item=>{
    if(!item || typeof item.id!=='string' || !item.id || item.id.length>100 || ids.has(item.id)) throw new Error('工资条项目编号无效或重复');
    if(typeof item.title!=='string'||!item.title.trim()||item.title.length>50) throw new Error('工资条项目名称需为1至50字');
    if(typeof item.amount!=='number') throw new Error('工资条金额必须是数字');
    units(item.amount,10000000);
    if(!['income','deduction'].includes(item.kind)||typeof item.note!=='string'||item.note.length>500) throw new Error('工资条收支或备注无效');
    ids.add(item.id);return {...item,title:item.title.trim()};
  });
}
export function validateMonthlyPayslips(value) {
  if(!value || typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>10000) throw new Error('月度工资条格式无效');
  const result={};
  for(const [month,slip] of Object.entries(value)) {
    if(!/^\d{4}-\d{2}$/.test(month)||!validDate(`${month}-01`)||!slip||typeof slip.enabled!=='boolean') throw new Error('工资条月份或开关无效');
    result[month]={enabled:slip.enabled,items:validatePayslipItems(slip.items)};
  }
  return result;
}
export function monthlyPayslip(data,month) {
  return data.monthlyPayslips?.[month]??{enabled:data.settings.payslipEnabled??false,items:data.settings.payslipItems??[]};
}
export function payslipSummary(data,month) {
  const overtime=monthlySummary(data.records,month,data.monthlyLeave[month]??0,true);
  const slip=monthlyPayslip(data,month);
  const items=slip.enabled?slip.items:[];
  const income=items.filter(i=>i.kind==='income').reduce((sum,i)=>sum+units(i.amount,10000000),0)/100;
  const deductions=items.filter(i=>i.kind==='deduction').reduce((sum,i)=>sum+units(i.amount,10000000),0)/100;
  return {overtime:overtime.pay,income,deductions,total:Math.round((overtime.pay+income-deductions)*100)/100,items,enabled:slip.enabled};
}
export function settingsWithPayslipSync(data,settings) {
  validateSettings(settings);
  const changed=JSON.stringify([data.settings.payslipEnabled??false,data.settings.payslipItems??[]])!==JSON.stringify([settings.payslipEnabled??false,settings.payslipItems??[]]);
  return {...data,settings,monthlyPayslips:changed?{}:data.monthlyPayslips};
}
export function applyMonthlyWage(records,month,settings) {
  if(!/^\d{4}-\d{2}$/.test(month)||!validDate(`${month}-01`)) throw new Error('月份无效');
  validateSettings(settings);
  return records.map(r=>r.date.startsWith(`${month}-`)?{...r,hourlyRate:settings.hourlyRate,salaryEnabled:settings.salaryEnabled}:r);
}
export function payslipCsv(data,month) {
  const summary=payslipSummary(data,month);
  const cell=value=>`"${String(value).replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')}"`;
  const rows=[['月份','项目','收支','金额','备注'],[month,'加班工资','收入',summary.overtime.toFixed(2),'按调休后剩余工时计算'],...summary.items.map(i=>[month,i.title,i.kind==='income'?'收入':'扣款',i.amount.toFixed(2),i.note]),[month,'收入小计（含加班）','',((Math.round(summary.overtime*100)+Math.round(summary.income*100))/100).toFixed(2),''],[month,'扣款小计','',summary.deductions.toFixed(2),''],[month,'实发合计','',summary.total.toFixed(2),'']];
  return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function csv(records, overtimeOnly = false, monthlyLeave = {}) {
  const cell = v => `"${String(v).replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')}"`;
  const settlements=new Map([...new Set(records.map(r=>r.date.slice(0,7)))].map(month=>[month,monthlySummary(records,month,monthlyLeave[month]??0,overtimeOnly)]));
  const adjusted=[...settlements.values()].some(s=>s.leave>0);
  const byDate=new Map([...settlements.values()].flatMap(s=>s.entries.map(e=>[e.record.date,e])));
  const header=['日期','总工时','正常工时','1.5倍工时','2倍工时','3倍工时','基础时薪',overtimeOnly?'加班工资金额':'全天工资金额','备注'];
  if (adjusted) header.push('1.5倍调休扣除','2倍调休扣除','3倍调休扣除','1.5倍剩余工时','2倍剩余工时','3倍剩余工时');
  const rows=[header,...records.map(r=>{
    const entry=byDate.get(r.date);
    const row=[r.date,r.total,...r.hours,r.salaryEnabled?r.hourlyRate:'',r.salaryEnabled?entry.pay.toFixed(2):'',r.note];
    if(adjusted) row.push(...entry.deductions.slice(1),...entry.remaining.slice(1));
    return row;
  })];
  if (adjusted) for (const [month,s] of settlements) {
    if (s.leave===0) continue;
    rows.push([`${month} 月度调休汇总`,s.total,...s.raw,'',s.pay.toFixed(2),`输入调休 ${s.leave}h；已扣 ${s.applied}h；未抵扣 ${s.excess}h`,...s.deductions.slice(1),...s.remaining.slice(1)]);
  }
  return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
