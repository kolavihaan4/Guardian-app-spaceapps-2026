import type { BodyRegionId, MissionEnvironmentId } from '@astrovitals/shared'

export const REGION_COPY: Record<BodyRegionId, { name: string; summary: string; risks: string[] }> = {
  head_neuro: { name: 'Head and balance', summary: 'This area helps you think, keep your balance and sleep.', risks: ['Fluid moving toward the head can cause pressure or a blocked nose.', 'A buildup of carbon dioxide in cabin air can cause headaches.', 'Changing gravity can make you feel dizzy or unsure which way is up.'] },
  eyes_sans: { name: 'Eyes and vision', summary: 'Fluid moving toward the head in space can affect the eyes and how clearly you see.', risks: ['Spaceflight can change vision. These changes are sometimes called SANS.', 'Swelling can affect the nerve that carries signals from the eye to the brain.', 'Changes in the shape of the eye can make nearby objects harder to see.'] },
  chest_cardio: { name: 'Chest, heart and lungs', summary: 'Your heart moves blood around the body. Your lungs bring oxygen in and remove carbon dioxide.', risks: ['The heart and muscles can become less fit in weightlessness.', 'Blood pressure may adjust more slowly when you return to gravity, causing dizziness.', 'Cabin particles or Moon and Mars dust can irritate breathing passages.'] },
  abdomen_nutrition: { name: 'Stomach and kidneys', summary: 'This area helps digest food, manage blood sugar and filter waste from the blood.', risks: ['Changes in calcium and too little water can increase the chance of kidney stones.', 'The body may handle blood sugar differently in space.', 'Digestion can slow down, and dehydration can make problems worse.'] },
  spine_bone: { name: 'Back and bones', summary: 'Your spine supports your back. Bones can lose strength when they carry less weight in space.', risks: ['The spine can stretch in weightlessness, causing lower-back discomfort.', 'Bones in the back, hips and legs can lose minerals and weaken.', 'The cushions between spinal bones can be more vulnerable when returning to gravity.'] },
  upper_limbs: { name: 'Shoulders, arms and hands', summary: 'You use these areas to move around, hold tools and work in a spacesuit.', risks: ['Spacesuit work can put pressure on the shoulders.', 'Hands and arms can tire, and spacewalks can damage fingernails.', 'A wrist sensor can loosen as fluid shifts away from the arms.'] },
  lower_limbs: { name: 'Legs and hips', summary: 'These muscles help you stand and move. They do less work in weightlessness.', risks: ['Leg muscles can weaken without regular exercise.', 'Legs can become thinner as fluid moves toward the upper body.', 'Slower blood flow and weaker muscles can make returning to gravity harder.'] },
}

export const LOCATION_COPY: Record<MissionEnvironmentId, { name: string; gravity: string; summary: string }> = {
  iss_leo: { name: 'Space station', gravity: 'Weightless', summary: 'Fluid moves toward the head and chest in weightlessness. This can affect the eyes and make standing harder after returning to Earth.' },
  lunar_base: { name: 'Moon', gravity: 'About one-sixth of Earth’s gravity', summary: 'Gravity is weaker here. Working in a spacesuit can be tiring, and dust can irritate breathing passages.' },
  deep_space_transit: { name: 'Spacecraft', gravity: 'Weightless', summary: 'Long trips mean weightlessness, limited space and slow messages to Earth. The crew needs to handle more tasks on its own.' },
  mars_surface: { name: 'Mars', gravity: 'About three-eighths of Earth’s gravity', summary: 'After a long weightless journey, the body must adjust to gravity again. Balance, blood pressure and weakened muscles all need attention.' },
  eva_spacewalk: { name: 'Spacewalk', gravity: 'Depends on the mission location', summary: 'Working in a spacesuit takes effort. Heart rate, temperature and breathing can rise, and movement can disturb a sensor.' },
  earth_preflight: { name: 'Earth', gravity: 'Normal Earth gravity', summary: 'Readings taken before flight help show what is usual for this person and give the crew something to compare with later.' },
}

export const TOOL_LABELS: Record<string, string> = {
  'Pulse Oximeter': 'Finger oxygen and pulse reader',
  'Blood Pressure Cuff': 'Blood pressure cuff',
  Glucometer: 'Blood sugar meter',
  Thermometer: 'Thermometer',
  'Portable Ultrasound': 'Portable ultrasound scanner',
  'Eye Exam Kit (Fundoscope & Amsler)': 'Eye-check kit and vision grid',
  'ARED Resistive Exercise System': 'Strength exercise machine (ARED)',
  'Cycle Ergometer': 'Exercise bike',
  'Hydration & Electrolyte Pack': 'Water and body-salt pack',
  'Sleep & Circadian Light Mask': 'Sleep and light-control mask',
  'Cabin CO2 & Air Monitor': 'Cabin air and carbon dioxide monitor',
}

