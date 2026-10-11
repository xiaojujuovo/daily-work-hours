import {localDate,reminderDates} from './domain.js';
const PREFIX='daily-work-hours:';
export function isDailyReminder(request) {
  return request.identifier.startsWith(PREFIX) || request.content?.data?.kind==='daily-work-hours' || request.content?.title==='下班啦，记一下今天的工时';
}
export function reminderPlan(data,current,now=new Date()) {
  const desired=reminderDates(data.settings,data.records,now).map(date=>({identifier:PREFIX+date.getTime(),date,day:localDate(date)}));
  const desiredIds=new Set(desired.map(item=>item.identifier));
  const today=localDate(now);
  const [hour,minute]=data.settings.reminderTime.split(':').map(Number);
  const todayTime=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hour,minute).getTime();
  const allowLate=data.settings.reminderEnabled && data.settings.reminderDays.includes(now.getDay()) && !data.records.some(record=>record.date===today);
  const obsolete=current.filter(isDailyReminder).filter(request=>{
    if(desiredIds.has(request.identifier))return false;
    const timestamp=Number(request.content?.data?.scheduledAt ?? request.trigger?.timestamp);
    // Preserve an overdue alarm still waiting for Android, instead of erasing it on foregrounding.
    if(allowLate && request.content?.data?.date===today && timestamp===todayTime && timestamp<=now.getTime())return false;
    return true;
  });
  return {desired,obsolete};
}
export async function reconcileReminders(data,adapter,now=new Date(),rearm=false) {
  const current=await adapter.getAll();
  const {desired,obsolete}=reminderPlan(data,current,now);
  const existing=new Set(current.map(request=>request.identifier));
  for(const item of desired)if(rearm || !existing.has(item.identifier))await adapter.schedule(item);
  // Keep existing alarms intact if scheduling a replacement fails.
  for(const request of obsolete)await adapter.cancel(request.identifier);
  return adapter.getAll();
}
