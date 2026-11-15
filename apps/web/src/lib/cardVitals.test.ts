import { describe, expect, it } from 'vitest'
import { cardReadings } from './cardVitals'
const card=(id:string,createdAt:number,vitals:Record<string,unknown>)=>({id,createdAt,title:id,vitals})
describe('saved card readings',()=>{
 it('orders actual readings and keeps separate cards at the same time',()=>{
  const rows=cardReadings([card('b',200,{heartRate:{value:72,unit:'Beats Per Minute'}}),card('a',100,{heartRate:{value:68,unit:'bpm'}}),card('c',200,{heartRate:{value:74,unit:'bpm'}})],'heartRate')
  expect(rows.map(r=>r.value)).toEqual([68,72,74])
 })
 it('shows both blood pressure numbers without averaging them',()=>{
  expect(cardReadings([card('a',100,{bloodPressure:{value:'120/80',unit:'mm/Hg'}})],'bloodPressure')[0]).toMatchObject({top:120,bottom:80})
 })
 it('keeps missing and malformed data out instead of creating zero readings',()=>{
  expect(cardReadings([card('a',100,{}),card('b',100,{heartRate:{value:'',unit:'bpm'}}),card('c',100,{heartRate:{value:'wrong',unit:'bpm'}}),card('d',100,{heartRate:{value:12,unit:'kg'}})],'heartRate')).toEqual([])
 })
 it('keeps moods as words, converts known sleep units and rejects Fahrenheit',()=>{
  expect(cardReadings([card('a',100,{mood:{value:'Calm',unit:''}})],'mood')[0]?.mood).toBe('Calm')
  expect(cardReadings([card('a',100,{sleep:{value:8,unit:'hours'}})],'sleep')[0]?.value).toBe(480)
  expect(cardReadings([card('a',100,{temperature:{value:98,unit:'F'}})],'temperature')).toEqual([])
 })
 it('reads older labelled notes and skips cards without dates',()=>{
  expect(cardReadings([{id:'a',createdAt:'2026-11-15T12:00:00Z',notes:'Heart rate: 75 Beats Per Minute\nSleep: 480 Minutes'}, {notes:'Heart rate: 1 bpm'}],'heartRate').map(r=>r.value)).toEqual([75])
 })
})
