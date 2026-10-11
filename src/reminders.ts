import {Linking,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {localDate} from './domain';
import {isDailyReminder,reconcileReminders} from './reminder-engine';
import type {Data} from './storage';

const CHANNEL='work-hours';
type AccessStatus={sdkVersion:number;exactAlarmAllowed:boolean;batteryUnrestricted:boolean};
type AccessModule={getStatus():Promise<AccessStatus>;openExactAlarmSettings():Promise<void>;openNotificationSettings():Promise<void>};
const access=Platform.OS==='android'?requireOptionalNativeModule<AccessModule>('WorkHoursReminderAccess'):null;
export type ReminderStatus={message:string;summary:string;exactAllowed:boolean|null};
let lastCapability='';
if(Platform.OS!=='web')Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:true,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});

async function prepare(request=false) {
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(CHANNEL,{name:'下班记录提醒',importance:Notifications.AndroidImportance.HIGH,sound:'default',enableVibrate:true,vibrationPattern:[0,200,100,200]});
  let permission=await Notifications.getPermissionsAsync();
  if(!permission.granted && request)permission=await Notifications.requestPermissionsAsync();
  const native=access?await access.getStatus():null;
  const channel=Platform.OS==='android'?await Notifications.getNotificationChannelAsync(CHANNEL):null;
  return {allowed:permission.granted,channelBlocked:channel?.importance===Notifications.AndroidImportance.NONE,native};
}
function timestamp(request:Notifications.NotificationRequest):number {
  const trigger=request.trigger as {timestamp?:number}|null;
  return Number(request.content.data?.scheduledAt ?? trigger?.timestamp ?? 0);
}
export async function syncReminders(data:Data,request=false):Promise<ReminderStatus> {
  if(Platform.OS==='web')return {message:data.settings.reminderEnabled?'网页预览不支持手机通知，请在安装版中开启。':'',summary:'请在手机安装版检查通知权限及测试提醒。',exactAllowed:null};
  const state=await prepare(request);
  const capability=`${state.allowed}/${state.native?.exactAlarmAllowed}`;
  const adapter={
    getAll:()=>Notifications.getAllScheduledNotificationsAsync(),
    cancel:(identifier:string)=>Notifications.cancelScheduledNotificationAsync(identifier),
    schedule:({identifier,date,day}:{identifier:string;date:Date;day:string})=>Notifications.scheduleNotificationAsync({identifier,content:{title:'下班啦，记一下今天的工时',body:'填写总工时，确认各倍率小时数。',sound:'default',priority:Notifications.AndroidNotificationPriority.HIGH,data:{kind:'daily-work-hours',date:day,scheduledAt:date.getTime()}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:CHANNEL}})
  };
  const pending=(!data.settings.reminderEnabled || (state.allowed && !state.channelBlocked))
    ?await reconcileReminders(data,adapter,new Date(),request || capability!==lastCapability)
    :await adapter.getAll();
  lastCapability=capability;
  const daily=pending.filter(isDailyReminder).sort((a:Notifications.NotificationRequest,b:Notifications.NotificationRequest)=>timestamp(a)-timestamp(b));
  const next=daily.find((item:Notifications.NotificationRequest)=>timestamp(item)>Date.now());
  const nextTime=next?new Date(timestamp(next)):null;
  const exactAllowed=Platform.OS==='android'?(state.native?.exactAlarmAllowed??null):null;
  const message=!data.settings.reminderEnabled?'':!state.allowed?'通知权限未开启，请点击“通知权限设置”。':state.channelBlocked?'下班记录提醒频道已关闭，请在通知权限设置中开启。':exactAllowed===false?'准时提醒权限未开启，系统可能推迟提醒。请点击“准时提醒权限设置”允许后返回应用。':Platform.OS==='android'&&exactAllowed===null?'无法读取准时提醒权限，请使用最新安装版。':'';
  const summary=[`通知权限：${state.allowed?'已开启':'未开启'}`,`提醒频道：${state.channelBlocked?'已关闭':'可用'}`,Platform.OS==='android'?`准时提醒：${exactAllowed===null?'无法读取':exactAllowed?'已允许':'未允许'}`:'',`下班提醒：${data.settings.reminderEnabled?'已开启':'已关闭'}`,`已安排 ${daily.length} 条`,nextTime?`下次：${localDate(nextTime)} ${String(nextTime.getHours()).padStart(2,'0')}:${String(nextTime.getMinutes()).padStart(2,'0')}`:'没有未来的下班提醒',data.records.some(record=>record.date===localDate())?'今天已记录工时，今天不再提醒。':'',state.native&&!state.native.batteryUnrestricted?'若锁屏仍收不到，请在应用设置允许后台运行，并检查手机自启动设置。':''].filter(Boolean).join('\n');
  return {message,summary,exactAllowed};
}
export async function testReminder(delayed=false):Promise<string> {
  if(Platform.OS==='web')throw new Error('请在安卓安装版中测试手机通知。');
  const state=await prepare(true);
  if(!state.allowed || state.channelBlocked)throw new Error('通知或提醒频道未开启，请先允许通知。');
  if(delayed && Platform.OS==='android' && state.native?.exactAlarmAllowed!==true)throw new Error('请先开启准时提醒权限，再运行1分钟测试。');
  const date=new Date(Date.now()+60000);
  await Notifications.scheduleNotificationAsync({identifier:delayed?'work-hours-test-delayed':'work-hours-test-now',content:{title:delayed?'工时定时提醒测试':'工时通知测试',body:delayed?'这是一分钟后的测试通知，说明定时提醒已触发。':'看到这条消息说明通知可以显示。',sound:'default',priority:Notifications.AndroidNotificationPriority.HIGH,data:{kind:'work-hours-test',date:localDate()}},trigger:delayed?{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:CHANNEL}:Platform.OS==='android'?{channelId:CHANNEL}:null});
  return delayed?'已安排1分钟后的测试通知。现在可回到桌面或锁屏；测试不受当天是否已记录影响。':'已发送测试通知，请查看手机通知栏。';
}
export async function openReminderSettings(exact=false) {
  if(Platform.OS==='web')throw new Error('请在手机安装版设置通知权限。');
  if(access) {if(exact)await access.openExactAlarmSettings();else await access.openNotificationSettings();}
  else await Linking.openSettings();
}
