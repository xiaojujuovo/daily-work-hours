import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, parseBackup } from './domain';
export type PayslipItem={id:string;title:string;amount:number;note:string;kind:'income'|'deduction'};
export type Payslip={enabled:boolean;items:PayslipItem[]};
export type Settings = Omit<typeof DEFAULT_SETTINGS,'payslipItems'|'doubleWorkdays'> & {payslipItems:PayslipItem[];doubleWorkdays:number[]};
export type RecordEntry = {date:string;total:number;hours:number[];salaryEnabled:boolean;hourlyRate:number;note:string};
export type Data = {version:1;settings:Settings;records:RecordEntry[];monthlyLeave:{[month:string]:number};monthlyPayslips:{[month:string]:Payslip}};
export const emptyData = ():Data => ({version:1,settings:{...DEFAULT_SETTINGS},records:[],monthlyLeave:{},monthlyPayslips:{}});
const KEY='daily-work-hours-v1';
export async function readData():Promise<Data> {const raw=await AsyncStorage.getItem(KEY); return raw?parseBackup(raw) as Data:emptyData();}
export async function writeData(data:Data) { await AsyncStorage.setItem(KEY,JSON.stringify(data)); }
