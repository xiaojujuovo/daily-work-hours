import React, {useEffect,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {monthlySummary} from './domain';
import {RecordEntry} from './storage';

const labels=['正常工时','1.5 倍工时','2 倍工时','3 倍工时'];
type Summary=ReturnType<typeof monthlySummary>;
const hours=(value:number)=>String(Number(value.toFixed(2)));
export function balanceText(raw:number,deducted:number,remaining:number) {
 return deducted>0?`${hours(raw)} - ${hours(deducted)} = ${hours(remaining)}`:hours(raw);
}
export function MonthlyTotals({month,summary,busy,onSave,onDetails}:{month:string;summary:Summary;busy:boolean;onSave:(month:string,value:string)=>Promise<void>;onDetails:(index:number)=>void}) {
 const [value,setValue]=useState(String(summary.leave)),[feedback,setFeedback]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{setValue(String(summary.leave));setFeedback('');},[month,summary.leave]);
 const save=async()=>{setSaving(true);setFeedback('');try{await onSave(month,value);setFeedback('本月调休已保存');}catch(e){setFeedback(e instanceof Error?e.message:String(e));}finally{setSaving(false);}};
 return <View style={s.summary}>
  <View style={s.leaveBox}><Text style={s.label}>调休工时（小时）</Text><View style={s.inputRow}><TextInput accessibilityLabel="本月调休工时" keyboardType="decimal-pad" value={value} onChangeText={v=>{setValue(v);setFeedback('');}} editable={!busy&&!saving} style={s.input}/><Pressable accessibilityRole="button" disabled={busy||saving} onPress={save} style={[s.save,(busy||saving)&&{opacity:.5}]}><Text style={s.saveText}>{saving?'保存中…':'保存调休'}</Text></Pressable></View><Text style={s.hint}>按 1.5 → 2 → 3 倍依次抵扣 · 填 0 保存可清除</Text>{!!feedback&&<Text accessibilityLiveRegion="polite" style={s.feedback}>{feedback}</Text>}</View>
  <View style={s.grid}>{summary.raw.map((raw:number,index:number)=><Pressable key={index} accessibilityRole="button" accessibilityLabel={`查看${labels[index]}明细，${balanceText(raw,summary.deductions[index],summary.remaining[index])}小时`} onPress={()=>onDetails(index)} style={({pressed})=>[s.stat,pressed&&{opacity:.65}]}><View style={s.heading}><Text style={s.label}>{labels[index]}</Text><Text style={s.arrow}>{'>'}</Text></View><Text style={[s.number,summary.deductions[index]>0&&s.equation]}>{balanceText(raw,summary.deductions[index],summary.remaining[index])}</Text><Text style={s.unit}>{summary.deductions[index]>0?'原工时 − 调休 = 剩余小时':'小时 · 点击查看明细'}</Text></Pressable>)}</View>
  {summary.excess>0&&<Text style={s.warning}>本月加班工时减少，仍有 {hours(summary.excess)} 小时调休未能抵扣，请调整调休。已抵扣 {hours(summary.applied)} 小时，剩余工时不会变为负数。</Text>}
  {summary.applied>0&&<Text style={s.hint}>已抵扣调休 {hours(summary.applied)} 小时，工资按剩余工时计算。实际总工时与每日原始记录保留。</Text>}
 </View>;
}
export function HoursDetails({month,index,summary,onClose,onEdit}:{month:string;index:number|null;summary:Summary;onClose:()=>void;onEdit:(record:RecordEntry)=>void}) {
 const selected=index??0;
 const entries=summary.entries.filter((e:any)=>e.record.hours[selected]>0);
 return <Modal visible={index!==null} transparent animationType="fade" onRequestClose={onClose}><View style={s.overlay}><View style={s.dialog} accessibilityViewIsModal>
  <View style={s.dialogHeader}><View style={{flex:1}}><Text style={s.dialogTitle}>{labels[selected]}明细</Text><Text style={s.hint}>{month} · {entries.length} 天 · 仅展示含该类工时的日期</Text></View><Pressable accessibilityRole="button" accessibilityLabel="关闭工时明细" onPress={onClose} style={s.close}><Text style={s.closeText}>关闭</Text></Pressable></View>
  <Text style={s.dialogTotal}>{balanceText(summary.raw[selected],summary.deductions[selected],summary.remaining[selected])} 小时</Text>
  {summary.deductions[selected]>0&&<Text style={s.hint}>原工时 − 调休 = 剩余工时；调休在该倍率内按日期从早到晚扣除。</Text>}
  <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
   {!entries.length&&<Text style={s.empty}>本月没有{labels[selected]}记录。</Text>}
   {entries.map((entry:any)=><View key={entry.record.date} style={s.detailRow}><View style={s.heading}><Text style={s.date}>{entry.record.date}</Text><Text style={s.detailHours}>{balanceText(entry.record.hours[selected],entry.deductions[selected],entry.remaining[selected])} h</Text></View><Text style={s.hint}>当天总工时 {entry.record.total} h</Text><Text style={s.hint}>正常 {entry.record.hours[0]} · 1.5倍 {entry.record.hours[1]} · 2倍 {entry.record.hours[2]} · 3倍 {entry.record.hours[3]}</Text>{!!entry.record.note&&<Text style={s.hint}>{entry.record.note}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`查看或修改 ${entry.record.date} 记录`} onPress={()=>onEdit(entry.record)} style={s.edit}><Text style={s.editText}>查看 / 修改这一天 {'>'}</Text></Pressable></View>)}
  </ScrollView>
 </View></View></Modal>;
}
const s=StyleSheet.create({
 summary:{gap:14},leaveBox:{backgroundColor:'#f6f8f3',padding:14,borderRadius:14,gap:9},label:{fontSize:13,fontWeight:'600',color:'#526b5b'},inputRow:{flexDirection:'row',gap:10,alignItems:'center'},input:{flex:1,minWidth:0,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#dce7d9',padding:12,fontSize:18,color:'#294a38'},save:{backgroundColor:'#16765f',paddingVertical:14,paddingHorizontal:15,borderRadius:10},saveText:{color:'#fff',fontWeight:'700',fontSize:13},hint:{fontSize:12,color:'#7a8b7e',lineHeight:20},feedback:{fontSize:12,color:'#8b632b',lineHeight:20},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},stat:{width:'47%',backgroundColor:'#f4f7f1',padding:12,borderRadius:12,gap:6},heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:6},arrow:{fontSize:18,fontWeight:'700',color:'#69957a'},number:{fontSize:23,fontWeight:'700',color:'#345d43'},equation:{fontSize:18,lineHeight:25},unit:{fontSize:10,color:'#8c9b8c',lineHeight:15},warning:{fontSize:12,color:'#8b632b',backgroundColor:'#fff0d6',padding:12,borderRadius:12,lineHeight:20},overlay:{flex:1,backgroundColor:'rgba(18,39,28,0.45)',justifyContent:'center',alignItems:'center',padding:18},dialog:{width:'100%',maxWidth:610,maxHeight:'85%',backgroundColor:'#fff',borderRadius:22,padding:20,gap:10},dialogHeader:{flexDirection:'row',gap:10,alignItems:'center'},dialogTitle:{fontSize:21,fontWeight:'700',color:'#294a38'},close:{backgroundColor:'#edf4ee',borderRadius:10,padding:12},closeText:{fontSize:13,fontWeight:'700',color:'#166452'},dialogTotal:{fontSize:24,fontWeight:'800',color:'#176a56'},list:{flexShrink:1},listContent:{gap:12,paddingBottom:4},detailRow:{padding:14,borderRadius:14,backgroundColor:'#f6f8f3',gap:6},date:{fontSize:14,fontWeight:'600',color:'#365441'},detailHours:{fontSize:14,fontWeight:'700',color:'#176a56',flexShrink:1,textAlign:'right'},edit:{paddingTop:9},editText:{fontSize:12,fontWeight:'600',color:'#16765f'},empty:{fontSize:14,color:'#87978d',paddingVertical:30,textAlign:'center'}
});
