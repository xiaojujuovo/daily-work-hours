import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo-modules-core';

export type WidgetConfiguration={presets:string[];intervalMicros:number};
export type LegacyWidgetSchedule={start:string;end:string;breakStart:string;breakEnd:string};
type WidgetBridge={
 getWidgetSettings():Promise<string>;
 saveWidgetSettings(value:string):Promise<void>;
 completeWidgetEntry(request:string,message:string):Promise<boolean>;
 writeWidgetAwareData(expected:string|null,value:string):Promise<boolean>;
};
const bridge=Platform.OS==='android'?requireOptionalNativeModule<WidgetBridge>('WorkHoursReminderAccess'):null;

export const widgets=typeof bridge?.writeWidgetAwareData==='function'?bridge:null;
