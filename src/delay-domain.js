import {units, validDate, DEFAULT_SETTINGS, normalizeDelayCategory, normalizeParty, validateDelay, validateDelayCategories, validateDelays} from './domain.js';

// Abnormal (delay) hours are a separate log: they never feed into work hours or pay.
export {normalizeDelayCategory, normalizeParty, validateDelay, validateDelayCategories, validateDelays};
export const DEFAULT_DELAY_CATEGORIES = DEFAULT_SETTINGS.delayCategories;
export const NO_PARTY = '未指定';
export function newDelayId(now = Date.now(), random = Math.random) {
  return `d${now.toString(36)}${Math.floor(random()*1e8).toString(36)}`;
}

const byDate = (a,b)=>a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
export function saveDelay(list, entry) {
  const next = validateDelays([...list.filter(d=>d.id!==entry.id), entry], false);
  return next.sort((a,b)=>byDate(b,a));
}
export function removeDelay(list, id) {
  return list.filter(d=>d.id!==id);
}
export function delaysOn(list, date) {
  return list.filter(d=>d.date===date).sort(byDate);
}
// Most used first, then most recent, so frequent names stay one tap away.
function suggestions(list, values) {
  const stats = new Map();
  for (const entry of list) for (const value of values(entry)) {
    if (!value) continue;
    const s = stats.get(value) ?? {value,count:0,last:''};
    s.count++; if (entry.date>s.last) s.last=entry.date;
    stats.set(value,s);
  }
  return [...stats.values()].sort((a,b)=>b.count-a.count || b.last.localeCompare(a.last) || a.value.localeCompare(b.value,'zh-CN')).map(s=>s.value);
}
export const knownParties = list => suggestions(list, d=>d.parties);
export const knownDevices = list => suggestions(list, d=>[d.device]);
export const knownOrders = list => suggestions(list, d=>[d.orderNo]);

const toHours = n => n/100;
function group(entries, keys) {
  const map = new Map();
  for (const entry of entries) for (const name of keys(entry)) {
    const g = map.get(name) ?? {name,hours:0,count:0};
    g.hours += units(entry.hours); g.count++;
    map.set(name,g);
  }
  return [...map.values()].sort((a,b)=>b.hours-a.hours || b.count-a.count || a.name.localeCompare(b.name,'zh-CN')).map(g=>({...g,hours:toHours(g.hours)}));
}
export function monthlyDelays(list, month) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw new Error('月份无效');
  const entries = list.filter(d=>d.date.startsWith(`${month}-`)).sort(byDate);
  return {
    month,
    entries,
    count: entries.length,
    days: new Set(entries.map(d=>d.date)).size,
    hours: toHours(entries.reduce((sum,d)=>sum+units(d.hours),0)),
    byParty: group(entries, d=>d.parties.length?d.parties:[NO_PARTY]),
    byCategory: group(entries, d=>[d.category]),
    byDevice: group(entries, d=>[d.device||'未填写设备']),
    byOrder: group(entries, d=>[d.orderNo||'未填写订单']),
  };
}
const h = value => `${Number(value.toFixed(2))}h`;
const list = groups => groups.map(g=>`${g.name} ${h(g.hours)}（${g.count} 次）`).join('，');
export function delaySummaryText(delays, month) {
  const s = monthlyDelays(delays, month);
  const [year, m] = month.split('-');
  const title = `${year}年${Number(m)}月`;
  if (!s.count) return `${title}无异常工时记录。`;
  const lines = [
    `${title}共记录异常工时 ${h(s.hours)}，${s.count} 次，涉及 ${s.days} 天。`,
    `按责任方：${list(s.byParty)}。`,
    `按原因：${list(s.byCategory)}。`,
  ];
  if (s.byParty.some(g=>g.name!==NO_PARTY) && s.entries.some(d=>d.parties.length>1)) lines.push('（同一条记录有多个责任方时，时长分别计入每个责任方。）');
  lines.push('', '明细：');
  for (const d of s.entries) {
    const head = [d.date.slice(5), d.orderNo&&`订单 ${d.orderNo}`, d.device].filter(Boolean).join(' ');
    const party = d.parties.length ? d.parties.join('、') : NO_PARTY;
    lines.push(`${head}｜${d.category}｜${party}｜${h(d.hours)}${d.note?`｜${d.note}`:''}`);
  }
  return lines.join('\n');
}
export function delayCsv(entries) {
  const cell = v => `"${String(v).replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')}"`;
  const sorted = [...entries].sort(byDate);
  const total = toHours(sorted.reduce((sum,d)=>sum+units(d.hours),0));
  const rows = [['日期','订单号','设备名称','耽误时长（小时）','原因分类','责任方','情况说明'],
    ...sorted.map(d=>[d.date,d.orderNo,d.device,d.hours,d.category,d.parties.join('、'),d.note]),
    ['合计','','',total,'','',`${sorted.length} 次`]];
  return '﻿'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
// Choices in the editor: the configured list, plus a deleted category an entry still uses.
export function delayCategoryOptions(categories, current) {
  const list = categories?.length ? categories : DEFAULT_DELAY_CATEGORIES;
  return current && !list.includes(current) ? [...list, current] : [...list];
}
// drafts: [{original, name}] where original is the saved name (null for a new row).
// Returns the cleaned list plus the renames to apply to existing records.
export function readDelayCategories(drafts) {
  const names = drafts.map(d=>normalizeDelayCategory(d.name));
  const categories = validateDelayCategories(names);
  const renames = Object.fromEntries(drafts.flatMap((d,i)=>
    d.original && d.original!==names[i] ? [[d.original,names[i]]] : []));
  return {categories, renames};
}
export function renameDelayCategories(delays, renames) {
  if (!Object.keys(renames).length) return delays;
  return delays.map(d=>Object.hasOwn(renames,d.category)?{...d,category:renames[d.category]}:d);
}
export const delayCategoryUsage = (delays, name) => delays.filter(d=>d.category===name).length;
