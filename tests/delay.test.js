import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,parseBackup} from '../src/domain.js';
import {NO_PARTY,delayCategoryOptions,delayCategoryUsage,readDelayCategories,renameDelayCategories,validateDelayCategories,delayCsv,delaySummaryText,delaysOn,knownDevices,knownOrders,knownParties,monthlyDelays,newDelayId,removeDelay,saveDelay,validateDelay,validateDelays} from '../src/delay-domain.js';

const delay=(id,date,hours,category='电气接线',parties=['电工'],extra={})=>({id,date,orderNo:'SO-118',device:'3号线码垛机',hours,category,parties,note:'',...extra});
const sample=()=>[
 delay('a','2026-11-03',4.5,'电气接线',['电工'],{note:'未按图纸接线，等待返工'}),
 delay('b','2026-11-05',2,'缺料/缺件',['采购','供应商'],{device:'',orderNo:''}),
 delay('c','2026-11-05',1.25,'电气接线',['电工']),
 delay('d','2026-11-20',3,'技术程序',[],{device:'包装机',orderNo:'SO-120'}),
 delay('e','2026-10-31',8,'机械安装',['机械组']),
];

test('校验字段：日期、时长、分类、责任方标签和长度限制',()=>{
 assert.deepEqual(validateDelay(delay('x','2026-11-18',.5,'其它',[],{orderNo:' SO-1 ',note:' 说明 '})).orderNo,'SO-1');
 const bad=[
  {date:'2026-02-30'},{date:'20261118'},{hours:0},{hours:-1},{hours:24.5},{hours:'2'},{hours:1.234},
  {category:''},{category:' 接线'},{category:'一'.repeat(21)},{category:undefined},{category:3},{parties:'电工'},{parties:['电工','电工']},{parties:['']},{parties:[' 电工']},
  {parties:['a','b','c','d','e','f']},{parties:['一二三四五六七八九十一二三四五六七八九十一']},
  {orderNo:'x'.repeat(51)},{device:'x'.repeat(51)},{note:'x'.repeat(501)},{note:undefined},{id:''},
 ];
 for(const change of bad)assert.throws(()=>validateDelay({...delay('x','2026-11-18',1),...change}),undefined,JSON.stringify(change));
 assert.equal(validateDelay(delay('x','2026-11-18',24)).hours,24);
});
test('同一天可记多条，合计不超过 24 小时，编号不能重复',()=>{
 assert.equal(validateDelays([delay('a','2026-11-18',12),delay('b','2026-11-18',12)]).length,2);
 assert.throws(()=>validateDelays([delay('a','2026-11-18',12),delay('b','2026-11-18',12.5)]),/24 小时/);
 assert.throws(()=>validateDelays([delay('a','2026-11-18',1),delay('a','2026-11-19',1)]),/重复/);
 assert.throws(()=>validateDelays({}),/格式/);
});
test('新增、修改、删除不改动原数组，按日期查询当天条目',()=>{
 const list=sample(),snapshot=JSON.stringify(list);
 const added=saveDelay(list,delay('f','2026-11-05',1,'其它'));
 assert.equal(added.length,6);assert.equal(added[0].date,'2026-11-20');
 const edited=saveDelay(added,{...added.find(d=>d.id==='a'),hours:5});
 assert.equal(edited.length,6);assert.equal(edited.find(d=>d.id==='a').hours,5);
 assert.deepEqual(delaysOn(edited,'2026-11-05').map(d=>d.id),['b','c','f']);
 assert.deepEqual(removeDelay(edited,'b').map(d=>d.id).sort(),['a','c','d','e','f']);
 assert.equal(JSON.stringify(list),snapshot);
 assert.throws(()=>saveDelay(list,delay('g','2026-11-05',21)),/24 小时/);
});
test('责任方、设备、订单建议按使用次数排序并去掉空值',()=>{
 const list=sample();
 assert.deepEqual(knownParties(list),['电工','供应商','采购','机械组']);
 assert.deepEqual(knownDevices(list),['3号线码垛机','包装机']);
 assert.deepEqual(knownOrders(list),['SO-118','SO-120']);
});
test('月度汇总只算本月，按责任方/原因/设备分组，多责任方各自计入',()=>{
 const s=monthlyDelays(sample(),'2026-11');
 assert.equal(s.count,4);assert.equal(s.days,3);assert.equal(s.hours,10.75);
 assert.deepEqual(s.byParty,[{name:'电工',hours:5.75,count:2},{name:NO_PARTY,hours:3,count:1},{name:'供应商',hours:2,count:1},{name:'采购',hours:2,count:1}]);
 assert.deepEqual(s.byCategory.map(g=>[g.name,g.hours]),[['电气接线',5.75],['技术程序',3],['缺料/缺件',2]]);
 assert.deepEqual(s.byDevice.map(g=>g.name),['3号线码垛机','包装机','未填写设备']);
 assert.deepEqual(s.entries.map(d=>d.id),['a','b','c','d']);
 assert.equal(monthlyDelays(sample(),'2026-12').count,0);
 assert.throws(()=>monthlyDelays([],'2026-13'),/月份/);
});
test('月度文字总结可直接粘贴，含合计、分组和逐条明细',()=>{
 const text=delaySummaryText(sample(),'2026-11');
 assert.match(text,/^2026年11月共记录异常工时 10\.75h，4 次，涉及 3 天。/);
 assert.match(text,/按责任方：电工 5\.75h（2 次），未指定 3h（1 次）/);
 assert.match(text,/分别计入每个责任方/);
 assert.ok(text.includes('11-03 订单 SO-118 3号线码垛机｜电气接线｜电工｜4.5h｜未按图纸接线，等待返工'));
 assert.ok(text.includes('11-05｜缺料/缺件｜采购、供应商｜2h'));
 assert.ok(!text.includes('10-31'));
 assert.equal(delaySummaryText([],'2026-01'),'2026年1月无异常工时记录。');
});
test('CSV 明细带 BOM、合计行，并防止公式注入',()=>{
 const csv=delayCsv([delay('z','2026-11-02',1,'其它',['=甲方'],{note:'说明 "引号"\n换行'}),...sample().slice(0,2)]);
 assert.ok(csv.startsWith('﻿"日期","订单号","设备名称","耽误时长（小时）","原因分类","责任方","情况说明"'));
 assert.ok(csv.includes("\"'=甲方\""));assert.ok(csv.includes('""引号""'));
 assert.ok(csv.includes('"采购、供应商"'));
 assert.ok(csv.trimEnd().endsWith('"合计","","","7.5","","","3 次"'));
 assert.ok(csv.indexOf('2026-11-02')<csv.indexOf('2026-11-03'));
});
test('备份：旧备份没有异常工时也能读取，新备份完整往返，坏数据拒绝',()=>{
 const base={version:1,settings:DEFAULT_SETTINGS,records:[],monthlyLeave:{},monthlyPayslips:{}};
 assert.deepEqual(parseBackup(JSON.stringify(base)).delays,[]);
 const current={...base,delays:sample()};
 assert.deepEqual(parseBackup(JSON.stringify(current)),current);
 for(const delays of [null,{},[delay('a','2026-11-01',0)],[{...delay('a','2026-11-01',1),category:''}]])assert.throws(()=>parseBackup(JSON.stringify({...base,delays})));
});
test('编号生成稳定且彼此不同',()=>{
 assert.equal(newDelayId(1700000000000,()=>.5),newDelayId(1700000000000,()=>.5));
 assert.notEqual(newDelayId(1,()=>.1),newDelayId(1,()=>.2));
 assert.match(newDelayId(),/^d[0-9a-z]+$/);
});
test('原因分类可自定义：任意名称可用，旧测试版的固定编号自动转成名称',()=>{
 assert.equal(validateDelay(delay('x','2026-11-18',1,'调试等待')).category,'调试等待');
 for(const [key,name] of [['electrical','电气接线'],['mechanical','机械安装'],['material','缺料/缺件'],['program','技术程序'],['other','其它']])
  assert.equal(validateDelay(delay('x','2026-11-18',1,key)).category,name);
 const base={version:1,settings:{...DEFAULT_SETTINGS},records:[],monthlyLeave:{},monthlyPayslips:{}};
 const old=parseBackup(JSON.stringify({...base,settings:{...base.settings,delayCategories:undefined},delays:[delay('a','2026-11-01',2,'electrical')]}));
 assert.equal(old.delays[0].category,'电气接线');
 assert.deepEqual(old.settings.delayCategories,['电气接线','机械安装','缺料/缺件','技术程序','其它']);
 const custom=parseBackup(JSON.stringify({...base,settings:{...base.settings,delayCategories:['接线','等甲方']}}));
 assert.deepEqual(custom.settings.delayCategories,['接线','等甲方']);
 for(const delayCategories of [[],['a','a'],[''],[' a'],['一'.repeat(21)],Array.from({length:31},(_,i)=>'c'+i),'接线'])
  assert.throws(()=>parseBackup(JSON.stringify({...base,settings:{...base.settings,delayCategories}})),undefined,JSON.stringify(delayCategories));
});
test('设置中改名会同步已有记录，删除分类保留历史记录',()=>{
 const {categories,renames}=readDelayCategories([{original:'电气接线',name:' 电气  接线返工 '},{original:'机械安装',name:'机械安装'},{original:null,name:'等甲方确认'}]);
 assert.deepEqual(categories,['电气 接线返工','机械安装','等甲方确认']);
 assert.deepEqual(renames,{'电气接线':'电气 接线返工'});
 const list=sample(),renamed=renameDelayCategories(list,renames);
 assert.deepEqual(renamed.map(d=>d.category),['电气 接线返工','缺料/缺件','电气 接线返工','技术程序','机械安装']);
 assert.equal(list[0].category,'电气接线');
 assert.equal(renameDelayCategories(list,{}),list);
 assert.throws(()=>readDelayCategories([{original:'a',name:'x'},{original:null,name:'x'}]),/重复/);
 assert.throws(()=>readDelayCategories([]),/1 至 30/);
 // 删除「缺料/缺件」后：旧记录仍然有效，编辑时仍可选，统计照常分组
 assert.deepEqual(delayCategoryOptions(categories,'缺料/缺件'),[...categories,'缺料/缺件']);
 assert.deepEqual(delayCategoryOptions(categories,'机械安装'),categories);
 assert.deepEqual(delayCategoryOptions([],null),['电气接线','机械安装','缺料/缺件','技术程序','其它']);
 assert.equal(validateDelays(renamed).length,5);
 assert.equal(delayCategoryUsage(renamed,'电气 接线返工'),2);
 assert.ok(validateDelayCategories(['x']));
});
