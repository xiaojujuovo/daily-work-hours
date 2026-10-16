import React,{useEffect,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import type {Data} from './storage';
import {comparisonCsv,monthlyComparison,shiftMonth,validMonth} from './comparison-domain.js';
import {exportFile} from './files';

function Action({text,onPress}:{text:string;onPress:()=>void}) {
 return <Pressable accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.actionText}>{text}</Text></Pressable>;
}
function MonthInput({label,value,onChange}:{label:string;value:string;onChange:(month:string)=>void}) {
 const move=(offset:number)=>{try{onChange(shiftMonth(value,offset));}catch{/* Invalid typed values stay editable. */}};
 return <View style={s.monthInput}><Text style={s.label}>{label}</Text><View style={s.monthControls}>
  <Pressable accessibilityRole="button" accessibilityLabel={`${label}上个月`} onPress={()=>move(-1)} style={s.arrow}><Text style={s.actionText}>‹</Text></Pressable>
  <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder="YYYY-MM" maxLength={7} style={s.input}/>
  <Pressable accessibilityRole="button" accessibilityLabel={`${label}下个月`} onPress={()=>move(1)} style={s.arrow}><Text style={s.actionText}>›</Text></Pressable>
 </View></View>;
}
const number=(value:number,money=false)=>money?value.toFixed(2):String(value);
export function MonthlyComparison({visible,month,data,onClose}:{visible:boolean;month:string;data:Data;onClose:()=>void}) {
 const [base,setBase]=useState(month),[target,setTarget]=useState(month),[adjusted,setAdjusted]=useState(false),[feedback,setFeedback]=useState('');
 const previous=()=>{try{setBase(shiftMonth(month,-1));}catch{setBase(month);}setTarget(month);setFeedback('');};
 useEffect(()=>{if(visible){previous();setAdjusted(false);}},[visible,month]);
 const result=validMonth(base)&&validMonth(target)?monthlyComparison(data,base,target,adjusted):null;
 const download=async()=>{if(!result)return;try{await exportFile(`月度对比-${base}-${target}.csv`,comparisonCsv(result),'text/csv');setFeedback('对比表格已导出');}catch(e){setFeedback(e instanceof Error?e.message:String(e));}};
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={s.overlay}><View style={s.dialog} accessibilityViewIsModal>
  <View style={s.heading}><View style={{flex:1}}><Text style={s.title}>月度对比</Text><Text style={s.hint}>选择两个月，看看付出和收入的变化</Text></View><Action text="关闭月度对比" onPress={onClose}/></View>
  <ScrollView style={{flexShrink:1}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
   <View style={s.months}><MonthInput label="基准月份" value={base} onChange={setBase}/><MonthInput label="对比月份" value={target} onChange={setTarget}/></View>
   <View style={s.shortcuts}><Action text="交换月份" onPress={()=>{setBase(target);setTarget(base);}}/><Action text="所选月与上月对比" onPress={previous}/></View>
   <View style={s.modes}>{[false,true].map(value=><Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{selected:adjusted===value}} accessibilityLabel={value?'比较调休后工时':'比较原始工时'} onPress={()=>setAdjusted(value)} style={[s.mode,adjusted===value&&s.active]}><Text style={[s.modeText,adjusted===value&&s.activeText]}>{value?'调休后工时':'原始工时'}</Text></Pressable>)}</View>
   {!result?<Text style={s.warning}>月份请填写 YYYY-MM，例如2026-10。</Text>:<>
    {base===target&&<Text style={s.hint}>当前选择相同月份，增减为0；可修改任一月份。</Text>}
    {result.emptyMonths.length>0&&<Text style={s.warning}>{[...new Set(result.emptyMonths)].join('、')} 无日记录；工时按0展示，工资仍计入已启用的工资条组成。</Text>}
    {result.excess.some((value:number)=>value>0)&&<Text style={s.warning}>存在未能抵扣的调休，已按实际可抵扣工时计算。可在对应月份调整调休。</Text>}
    <Text style={s.hint}>增减 = 对比月 − 基准月；百分比在基准大于0时显示。只统计已保存的日记录，未记录日期不算休息。</Text>
    {result.sections.map(section=><View key={section.title} style={s.section}><Text style={s.sectionTitle}>{section.title}</Text><View style={s.tableHeader}><Text style={[s.cell,s.metric]}>指标</Text><Text style={s.cell}>{base}</Text><Text style={s.cell}>{target}</Text><Text style={s.cell}>增减</Text></View>
     {section.rows.map(row=><View key={row.id} style={[s.row,row.id==='netPay'&&s.net]} accessibilityLabel={`${row.label}，基准${row.base}${row.unit}，对比${row.target}${row.unit}，增减${row.delta}${row.unit}`}>
      <Text style={[s.cell,s.metric]}>{row.label}<Text style={s.unit}>{'\n'}{row.unit}</Text></Text>
      <Text style={s.cell} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.65}>{number(row.base,row.unit==='元')}</Text>
      <Text style={s.cell} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.65}>{number(row.target,row.unit==='元')}</Text>
      <View style={s.delta}><Text style={[s.value,{color:row.delta>0?'#16765f':row.delta<0?'#a86432':'#7a8b7e'}]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.65}>{row.delta>0?'+':''}{number(row.delta,row.unit==='元')}</Text><Text style={s.unit}>{row.percent===null?'—':`${row.percent>0?'+':''}${row.percent}%`}</Text></View>
     </View>)}
    </View>)}
    <Text style={s.hint}>实际总工时始终保留原始值；倍率工时可切换原始/调休后。工资始终按调休后工时及各日保存的时薪计算，与月度合计一致。</Text>
    <Action text="导出月度对比表格" onPress={()=>void download()}/>
   </>}
   {!!feedback&&<Text accessibilityLiveRegion="polite" style={s.hint}>{feedback}</Text>}
  </ScrollView>
 </View></View></Modal>;
}
const s=StyleSheet.create({
 overlay:{flex:1,backgroundColor:'rgba(18,39,28,0.45)',alignItems:'center',justifyContent:'center',padding:12},dialog:{width:'100%',maxWidth:640,maxHeight:'92%',borderRadius:22,backgroundColor:'#fff',padding:16,gap:16},heading:{flexDirection:'row',alignItems:'center',gap:8},title:{fontSize:22,fontWeight:'800',color:'#294a38'},hint:{fontSize:12,color:'#7a8b7e',lineHeight:20},content:{gap:16,paddingBottom:8},action:{backgroundColor:'#edf4ee',borderRadius:10,padding:11,alignItems:'center'},actionText:{fontSize:12,fontWeight:'700',color:'#166452'},months:{flexDirection:'row',gap:10},monthInput:{flex:1,minWidth:0,gap:8},label:{fontSize:13,color:'#526b5b',fontWeight:'600'},monthControls:{flexDirection:'row',alignItems:'center',backgroundColor:'#f5f7f3',borderRadius:10,borderWidth:1,borderColor:'#e2e9de'},arrow:{paddingHorizontal:9,paddingVertical:13},input:{flex:1,minWidth:0,textAlign:'center',fontSize:14,color:'#294a38',paddingVertical:12},shortcuts:{flexDirection:'row',justifyContent:'space-between',gap:8},modes:{flexDirection:'row',gap:8},mode:{flex:1,padding:11,borderRadius:10,backgroundColor:'#edf4ee',alignItems:'center'},active:{backgroundColor:'#16765f'},modeText:{fontSize:13,color:'#526b5b',fontWeight:'600'},activeText:{color:'#fff'},warning:{padding:12,borderRadius:12,backgroundColor:'#fff0d6',fontSize:12,color:'#8b632b',lineHeight:20},section:{gap:6},sectionTitle:{fontSize:16,fontWeight:'700',color:'#294a38',marginBottom:6},tableHeader:{flexDirection:'row',paddingVertical:10,backgroundColor:'#edf4ee',borderRadius:8},row:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderBottomWidth:1,borderColor:'#edf1e9'},cell:{flex:1,minWidth:0,fontSize:12,textAlign:'center',color:'#365441',paddingHorizontal:2},metric:{flex:1.35,textAlign:'left',paddingLeft:6,fontWeight:'600'},delta:{flex:1,minWidth:0,alignItems:'center',paddingHorizontal:2,gap:4},value:{fontSize:12,fontWeight:'700'},unit:{fontSize:10,fontWeight:'400',color:'#8c9b8c',lineHeight:17},net:{backgroundColor:'#f3f8f1',borderRadius:10}
});
