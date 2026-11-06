import React,{useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {normalizeTotalHours} from './domain';
import {widgets,type WidgetConfiguration} from './widgets';
import HourSlider from './hour-slider';
import {MIN_REFRESH_SECONDS,MAX_REFRESH_SECONDS,parseRefreshInterval} from './widget-interval.js';

export function WidgetSettings({busy,onSave,onDragChange}:{busy:boolean;onSave:(config:WidgetConfiguration)=>void;onDragChange:(dragging:boolean)=>void}) {
 const [config,setConfig]=useState<WidgetConfiguration|null>(null);
 const [intervalText,setIntervalText]=useState('0.1');
 const [error,setError]=useState('');
 useEffect(()=>{
  let mounted=true;
  if(!widgets){setError('请使用安卓 Alpha 安装包设置桌面小部件。');return;}
  widgets.getWidgetSettings().then(raw=>{if(mounted){const next=JSON.parse(raw) as WidgetConfiguration;setConfig(next);setIntervalText(String(next.intervalMicros/1_000_000));}})
   .catch(()=>{if(mounted)setError('无法读取桌面小部件设置。');});
  return()=>{mounted=false;};
 },[]);
 const save=()=>{
  if(!config)return;
  let presets:string[];
  try{
   presets=config.presets.map(value=>String(normalizeTotalHours(value)));
  }catch{setError('三个快记按钮均需填写 0–24 小时，最多两位小数。');return;}
  try{
   const intervalMicros=parseRefreshInterval(intervalText);
   setConfig({...config,presets,intervalMicros});
   setError('');
   onSave({presets,intervalMicros});
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 };
 let sliderValue=Math.round((config?.intervalMicros??100_000)/100_000);
 try{sliderValue=Math.round(parseRefreshInterval(intervalText)/100_000);}catch{/* Keep the last saved slider position while typing. */}
 return <View style={s.section}>
   <Text style={s.title}>桌面小部件</Text>
  {!!error&&<Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
  {config&&<>
   <Text style={s.label}>桌面快记 · 三个按钮</Text>
   <View style={s.row}>{config.presets.map((value,index)=><View style={s.field} key={index}><Text style={s.hint}>按钮 {index+1}（小时）</Text><TextInput accessibilityLabel={`快记按钮 ${index+1} 工时`} style={s.input} editable={!busy} value={value} keyboardType="decimal-pad" onChangeText={next=>setConfig(current=>current?{...current,presets:current.presets.map((v,i)=>i===index?next:v)}:current)}/></View>)}</View>
   <Text style={s.hint}>快记工时向下取到半小时。点桌面按钮预览工时，3 秒内再点同一按钮保存。</Text>
   <Text style={s.label}>今日已赚 · 实时刷新</Text>
   <Text style={s.hint}>上下班时间和休息时段在「工时规则」设置。</Text>
   <Text style={s.label}>刷新间隔（秒）</Text>
   <View style={s.intervalRow}>
    <View style={s.intervalSlider}>
     <HourSlider value={sliderValue} min={0} max={MAX_REFRESH_SECONDS*10} step={1} label="实时刷新间隔滑块" unit="档" disabled={busy}
      onChange={value=>{setIntervalText(value===0?String(MIN_REFRESH_SECONDS):(value/10).toFixed(1));setError('');}} onDragChange={onDragChange}/>
     <View style={s.endpoints}><Text style={s.hint}>0.01 秒</Text><Text style={s.hint}>3 秒</Text></View>
    </View>
    <TextInput accessibilityLabel="刷新间隔（秒）" style={[s.input,s.intervalInput]} editable={!busy} value={intervalText} keyboardType="decimal-pad" onChangeText={value=>{setIntervalText(value);setError('');}}/>
   </View>
   <Text style={s.hint}>最左是 0.01 秒最快档，其余每格 0.1 秒。也可手输四位小数，例如 0.0167 秒。</Text>
   <Text style={s.hint}>桌面可分别添加「快记」和「今日已赚」，也可添加 4×2 的「快记与收入」。点金额区开启实时模式；息屏暂停刷新，亮屏按实际时间重算并恢复。</Text>
   <Pressable accessibilityRole="button" disabled={busy} style={[s.choice,s.selected]} onPress={save}><Text style={[s.choiceText,s.selectedText]}>保存小部件设置</Text></Pressable>
  </>}
 </View>;
}
const s=StyleSheet.create({
 section:{padding:16,gap:10,backgroundColor:'#fff',borderRadius:16},title:{fontSize:17,fontWeight:'700',color:'#294a38'},
 row:{flexDirection:'row',gap:8},field:{flex:1,minWidth:0,gap:4},label:{fontSize:13,fontWeight:'600',color:'#526b5b'},
 input:{borderWidth:1,borderColor:'#dce7d9',backgroundColor:'#f5f7f3',padding:10,borderRadius:10,color:'#294a38'},
 hint:{fontSize:12,color:'#617568',lineHeight:18},error:{color:'#a04326',fontSize:13},
 intervalRow:{flexDirection:'row',alignItems:'center',gap:10},intervalSlider:{flex:1,minWidth:0},endpoints:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:5},intervalInput:{width:82,textAlign:'center'},
 choice:{flexGrow:1,backgroundColor:'#edf4ee',borderRadius:10,alignItems:'center',padding:11},choiceText:{color:'#166452',fontWeight:'700',fontSize:13},
 selected:{backgroundColor:'#16765f'},selectedText:{color:'#fff'},
});
