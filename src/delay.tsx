import React,{useEffect,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import type {DelayCategory,DelayEntry} from './storage';
import {DELAY_CATEGORIES,NO_PARTY,delayCategoryLabel,delaysOn,knownDevices,knownOrders,knownParties,monthlyDelays,newDelayId,normalizeParty} from './delay-domain.js';
import {validDate} from './domain';

const hours=(value:number)=>`${Number(value.toFixed(2))}h`;
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);

function Action({text,onPress,primary=false,danger=false,disabled=false,label}:{text:string;onPress:()=>void;primary?:boolean;danger?:boolean;disabled?:boolean;label?:string}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={label??text} disabled={disabled} onPress={onPress} style={[s.action,primary&&s.primary,danger&&s.danger,disabled&&{opacity:.45}]}>
  <Text style={[s.actionText,primary&&{color:'#fff'},danger&&{color:'#a8452c'}]}>{text}</Text>
 </Pressable>;
}
function Chip({text,active=false,onPress,label}:{text:string;active?:boolean;onPress:()=>void;label?:string}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={label??text} accessibilityState={{selected:active}} onPress={onPress} style={[s.chip,active&&s.chipActive]}>
  <Text style={[s.chipText,active&&{color:'#fff'}]}>{text}</Text>
 </Pressable>;
}
function Input({label,value,onChange,placeholder,maxLength,number=false,multiline=false,onSubmit}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;maxLength?:number;number?:boolean;multiline?:boolean;onSubmit?:()=>void}) {
 return <View style={s.field}><Text style={s.label}>{label}</Text>
  <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#a4afa9" maxLength={maxLength} keyboardType={number?'decimal-pad':'default'} multiline={multiline} onSubmitEditing={onSubmit} blurOnSubmit={!onSubmit} style={[s.input,multiline&&s.multiline]}/>
 </View>;
}
function Suggestions({values,current,onPick}:{values:string[];current:string;onPick:(value:string)=>void}) {
 const text=current.trim();
 const shown=values.filter(v=>v!==text&&(!text||v.includes(text))).slice(0,6);
 if(!shown.length)return null;
 return <View style={s.chips}>{shown.map(v=><Chip key={v} text={v} label={`填入 ${v}`} onPress={()=>onPick(v)}/>)}</View>;
}
function splitParties(text:string) {
 return text.split(/[,，、;；\n]/).map(normalizeParty).filter(Boolean);
}

