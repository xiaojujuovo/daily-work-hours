// Web builds never import the Android notification package or request notification access.
import type {Data} from './storage';
export type ReminderStatus={message:string;summary:string;exactAllowed:boolean|null};
export async function syncReminders(_data:Data,_request=false):Promise<ReminderStatus> {
 return {message:'',summary:'',exactAllowed:null};
}
export async function testReminder(_delayed=false):Promise<string> {throw new Error('网页版不提供下班提醒');}
export async function openReminderSettings(_exact=false) {throw new Error('网页版不提供下班提醒');}
export function subscribeReminderResponse(_onOpen:(date:string)=>Promise<void>) {return()=>{};}
