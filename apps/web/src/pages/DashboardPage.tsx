import '../user-vitals.css'
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, ErrorNote, Loading, useAsync, VitalsTabs } from '../components/common'
import { auth } from '../lib/auth'
import { cardReadings, VITAL_CHOICES, type VitalKey } from '../lib/cardVitals'

const dateLabel=(time:number)=>new Date(time).toLocaleDateString(undefined,{month:'short',day:'numeric'})
const fullDate=(time:number)=>new Date(time).toLocaleString()
export function DashboardPage(){
  const [key,setKey]=useState<VitalKey>('heartRate')
  useEffect(()=>{const previous=document.title;document.title='User vitals · Guardian';return()=>{document.title=previous}},[])
  const cards=useAsync(()=>auth.cards(),[])
  useEffect(()=>{const refresh=()=>cards.reload();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[cards.reload])
  const choice=VITAL_CHOICES.find(v=>v.key===key)!
  const rows=useMemo(()=>cardReadings(cards.data??[],key),[cards.data,key])
  const newest=rows.at(-1)
  const value=(row:typeof newest)=>!row?'—':key==='bloodPressure'?`${row.top}/${row.bottom}`:key==='mood'?row.mood:String(row.value)
  return <div className="user-vitals">
    <VitalsTabs current="dashboard"/>
    <header className="user-vitals-head"><div><p className="user-vitals-kicker">YOUR SAVED READINGS</p><h1>User vitals</h1><p>See how your readings change over time, using the cards saved to your account.</p></div><a className="button primary" href="/home/index.html#/dashboard">Log a reading</a></header>
    <Card title="Your readings over time" actions={<button type="button" onClick={cards.reload} disabled={cards.loading}>Refresh</button>}>
      <div className="user-vitals-controls"><label htmlFor="vital-choice">Which vital would you like to see?<select id="vital-choice" value={key} onChange={e=>setKey(e.target.value as VitalKey)}>{VITAL_CHOICES.map(v=><option value={v.key} key={v.key}>{v.label}</option>)}</select></label><p>{choice.description}</p></div>
      {cards.error?<ErrorNote error={new Error('Your cards could not be loaded. Please try again.')} retry={cards.reload}/>:null}
      {cards.loading&&!cards.data?<Loading what="your saved readings"/>:null}
      {cards.data&&!cards.error?<><div className="user-vitals-summary"><div><span>Latest {choice.label.toLowerCase()}</span><strong>{value(newest)} <small>{newest?choice.unit:''}</small></strong><span>{newest?fullDate(newest.time):'No saved reading yet'}</span></div><div><span>Saved entries</span><strong>{rows.length}</strong><span>Each dot comes from one card.</span></div></div>
      {rows.length?<><p className="user-vitals-explain">Read left to right to follow the dates.{key==='bloodPressure'?' Blue shows the top number; green shows the bottom number.':key==='mood'?' Each row shows the mood you wrote.':' Higher points mean a higher recorded value.'} Select a dot to see its reading.</p>
      <div className="user-vitals-chart" key={key} role="img" aria-label={`${choice.label} from ${rows.length} saved cards`}>
        <ResponsiveContainer>{key==='mood'?<ScatterChart margin={{top:16,right:24,bottom:20,left:8}}><CartesianGrid stroke="var(--grid)"/><XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} tickFormatter={dateLabel} minTickGap={45}/><YAxis dataKey="mood" type="category" allowDuplicatedCategory={false} width={100} tick={{fontSize:11}}/><Tooltip cursor={false} content={({payload})=>{const row=payload?.[0]?.payload;return row?<div className="user-vitals-tooltip"><strong>{row.mood}</strong><div>{fullDate(row.time)}</div><small>{row.title}</small></div>:null}}/><Scatter data={rows} fill="var(--accent)" isAnimationActive={false}/></ScatterChart>:<LineChart data={rows} margin={{top:16,right:24,bottom:20,left:8}}><CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} tickFormatter={dateLabel} minTickGap={45} tick={{fontSize:11}}/><YAxis width={50} domain={['auto','auto']} tick={{fontSize:11}}/><Tooltip labelFormatter={t=>fullDate(Number(t))} formatter={(v,name)=>[`${v} ${choice.unit}`,name]} contentStyle={{background:'#fff',borderRadius:10,border:'1px solid var(--border)'}}/>{(key==='bloodPressure'?['top','bottom']:['value']).map((field,i)=><Line key={field} dataKey={field} name={field==='top'?'Top number':field==='bottom'?'Bottom number':choice.label} type="linear" stroke={i?'#27896b':'#2a78d6'} strokeWidth={2} dot={{r:4,strokeWidth:2,fill:'#fff'}} activeDot={{r:6}} connectNulls={false} isAnimationActive={false}/>)}</LineChart>}</ResponsiveContainer>
      </div><div className="user-vitals-axis"><span>Dates of your saved cards →</span><span>{choice.unit? `Values in ${choice.unit}`:'Your mood descriptions'}</span></div>
      {rows.length===1?<p className="user-vitals-note">You have one reading. Save another card to see how it changes.</p>:null}
      <details className="user-vitals-table"><summary>See the exact readings</summary><div className="table-wrap"><table className="data"><thead><tr><th>Date and time</th><th>{choice.label}</th><th>Card</th></tr></thead><tbody>{[...rows].reverse().map(r=><tr key={r.id}><td>{fullDate(r.time)}</td><td>{value(r)} {choice.unit}</td><td>{r.title}</td></tr>)}</tbody></table></div></details></>:<div className="user-vitals-empty"><h2>No {choice.label.toLowerCase()} readings yet</h2><p>Choose another vital above, or save a card with this reading to start your graph.</p><a href="/home/index.html#/dashboard">Go to Log vitals →</a></div>}
      <p className="user-vitals-note">Only saved card readings are shown. Missing or unsupported values are left out. Lines join recorded entries; they do not show measurements between them. <a href="/home/index.html#/cards">View or edit your cards</a>.</p></>:null}
    </Card>
  </div>
}
