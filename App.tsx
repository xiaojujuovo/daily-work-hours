import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { allocate, csv, hourUnits, localDate, money, monthlySummary, saveMonthlyLeave, monthlyPayslip, applyMonthlyWage, payslipCsv, settingsWithPayslipSync, validatePayslipItems, parseBackup, rebalanceHours, units, validDate, validateRecord, validateSettings } from './src/domain';
import { Data, emptyData, readData, RecordEntry, Settings, Payslip, writeData } from './src/storage';
import { openReminderSettings, ReminderStatus, syncReminders, testReminder } from './src/reminders';
import { exportFile, importFile } from './src/files';
import {MonthlyTotals,HoursDetails} from './src/monthly';
import {PayslipDisplay,PayslipEditor,MonthPayrollSettings,ItemDraft,itemDrafts,readItems} from './src/payslip';
import {About} from './src/about';

const weekdays = ['日','一','二','三','四','五','六'];
const labels = ['正常工时','1.5 倍工时','2 倍工时','3 倍工时'];
const errorText = (e:unknown) => e instanceof Error ? e.message : String(e);
function notify(text:string) { if(Platform.OS==='web') window.alert(text); else Alert.alert('每日工时',text); }
async function confirm(text:string):Promise<boolean> {if(Platform.OS==='web') return window.confirm(text);return new Promise(resolve=>Alert.alert('请确认',text,[{text:'取消',style:'cancel',onPress:()=>resolve(false)},{text:'确认',onPress:()=>resolve(true)}],{cancelable:false}));}
function Button({text,onPress,secondary=false,disabled=false}:{text:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondary,disabled&&{opacity:.45}]}><Text style={[styles.buttonText,secondary&&{color:'#166452'}]}>{text}</Text></Pressable>;}
function Field({label,value,onChange,number=false,placeholder,maxLength}:{label:string;value:string;onChange:(v:string)=>void;number?:boolean;placeholder?:string;maxLength?:number}) {return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={number?'decimal-pad':'default'} placeholder={placeholder} maxLength={maxLength} style={styles.input}/></View>;}
function DayPicker({days,onChange,allowed=[0,1,2,3,4,5,6]}:{days:number[];onChange:(days:number[])=>void;allowed?:number[]}) {return <View style={styles.dayRow}>{[1,2,3,4,5,6,0].map(d=><Pressable key={d} accessibilityRole="checkbox" disabled={!allowed.includes(d)} accessibilityState={{checked:days.includes(d),disabled:!allowed.includes(d)}} aria-checked={days.includes(d)} accessibilityLabel={`星期${weekdays[d]}`} onPress={()=>onChange(days.includes(d)?days.filter(v=>v!==d):[...days,d])} style={[styles.day,days.includes(d)&&styles.dayActive,!allowed.includes(d)&&{opacity:.3}]}><Text style={{color:days.includes(d)?'#fff':'#64736e'}}>{weekdays[d]}</Text></Pressable>)}</View>;}

