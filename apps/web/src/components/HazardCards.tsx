import { Card } from './common'

interface Fact {
  text: string
  source: string
  url: string
}

/**
 * Three of NASA's five hazards of human spaceflight, each as short facts with the source they were
 * read from. Radiation is covered by the live panels on the same page, and isolation by the mood
 * notes on the Crew Triage page. Wording is paraphrased; the numbers are the sources' own.
 */
const HAZARDS: { title: string; summary: string; facts: Fact[] }[] = [
  {
    title: 'Distance from Earth',
    summary: 'Instructions, supplies and medical care get harder to receive the farther a crew travels, so the crew has to be self-sufficient.',
    facts: [
      { text: 'Mars is on average 140 million miles from Earth, and a Mars mission would last roughly three years.', source: 'NASA Human Research Program', url: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/' },
      { text: 'Messages to Mars take up to 22 minutes one way (44 minutes there and back at the greatest distance); lunar missions may see 3 to 14 seconds one way.', source: 'Karasinski et al. 2025, NASA NTRS 20250000703', url: 'https://ntrs.nasa.gov/citations/20250000703' },
      { text: 'Earth to Mars distance ranges from 54.6 to 401.4 million km.', source: 'NASA NSSDCA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
      { text: 'Private medical conferences are scheduled routinely; when messages are delayed, store-and-forward communication can be used instead of a live call.', source: 'NASA-STD-3001 Vol 1 [V1 6002]', url: 'https://www.nasa.gov/reference/6-0-medical-operations/' },
      { text: 'All crew health monitoring results are kept in a retrievable record, and handling, storage and transmission of those records must be secured.', source: 'NASA-STD-3001 Vol 1 [V1 7001, 7003]', url: 'https://www.nasa.gov/reference/7-0-crew-health-records/' },
      { text: 'In a ground habitat, up to two weeks of confinement did not impair thinking in 32 people, but one night without sleep reduced vigilance.', source: 'Nasrini et al. 2020, Front Physiol', url: 'https://doi.org/10.3389/fphys.2020.00394' },
      { text: 'In a 105-day simulated Mars mission (six men), fasting glucose rose from 85.2 to 98.4 mg/dL by 2.5 weeks.', source: 'Strollo et al. 2014, Aviat Space Environ Med (abstract)', url: 'https://doi.org/10.3357/ASEM.3907.2014' },
    ],
  },
  {
    title: 'Gravity Fields',
    summary: 'A Mars crew meets three gravity fields: weightlessness on the six-month trip, about one-third of Earth gravity on Mars, then Earth gravity again.',
    facts: [
      { text: 'Surface gravity is 0.165 of Earth on the Moon and 0.380 on Mars.', source: 'NASA NSSDCA Moon and Mars Fact Sheets', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' },
      { text: 'Weight-bearing bones lose on average 1% to 1.5% of mineral density per month in spaceflight.', source: 'NASA Human Research Program', url: 'https://www.nasa.gov/hrp/hazard-gravity-fields/' },
      { text: 'Fluids shift toward the head and may put pressure on the eyes; kidney stone risk rises with dehydration and calcium loss; lightheadedness and fainting can follow the return to gravity.', source: 'NASA Human Research Program', url: 'https://www.nasa.gov/hrp/hazard-gravity-fields/' },
      { text: 'Gravity below 0.4 g appears insufficient to maintain muscle, bone and heart-lung conditioning in the long term. No study was long-term.', source: 'Richter et al. 2017, Front Physiol', url: 'https://doi.org/10.3389/fphys.2017.00583' },
      { text: 'On standing, heart rate rose by about 21 bpm in lunar gravity, 23 in Mars gravity and 34 in Earth gravity (14 people, parabolic flight).', source: 'Beck et al. 2018, Clin Auton Res (abstract)', url: 'https://doi.org/10.1007/s10286-018-0527-x' },
      { text: 'After 85 to 192 days on the ISS, 24-hour blood pressure was 8 to 10 mmHg lower and heart rate unchanged (eight astronauts).', source: 'Norsk et al. 2015, J Physiol', url: 'https://doi.org/10.1113/jphysiol.2014.284869' },
      { text: 'In weightlessness, breathing rate rose 9% and the size of each breath fell 15% (eight people, 9 or 14 days).', source: 'Prisk et al. 1995, J Appl Physiol (abstract)', url: 'https://doi.org/10.1152/jappl.1995.79.4.1290' },
    ],
  },
  {
    title: 'Hostile / Closed Environments',
    summary: 'Inside a sealed vehicle the air, pressure, temperature, light, noise and microbes all have to be kept within safe limits.',
    facts: [
      { text: 'Cabin carbon dioxide is limited to a one-hour average of no more than 3 mmHg.', source: 'NASA-STD-3001 Vol 2 [V2 6004]', url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2' },
      { text: 'Crew reports link headaches to roughly 2.8 to 4.5 mmHg of CO2, and poor sleep with frontal headaches to 3.5 mmHg; 19 of 49 ISS astronauts reported headaches. NASA labels this evidence anecdotal.', source: 'NASA OCHMO-TB-004', url: 'https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/' },
      { text: 'The normal target for inspired oxygen is 145 to 155 mmHg; 127 mmHg (an exploration atmosphere of 8.2 psia and 34% oxygen) is allowed indefinitely with monitoring.', source: 'NASA-STD-3001 Vol 2, Table 6.2-1', url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2' },
      { text: 'At that lower oxygen level, astronauts’ SpO2 stayed at about 97% (eight astronauts).', source: 'Conkin et al. 2017, Aerosp Med Hum Perform (abstract)', url: 'https://doi.org/10.3357/AMHP.4804.2017' },
      { text: 'Cabin pressure is kept above 5 and up to 15 psia for indefinite exposure.', source: 'NASA-STD-3001 Vol 2 [V2 6006]', url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-3001_VOL_2' },
      { text: 'On six-month ISS missions astronauts slept about 6.5 hours; under 6 hours was linked to slower responses and more stress (24 astronauts).', source: 'Sleep 2022 (abstract)', url: 'https://doi.org/10.1093/sleep/zsac006' },
      { text: 'A pulse oximeter may read 2% to 4% higher or lower than the true blood oxygen level; poor circulation, skin pigmentation, cold skin and nail polish affect it.', source: 'MedlinePlus; US FDA', url: 'https://medlineplus.gov/lab-tests/pulse-oximetry/' },
    ],
  },
]

export function HazardCards() {
  return (
    <div className="hazard-grid">
      {HAZARDS.map((hazard) => (
        <Card key={hazard.title} title={hazard.title}>
          <p className="hazard-summary">{hazard.summary}</p>
          <ul className="hazard-facts">
            {hazard.facts.map((fact) => (
              <li key={fact.text}>
                {fact.text}{' '}
                <a href={fact.url} target="_blank" rel="noreferrer">
                  {fact.source}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
