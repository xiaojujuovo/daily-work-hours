import {AppRegistry} from 'react-native';
import {allocate, isWidgetConfirmation, localDate, normalizeTotalHours, widgetEntryMessage} from './domain';
import {persistRecord, readData, writeData, writeRecentHours, type RecordEntry} from './storage';
import {syncReminders} from './reminders';
import {widgets} from './widgets';

type EntryRequest={request:string;button:string;date:string;total:string;tappedAt:number};
let pending:{key:string;shownAt:number;button:string;date:string;total:number}|null=null;
let queue=Promise.resolve();

async function handleEntry(entry:EntryRequest) {
 const bridge=widgets;
 if(!bridge)return;
 const show=(message:string)=>bridge.completeWidgetEntry(entry.request,message);
 try {
  if(entry.date!==localDate())throw new Error('日期已变更，请重新点击桌面按钮');
  const data=await readData();
  const existing=data.records.find(row=>row.date===entry.date);
  const confirmation=pending&&isWidgetConfirmation(pending,entry)?pending:null;
  const total=confirmation?.total??normalizeTotalHours(entry.total);
  const {salaryEnabled,hourlyRate}=data.settings;
  const record:RecordEntry={
   date:entry.date,total,hours:allocate(total,entry.date,data.settings),
   salaryEnabled,hourlyRate,note:existing?.note??'',
  };
  const key=JSON.stringify([entry.button,record,existing]);
  if(confirmation?.key!==key) {
   pending=null;
   const message=widgetEntryMessage(record);
   if(await show(existing?`${message}（覆盖今日记录）`:message))pending={key,shownAt:Date.now(),button:entry.button,date:entry.date,total};
   return;
  }
  pending=null;
  if(entry.date!==localDate())throw new Error('日期已变更，请重新点击桌面按钮');
  await persistRecord(data,record,next=>writeData(next,{
   before:data,write:(expected,value)=>bridge.writeWidgetAwareData(expected,value),
  }));
  await writeRecentHours(total).catch(()=>{});
  await show(`今日已保存 ${total} 小时`);
  await readData().then(next=>syncReminders(next)).catch(()=>{});
 }catch(error){
  pending=null;
  await show(error instanceof Error?error.message:'未能保存工时').catch(()=>{});
 }
}

export function registerWidgetEntry() {
 if(widgets)AppRegistry.registerHeadlessTask('DailyWorkHoursWidgetEntry',()=>entry=>{
  queue=queue.catch(()=>{}).then(()=>handleEntry(entry));
  return queue;
 });
}