export type DelayDraft={entry?:DelayEntry;date:string};
export function DelayEditor({draft,delays,busy,onClose,onSave,onDelete}:{draft:DelayDraft|null;delays:DelayEntry[];busy:boolean;onClose:()=>void;onSave:(entry:DelayEntry)=>Promise<void>;onDelete:(entry:DelayEntry)=>Promise<boolean>}) {
 const [date,setDate]=useState(''),[orderNo,setOrderNo]=useState(''),[device,setDevice]=useState(''),[value,setValue]=useState(''),[category,setCategory]=useState<DelayCategory|null>(null);
 const [parties,setParties]=useState<string[]>([]),[partyInput,setPartyInput]=useState(''),[note,setNote]=useState(''),[feedback,setFeedback]=useState('');
 useEffect(()=>{
  if(!draft)return;
  const e=draft.entry;
  setDate(e?.date??draft.date);setOrderNo(e?.orderNo??'');setDevice(e?.device??'');setValue(e?String(e.hours):'');
  setCategory(e?.category??null);setParties(e?.parties??[]);setPartyInput('');setNote(e?.note??'');setFeedback('');
 },[draft]);
 useEffect(()=>setFeedback(''),[date,value,category,parties]);
 const addParties=(text:string)=>{
  const next=[...parties];
  for(const party of splitParties(text))if(!next.includes(party))next.push(party);
  setParties(next);setPartyInput('');return next;
 };
 const allParties=knownParties(delays).filter(p=>!parties.includes(p));
 const partyText=partyInput.trim();
 const shownParties=allParties.filter(p=>!partyText||p.includes(partyText)).slice(0,12);
 const save=async()=>{
  setFeedback('');
  try{
   if(!category)throw new Error('请选择原因分类');
   const text=value.trim();
   if(!/^\d+(\.\d{1,2})?$/.test(text))throw new Error('耽误时长请填写大于 0 的小时数，最多两位小数');
   const finalParties=partyText?addParties(partyInput):parties;
   await onSave({id:draft?.entry?.id??newDelayId(),date:date.trim(),orderNo,device,hours:Number(text),category,parties:finalParties,note});
  }catch(e){setFeedback(errorText(e));}
 };
 const remove=async()=>{
  if(!draft?.entry)return;
  try{await onDelete(draft.entry);}catch(e){setFeedback(errorText(e));}
 };
 return <Modal visible={draft!==null} transparent animationType="fade" onRequestClose={()=>{if(!busy)onClose();}}><View style={s.overlay}><View style={s.dialog} accessibilityViewIsModal>
  <View style={s.heading}><View style={{flex:1}}><Text style={s.title}>{draft?.entry?'修改异常工时':'记录异常工时'}</Text><Text style={s.hint}>只单独记账，不计入当天工时和工资</Text></View><Action text="关闭" disabled={busy} onPress={onClose}/></View>
  <ScrollView style={{flexShrink:1}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
   <Input label="日期" value={date} onChange={setDate} placeholder="YYYY-MM-DD" maxLength={10}/>
   <Input label="订单号（选填）" value={orderNo} onChange={setOrderNo} placeholder="例如：SO-2026-118" maxLength={50}/>
   <Suggestions values={knownOrders(delays)} current={orderNo} onPick={setOrderNo}/>
   <Input label="设备名称（选填）" value={device} onChange={setDevice} placeholder="例如：3 号线码垛机" maxLength={50}/>
   <Suggestions values={knownDevices(delays)} current={device} onPick={setDevice}/>
   <Input label="耽误时长（小时）" value={value} onChange={setValue} number placeholder="例如：2.5"/>
   <View style={s.chips}>{[0.5,1,2,3,4,8].map(h=><Chip key={h} text={`${h}h`} label={`耽误 ${h} 小时`} active={value===String(h)} onPress={()=>setValue(String(h))}/>)}</View>
   <View style={s.field}><Text style={s.label}>原因分类</Text><View style={s.chips}>{DELAY_CATEGORIES.map(c=><Chip key={c.key} text={c.label} active={category===c.key} onPress={()=>setCategory(c.key as DelayCategory)}/>)}</View></View>
   <View style={s.field}>
    <Text style={s.label}>责任方（可多个）</Text>
    {parties.length>0&&<View style={s.chips}>{parties.map(p=><Chip key={p} text={`${p}  ×`} label={`移除责任方 ${p}`} active onPress={()=>setParties(parties.filter(x=>x!==p))}/>)}</View>}
    <View style={s.row}>
     <TextInput accessibilityLabel="输入责任方" value={partyInput} onChangeText={setPartyInput} onSubmitEditing={()=>addParties(partyInput)} blurOnSubmit={false} placeholder="输入后点添加，如：电工" placeholderTextColor="#a4afa9" maxLength={60} style={[s.input,{flex:1}]}/>
     <Action text="添加" disabled={!partyText} onPress={()=>addParties(partyInput)} label="添加责任方"/>
    </View>
    {shownParties.length>0&&<><Text style={s.hint}>曾经填过，点一下即可添加：</Text><View style={s.chips}>{shownParties.map(p=><Chip key={p} text={`＋ ${p}`} label={`添加责任方 ${p}`} onPress={()=>{setParties([...parties,p]);setPartyInput('');}}/>)}</View></>}
   </View>
   <Input label="情况说明（选填）" value={note} onChange={setNote} placeholder="例如：电工未按图纸接线，一直等待返工" maxLength={500} multiline/>
   {!!feedback&&<Text accessibilityLiveRegion="polite" style={s.warning}>{feedback}</Text>}
   <Action text={busy?'正在保存…':'保存'} primary disabled={busy} onPress={()=>void save()}/>
   {draft?.entry&&<Action text="删除这条记录" danger disabled={busy} onPress={()=>void remove()}/>}
  </ScrollView>
 </View></View></Modal>;
}

function EntryRow({entry,onEdit,showDate=false}:{entry:DelayEntry;onEdit:(entry:DelayEntry)=>void;showDate?:boolean}) {
 const head=[showDate&&entry.date,entry.orderNo&&`订单 ${entry.orderNo}`,entry.device].filter(Boolean).join(' · ');
 return <Pressable accessibilityRole="button" accessibilityLabel={`${head||'异常工时'}，${delayCategoryLabel(entry.category)}，${hours(entry.hours)}，点击修改`} onPress={()=>onEdit(entry)} style={s.entry}>
  <View style={s.entryHeading}><Text style={s.entryTitle} numberOfLines={1}>{head||delayCategoryLabel(entry.category)}</Text><Text style={s.entryHours}>{hours(entry.hours)}</Text></View>
  <View style={s.chips}><Text style={s.tag}>{delayCategoryLabel(entry.category)}</Text>{(entry.parties.length?entry.parties:[NO_PARTY]).map(p=><Text key={p} style={[s.tag,s.partyTag]}>{p}</Text>)}</View>
  {!!entry.note&&<Text style={s.hint}>{entry.note}</Text>}
 </Pressable>;
}

export function DelayDay({date,delays,busy,onAdd,onEdit}:{date:string;delays:DelayEntry[];busy:boolean;onAdd:()=>void;onEdit:(entry:DelayEntry)=>void}) {
 const valid=validDate(date);
 const entries:DelayEntry[]=valid?delaysOn(delays,date):[];
 const total=entries.reduce((sum,e)=>sum+e.hours,0);
 return <View style={s.card}>
  <View style={s.entryHeading}><Text style={s.sectionTitle}>异常工时</Text>{entries.length>0&&<Text style={s.entryHours}>{hours(total)}</Text>}</View>
  <Text style={s.hint}>调试时因设备、接线、缺料等原因耽误的时间。单独记录，不影响当天工时。</Text>
  {entries.map(e=><EntryRow key={e.id} entry={e} onEdit={onEdit}/>)}
  <Action text="＋ 记录异常工时" disabled={busy||!valid} onPress={onAdd}/>
 </View>;
}

function GroupList({title,groups}:{title:string;groups:{name:string;hours:number;count:number}[]}) {
 if(!groups.length)return null;
 const max=Math.max(...groups.map(g=>g.hours));
 return <View style={s.group}><Text style={s.label}>{title}</Text>{groups.map(g=><View key={g.name} style={s.groupRow} accessibilityLabel={`${g.name}，${hours(g.hours)}，${g.count} 次`}>
  <View style={s.groupText}><Text style={s.groupName} numberOfLines={1}>{g.name}</Text><Text style={s.groupValue}>{hours(g.hours)} · {g.count} 次</Text></View>
  <View style={s.bar}><View style={[s.barFill,{width:`${max>0?Math.max(4,g.hours/max*100):0}%`}]}/></View>
 </View>)}</View>;
}

export function DelayMonthly({month,delays,busy,onAdd,onEdit,onCopy,onExport}:{month:string;delays:DelayEntry[];busy:boolean;onAdd:()=>void;onEdit:(entry:DelayEntry)=>void;onCopy:()=>void;onExport:()=>void}) {
 const summary=monthlyDelays(delays,month);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>setExpanded(false),[month]);
 const shown=expanded?summary.entries:summary.entries.slice(-5);
 return <View style={s.card}>
  <Text style={s.sectionTitle}>本月异常工时</Text>
  <Text style={s.total}>{Number(summary.hours.toFixed(2))} <Text style={s.unit}>小时 · {summary.count} 次 · {summary.days} 天</Text></Text>
  {!summary.count?<Text style={s.hint}>这个月还没有异常工时记录。</Text>:<>
   <GroupList title="按责任方" groups={summary.byParty}/>
   <GroupList title="按原因分类" groups={summary.byCategory}/>
   <GroupList title="按设备" groups={summary.byDevice}/>
   {summary.entries.some((e:DelayEntry)=>e.parties.length>1)&&<Text style={s.hint}>一条记录有多个责任方时，时长分别计入每个责任方。</Text>}
   <Text style={s.label}>明细{summary.count>5&&!expanded?`（最近 5 条，共 ${summary.count} 条）`:''}</Text>
   {[...shown].reverse().map((e:DelayEntry)=><EntryRow key={e.id} entry={e} showDate onEdit={onEdit}/>)}
   {summary.count>5&&<Action text={expanded?'收起明细':`展开全部 ${summary.count} 条`} onPress={()=>setExpanded(!expanded)}/>}
  </>}
  <Action text="＋ 补记异常工时" disabled={busy} onPress={onAdd}/>
  <View style={s.row}>
   <View style={{flex:1}}><Action text="复制月度总结" disabled={busy||!summary.count} onPress={onCopy}/></View>
   <View style={{flex:1}}><Action text="导出明细表格" disabled={busy||!summary.count} onPress={onExport}/></View>
  </View>
 </View>;
}