function MonthCalendar({month,records,onOpen}:{month:string;records:RecordEntry[];onOpen:(date:string)=>void}) {
 const [year,monthNumber]=month.split('-').map(Number);
 const first=new Date(year,monthNumber-1,1,12);
 const offset=(first.getDay()+6)%7;
 const count=new Date(year,monthNumber,0,12).getDate();
 const byDate=new Map(records.map(record=>[record.date,record]));
 const today=localDate();
 const rows=Array.from({length:Math.ceil((offset+count)/7)},(_,row)=>Array.from({length:7},(_,column)=>{
  const day=row*7+column-offset+1;
  return day>=1&&day<=count?day:null;
 }));
 return <View style={styles.calendar}>
  <View style={styles.calendarWeek}>{[1,2,3,4,5,6,0].map(day=><Text key={day} style={styles.calendarWeekday}>{weekdays[day]}</Text>)}</View>
  {rows.map((row,index)=><View key={index} style={styles.calendarRow}>{row.map((day,column)=>{
   if(day===null)return <View key={column} style={styles.calendarBlank}/>;
   const date=`${month}-${String(day).padStart(2,'0')}`;
   const record=byDate.get(date);
   const rest=record?.total===0;
   const color=record?(rest?'#367bc4':record.total>8?'#d64c4c':record.total===8?'#218259':'#a87512'):'#a4afa9';
   const state=record?(rest?'休息':record.total>8?'加班':record.total===8?'正常工时':'早退'):'未记录';
   const mark=record?(rest?'休':record.total>8?'加':record.total===8?'正':'早'):'';
   const markColor=rest?'#a6c7ee':record?.total===8?'#b7dec7':(record?.total??0)>8?'#efb7b7':'#ead081';
   return <Pressable key={column} accessibilityRole="button" accessibilityLabel={`${date}，${rest?'休息日，':''}${record?`${record.total}小时，`:''}${state}，点击记录或修改`} onPress={()=>onOpen(date)} style={({pressed})=>[styles.calendarDay,rest&&styles.calendarRest,date===today&&styles.calendarToday,pressed&&{opacity:.65}]}>
    {!!mark&&<Text accessible={false} style={[styles.restMark,{color:markColor}]}>{mark}</Text>}
    <Text style={[styles.calendarDate,rest&&{color:'#285c94'}]}>{day}</Text>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={[styles.calendarHours,{color}]}>{record?`${record.total}h`:'—'}</Text>
    {date===today&&<View style={styles.todayDot}/>}
   </Pressable>;
  })}</View>)}
  <View style={styles.calendarLegend}>{[['#d64c4c','加 >8h'],['#218259','正 8h'],['#a87512','早 <8h'],['#367bc4','休 0h']].map(([color,text])=><View key={text} style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:color}]}/><Text style={styles.legendText}>{text}</Text></View>)}</View>
  <Text style={styles.calendarHint}>0h 蓝色休息格 · 未记录显示 — · 点击日期记工时</Text>
 </View>;
}

