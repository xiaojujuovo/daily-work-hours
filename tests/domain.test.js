import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS as S,allocate,rebalanceHours,hourUnits,validateRecord,validateSettings,money,parseBackup,reminderDates,csv,validDate} from '../src/domain.js';
const record={date:'2026-10-06',total:10,hours:[8,2,0,0],salaryEnabled:true,hourlyRate:20,note:''};
test('工作日超时倍率、小数及可自定义门槛',()=>{assert.deepEqual(allocate(10.25,'2026-10-06',S),[8,2.25,0,0]);assert.deepEqual(allocate(8,'2026-10-06',{...S,threshold:6}),[6,2,0,0]);});
test('周六也可以是工作日，周二也可以是休息日',()=>{assert.deepEqual(allocate(10,'2026-10-10',{...S,workdays:[6]}),[8,2,0,0]);assert.deepEqual(allocate(10,'2026-10-06',{...S,workdays:[6]}),[0,0,10,0]);});
test('手动3倍、工资及合计验证',()=>{const r={...record,hours:[7,1,0,2]};assert.equal(money(validateRecord(r)),290);assert.throws(()=>validateRecord({...r,hours:[8,2,0,2]}));assert.equal(money({...r,salaryEnabled:false}),0);});
test('小数合计没有浮点误差',()=>{assert.doesNotThrow(()=>validateRecord({...record,total:.3,hours:[.1,.2,0,0]}));});
test('拒绝无效日期、负数、非数字及超24小时',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);for(const n of [-1,25,'abc','1.234',''])assert.throws(()=>allocate(n,record.date,S));});
test('设置时间和星期验证',()=>{assert.throws(()=>validateSettings({...S,reminderTime:'25:10'}));assert.throws(()=>validateSettings({...S,workdays:[7]}));assert.throws(()=>validateSettings({...S,reminderEnabled:true,reminderDays:[]}));});
test('备份往返及坏备份不被接受',()=>{const data={version:1,settings:S,records:[record],monthlyLeave:{},monthlyPayslips:{}};assert.deepEqual(parseBackup(JSON.stringify(data)),data);assert.throws(()=>parseBackup(JSON.stringify({...data,records:[record,record]})));assert.throws(()=>parseBackup('{}'));});
test('备份拒绝字符串时薪和工时，防止恢复后界面异常',()=>{assert.throws(()=>validateRecord({...record,hourlyRate:'20'}));assert.throws(()=>validateRecord({...record,hours:['8',2,0,0]}));assert.throws(()=>validateSettings({...S,hourlyRate:'20'}));});
test('提醒避开已记录日期、已过时间和未选的星期',()=>{const s={...S,reminderEnabled:true,reminderDays:[2],reminderTime:'18:00'};const dates=reminderDates(s,[record],new Date('2026-10-06T17:00:00'));assert.ok(dates.length>0&&dates.length<60);assert.equal(dates[0].getDate(),13);assert.ok(dates.every(d=>d.getDay()===2&&d.getHours()===18));assert.equal(reminderDates({...s,reminderEnabled:false},[]).length,0);});
test('CSV编码、换行转义和公式注入处理',()=>{const value=csv([{...record,note:'=SUM(1,2)\n"备注"'}]);assert.ok(value.startsWith('\ufeff'));assert.ok(value.includes("'=SUM"));assert.ok(value.includes('""备注""'));});
test('用户的连续转移示例：正常8转1.5倍8，再转3倍4，再减少3倍',()=>{
 let hours=rebalanceHours('8',['8','0','0','0'],1,'8');assert.deepEqual(hours,['0','8','0','0']);
 hours=rebalanceHours('8',hours,3,'4');assert.deepEqual(hours,['0','4','0','4']);
 hours=rebalanceHours('8',hours,3,'1');assert.deepEqual(hours,['3','4','0','1']);
});
test('正常工时不足时继续依次扣1.5倍和2倍，不出现负数',()=>{
 assert.deepEqual(rebalanceHours('8',['1','2','3','2'],3,'7'),['0','0','1','7']);
 assert.deepEqual(rebalanceHours('8',['2','4','1','1'],3,'5'),['0','2','1','5']);
 assert.deepEqual(rebalanceHours('8',['0','0','8','0'],1,'5'),['0','5','3','0']);
});
test('其它工时全扣完仍不足时保留用户输入，降低后恢复一致',()=>{
 const hours=rebalanceHours('8',['8','0','0','0'],3,'10');assert.deepEqual(hours,['0','0','0','10']);
 assert.deepEqual(rebalanceHours('8',hours,3,'4'),['4','0','0','4']);
});
test('小数和编辑中间状态调平，不改变总工时',()=>{
 assert.deepEqual(rebalanceHours('0.3',['0.1','0.2','0','0'],3,'0.3'),['0','0','0','0.3']);
 assert.deepEqual(rebalanceHours('8',['0','8','0','0'],1,''),['8','','0','0']);
 assert.deepEqual(rebalanceHours('8',['8','0','0','0'],1,'1.'),['7','1.','0','0']);
 assert.equal(hourUnits('1.'),100);assert.equal(hourUnits(''),0);
 assert.deepEqual(rebalanceHours('8',['8','0','0','0'],1,'abc'),['8','abc','0','0']);
});
test('直接修改正常工时也调平，减少的工时补入1.5倍',()=>{
 assert.deepEqual(rebalanceHours('8',['8','0','0','0'],0,'6'),['6','2','0','0']);
 assert.deepEqual(rebalanceHours('8',['2','3','2','1'],0,'7'),['7','0','0','1']);
});

test('加班工资不计正常工时，混合倍率、小数、历史记录与CSV保持一致',()=>{
 assert.equal(money(record,true),60);
 assert.equal(money({...record,total:8,hours:[8,0,0,0]},true),0);
 const mixed={...record,total:10,hours:[6,1.25,2,.75],hourlyRate:20.01};
 assert.equal(money(validateRecord(mixed),true),162.58);
 assert.equal(money(parseBackup(JSON.stringify({version:1,settings:S,records:[record]})).records[0],true),60);
 assert.ok(csv([record],true).includes('加班工资金额'));
 assert.ok(csv([record],true).includes('60.00'));
});

test('全天与加班工资切换，旧备份默认全天，新备份保留选择',()=>{
 assert.equal(money(record),220);assert.equal(money(record,true),60);
 assert.equal(money({...record,hours:[8,0,0,0]}),160);
 const old={...S};delete old.overtimeOnly;
 const restored=parseBackup(JSON.stringify({version:1,settings:old,records:[record]}));
 assert.equal(restored.settings.overtimeOnly,false);
 assert.equal(parseBackup(JSON.stringify({version:1,settings:{...S,overtimeOnly:true},records:[record]})).settings.overtimeOnly,true);
 assert.throws(()=>validateSettings({...S,overtimeOnly:'true'}));
 assert.ok(csv([record]).includes('全天工资金额'));assert.ok(csv([record]).includes('220.00'));
 assert.equal(money({...record,salaryEnabled:false},true),0);
});
