import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import appConfig from '../app.json';

export const AUTHOR={name:'xiaojuju(化名)',contact:'2675590570'};
export const RELEASES=[
 {version:'1.5.0',date:'2026-10-11',changes:['工作日可指定超出正常门槛的工时为2倍。','自定义工资条收入和扣款，设置默认组成并独立修改每月内容。','月度更多设置、工资组成列表收起与展开。','当月一次套用当前工资设置，批量更新记录时薪。','新增关于、作者信息和历史版本更新说明。']},
 {version:'1.4.0',date:'2026-10-06',changes:['新增月度调休，按1.5、2、3倍工时顺序抵扣并同步计算工资。','工时合计可点击查看对应日记录明细。','备份、CSV导出包含月度调休和剩余工时。']},
 {version:'1.3.1',date:'2026-10-06',changes:['增加全天工资与加班工资计算范围选择。']},
 {version:'1.3.0',date:'2026-10-06',changes:['改进下班提醒安排，增加权限检查、即时测试和1分钟测试。']},
 {version:'1.2.0',date:'2026-10-06',changes:['月历显示休、正、早、加标记及对应颜色。','修改倍率工时自动调平，保持总工时不变。']},
 {version:'1.1.0',date:'2026-10-06',changes:['统计改为月历网格，0小时显示休息。']},
 {version:'1.0.0',date:'2026-10-06',changes:['每日工时、倍率分配、工资统计、本地备份及下班提醒。']}
];
export function About() {
 const [expanded,setExpanded]=useState(false);
 return <View style={s.card}><Text style={s.title}>关于每日工时</Text><Text selectable style={s.text}>作者：{AUTHOR.name||'暂未填写'}</Text><Text selectable style={s.text}>联系方式：{AUTHOR.contact||'暂未填写'}</Text><Text style={s.text}>当前版本：{appConfig.expo.version}</Text><Text style={s.hint}>记录和工资信息保存在本机。</Text><Pressable accessibilityRole="button" onPress={()=>setExpanded(!expanded)} style={s.toggle}><Text style={s.toggleText}>{expanded?'收起':'查看'}历史版本更新内容 {expanded?'⌃':'>'}</Text></Pressable>{expanded&&RELEASES.map(release=><View key={release.version} style={s.release}><Text style={s.version}>{release.version} · {release.date}</Text>{release.changes.map(change=><Text key={change} style={s.text}>· {change}</Text>)}</View>)}</View>;
}
const s=StyleSheet.create({card:{backgroundColor:'#fff',borderRadius:20,padding:20,gap:12,borderWidth:1,borderColor:'#e6ede5'},title:{fontSize:18,fontWeight:'700',color:'#294a38'},text:{fontSize:13,color:'#526b5b',lineHeight:21},hint:{fontSize:12,color:'#7a8b7e',lineHeight:20},toggle:{padding:12,backgroundColor:'#edf4ee',borderRadius:12},toggleText:{color:'#166452',fontWeight:'700',fontSize:13},release:{gap:6,paddingVertical:10,borderTopWidth:1,borderColor:'#e6ede5'},version:{fontSize:15,fontWeight:'700',color:'#294a38'}});
