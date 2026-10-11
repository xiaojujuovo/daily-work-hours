import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../src/domain.js';
import {reconcileReminders,reminderPlan} from '../src/reminder-engine.js';
const data={settings:{...DEFAULT_SETTINGS,reminderEnabled:true},records:[]};
const now=new Date('2026-10-06T17:00:00');
function adapter(initial=[]) {
 const store=new Map(initial.map(item=>[item.identifier,item]));
 const calls=[];
 return {store,calls,getAll:async()=>[...store.values()],cancel:async identifier=>{calls.push(['cancel',identifier]);store.delete(identifier);},schedule:async item=>{calls.push(['schedule',item.identifier]);store.set(item.identifier,{identifier:item.identifier,content:{data:{kind:'daily-work-hours',date:item.day,scheduledAt:item.date.getTime()}},trigger:{timestamp:item.date.getTime()}});}};
}
test('返回前台保留已有有效提醒，不先清空队列',async()=>{
 const api=adapter();await reconcileReminders(data,api,now);
 const count=api.store.size;assert.ok(count>0);
 api.calls.length=0;await reconcileReminders(data,api,now);
 assert.equal(api.store.size,count);assert.deepEqual(api.calls,[]);
});
test('测试提醒不会被前台刷新或关闭下班提醒取消',async()=>{
 const test={identifier:'work-hours-test-delayed',content:{data:{kind:'work-hours-test'}}};
 const api=adapter([test]);await reconcileReminders(data,api,now);
 await reconcileReminders({...data,settings:{...data.settings,reminderEnabled:false}},api,now);
 assert.deepEqual([...api.store.values()],[test]);
});
test('手机推迟的当天提醒在返回前台时保留，保存当天工时后取消',async()=>{
 const late={identifier:'legacy-random-id',content:{title:'下班啦，记一下今天的工时',data:{date:'2026-10-06'}},trigger:{timestamp:new Date('2026-10-06T18:00:00').getTime()}};
 const api=adapter([late]);const after=new Date('2026-10-06T18:10:00');
 await reconcileReminders(data,api,after);assert.equal(api.store.get(late.identifier),late);
 await reconcileReminders({...data,records:[{date:'2026-10-06'}]},api,after);assert.equal(api.store.has(late.identifier),false);
});
test('修改时间先建立新提醒，再移除旧时间的提醒',async()=>{
 const api=adapter();await reconcileReminders(data,api,now);api.calls.length=0;
 await reconcileReminders({...data,settings:{...data.settings,reminderTime:'19:00'}},api,now);
 const firstCancel=api.calls.findIndex(call=>call[0]==='cancel');assert.ok(firstCancel>0);
 assert.ok(api.calls.slice(0,firstCancel).every(call=>call[0]==='schedule'));
 assert.ok([...api.store.values()].every(item=>new Date(item.content.data.scheduledAt).getHours()===19));
});
test('建立新提醒失败时不取消旧提醒',async()=>{
 const old={identifier:'daily-work-hours:old',content:{data:{kind:'daily-work-hours',date:'2026-10-07',scheduledAt:1}}};
 const api=adapter([old]);api.schedule=async()=>{throw new Error('模拟调度失败');};
 await assert.rejects(reconcileReminders(data,api,now),/模拟调度失败/);
 assert.equal(api.store.get(old.identifier),old);assert.deepEqual(api.calls,[]);
});
test('权限改变后用相同标识重新安排，不累积重复提醒',async()=>{
 const api=adapter();await reconcileReminders(data,api,now);const count=api.store.size;api.calls.length=0;
 await reconcileReminders(data,api,now,true);
 assert.equal(api.calls.filter(call=>call[0]==='schedule').length,count);assert.equal(api.store.size,count);
 assert.equal(api.calls.filter(call=>call[0]==='cancel').length,0);
});
test('不保留昨天过期或已修改时间的旧提醒',()=>{
 const late={identifier:'legacy',content:{title:'下班啦，记一下今天的工时',data:{date:'2026-10-05'}},trigger:{timestamp:new Date('2026-10-05T18:00:00').getTime()}};
 assert.deepEqual(reminderPlan(data,[late],now).obsolete,[late]);
 const wrongTime={...late,content:{...late.content,data:{date:'2026-10-06'}},trigger:{timestamp:new Date('2026-10-06T16:00:00').getTime()}};
 assert.deepEqual(reminderPlan(data,[wrongTime],now).obsolete,[wrongTime]);
});
