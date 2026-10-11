import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,monthlySummary,saveMonthlyLeave,categoryRecords,parseBackup,csv} from '../src/domain.js';
const record=(date,hours,rate=20,enabled=true)=>({date,total:hours.reduce((a,b)=>a+b,0),hours,hourlyRate:rate,salaryEnabled:enabled,note:''});
test('调休先扣1.5倍，足够时其它倍率不变',()=>{
 const records=Array.from({length:5},(_,i)=>record(`2026-10-0${i+1}`,[8,8,0,0]));
 const result=monthlySummary(records,'2026-10',8,true);
 assert.deepEqual(result.raw,[40,40,0,0]);assert.deepEqual(result.deductions,[0,8,0,0]);assert.deepEqual(result.remaining,[40,32,0,0]);assert.equal(result.pay,960);assert.equal(result.total,80);
 assert.deepEqual(records[0].hours,[8,8,0,0]);
});
test('1.5不足接着扣2和3倍，正常工时不扣',()=>{
 const records=[record('2026-10-01',[8,2,3,4])];
 const result=monthlySummary(records,'2026-10',8,true);
 assert.deepEqual(result.deductions,[0,2,3,3]);assert.deepEqual(result.remaining,[8,0,0,1]);assert.equal(result.pay,60);
 assert.equal(monthlySummary(records,'2026-10',8,false).pay,220);
});
test('按倍率再按日期扣除，工资保留各日时薪及启用状态',()=>{
 const records=[record('2026-10-03',[8,2,0,0],40),record('2026-10-01',[8,0,2,0],10),record('2026-10-02',[8,2,0,0],20)];
 const result=monthlySummary(records,'2026-10',3,true);
 assert.equal(result.entries[0].deductions[2],0);assert.equal(result.entries[1].deductions[1],2);assert.equal(result.entries[2].deductions[1],1);assert.equal(result.pay,100);
 const disabled=monthlySummary([record('2026-10-01',[8,2,0,0],20,false),record('2026-10-02',[8,2,0,0],20)],'2026-10',2,true);
 assert.equal(disabled.pay,60);assert.equal(disabled.entries[0].pay,0);
});
test('小数精确扣除并四舍五入金额，零调休不产生扣减',()=>{
 const records=[record('2026-10-01',[8,.1,.2,.3],20.01)];
 const result=monthlySummary(records,'2026-10',.3,true);
 assert.deepEqual(result.deductions,[0,.1,.2,0]);assert.deepEqual(result.remaining,[8,0,0,.3]);assert.equal(result.pay,18.01);
 assert.deepEqual(monthlySummary(records,'2026-10',0).deductions,[0,0,0,0]);
});
test('按月独立保存、清除调休并拒绝超额或不合法输入',()=>{
 const records=[record('2026-10-01',[8,2,0,0]),record('2026-11-01',[8,0,8,0])];
 let map=saveMonthlyLeave('2026-10','1.5',records,{});map=saveMonthlyLeave('2026-11','4',records,map);
 assert.deepEqual(map,{'2026-10':1.5,'2026-11':4});assert.deepEqual(saveMonthlyLeave('2026-10','0',records,map),{'2026-11':4});
 for(const value of ['3','-1','abc','1.234',''])assert.throws(()=>saveMonthlyLeave('2026-10',value,records,map));
 assert.throws(()=>saveMonthlyLeave('2026-12',1,records,map));
});
test('旧记录被修改后超额调休保留输入并提示余额，不产生负工时',()=>{
 const result=monthlySummary([record('2026-10-01',[8,1,0,0])],'2026-10',8,true);
 assert.equal(result.excess,7);assert.equal(result.applied,1);assert.deepEqual(result.remaining,[8,0,0,0]);assert.equal(result.pay,0);
});
test('每个分类包含混合工时日，排除0小时及其它月份',()=>{
 const records=[record('2026-10-02',[8,2,3,1]),record('2026-10-01',[8,0,0,0]),record('2026-10-03',[0,0,0,0]),record('2026-11-01',[0,8,0,0])];
 assert.deepEqual(categoryRecords(records,'2026-10',0).map(r=>r.date),['2026-10-01','2026-10-02']);
 for(const i of [1,2,3])assert.deepEqual(categoryRecords(records,'2026-10',i).map(r=>r.date),['2026-10-02']);
 assert.deepEqual(categoryRecords(records,'2026-12',1),[]);
});
test('备份兼容旧版，调休往返以及坏格式拒绝',()=>{
 const data={version:1,settings:DEFAULT_SETTINGS,records:[record('2026-10-01',[8,2,0,0])]};
 assert.deepEqual(parseBackup(JSON.stringify(data)).monthlyLeave,{});
 const current={...data,monthlyLeave:{'2026-10':1.25,'2026-11':4},monthlyPayslips:{}};assert.deepEqual(parseBackup(JSON.stringify(current)),current);
 for(const monthlyLeave of [[],null,{'2026-13':1},{'2026-10':-1},{'2026-10':'2'},{'2026-10':.001},{'2026-10':745}]) {
  assert.throws(()=>parseBackup(JSON.stringify({...data,monthlyLeave})));
 }
});
test('CSV保留原工时、导出抵扣与剩余工时，金额等于月度工资',()=>{
 const records=[record('2026-10-01',[8,2,3,4])];
 const text=csv(records,true,{'2026-10':8});
 assert.ok(text.includes('1.5倍调休扣除'));assert.ok(text.includes('3倍剩余工时'));assert.ok(text.includes('"60.00"'));assert.ok(text.includes('2026-10 月度调休汇总'));assert.ok(text.includes('输入调休 8h；已扣 8h；未抵扣 0h'));
 assert.ok(!csv(records,true,{}).includes('调休扣除'));
});
