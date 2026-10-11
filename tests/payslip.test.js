import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,allocate,validateSettings,validatePayslipItems,parseBackup,monthlyPayslip,payslipSummary,settingsWithPayslipSync,applyMonthlyWage,payslipCsv} from '../src/domain.js';
const item=(id,title,amount,kind='income',note='')=>({id,title,amount,kind,note});
const record=(date,hours,rate=20)=>({date,hours,total:hours.reduce((a,b)=>a+b,0),hourlyRate:rate,salaryEnabled:true,note:''});
const data=()=>({version:1,settings:{...DEFAULT_SETTINGS,salaryEnabled:true,payslipEnabled:true,hourlyRate:20,payslipItems:[item('base','基础薪资',3000),item('meal','餐补',200),item('social','社保',350,'deduction')]},records:[record('2026-10-01',[8,2,0,0]),record('2026-10-02',[8,0,3,0]),record('2026-11-01',[8,2,0,0])],monthlyLeave:{'2026-10':1},monthlyPayslips:{}});
test('指定工作日只有超出门槛算2倍，非工作日仍全2倍',()=>{
 const settings={...DEFAULT_SETTINGS,doubleWorkdays:[1,2]};
 assert.deepEqual(allocate(10,'2026-10-12',settings),[8,0,2,0]);
 assert.deepEqual(allocate(8,'2026-10-12',settings),[8,0,0,0]);
 assert.deepEqual(allocate(6.5,'2026-10-12',settings),[6.5,0,0,0]);
 assert.deepEqual(allocate(10,'2026-10-14',settings),[8,2,0,0]);
 assert.deepEqual(allocate(10,'2026-10-11',settings),[0,0,10,0]);
 assert.deepEqual(allocate(10,'2026-10-12',{...settings,threshold:7.5}),[7.5,0,2.5,0]);
 for(const doubleWorkdays of [[6],[1,1],['1'],null])assert.throws(()=>validateSettings({...settings,doubleWorkdays}));
});
test('调休后加班工资+收入-扣款，不重复计入正常工时',()=>{
 const result=payslipSummary(data(),'2026-10');
 assert.equal(result.overtime,150);assert.equal(result.income,3200);assert.equal(result.deductions,350);assert.equal(result.total,3000);
 const current=data();current.settings.overtimeOnly=false;
 assert.equal(payslipSummary(current,'2026-10').total,3000);
});
test('默认组成对无记录月份仍可统计，关闭组成保留项目且只算加班',()=>{
 const current=data();assert.equal(payslipSummary(current,'2026-12').total,2850);
 current.settings.payslipEnabled=false;assert.equal(payslipSummary(current,'2026-10').total,150);
 assert.equal(current.settings.payslipItems.length,3);
 current.settings.payslipItems=[item('charge','扣款',200,'deduction')];current.settings.payslipEnabled=true;
 assert.equal(payslipSummary(current,'2026-10').total,-50);
});
test('单月修改不影响其它月，修改默认组成同步清除所有月自定义',()=>{
 const current=data();current.monthlyPayslips={'2026-10':{enabled:true,items:[item('custom','当月补贴',500)]},'2026-11':{enabled:false,items:[]}};
 assert.equal(payslipSummary(current,'2026-10').total,650);assert.equal(payslipSummary(current,'2026-11').total,60);
 const updated=settingsWithPayslipSync(current,{...current.settings,payslipItems:[item('new','基础薪资',4000)]});
 assert.deepEqual(updated.monthlyPayslips,{});assert.equal(payslipSummary(updated,'2026-10').total,4150);assert.equal(payslipSummary(updated,'2026-11').total,4060);
 assert.deepEqual(current.monthlyPayslips['2026-10'].items,[item('custom','当月补贴',500)]);
});
test('仅修改时薪、工作日或保存相同默认内容不会覆盖月自定义',()=>{
 const current=data();current.monthlyPayslips={'2026-10':{enabled:true,items:[item('custom','当月补贴',500)]}};
 for(const settings of [{...current.settings,hourlyRate:30},{...current.settings,workdays:[1,2,3,4]},{...current.settings,payslipItems:current.settings.payslipItems.map(i=>({...i}))}]) assert.deepEqual(settingsWithPayslipSync(current,settings).monthlyPayslips,current.monthlyPayslips);
 assert.deepEqual(settingsWithPayslipSync(current,{...current.settings,payslipEnabled:false}).monthlyPayslips,{});
});
test('批量应用时薪与工资开关只改本月，工时/备注/调休不变',()=>{
 const current=data(),before=JSON.stringify(current);
 const records=applyMonthlyWage(current.records,'2026-10',{...current.settings,hourlyRate:30,salaryEnabled:true});
 assert.deepEqual(records.slice(0,2).map(r=>r.hourlyRate),[30,30]);assert.equal(records[2].hourlyRate,20);
 assert.deepEqual(records[0].hours,current.records[0].hours);assert.equal(records[0].note,current.records[0].note);
 assert.equal(payslipSummary({...current,records},'2026-10').overtime,225);assert.equal(JSON.stringify(current),before);
 assert.equal(payslipSummary({...current,records:applyMonthlyWage(records,'2026-10',{...current.settings,salaryEnabled:false})},'2026-10').overtime,0);
 assert.throws(()=>applyMonthlyWage(records,'2026-13',current.settings));
});
test('工资项目小数精确相加，重复编号及坏金额/项目被拒绝',()=>{
 const current=data();current.settings.payslipItems=[item('a','补贴A',.1),item('b','补贴B',.2),item('c','扣款',.1,'deduction')];
 assert.equal(payslipSummary(current,'2026-12').total,.2);
 for(const items of [[item('a','',1)],[item('a','补贴',-1)],[item('a','补贴','2')],[item('a','补贴',.001)],[item('a','补贴',1,'wrong')],[item('a','补贴',1),item('a','补贴2',2)],Array.from({length:101},(_,i)=>item(String(i),'补贴',1))])assert.throws(()=>validatePayslipItems(items));
});
test('旧版备份缺少新字段可读取，新工资条备份完整往返',()=>{
 const current=data();current.monthlyPayslips={'2026-10':{enabled:true,items:[item('custom','补贴',123.45,'income','当月')]}};
 assert.deepEqual(parseBackup(JSON.stringify(current)),current);
 const old=JSON.parse(JSON.stringify(current));delete old.monthlyPayslips;delete old.settings.doubleWorkdays;delete old.settings.payslipItems;delete old.settings.payslipEnabled;
 const restored=parseBackup(JSON.stringify(old));assert.deepEqual(restored.monthlyPayslips,{});assert.deepEqual(restored.settings.doubleWorkdays,[]);assert.equal(restored.settings.payslipEnabled,false);
 for(const monthlyPayslips of [null,[],{'2026-13':{enabled:true,items:[]}},{'2026-10':{enabled:'true',items:[]}},{'2026-10':{enabled:true,items:[item('a','补贴',-1)]}}])assert.throws(()=>parseBackup(JSON.stringify({...current,monthlyPayslips})));
});
test('工资条CSV导出组成、调休后加班、实发及特殊字符',()=>{
 const current=data();current.settings.payslipItems.push(item('note','=补贴',1.25,'income','备注\n"测试"'));
 const result=payslipCsv(current,'2026-10');assert.ok(result.startsWith('\ufeff'));assert.ok(result.includes('"150.00"'));assert.ok(result.includes('"3001.25"'));assert.ok(result.includes("'=补贴"));assert.ok(result.includes('""测试""'));assert.ok(result.includes('实发合计'));
});
