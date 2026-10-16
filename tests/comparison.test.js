import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,payslipSummary} from '../src/domain.js';
import {comparisonCsv,monthlyComparison,shiftMonth,validMonth} from '../src/comparison-domain.js';
const record=(date,hours,rate=20)=>({date,hours,total:hours.reduce((a,b)=>a+b,0),salaryEnabled:true,hourlyRate:rate,note:''});
const data=()=>({version:1,settings:{...DEFAULT_SETTINGS,payslipEnabled:true,payslipItems:[{id:'base',title:'基础薪资',amount:3000,kind:'income',note:''},{id:'social',title:'社保',amount:350,kind:'deduction',note:''}]},records:[record('2025-12-01',[8,2.25,0,0]),record('2025-12-02',[0,0,0,0]),record('2026-01-01',[8,0,3.5,0],30)],monthlyLeave:{'2025-12':.75,'2026-01':1},monthlyPayslips:{}});
const get=(result,id)=>result.sections.flatMap(s=>s.rows).find(r=>r.id===id);
test('跨年选月、非法月份、输入中间状态及边界校验',()=>{
 assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(shiftMonth('2025-12',1),'2026-01');
 assert.equal(shiftMonth('2026-03',-13),'2025-02');
 for(const month of ['2026-00','2026-13','2026-1','2026-','bad',null])assert.equal(validMonth(month),false);
 assert.throws(()=>monthlyComparison(data(),'2026-13','2026-01'),/月份/);
 assert.throws(()=>shiftMonth('2026-01',.5),/月份/);
});
test('原始对比精确计算小数、出勤与0小时休息，不补齐未记录日期',()=>{
 const result=monthlyComparison(data(),'2025-12','2026-01');
 assert.deepEqual(get(result,'total'),{id:'total',label:'实际总工时',unit:'小时',base:10.25,target:11.5,delta:1.25,percent:12.2});
 assert.equal(get(result,'recordDays').base,2);assert.equal(get(result,'workDays').base,1);assert.equal(get(result,'restDays').base,1);
 assert.equal(get(result,'restDays').target,0);assert.equal(get(result,'hours1').base,2.25);assert.equal(get(result,'hours2').target,3.5);
 assert.equal(get(result,'leave').base,.75);assert.equal(get(result,'appliedLeave').target,1);
});
test('切换调休后倍率只改变倍率行，工资保持月度合计口径和历史时薪',()=>{
 const original=data(),snapshot=JSON.stringify(original);
 const raw=monthlyComparison(original,'2025-12','2026-01'),adjusted=monthlyComparison(original,'2025-12','2026-01',true);
 assert.equal(get(adjusted,'hours1').base,1.5);assert.equal(get(adjusted,'hours2').target,2.5);
 assert.equal(get(adjusted,'total').base,10.25);assert.equal(get(adjusted,'overtimePay').base,45);assert.equal(get(adjusted,'overtimePay').target,150);
 assert.equal(get(adjusted,'netPay').target,payslipSummary(original,'2026-01').total);
 assert.deepEqual(get(raw,'netPay'),get(adjusted,'netPay'));assert.equal(JSON.stringify(original),snapshot);
});
test('无记录月份仍包含默认工资条，基准为0或负数时不显示误导百分比',()=>{
 const original=data(),result=monthlyComparison(original,'2026-02','2026-01');
 assert.deepEqual(result.emptyMonths,['2026-02']);assert.equal(get(result,'netPay').base,2650);
 assert.equal(get(result,'total').percent,null);assert.equal(get(result,'total').delta,11.5);
 original.settings.payslipItems=[{id:'charge',title:'扣款',kind:'deduction',amount:100,note:''}];
 assert.equal(get(monthlyComparison(original,'2026-02','2026-01'),'netPay').percent,null);
});
test('相同月份为0差额，交换月份差额反向，月度工资条覆盖独立计算',()=>{
 const original=data();original.monthlyPayslips['2026-01']={enabled:true,items:[{id:'base',title:'基础薪资',amount:4000,kind:'income',note:''}]};
 const same=monthlyComparison(original,'2026-01','2026-01');assert.ok(same.sections.flatMap(s=>s.rows).every(r=>r.delta===0));
 const forward=monthlyComparison(original,'2025-12','2026-01'),reverse=monthlyComparison(original,'2026-01','2025-12');
 assert.equal(get(forward,'netPay').target,4150);assert.equal(get(forward,'netPay').base,2695);
 assert.equal(get(forward,'netPay').delta,-get(reverse,'netPay').delta);
});
test('调休过量仍按可用工时抵扣，关闭工资组成及日工资开关正确生效',()=>{
 const original=data();original.monthlyLeave['2026-01']=10;original.settings.payslipEnabled=false;original.records[0].salaryEnabled=false;
 const result=monthlyComparison(original,'2025-12','2026-01',true);
 assert.equal(result.excess[1],6.5);assert.equal(get(result,'hours2').target,0);assert.equal(get(result,'income').target,0);assert.equal(get(result,'netPay').base,0);assert.equal(get(result,'netPay').target,0);
});
test('对比CSV包含两个年月、计算口径、差额与零基数标记',()=>{
 const text=comparisonCsv(monthlyComparison(data(),'2026-02','2026-01',true));
 assert.ok(text.startsWith('\ufeff'));assert.ok(text.includes('基准月 2026-02'));assert.ok(text.includes('对比月 2026-01'));
 assert.ok(text.includes('倍率工时 · 调休后'));assert.ok(text.includes('工资组成 · 调休后'));assert.ok(text.includes('"—"'));
 assert.equal(text.split('\r\n').length,16);
});