export default function App() {
 const [data,setData]=useState<Data>(emptyData());
 const [loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(''),[tab,setTab]=useState('record'),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [reminderStatus,setReminderStatus]=useState<ReminderStatus>({message:'',summary:'正在检查提醒…',exactAllowed:null});
 const dataRef=useRef(data); const mutation=useRef(false); const reminderQueue=useRef(Promise.resolve());
 const [date,setDate]=useState(localDate()),[total,setTotal]=useState('8'),[hours,setHours]=useState(['8','0','0','0']),[note,setNote]=useState('');
 const [editSalary,setEditSalary]=useState(false),[editRate,setEditRate]=useState(0);
 const [month,setMonth]=useState(localDate().slice(0,7));
 const [detailIndex,setDetailIndex]=useState<number|null>(null);
 const [payrollOpen,setPayrollOpen]=useState(false);
 const [defaultItems,setDefaultItems]=useState<ItemDraft[]>([]);
 useEffect(()=>{setDetailIndex(null);setPayrollOpen(false);},[month,tab]);
 const [draft,setDraft]=useState<Settings>(data.settings),[threshold,setThreshold]=useState('8'),[rate,setRate]=useState('0');
 const refreshNotifications=(next:Data,request=false)=>{
   reminderQueue.current=reminderQueue.current.catch(()=>{}).then(async()=>{try{const result=await syncReminders(next,request);setReminderStatus(result);setNotice(result.message);}catch(e){const message=`提醒设置失败：${errorText(e)}`;setNotice(message);setReminderStatus({message,summary:message,exactAllowed:null});}});
   return reminderQueue.current;
 };
 const loadEditor=(day:string,current=dataRef.current)=>{
   const record=current.records.find(r=>r.date===day);setDate(day);setTotal(String(record?.total??8));setNote(record?.note??'');
   setHours((record?.hours??allocate(8,day,current.settings)).map(String));setEditSalary(record?.salaryEnabled??current.settings.salaryEnabled);setEditRate(record?.hourlyRate??current.settings.hourlyRate);
 };
 const changeSettingsDraft=(settings:Settings)=>{setDraft({...settings});setThreshold(String(settings.threshold));setRate(String(settings.hourlyRate));setDefaultItems(itemDrafts(settings.payslipItems));};
 const commit=async(next:Data,request=false)=>{
   await writeData(next); dataRef.current=next;setData(next);await refreshNotifications(next,request);
 };
 const action=async(task:()=>Promise<void>)=>{if(mutation.current)return;mutation.current=true;setBusy(true);try{await task();}catch(e){notify(errorText(e));}finally{mutation.current=false;setBusy(false);}};
 useEffect(()=>{
   let alive=true;
   readData().then(next=>{if(!alive)return;dataRef.current=next;setData(next);changeSettingsDraft(next.settings);loadEditor(localDate(),next);setLoaded(true);void refreshNotifications(next);}).catch(e=>{if(alive)setLoadError(`本地数据读取失败：${errorText(e)}。为保护原数据，未创建新记录。`);});
   const appSub=AppState.addEventListener('change',state=>{if(state==='active'&&dataRef.current)void refreshNotifications(dataRef.current);});
   let sub:Notifications.EventSubscription|undefined;
   if(Platform.OS!=='web') {
    const open=(response:Notifications.NotificationResponse)=>{const target=response.notification.request.content.data?.date;loadEditor(typeof target==='string'&&validDate(target)?target:localDate());setTab('record');};
    sub=Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync().then(response=>{if(response&&alive){readData().then(next=>{dataRef.current=next;open(response);void Notifications.clearLastNotificationResponseAsync();});}}).catch(()=>{});
   }
   return()=>{alive=false;appSub.remove();sub?.remove();};
 },[]);
 const automatic=()=>{try{setHours(allocate(total,date,data.settings).map(String));}catch(e){notify(errorText(e));}};
 const changeTotal=(value:string)=>{setTotal(value);try{setHours(allocate(value,date,data.settings).map(String));}catch{/* Allow incomplete decimal input. */}};
 const runReminderTest=(delayed=false)=>action(async()=>{await reminderQueue.current;const message=await testReminder(delayed);await refreshNotifications(dataRef.current);notify(message);});
 const save=()=>action(async()=>{
   const record:RecordEntry={date,total:units(total)/100,hours:hours.map(h=>hourUnits(h)/100),salaryEnabled:editSalary,hourlyRate:editRate,note};validateRecord(record);
   const exists=dataRef.current.records.some(r=>r.date===date);
   if(exists&&!await confirm(`覆盖 ${date} 已有的工时记录？`))return;
   await commit({...dataRef.current,records:[...dataRef.current.records.filter(r=>r.date!==date),record].sort((a,b)=>b.date.localeCompare(a.date))});notify('已保存到手机本地');
 });
 const monthly=data.records.filter(r=>r.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date));
 const settlement=monthlySummary(data.records,month,data.monthlyLeave[month]??0,true);
 const sums=settlement.raw;
 const salaryLabel='加班工资';
 const saveLeave=async(targetMonth:string,value:string)=>{
  if(mutation.current)throw new Error('请等当前保存完成后再试');
  const monthlyLeave=saveMonthlyLeave(targetMonth,value,dataRef.current.records,dataRef.current.monthlyLeave);
  mutation.current=true;setBusy(true);
  try{await commit({...dataRef.current,monthlyLeave});}finally{mutation.current=false;setBusy(false);}
 };
 const saveMonthSlip=async(targetMonth:string,slip:Payslip)=>{
  if(mutation.current)throw new Error('请等当前保存完成后再试');
  validatePayslipItems(slip.items);
  mutation.current=true;setBusy(true);
  try{await commit({...dataRef.current,monthlyPayslips:{...dataRef.current.monthlyPayslips,[targetMonth]:slip}});}finally{mutation.current=false;setBusy(false);}
 };
 const applyMonthWage=async(targetMonth:string)=>{
  if(mutation.current)throw new Error('请等当前保存完成后再试');
  const current=dataRef.current,count=current.records.filter(r=>r.date.startsWith(targetMonth+'-')).length;
  if(!count)throw new Error('本月还没有日记录');
  const records=applyMonthlyWage(current.records,targetMonth,current.settings) as RecordEntry[];
  mutation.current=true;setBusy(true);
  try{const next={...current,records};await commit(next);if(date.startsWith(targetMonth+'-'))loadEditor(date,next);return count;}finally{mutation.current=false;setBusy(false);}
 };
 const sum=hours.reduce((n,v)=>n+(Number(v)||0),0);
 const totalValid=(()=>{try{return units(total)===hours.reduce((n,v)=>n+hourUnits(v),0);}catch{return false;}})();
 const stored=data.records.find(r=>r.date===date);
 const saveSettings=()=>action(async()=>{
   const settings={...draft,threshold:units(threshold)/100,hourlyRate:units(rate,100000)/100,payslipItems:readItems(defaultItems),overtimeOnly:true};validateSettings(settings);
   await commit(settingsWithPayslipSync(dataRef.current,settings) as Data,settings.reminderEnabled);changeSettingsDraft(settings);
   if(!stored){setEditSalary(settings.salaryEnabled);setEditRate(settings.hourlyRate);try{setHours(allocate(total,date,settings).map(String));}catch{/* Incomplete editor values do not prevent saving settings. */}}
   notify('设置已保存');
 });
 const restore=()=>action(async()=>{
   const raw=await importFile();if(raw===null)return;const backup=parseBackup(raw) as Data;
   if(!await confirm(`备份包含 ${backup.records.length} 天记录。恢复会替换当前 ${dataRef.current.records.length} 天记录及设置，请先保存当前备份。是否继续？`))return;
   await commit(backup,backup.settings.reminderEnabled);changeSettingsDraft(backup.settings);loadEditor(localDate(),backup);notify('备份已恢复');
 });
 if(loadError)return <SafeAreaProvider><SafeAreaView style={styles.root}><Text style={styles.title}>数据需要检查</Text><Text style={styles.hint}>{loadError}</Text></SafeAreaView></SafeAreaProvider>;
 if(!loaded)return <SafeAreaProvider><SafeAreaView style={styles.root}><ActivityIndicator size="large" color="#16765f"/></SafeAreaView></SafeAreaProvider>;
 return <SafeAreaProvider><SafeAreaView style={styles.root}><StatusBar barStyle="dark-content"/><View style={styles.shell}>
  <View style={styles.header}><View><Text style={styles.eyebrow}>一点一滴，都有记录</Text><Text style={styles.title}>每日工时</Text></View><View style={styles.localBadge}><Text style={styles.localText}>仅本地保存</Text></View></View>
  <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  {notice!==''&&<Text style={styles.warning}>{notice}</Text>}
  {tab==='record'&&<>
   <View style={styles.hero}><Text style={styles.heroEyebrow}>{stored?'这一天已记录，可继续修改':'记录今天的付出'}</Text><Text style={styles.heroTitle}>{Number(total)||0}<Text style={styles.heroUnit}> 小时</Text></Text><Text style={styles.heroHint}>自动分配倍率，也可以按实际情况调整</Text></View>
   <View style={styles.card}><Field label="记录日期" value={date} onChange={v=>{setDate(v);if(validDate(v))loadEditor(v);}} placeholder="YYYY-MM-DD"/><Button text="回到今天" secondary onPress={()=>loadEditor(localDate())}/><Field label="当天总工时（小时）" value={total} onChange={changeTotal} number/>
    <View style={styles.rule}><Text style={styles.hint}>{validDate(date)?(data.settings.workdays.includes(new Date(`${date}T12:00:00`).getDay())?`工作日：前 ${data.settings.threshold} 小时正常，超过部分 ${data.settings.doubleWorkdays.includes(new Date(`${date}T12:00:00`).getDay())?2:1.5} 倍`:'非工作日：默认全部 2 倍'):'请输入有效日期'}。3 倍请手动填写。</Text></View>
    <View style={styles.grid}>{labels.map((label,i)=><View key={label} style={styles.half}><Field label={label} number value={hours[i]} onChange={v=>setHours(current=>rebalanceHours(total,current,i,v))}/></View>)}</View>
    <Text style={styles.hint}>增加倍率工时会先扣正常工时，再按 1.5、2、3 倍顺序扣其它项；减少倍率工时会补回正常工时。总工时保持不变。</Text>
    <Text style={[styles.balance,{color:totalValid?'#16765f':'#b14e29'}]}>分类合计 {Number(sum.toFixed(2))} 小时 / 总工时 {total||'0'} 小时 {totalValid?'✓':'· 请调整至一致'}</Text><Button text="重新按规则分配" secondary onPress={automatic}/>
    <Field label="备注（选填）" value={note} onChange={setNote} placeholder="例如：节假日加班、临时调休" maxLength={500}/>
    {editSalary&&<Text style={styles.hint}>本条记录时薪 ¥{editRate.toFixed(2)} · 预计{salaryLabel} ¥{money({salaryEnabled:editSalary,hourlyRate:editRate,hours:hours.map(h=>Number(h)||0)},true).toFixed(2)}</Text>}
    <Button text={busy?'正在保存…':stored?'保存修改':'保存当天工时'} onPress={save} disabled={busy||!totalValid||!validDate(date)}/>
   </View><Text style={styles.footerHint}>支持小数小时，最多两位小数。例如 1.5 = 1 小时 30 分钟。</Text><Button text={data.settings.reminderEnabled?`下班提醒 · ${data.settings.reminderTime} · 点击设置`:'开启下班手机提醒'} secondary onPress={()=>{changeSettingsDraft(data.settings);setTab('settings');}}/>
  </>}
  {tab==='stats'&&<>
   <View style={[styles.card,styles.calendarCard]}><View style={styles.calendarHeading}><Text style={styles.sectionTitle}>工时月历</Text><Text style={styles.calendarSubtitle}>把每一天，看得清清楚楚</Text></View><View style={styles.monthRow}><Button text="‹ 上月" secondary onPress={()=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()-1);setMonth(localDate(d).slice(0,7));}}/><Text style={styles.month}>{month.replace('-',' 年 ')} 月</Text><Button text="下月 ›" secondary onPress={()=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+1);setMonth(localDate(d).slice(0,7));}}/></View>
    <MonthCalendar month={month} records={monthly} onOpen={day=>{loadEditor(day);setTab('record');}}/>
   </View>
   <View style={styles.card}><Text style={styles.sectionTitle}>本月合计</Text>
    <Text style={styles.statTotal}>{Number(sums.reduce((a,b)=>a+b,0).toFixed(2))} <Text style={styles.statUnit}>小时 / {monthly.length} 天</Text></Text>
    <MonthlyTotals key={month} month={month} summary={settlement} busy={busy} onSave={saveLeave} onDetails={setDetailIndex}/>
    <PayslipDisplay data={data} month={month} busy={busy} onMore={()=>setPayrollOpen(true)} onExport={()=>action(()=>exportFile(`工资条-${month}.csv`,payslipCsv(data,month),'text/csv'))}/>
    <Button text="导出本月表格（Excel 可打开）" secondary disabled={busy||!monthly.length} onPress={()=>action(()=>exportFile(`工时-${month}.csv`,csv([...monthly].reverse(),true,data.monthlyLeave),'text/csv'))}/>
   </View><Text style={styles.sectionTitle}>每日记录（原始工时）</Text>
   {!monthly.length&&<View style={styles.card}><Text style={styles.hint}>这个月还没有记录。去“记录”页补记一天吧。</Text></View>}
   {monthly.map(r=><View key={r.date} style={styles.card}><View style={styles.recordHeading}><Text style={styles.recordDate}>{r.date} · 星期{weekdays[new Date(`${r.date}T12:00:00`).getDay()]}</Text><Text style={styles.recordHours}>{r.total} h</Text></View><Text style={styles.hint}>正常 {r.hours[0]} · 1.5倍 {r.hours[1]} · 2倍 {r.hours[2]} · 3倍 {r.hours[3]}</Text>{r.salaryEnabled&&<Text style={styles.salary}>原始{salaryLabel} ¥{money(r,true).toFixed(2)} · 时薪 ¥{r.hourlyRate}</Text>}{!!r.note&&<Text style={styles.hint}>{r.note}</Text>}<View style={styles.monthRow}><Button text="修改" secondary onPress={()=>{loadEditor(r.date);setTab('record');}}/><Button text="删除" secondary disabled={busy} onPress={()=>action(async()=>{if(await confirm(`删除 ${r.date} 的记录？`))await commit({...dataRef.current,records:dataRef.current.records.filter(v=>v.date!==r.date)});})}/></View></View>)}
  </>}
  {tab==='settings'&&<>
   <View style={styles.card}><Text style={styles.sectionTitle}>工时规则</Text><Text style={styles.label}>每周工作日</Text><DayPicker days={draft.workdays} onChange={workdays=>setDraft({...draft,workdays,doubleWorkdays:draft.doubleWorkdays.filter(d=>workdays.includes(d))})}/><Text style={styles.label}>超出正常门槛按2倍计算的工作日</Text><DayPicker days={draft.doubleWorkdays} allowed={draft.workdays} onChange={doubleWorkdays=>setDraft({...draft,doubleWorkdays})}/><Field label="每天正常工时门槛（小时）" value={threshold} onChange={setThreshold} number/><Text style={styles.hint}>选中的工作日只将超出门槛的部分算2倍，其余工作日超出部分算1.5倍；非工作日仍全部2倍。默认门槛8小时，3倍手动填写。</Text></View>
   <View style={styles.card}><View style={styles.switchRow}><Text style={styles.sectionTitle}>计算加班工资</Text><Switch accessibilityLabel="计算加班工资" value={draft.salaryEnabled} onValueChange={salaryEnabled=>setDraft({...draft,salaryEnabled})} trackColor={{true:'#16765f'}}/></View><Field label="基础时薪（元 / 小时）" number value={rate} onChange={setRate}/><Text style={styles.hint}>只按1.5、2、3倍工时计算加班工资，正常工时不再自动折算工资。基础薪资可加入下面的工资条组成。更改时薪后，可在统计页“更多设置”一次更新本月全部记录。</Text></View>
   <View style={styles.card}><View style={styles.switchRow}><Text style={styles.sectionTitle}>默认工资条组成</Text><Switch accessibilityLabel="默认工资条组成" value={draft.payslipEnabled} onValueChange={payslipEnabled=>setDraft({...draft,payslipEnabled})} trackColor={{true:'#16765f'}}/></View><PayslipEditor items={defaultItems} onChange={setDefaultItems} disabled={busy}/><Text style={styles.hint}>默认组成用于所有月份。修改开关、项目、金额或备注并保存，会同步所有月份并替换各月自定义组成；仅修改时薪或工时规则不会替换。统计页“更多设置”可单独修改本月。</Text></View>
   <View style={styles.card}><View style={styles.switchRow}><Text style={styles.sectionTitle}>下班提醒</Text><Switch accessibilityLabel="下班提醒" value={draft.reminderEnabled} onValueChange={reminderEnabled=>setDraft({...draft,reminderEnabled})} trackColor={{true:'#16765f'}}/></View>{draft.reminderEnabled&&<><Field label="提醒时间（24小时制）" value={draft.reminderTime} onChange={reminderTime=>setDraft({...draft,reminderTime})} placeholder="18:00"/><Text style={styles.label}>提醒星期</Text><DayPicker days={draft.reminderDays} onChange={reminderDays=>setDraft({...draft,reminderDays})}/><Text style={styles.hint}>已记录的日期不提醒，点击通知可打开对应日期。每次打开应用安排未来60天的通知，请至少每月打开一次。系统省电限制可能影响送达时间。</Text></>}</View>
   <Text style={styles.footerHint}>设置修改后需要保存。工时规则不改历史工时；时薪可在统计页批量更新。默认工资条的修改会同步所有月份。</Text><Button text={busy?'正在保存…':'保存设置'} onPress={saveSettings} disabled={busy}/>
   <View style={styles.card}><Text style={styles.sectionTitle}>提醒状态与测试</Text><Text style={styles.hint}>{reminderStatus.summary}</Text><Text style={styles.hint}>先保存提醒时间和星期，再查看下次提醒。测试通知不受当天是否已记录影响。</Text><Button text="检查并重新安排提醒" secondary disabled={busy} onPress={()=>action(()=>refreshNotifications(dataRef.current,true))}/><Button text="立即测试通知" secondary disabled={busy} onPress={()=>runReminderTest()}/><Button text="1 分钟后测试提醒" secondary disabled={busy} onPress={()=>runReminderTest(true)}/><Button text="通知权限设置" secondary disabled={busy} onPress={()=>action(()=>openReminderSettings())}/>{Platform.OS==='android'&&<Button text="准时提醒权限设置" secondary disabled={busy} onPress={()=>action(()=>openReminderSettings(true))}/>}{Platform.OS!=='web'&&<Button text="应用与后台运行设置" secondary disabled={busy} onPress={()=>action(()=>Linking.openSettings())}/>}</View>
   <View style={styles.card}><Text style={styles.sectionTitle}>数据与备份</Text><Text style={styles.hint}>无需账号，共 {data.records.length} 天记录。数据保存在本机，卸载应用会清除记录，请定期将备份保存到手机文件中。</Text><Button text="导出全部工时表格" secondary disabled={busy||!data.records.length} onPress={()=>action(()=>exportFile('全部工时.csv',csv([...data.records].sort((a,b)=>a.date.localeCompare(b.date)),true,data.monthlyLeave),'text/csv'))}/><Button text="保存完整备份" secondary disabled={busy} onPress={()=>action(()=>exportFile(`工时备份-${localDate()}.json`,JSON.stringify(dataRef.current,null,2),'application/json'))}/><Button text="从备份恢复" secondary disabled={busy} onPress={restore}/></View>
  </>}
   {tab==='settings'&&<About/>}
  </ScrollView><MonthPayrollSettings visible={payrollOpen} month={month} slip={monthlyPayslip(data,month) as Payslip} settings={data.settings} busy={busy} onClose={()=>setPayrollOpen(false)} onSave={saveMonthSlip} onApplyWage={applyMonthWage}/><HoursDetails month={month} index={detailIndex} summary={settlement} onClose={()=>setDetailIndex(null)} onEdit={record=>{setDetailIndex(null);loadEditor(record.date);setTab('record');}}/><View style={styles.nav}>{[['record','记录','＋'],['stats','统计','▤'],['settings','设置','⚙']].map(([key,title,icon])=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===key}} aria-selected={tab===key} key={key} onPress={()=>{if(key==='settings')changeSettingsDraft(data.settings);setTab(key);}} style={styles.navItem}><Text style={[styles.navIcon,tab===key&&styles.navActive]}>{icon}</Text><Text style={[styles.navText,tab===key&&styles.navActive]}>{title}</Text></Pressable>)}</View>
 </View></SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({
 calendarCard:{padding:12,gap:16},calendarHeading:{paddingHorizontal:4,gap:5},calendarSubtitle:{fontSize:12,color:'#87978d'},calendar:{gap:6},calendarWeek:{flexDirection:'row',marginBottom:4},calendarWeekday:{flex:1,textAlign:'center',fontSize:12,fontWeight:'600',color:'#87978d'},calendarRow:{flexDirection:'row',gap:4},calendarBlank:{flex:1},calendarDay:{flex:1,minWidth:0,height:72,backgroundColor:'#f5f7f3',borderRadius:10,paddingTop:12,paddingHorizontal:2,alignItems:'center',justifyContent:'center',gap:7,borderWidth:1.5,borderColor:'transparent',overflow:'hidden'},calendarRest:{backgroundColor:'#dcecff'},calendarToday:{borderColor:'#176a56'},calendarDate:{fontSize:15,fontWeight:'700',color:'#405647',zIndex:1},calendarHours:{fontSize:12,fontWeight:'700',zIndex:1},restMark:{position:'absolute',top:-3,right:-1,fontSize:30,fontWeight:'900',color:'#a6c7ee',opacity:.7},todayDot:{position:'absolute',bottom:3,width:3,height:3,borderRadius:2,backgroundColor:'#176a56'},calendarLegend:{flexDirection:'row',justifyContent:'center',gap:14,marginTop:12},legendItem:{flexDirection:'row',alignItems:'center',gap:4},legendDot:{width:6,height:6,borderRadius:3},legendText:{fontSize:10,color:'#738779'},calendarHint:{textAlign:'center',fontSize:10,color:'#87978d',marginTop:3},
 root:{flex:1,backgroundColor:'#f3f6f2'},shell:{flex:1,width:'100%',maxWidth:650,alignSelf:'center'},header:{paddingHorizontal:24,paddingTop:18,paddingBottom:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{fontSize:12,color:'#83958b',marginBottom:5},title:{fontSize:28,fontWeight:'800',color:'#213d32'},localBadge:{backgroundColor:'#e3eee5',borderRadius:18,padding:9},localText:{fontSize:11,color:'#46725b'},content:{paddingHorizontal:20,paddingBottom:32,gap:16},hero:{backgroundColor:'#176a56',borderRadius:24,padding:25},heroEyebrow:{color:'#bdd8cb',fontSize:13},heroTitle:{fontSize:52,fontWeight:'800',color:'#fff',marginVertical:7},heroUnit:{fontSize:18,fontWeight:'400'},heroHint:{fontSize:12,color:'#c9ded4'},card:{backgroundColor:'#fff',borderRadius:20,padding:20,gap:12,borderWidth:1,borderColor:'#e6ede5'},field:{gap:8,marginBottom:3},label:{color:'#4e6659',fontSize:13,fontWeight:'600'},input:{backgroundColor:'#f5f7f3',borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:17,color:'#243e31',borderWidth:1,borderColor:'#e2e9de'},button:{backgroundColor:'#16765f',borderRadius:12,paddingVertical:14,paddingHorizontal:12,alignItems:'center'},buttonText:{fontWeight:'700',color:'#fff',fontSize:14},secondary:{backgroundColor:'#edf4ee'},rule:{backgroundColor:'#f7f8ed',padding:12,borderRadius:12},hint:{fontSize:12,color:'#7a8b7e',lineHeight:20},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},half:{width:'47%'},balance:{fontSize:12,fontWeight:'600'},footerHint:{fontSize:12,color:'#849486',lineHeight:20},sectionTitle:{fontSize:18,fontWeight:'700',color:'#294a38'},dayRow:{flexDirection:'row',gap:6},day:{flex:1,alignItems:'center',paddingVertical:13,backgroundColor:'#f0f4ee',borderRadius:10},dayActive:{backgroundColor:'#16765f'},switchRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},monthRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},month:{fontSize:18,fontWeight:'700',color:'#294a38'},statTotal:{fontSize:40,fontWeight:'800',color:'#176a56'},statUnit:{fontSize:13,fontWeight:'400',color:'#7a8b7e'},statCell:{backgroundColor:'#f4f7f1',padding:12,borderRadius:12},statNumber:{fontSize:23,color:'#345d43',fontWeight:'700',marginTop:4},salary:{color:'#8c7433',fontSize:13,lineHeight:21},recordHeading:{flexDirection:'row',justifyContent:'space-between'},recordDate:{fontSize:14,fontWeight:'600',color:'#365441'},recordHours:{fontSize:17,fontWeight:'700',color:'#16765f'},nav:{flexDirection:'row',borderTopWidth:1,borderColor:'#dfe8dc',backgroundColor:'#fff',paddingTop:8,paddingBottom:10},navItem:{flex:1,alignItems:'center',gap:2,padding:4},navIcon:{fontSize:25,color:'#9aa89d'},navText:{fontSize:12,color:'#9aa89d'},navActive:{color:'#16765f',fontWeight:'700'},warning:{backgroundColor:'#fff0d6',padding:14,borderRadius:12,color:'#8b632b',fontSize:13,lineHeight:20}
});
