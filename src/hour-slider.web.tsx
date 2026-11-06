import React from 'react';
import type {HourSliderProps} from './hour-slider';

export default function HourSlider({value,onChange,min=0,max=12,step=.5,label='总工时滑块',unit='小时',disabled=false}:HourSliderProps) {
 return <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
  aria-label={label} aria-valuetext={`${value} ${unit}`}
  onChange={event=>onChange(event.currentTarget.valueAsNumber)}
  style={{width:'100%',minWidth:0,height:44,margin:0,accentColor:'#16765f'}}/>;
}