const s=StyleSheet.create({
 card:{backgroundColor:'#fff',borderRadius:20,padding:20,gap:12,borderWidth:1,borderColor:'#e6ede5'},
 sectionTitle:{fontSize:18,fontWeight:'700',color:'#294a38'},
 total:{fontSize:30,fontWeight:'800',color:'#b25a22'},unit:{fontSize:13,fontWeight:'500',color:'#7a8b7e'},
 hint:{fontSize:12,color:'#7a8b7e',lineHeight:20},
 warning:{fontSize:13,color:'#a8452c',backgroundColor:'#fdf0e8',padding:10,borderRadius:10,lineHeight:20},
 label:{color:'#4e6659',fontSize:13,fontWeight:'600'},
 field:{gap:8},
 input:{minWidth:0,backgroundColor:'#f5f7f3',borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:16,color:'#243e31',borderWidth:1,borderColor:'#e2e9de'},
 multiline:{minHeight:84,textAlignVertical:'top'},
 row:{flexDirection:'row',gap:10,alignItems:'center'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{paddingHorizontal:12,paddingVertical:8,borderRadius:16,backgroundColor:'#f0f4ee',borderWidth:1,borderColor:'#e2e9de'},
 chipActive:{backgroundColor:'#c46a2c',borderColor:'#c46a2c'},
 chipText:{fontSize:13,color:'#4e6659',fontWeight:'600'},
 action:{backgroundColor:'#edf4ee',borderRadius:12,paddingVertical:13,paddingHorizontal:14,alignItems:'center'},
 primary:{backgroundColor:'#16765f'},danger:{backgroundColor:'#fbeee8'},
 actionText:{fontWeight:'700',color:'#166452',fontSize:14},
 entry:{backgroundColor:'#fbf7f2',borderRadius:14,padding:12,gap:8,borderLeftWidth:3,borderLeftColor:'#d9853f'},
 entryHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
 entryTitle:{flex:1,fontSize:14,fontWeight:'700',color:'#3c4f44'},entryHours:{fontSize:16,fontWeight:'800',color:'#b25a22'},
 tag:{fontSize:12,color:'#8a5a2f',backgroundColor:'#f6e6d6',paddingHorizontal:8,paddingVertical:3,borderRadius:8,overflow:'hidden'},
 partyTag:{color:'#4e6659',backgroundColor:'#e6efe8'},
 group:{gap:8},groupRow:{gap:4},groupText:{flexDirection:'row',justifyContent:'space-between',gap:10},
 groupName:{flex:1,fontSize:13,color:'#3c4f44'},groupValue:{fontSize:13,fontWeight:'700',color:'#3c4f44'},
 bar:{height:6,borderRadius:3,backgroundColor:'#f1ebe4',overflow:'hidden'},barFill:{height:6,borderRadius:3,backgroundColor:'#d9853f'},
 overlay:{flex:1,backgroundColor:'rgba(18,39,28,0.45)',alignItems:'center',justifyContent:'center',padding:12},
 dialog:{width:'100%',maxWidth:620,maxHeight:'92%',borderRadius:22,backgroundColor:'#fff',padding:16,gap:14},
 heading:{flexDirection:'row',alignItems:'center',gap:8},title:{fontSize:22,fontWeight:'800',color:'#294a38'},
 content:{gap:14,paddingBottom:4,overflow:'hidden'},
});
