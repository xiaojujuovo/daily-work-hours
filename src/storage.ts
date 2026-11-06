import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import { DEFAULT_SETTINGS, parseBackup, units, validateRecord } from './domain';
export type PayslipItem={id:string;title:string;amount:number;note:string;kind:'income'|'deduction'};
export type Payslip={enabled:boolean;items:PayslipItem[]};
export type TimeRange = {start:string;end:string};
export type ShiftSettings = TimeRange & {breaks:TimeRange[]};
export const defaultShift:ShiftSettings = {start:'09:00',end:'18:00',breaks:[{start:'12:00',end:'13:00'}]};
export type Settings = Omit<typeof DEFAULT_SETTINGS,'payslipItems'|'doubleWorkdays'> & {payslipItems:PayslipItem[];doubleWorkdays:number[];shift?:ShiftSettings};
export type RecordEntry = {date:string;total:number;hours:number[];salaryEnabled:boolean;hourlyRate:number;note:string};
export type Data = {version:1;settings:Settings;records:RecordEntry[];monthlyLeave:{[month:string]:number};monthlyPayslips:{[month:string]:Payslip}};
export async function persistRecord(data:Data, record:RecordEntry, commit:(next:Data)=>Promise<void>) {
 validateRecord(record);
 const records=[...data.records.filter(r=>r.date!==record.date),record].sort((a,b)=>b.date.localeCompare(a.date));
 await commit({...data,records});
}
export const emptyData = ():Data => ({version:1,settings:{...DEFAULT_SETTINGS},records:[],monthlyLeave:{},monthlyPayslips:{}});
const KEY='daily-work-hours-v1';
const RECENT_HOURS_KEY='daily-work-hours-recent-total';
let recentHoursWrites=Promise.resolve();
export async function readRecentHours():Promise<number|null> {
 try{const raw=await AsyncStorage.getItem(RECENT_HOURS_KEY);return raw===null?null:units(raw)/100;}
 catch{return null;}
}
export function writeRecentHours(value:number) {
 const raw=String(units(value)/100);
 recentHoursWrites=recentHoursWrites.catch(()=>{}).then(()=>AsyncStorage.setItem(RECENT_HOURS_KEY,raw));
 return recentHoursWrites;
}
const snapshots=new WeakMap<Data,string|null>();
export const dataSnapshot=(data:Data)=>snapshots.get(data)??null;
export class WidgetDataConflict extends Error {}
export async function readData():Promise<Data> {
 const raw=await AsyncStorage.getItem(KEY);
 const data=raw?parseBackup(raw) as Data:emptyData();
 snapshots.set(data,raw);
 return data;
}
export async function writeData(data:Data, compare?:{before:Data;write:(expected:string|null,value:string)=>Promise<boolean>}) {
 try{
  const raw=JSON.stringify(data);
  if(compare){
   if(!await compare.write(dataSnapshot(compare.before),raw))throw new WidgetDataConflict('桌面工时已更新，请核对记录后再保存。');
  }else await AsyncStorage.setItem(KEY,raw);
  snapshots.set(data,raw);
 }
 catch(error){if(Platform.OS==='web')throw new Error('无法保存到浏览器本地，请检查网站存储权限或剩余空间。原有记录未被替换，请先导出完整备份。');throw error;}
}
