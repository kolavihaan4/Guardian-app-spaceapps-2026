export const VITAL_CHOICES = [
  {key:'heartRate',label:'Heart rate',unit:'beats per minute',description:'How many times your heart beats in a minute.'},
  {key:'bloodPressure',label:'Blood pressure',unit:'mmHg',description:'Two readings: the top number is pressure during a beat, and the bottom number is pressure between beats.'},
  {key:'temperature',label:'Temperature',unit:'°C',description:'Your recorded temperature in degrees Celsius.'},
  {key:'sleep',label:'Sleep',unit:'minutes',description:'How long you slept. For example, 480 minutes is 8 hours.'},
  {key:'mood',label:'Mood',unit:'',description:'Your own words about how you felt. Each dot is an entry; moods are not given a health score.'},
  {key:'respirationRate',label:'Breathing rate',unit:'breaths per minute',description:'How many breaths you take in a minute.'},
  {key:'oxygenSaturation',label:'Blood oxygen',unit:'%',description:'The oxygen percentage you recorded with your sensor.'},
] as const
export type VitalKey = typeof VITAL_CHOICES[number]['key']
export interface CardReading {id:string;title:string;time:number;value?:number;top?:number;bottom?:number;mood?:string}
const labels: Record<VitalKey,string> = {heartRate:'Heart rate',bloodPressure:'Blood pressure',temperature:'Temperature',sleep:'Sleep',mood:'Mood',respirationRate:'Respiration rate',oxygenSaturation:'Oxygen saturation'}
/** Only recorded card values are plotted. Blank, malformed and unsupported units are excluded. */
export function cardReadings(cards:Record<string,unknown>[], key:VitalKey):CardReading[] {
  return cards.flatMap<CardReading>(card=>{
    const time=typeof card.createdAt==='number'?card.createdAt:Date.parse(String(card.createdAt??''))
    if(!Number.isFinite(time))return []
    const values=card.vitals as Record<string,{value?:unknown;unit?:unknown}>|undefined
    let item=values?.[key]
    if(!values && typeof card.notes==='string'){
      const line=card.notes.split('\n').find(row=>row.toLowerCase().startsWith(labels[key].toLowerCase()+':'))
      if(line){const raw=line.slice(line.indexOf(':')+1).trim(); const m=/^(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)(.*)$/.exec(raw);item=key==='mood'?{value:raw,unit:''}:m?{value:m[1],unit:m[2]?.trim()}:undefined}
    }
    if(item?.value===undefined || item.value===null || String(item.value).trim()==='')return []
    const row:CardReading={id:String(card.id),title:String(card.title??'Saved card'),time}
    if(key==='mood')return typeof item.value==='string'?[{...row,mood:item.value}]:[]
    const unit=String(item.unit??'').toLowerCase().replace(/\s/g,'')
    if(key==='bloodPressure'){
      if(!['mm/hg','mmhg',''].includes(unit))return []
      const parts=/^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(String(item.value))
      return parts?[{...row,top:Number(parts[1]),bottom:Number(parts[2])}]:[]
    }
    const n=Number(item.value); if(!Number.isFinite(n))return []
    if(key==='temperature' && !['c','°c','celsius','celcius',''].includes(unit))return []
    if(key==='sleep' && !['minutes','minute','min','hours','hour','h',''].includes(unit))return []
    if(key==='oxygenSaturation' && !['percentage','%','percent',''].includes(unit))return []
    if(key==='heartRate' && !['beatsperminute','beats/min','bpm',''].includes(unit))return []
    if(key==='respirationRate' && !['respirationsperminute','breathsperminute','breaths/min','br/min',''].includes(unit))return []
    const value=key==='sleep'&&['hours','hour','h'].includes(unit)?n*60:n
    return value<0&&key!=='temperature'?[]:[{...row,value}]
  }).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id))
}
