import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRefreshInterval} from '../src/widget-interval.js';

test('实时刷新支持 0.01 秒最快档、手输四位小数与普通 0.1 秒档',()=>{
 for(const [input,micros] of [['0.01',10000],['.01',10000],['0.0167',16700],['0.1',100000],['0.25',250000],['3',3000000]]){
  assert.equal(parseRefreshInterval(input),micros);
 }
});
test('实时刷新不接受低于极限、超过范围或多于四位小数的输入',()=>{
 for(const input of ['0','0.0001','0.0099','0.01001','3.0001','-0.1','1e-2','','0.'])assert.throws(()=>parseRefreshInterval(input),/0\.01/);
});
