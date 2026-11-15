import { Card } from './common'

// Short paraphrases of NASA HRP's five hazards. Reference summaries, not live readings.
const HAZARDS = [
  {
    title: 'Space radiation',
    summary: 'Invisible, high-energy particles can harm the body. Beyond Earth’s protection, crews face more radiation from the Sun and deep space.',
    support: 'Shielding and space-weather monitoring help protect the crew.',
    url: 'https://www.nasa.gov/hrp/hazard-space-radiation/',
  },
  {
    title: 'Isolation and confinement',
    summary: 'Living far from family in a small space can affect sleep, mood and teamwork, especially on a long mission.',
    support: 'Routines, rest and support from others help crews stay connected.',
    url: 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/',
  },
  {
    title: 'Distance from Earth',
    summary: 'The farther crews travel, the longer messages and supplies take to arrive. Quick help from Earth may not be possible.',
    support: 'Crews need supplies, training and tools to solve problems themselves.',
    url: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/',
  },
  {
    title: 'Gravity fields',
    summary: 'Different levels of gravity change how the body works. In weightlessness, muscles and bones weaken and body fluids shift toward the head.',
    support: 'Exercise helps crews adapt during flight and after returning home.',
    url: 'https://www.nasa.gov/hrp/hazard-gravity-fields/',
  },
  {
    title: 'Hostile and closed environments',
    summary: 'A spacecraft must keep its air, water, temperature and pressure safe. Germs, noise and poor lighting can also affect the crew.',
    support: 'Life-support systems and regular checks keep the cabin livable.',
    url: 'https://www.nasa.gov/hrp/hazard-hostile-closed-environments/',
  },
]

export function HazardCards() {
  return (
    <div className="hazard-grid">
      {HAZARDS.map((hazard, i) => (
        <Card key={hazard.title} title={<><span className="hazard-number" aria-hidden="true">0{i + 1}</span>{hazard.title}</>}>
          <p className="hazard-summary">{hazard.summary}</p>
          <p className="hazard-support">{hazard.support}</p>
          <a className="hazard-source" href={hazard.url} target="_blank" rel="noreferrer" aria-label={`Read NASA’s explanation of ${hazard.title.toLowerCase()}`}>Explore at NASA <span aria-hidden="true">↗</span></a>
        </Card>
      ))}
    </div>
  )
}
