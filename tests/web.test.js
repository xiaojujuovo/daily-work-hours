import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as domain from '../src/domain.js';

function load(file,dependencies={},globals={}) {
 const source=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',...Object.keys(globals),compiled)(name=>{
  if(!(name in dependencies))throw new Error('Unexpected dependency: '+name);
  return dependencies[name];
 },module,module.exports,...Object.values(globals));
 return module.exports;
}
function files() {
 const elements=[],blobs=[],revoked=[];
 const document={body:{appendChild:element=>{element.attached=true;}},createElement:tag=>{
  const element={tag,listeners:{},attached:false,click(){this.clicked=true;},remove(){this.attached=false;},addEventListener(event,fn){this.listeners[event]=fn;}};
  elements.push(element);return element;
 }};
 const api=load('files.web.ts',{}, {document,Blob,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:local-backup';},revokeObjectURL:url=>revoked.push(url)},setTimeout:fn=>fn()});
 return {api,elements,blobs,revoked};
}
test('网页备份直接下载本地Blob，保留中文内容并释放临时资源',async()=>{
 const f=files();const text=JSON.stringify({备注:'仅本地',小时:8});
 await f.api.exportFile('工时备份.json',text,'application/json');
 assert.equal(await f.blobs[0].text(),text);
 assert.equal(f.elements[0].download,'工时备份.json');
 assert.equal(f.elements[0].clicked,true);assert.equal(f.elements[0].attached,false);
 assert.deepEqual(f.revoked,['blob:local-backup']);
});
test('网页备份从用户所选文件直接读取，取消返回null，超大文件不读取',async()=>{
 const f=files();const pending=f.api.importFile();
 f.elements[0].files=[{size:100,text:async()=>'{"本地":true}'}];
 await f.elements[0].listeners.change();assert.equal(await pending,'{"本地":true}');assert.equal(f.elements[0].attached,false);
 const cancel=f.api.importFile();f.elements[1].listeners.cancel();assert.equal(await cancel,null);
 let read=false;const large=f.api.importFile();
 f.elements[2].files=[{size:10*1024*1024+1,text:async()=>{read=true;}}];
 const rejected=assert.rejects(large,/10MB/);await f.elements[2].listeners.change();await rejected;assert.equal(read,false);
});
test('网页存储重载后保持工资条和调休，写入失败保留原有备份且明确报错',async()=>{
 const memory=new Map();let blocked=false;
 const dependencies={'@react-native-async-storage/async-storage':{getItem:async key=>memory.get(key),setItem:async(key,value)=>{if(blocked)throw Error('QuotaExceededError');memory.set(key,value);}},'./domain':domain,'react-native':{Platform:{OS:'web'}}};
 const first=load('storage.ts',dependencies),data=first.emptyData();
 data.monthlyLeave={'2026-10':2};data.settings.payslipItems=[{id:'base',title:'基础薪资',amount:3000,note:'本地',kind:'income'}];
 await first.writeData(data);
 assert.deepEqual(await load('storage.ts',dependencies).readData(),data);
 blocked=true;await assert.rejects(first.writeData({...data,monthlyLeave:{}}),/无法保存到浏览器本地/);
 assert.deepEqual(await first.readData(),data);
 memory.set('daily-work-hours-v1','invalid');await assert.rejects(first.readData());assert.equal(memory.get('daily-work-hours-v1'),'invalid');
});
test('网页不加载通知原生依赖，也不安排提醒或申请权限',async()=>{
 const api=load('reminders.web.ts');
 assert.deepEqual(await api.syncReminders({settings:{reminderEnabled:true}},true),{message:'',summary:'',exactAllowed:null});
 let opened=false;api.subscribeReminderResponse(async()=>{opened=true;})();assert.equal(opened,false);
 await assert.rejects(api.testReminder(),/网页版不提供/);
 const config=JSON.parse(fs.readFileSync(new URL('../app.json',import.meta.url),'utf8')).expo;
 assert.deepEqual(config.platforms,['android','web']);assert.equal(config.ios,undefined);
});
