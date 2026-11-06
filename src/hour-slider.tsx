import React,{useEffect,useMemo,useRef} from 'react';
import {PanResponder,StyleSheet,View} from 'react-native';

export type HourSliderProps={value:number;onChange:(value:number)=>void;onDragChange:(dragging:boolean)=>void;min?:number;max?:number;step?:number;label?:string;unit?:string;disabled?:boolean};
const snap=(n:number,{min=0,max=12,step=.5}:HourSliderProps)=>
 Math.min(max,Math.max(min,Number((min+Math.round((n-min)/step)*step).toFixed(6))));

export default function HourSlider(props:HourSliderProps) {
 const latest=useRef(props);latest.current=props;
 const width=useRef(0),start=useRef(0),last=useRef(-1);
 const responder=useMemo(()=>{
  const update=(x:number)=>{
   if(width.current<=24)return;
   const {min=0,max=12}=latest.current;
   const value=snap(min+(x-12)/(width.current-24)*(max-min),latest.current);
   if(value!==last.current){last.current=value;latest.current.onChange(value);}
  };
  const end=()=>latest.current.onDragChange(false);
  return PanResponder.create({
   onStartShouldSetPanResponder:()=>!latest.current.disabled,
   onPanResponderGrant:e=>{start.current=e.nativeEvent.locationX;last.current=-1;latest.current.onDragChange(true);update(start.current);},
   onPanResponderMove:(_,gesture)=>update(start.current+gesture.dx),
   onPanResponderRelease:end,onPanResponderTerminate:end,
   onPanResponderTerminationRequest:()=>false,
  });
 },[]);
 useEffect(()=>()=>latest.current.onDragChange(false),[]);
 const {min=0,max=12,step=.5,label='总工时滑块',unit='小时',disabled=false}=props;
 const position=`${(snap(props.value,props)-min)/(max-min)*100}%` as const;
 return <View {...responder.panHandlers} style={s.touch} onLayout={e=>{width.current=e.nativeEvent.layout.width;}}
  accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityState={{disabled}}
  accessibilityValue={{min,max,now:props.value,text:`${props.value} ${unit}`}}
  accessibilityActions={[{name:'increment'},{name:'decrement'}]}
  onAccessibilityAction={e=>{if(!disabled)props.onChange(snap(props.value+(e.nativeEvent.actionName==='increment'?step:-step),props));}}>
  <View pointerEvents="none" style={s.track}>
   <View style={[s.fill,{width:position}]}/>
   <View style={[s.thumb,{left:position}]}/>
  </View>
 </View>;
}
const s=StyleSheet.create({
 touch:{width:'100%',height:44,justifyContent:'center',paddingHorizontal:12},
 track:{height:6,borderRadius:3,backgroundColor:'#dfe8dc'},
 fill:{height:6,borderRadius:3,backgroundColor:'#16765f'},
 thumb:{position:'absolute',top:-9,marginLeft:-12,width:24,height:24,borderRadius:12,backgroundColor:'#16765f',borderWidth:2,borderColor:'#fff'},
});