// Presentation only: preserve every number, warning, qualification and API value.
const WORDS: [string, string][] = [
  ['Sensor placement verified by crew; readings are evaluated directly against personal preflight median and habitat norms.', 'The crew has checked the sensor fit. Readings are compared with this person’s usual readings and the mission’s reference information.'],
  ['Normal circadian variation and expected physiological adaptation to current mission environment', 'Normal changes over the day and the body adjusting to the mission location'],
  ['Confirming routine autonomous check-in: how is your energy and hydration level ahead of your next scheduled mission task?', 'Before your next task, how is your energy level, and have you had enough water?'],
  ['Reduced baroreflex sensitivity; cephalad venous stasis', 'Blood pressure may adjust more slowly, and blood flow from the head may slow down'],
  ['Long-duration 0g deconditioning combined with Galactic Cosmic Rays (GCR), strict confinement, and delayed Ground Support requires high crew autonomy.', 'On a long weightless trip, the body can lose strength. Space radiation, limited living space and slow replies from Earth mean the crew must handle more tasks on its own.'],
  ['Microgravity plasma volume reduction, mild dehydration, or post-exercise thermal load', 'Less fluid in the blood during weightlessness, mild dehydration, or warming up after exercise'],
  ['Cephalad fluid shift increasing intracranial/ocular venous pressure (SANS pathway)', 'Fluid moving toward the head may raise pressure around the eyes and affect vision (SANS)'],
  ['Spaceflight subclinical insulin resistance or recent high-glycemic ration intake', 'Changes in how the body handles blood sugar, or a recent meal that raises blood sugar quickly'],
  ['Circadian slam-shift, habitat acoustic noise, or confinement fatigue', 'A disrupted sleep schedule, cabin noise, or tiredness from living in a small space'],
  ['Loose optical wrist sensor strap or motion artifact during crew tasks', 'A loose wrist sensor or movement affecting the reading'],
  ['NOMINAL WORKOUT:', 'REGULAR WORKOUT:'],
  ['Cleared for full scheduled countermeasure block', 'Follow the full scheduled exercise session'],
  ['personal preflight median', 'usual reading before flight'],
  ['preflight median', 'usual reading before flight'],
  ['baseline telemetry', 'usual health readings'],
  ['standard sensor telemetry', 'sensor readings'],
  ['sensor telemetry', 'sensor readings'],
  ['sensor placement', 'sensor fit'],
  ['single-metric spikes', 'a sudden change in one reading'],
  ['microgravity', 'weightlessness'],
  ['cephalad', 'toward the head'],
  ['intracranial', 'inside the skull'],
  ['ocular', 'eye'],
  ['renal', 'kidney'],
  ['cardiovascular', 'heart and blood-vessel'],
  ['orthostatic', 'after standing'],
  ['systolic', 'top number'],
  ['diastolic', 'bottom number'],
  ['glycemic', 'blood-sugar'],
  ['circadian', 'sleep-wake'],
  ['physiological', 'body'],
  ['venous', 'vein'],
  ['countermeasure', 'health-support'],
  ['resistive loading', 'strength exercise'],
  ['aerobic', 'heart-and-lung exercise'],
  ['ergometer', 'exercise bike'],
  ['dosimetry', 'a radiation-dose monitor'],
  ['telemetry packet', 'readings'],
  ['telemetry', 'readings'],
  ['habitat', 'living area'],
  ['comms', 'messages'],
  ['norms', 'reference ranges'],
  ['glucose', 'blood sugar'],
  ['SpO2', 'blood oxygen'],
  ['HRV', 'changes in time between heartbeats'],
  ['HR', 'heart rate'],
  ['BP', 'blood pressure'],
  ['RR', 'breathing rate'],
  ['br/min', 'breaths/min'],
  ['bpm', 'beats/min'],
  ['temp', 'temperature'],
]
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const replacements = WORDS.map(([from, to]) => [new RegExp('\\b' + escaped(from) + (/[a-z0-9]$/i.test(from) ? '\\b' : ''), 'gi'), to] as const)
export function plainHealthText(text: string | null | undefined) {
  return replacements.reduce((out, [pattern, to]) => out.replace(pattern, to), text ?? '')
}
