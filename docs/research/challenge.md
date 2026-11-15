# Research: Official challenge page — "Create Health Monitoring Software for Astronauts on Space Missions" (NASA Space Apps 2026)

Key: `challenge` · Researched 2026-10-05 · All URLs below were opened on 2026-10-05 unless marked UNVERIFIED.

**Method note.** spaceappschallenge.org is a Next.js App Router site; WebFetch only sees the navigation shell. Every page was therefore downloaded with `curl -sL` and its React Server Components payload (`self.__next_f.push([1,"…"])` chunks) was JSON-decoded (`extract_rsc.js` in this folder). The challenge data lives in a `ChallengePage` object inside that payload; the raw page is saved as `challenge-page.html` and the decoded payload as `challenge-page.html.rsc.txt` next to this report. No NASA API was called and no samples were saved (per topic instructions).

**Headline findings (read these first)**

| # | Finding | Source |
|---|---------|--------|
| 1 | Only the challenge **summary** is published today. The page's `resourcesTabContent` field is an empty string, and there is no Background / Objectives / Potential Considerations / Resources content anywhere in the payload. | https://www.spaceappschallenge.org/2026/challenges/create-health-monitoring-software-for-astronauts-on-space-missions/ (accessed 2026-10-05) |
| 2 | The site-wide alert reads: "💡Challenge Summaries are now live! Explore the 14 challenges and form or join a team today." | same page, `siteAlert` object (accessed 2026-10-05) |
| 3 | The FAQ states the full **challenge statements "which include the full details, resources, and requirements"** are released **October 28**, and that **"Teams are not allowed to begin working on the challenges prior to the hackathon."** | https://www.spaceappschallenge.org/resources/participant-faqs/ (accessed 2026-10-05) |
| 4 | The 2026 **Judging and Awards Guide is not yet published** (guide URL returns the site's "Oops! Page Not Found" 404 fallback); FAQ says it becomes available **November 13**. | https://www.spaceappschallenge.org/resources/judging-awards-guide/ (accessed 2026-10-05, Next.js `NEXT_HTTP_ERROR_FALLBACK;404`); FAQ page above |
| 5 | Hackathon: **November 14–15, 2026**; project submission opens Sat Nov 14 9:00 AM and closes Sun Nov 15 11:59 PM local time. | https://www.spaceappschallenge.org/2026/ (accessed 2026-10-05); FAQ page above |

---

## Challenge text

### Verbatim content from the official page

| Field (payload key) | Value | Source |
|---|---|---|
| Title | "Create Health Monitoring Software for Astronauts on Space Missions" | challenge page, `ChallengePage.title` (accessed 2026-10-05) |
| Summary (`excerpt`) | "Long-duration missions expose astronauts to space radiation, isolation and confinement, altered gravity, and a hostile closed environment, which can bring immune changes, bone loss, cardiovascular events, and behavioral health problems. On long missions, astronauts carry much of the responsibility for spotting these changes in themselves. Your challenge is to build a health monitoring software that gathers health indicators and enables astronauts to evaluate and act on the status of their health." | challenge page, `ChallengePage.excerpt` (accessed 2026-10-05) |
| Details (`detailsContent`) | One `<p>` whose text is **identical** to the summary above. | challenge page, `ChallengePage.detailsContent` (accessed 2026-10-05) |
| Background | Not present in the payload (no such field or text). | challenge page (accessed 2026-10-05) |
| Objectives | Not present in the payload. | challenge page (accessed 2026-10-05) |
| Potential Considerations | Not present in the payload. | challenge page (accessed 2026-10-05) |
| Resources tab (`resourcesTabContent`) | `""` (empty string) | challenge page (accessed 2026-10-05) |
| Teams tab (`teamsTabContent`) | `""` (empty string); the page links to `…/?tab=teams` | challenge page (accessed 2026-10-05) |
| Difficulty (`categories[0].name`) | "Intermediate" (slug `intermediate`, color `#FF580A`) | challenge page (accessed 2026-10-05) |
| Subject/skill tags (`skills`) | "Human Exploration", "Software", "Space Exploration" | challenge page (accessed 2026-10-05) |
| Breadcrumb label | "Health-Monitoring-Software" | challenge page (accessed 2026-10-05) |
| Page meta | `type: "CHALLENGE"`, `firstPublishedAt: 2026-09-17T14:21:16Z`, `lastPublishedAt` identical, `live: true`, event id `aWQ6NA==` ("2026 NASA Space Apps Challenge") | challenge page (accessed 2026-10-05) |
| Hero image | `https://assets.spaceappschallenge.org/media/original_images/Astronaut_exercise_2.jpeg`; alt text: "An astronaut performs a leg exercise while health data displays on a nearby monitor, with Earth visible through the window behind them." | challenge page (accessed 2026-10-05) |
| HTTP | 200 OK, 0.685 s total, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` | curl of challenge page (accessed 2026-10-05) |

### Faithful summary (what NASA says it wants, in the summary's own key sentences)

- Stressors named: "space radiation, isolation and confinement, altered gravity, and a hostile closed environment". (challenge page, accessed 2026-10-05)
- Health outcomes named: "immune changes, bone loss, cardiovascular events, and behavioral health problems". (challenge page, accessed 2026-10-05)
- Operational premise: "On long missions, astronauts carry much of the responsibility for spotting these changes in themselves." (challenge page, accessed 2026-10-05)
- Deliverable: "build a health monitoring software that **gathers health indicators** and **enables astronauts to evaluate and act** on the status of their health." (challenge page, accessed 2026-10-05)
- The four stressors map one-to-one onto four of NASA Human Research Program's "5 Hazards of Human Spaceflight": Space Radiation; Isolation and Confinement; Gravity Fields; Hostile/Closed Environments (the fifth, Distance from Earth, is implied by "astronauts carry much of the responsibility … themselves"). (https://www.nasa.gov/hrp/hazards/, accessed 2026-10-05)

### Surrounding programme facts (official FAQ / landing page)

| Fact | Quote / value | Source |
|---|---|---|
| Who writes challenges | "Challenges are authored by NASA and Space Agency Partner subject matter experts and encompass a wide variety of Earth and space science topics. Each team must select a challenge to address during the hackathon." | https://www.spaceappschallenge.org/resources/participant-faqs/ (accessed 2026-10-05) |
| Release schedule | "A summary of each challenge will be released on September 17, followed by challenge statements on October 28, which include the full details, resources, and requirements. Teams **are not allowed** to begin working on the challenges prior to the hackathon." | FAQ (accessed 2026-10-05) |
| 2026 theme | "Get ready to explore The Next Frontier! … turn data into tools that benefit humanity and propel us to the Moon, Mars, and beyond." | FAQ (accessed 2026-10-05) |
| Dates | "The 2026 NASA Space Apps Challenge will take place November 14-15, 2026." | FAQ (accessed 2026-10-05) |
| Important dates list | Oct 28: Challenge Statements available · Nov 2: Space Apps Connect opens · Nov 13: Global Offers; Project Submission and Judging & Awards Participant Guides available · Nov 14-15: event · After: judging; "December 2026: Global Nominees, Global Finalists, and Honorable Mentions are announced." | FAQ, "Important Dates" accordion (accessed 2026-10-05) |
| Submission window | "Project submission opens on Saturday, November 14 at 9:00 AM and closes on Sunday, November 15 at 11:59 PM local time. Submit your project to receive a participant certificate and to be eligible for Global Judging." | https://www.spaceappschallenge.org/2026/ (accessed 2026-10-05) |
| Teams | "Teams may have no more than six (6) members and must be signed up for the same Local Event or the Universal Event. You may only be on one team and teams are only permitted to work on one challenge." Team formation opened Sept 17. | FAQ (accessed 2026-10-05) |
| Submission mechanism | "teams must submit their project through their team's project page on spaceappschallenge.org" — instructions in the Project Submission Guide (Nov 13). | FAQ (accessed 2026-10-05) |
| Universal Event | Virtual, asynchronous, Nov 14-15; "evaluated only in comparison with other Universal Event submissions"; "selection rate for Global Nominees is comparable". | FAQ (accessed 2026-10-05) |
| Platform API | The site is served from GraphQL at `https://api.spaceappschallenge.org/graphql` (from `__SERVER_CONTEXT__`); the challenge list page is client-rendered (0 `ChallengePage` objects in its server payload), so the "14 challenges" count is taken from the site alert, not enumerated. | challenge page / https://www.spaceappschallenge.org/2026/challenges/ (accessed 2026-10-05) |

## Resources listed by NASA

**None yet.** As of 2026-10-05 the challenge page's `resourcesTabContent` is an empty string and the payload contains no outbound NASA links; the FAQ says resources arrive with the full challenge statement on **October 28**. (challenge page; FAQ — both accessed 2026-10-05)

Because nothing is listed, the table below gives **official NASA resources that match the summary's wording**, found and opened by us. They are candidates, **not** NASA's list for this challenge; re-check on Oct 28.

| Resource | What it is (official wording) | API/dataset? | Source (opened) |
|---|---|---|---|
| NASA Human Research Program (HRP) | "HRP uses research to develop methods to protect the health and performance of astronauts in space." Elements: Human Factors and Behavioral Performance; Human Health Countermeasures; Space Radiation; Research Operations and Integration. | Programme page (links to data portals below) | https://www.nasa.gov/hrp/ (accessed 2026-10-05) |
| HRP "5 Hazards of Human Spaceflight" | Space Radiation ("one of the most hazardous aspects of spaceflight"); Isolation and Confinement ("Behavioral responses occur among groups of people far from Earth…"); Distance from Earth ("Instructions, new supplies, medical care, and more become increasingly challenging to receive from Earth…"); Gravity Fields ("muscles, bones, inner ear, and organs – must adjust…"); Hostile/Closed Environments ("…monitoring microbial communities, and tracking immune responses"). | Reference page (framework) | https://www.nasa.gov/hrp/hazards/ (accessed 2026-10-05) |
| NASA Life Sciences Portal (NLSP) | "provides access to human research data from spaceflight and ground-analog studies dating back to 1961." Access points: Explore `https://nlsp.nasa.gov/explore`; Request Data `https://nlsp.nasa.gov/data-request`; Standard Measures `https://nlsp.nasa.gov/resources/standard-measures`; LSAH `https://nlsp.nasa.gov/resources/lsah`. `https://nlsp.nasa.gov/` itself rendered only a title via WebFetch (client-rendered). | Dataset portal (human data; request process, not a public REST API as far as we could verify) | https://www.nasa.gov/hrp/nlsp/ (accessed 2026-10-05) |
| Life Sciences Data Archive (LSDA) | "houses de-identified human research data from spaceflight and analog missions." (`https://lsda.jsc.nasa.gov/` 301-redirects to nlsp.nasa.gov.) | Dataset archive (de-identified human data) | https://www.nasa.gov/hrp/nlsp/ (accessed 2026-10-05) |
| Lifetime Surveillance of Astronaut Health (LSAH) | "uses medical monitoring data for astronaut health surveillance." | Programme/dataset (access terms UNVERIFIED) | https://www.nasa.gov/hrp/nlsp/ (accessed 2026-10-05) |
| NASA Open Science Data Repository (OSDR) | OSDR and PSI "provide open access to biological and physical science datasets from spaceflight and ground studies, enabling data reuse for discovery and innovation." Search: `https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study`. (`https://osdr.nasa.gov/bio/` 301-redirects here.) | Dataset repository (mostly omics/biology; human-astronaut coverage UNVERIFIED on this page) | https://science.nasa.gov/biological-physical/data/ (accessed 2026-10-05) |
| OSDR Biological Data API | Base `https://visualization.osdr.nasa.gov/biodata/api`; endpoints `/v2/datasets/`, `/v2/dataset/{accessionId}/`, `/v2/dataset/{accessionId}/files/`, `/v2/dataset/{accessionId}/assays/`, `/v2/query/datasets/`, `/v2/query/assays/`, `/v2/query/samples/`; `format` = `csv` (default), `tsv`, `json.records`, `json.table`, `json.split`; filter by metadata field paths, `|` for OR; example `/v2/query/datasets/?study.factor%20value.spaceflight=in-flight`; no authentication or rate-limit statements on the page. **Not called live** (topic rule). | Public API (keyless per docs) | https://visualization.osdr.nasa.gov/biodata/api/ (accessed 2026-10-05) |
| OSDR Public API reference (Data File / Metadata / Search API) | `https://www.nasa.gov/reference/osdr-public-api/` → HTTP **404** (redirects to `/reference/osdr-developer-api`, also 404); `https://science.nasa.gov/reference/osdr-public-api/` → 404; `https://osdr.nasa.gov/bio/api/` → 404. Location of these docs is **UNVERIFIED**. | API docs (missing) | curl results (accessed 2026-10-05) |
| Space-weather/radiation feeds (DONKI, NOAA SWPC), EONET, POWER, EPIC | Covered by sibling research tasks; not re-verified here. | APIs | — |

## Judging criteria

### What is verifiable today

| Item | Finding | Source |
|---|---|---|
| 2026 criteria publication | "Judging occurs. Experts from NASA, Space Agency Partners, and industry leaders will evaluate the projects and select the winners. See the Judging and Awards Guide for details…" — guide available **November 13**. | FAQ (accessed 2026-10-05) |
| Guide page status today | `https://www.spaceappschallenge.org/resources/judging-awards-guide/` returns HTTP 200 but renders the Next.js 404 fallback ("Oops! Page Not Found", `NEXT_HTTP_ERROR_FALLBACK;404`); `/2025/resources/judging-awards-guide/` and `/resources/project-submission-guide/` are the same 404 fallback. | curl + decoded payload (accessed 2026-10-05) |
| Recognition | "All NASA Space Apps Challenge participants will receive a certificate … upon submitting their project. Projects will then be judged on specific criteria to determine Honorable Mentions, Global Finalists, and Global Winners." | FAQ, "Recognition and Awards" (accessed 2026-10-05) |
| Judging ladder | "Following the hackathon, Local Event and Universal Event judges will determine the projects that will advance to Global Judging, known as Global Nominees." → "During Global Judging, all Global Nominees will be reviewed by NASA and Space Agency Partner Subject Matter Experts to determine the Global Finalists and Honorable Mentions." → "The Global Finalists will be reviewed by an executive committee from NASA and Space Agency Partners to determine 10 Global Winners. These judges are agency leaders and executives with a variety of subject matter expertise. Announced on December 18, 2025." | https://www.spaceappschallenge.org/2025/awards/ (accessed 2026-10-05); identical ladder text on https://www.spaceappschallenge.org/nasa-space-apps-2024/awards/ (accessed 2026-10-05) |
| Eligibility gates | Register for the 2026 event; be on a team registered in the same Local Event; submit through the team project page inside the submission window. | https://www.spaceappschallenge.org/2026/ and FAQ (accessed 2026-10-05) |

### The 10 Global Awards (2025 wording; 2024 page carries the same descriptions)

| Award | Official description | Source |
|---|---|---|
| Best Use of Science | "The project that makes the best and most valid use of science and/or the scientific method." | https://www.spaceappschallenge.org/2025/awards/ (accessed 2026-10-05) |
| Best Use of Data | "The project that best makes space data accessible or leverages it for a unique application." | same |
| Best Use of Technology | "The project that exemplifies the most innovative use of technology." | same |
| Galactic Impact | "The project with the most potential to improve life on Earth or in the universe." | same |
| Best Mission Concept | "The project with the most plausible concept and design." | same |
| Most Inspirational | "The project that captures our hearts." | same |
| Best Use of Storytelling | "The project that most creatively communicates the potential of open data through the art of storytelling." | same |
| Global Connection | "The project that best connects people around the world through technology." | same |
| Art & Technology | "The project that most effectively combines technical and creative skills." | same |
| Local Impact | "The project that demonstrates the greatest potential for local impact." | same |
| Intro | "NASA Space Apps recognizes exceptional projects each year through its 10 Global Awards. The winning teams are determined by an executive committee of NASA and Space Agency Partner Subject Matter Experts." | same |

### Scoring rubric — UNVERIFIED for 2026

| Criterion | Definition as indexed by the search engine from the official guide URL (page itself is 404 today) | Status |
|---|---|---|
| Scale | "At every level of judging, projects are evaluated on a scale from 1-to-5 in each of the following criteria: Impact, Creativity, Validity, Relevance, and Presentation." | UNVERIFIED: text from search-engine snippet of https://www.spaceappschallenge.org/resources/judging-awards-guide/ (page not openable on 2026-10-05; wording presumably from the 2025 guide) |
| Impact | "…makes an impact by addressing either a minor or major problem, which influences the quality and quantity of its overall effect…" | UNVERIFIED (same) |
| Creativity | "…demonstrates originality and innovation. It introduces a novel concept that has not been attempted before or presents an improvement upon existing ideas in a meaningful way…" | UNVERIFIED (same) |
| Validity | "…grounded in scientific principles and demonstrates technical, functional, or logical feasibility… has the potential to function in real-world applications." | UNVERIFIED (same) |
| Relevance | "…fully and directly addresses the challenge for which it was submitted… meaningfully integrates NASA data, utilizing it as a core component of the proposed solution rather than a superficial addition." | UNVERIFIED (same) |
| Presentation | "…effectively communicated their project, clearly conveying the challenge, their proposed solution, and its significance, with storytelling that was engaging and well-structured…" | UNVERIFIED (same) |

Historical official rubric (verified, but from 2017 and superseded): "Impact — How much impact (quality and quantity) can this project have? Does it solve a big or little problem?"; "Creativity — How creative is the approach? Is the project new…?"; "Product — How well does this project fit the needs of the challenge it addresses? How user-friendly is the technology?"; "Sustainability — How good is the plan for next steps?…"; "Presentation — How well did the team communicate their project? Are they effective in telling the story of the project?" (https://2017.spaceappschallenge.org/blog/how-develop-winning-space-apps-solution, dated Apr 25 2017, accessed 2026-10-05). The 2022 legacy FAQ lists the same 10 Global Awards but no rubric (https://legacy.spaceappschallenge.org/resources/faq/, accessed 2026-10-05).

### Submission rules that affect scoring/eligibility (Participant Terms & Conditions)

| Rule | Official wording | Source |
|---|---|---|
| Open licence | "You agree that any original content … is freely available without restriction or is licensed as open source as defined by the Open Source Initiative (OSI) … If you do not specify a specific OSI compliant license, NASA will distribute your original content under an Apache 2.0 license." | https://www.spaceappschallenge.org/legal/ (accessed 2026-10-05) |
| Third-party materials | "…you are responsible for ensuring that your Solution Materials are freely and publicly available without restriction or, at a minimum, are also licensed as open source … Any licenses applicable to your Solution Materials must be identified in the documentation that you submit with your Solution. NASA will not accept or post any Solutions that do not include appropriate license documentation…" | same |
| Citations | "You must cite every source that is used in the creation of your project, even if it is open source or freely available. … NASA also reserves the right to remove nominations, awards, or winner status from teams that do not cite resources used in their Solution; all resources, even open source resources, must be cited." | same |
| Prohibited content | No "Personally Identifiable Information (e.g., birthdays, social security numbers, home addresses, home phone numbers)"; "Recognizable names, voices, and likenesses of persons under the age of 18 should not be included in any submission"; no "Proprietary or business sensitive information"; no export-controlled information (ITAR/EAR). | same |
| Video | Submitted videos must be the team's original work; grant the U.S. government a royalty-free, worldwide, perpetual, non-exclusive licence. | same |

## Implications for our build

Each row ties a feature to a sentence NASA actually published (challenge summary, HRP hazards page, awards/criteria text, or terms).

| # | Feature / decision | Why it scores | Source |
|---|---|---|---|
| 1 | **Four "hazard lanes" on the dashboard**: Radiation (space-weather feeds), Isolation & Confinement (mood/sleep/social check-ins), Altered Gravity (exercise-countermeasure adherence, resting HR trend), Hostile/Closed Environment (cabin CO₂/temperature/noise placeholders). Label them with NASA's hazard names. | Mirrors the summary's four stressors and HRP's five-hazard framework → Relevance; gives judges a recognisable NASA structure. | challenge summary; https://www.nasa.gov/hrp/hazards/ (accessed 2026-10-05) |
| 2 | **Indicator-to-outcome mapping panel**: map watch vitals (HR, HRV, SpO₂, sleep stages, steps/active minutes, skin temp, weight if available) to the four outcomes NASA names — immune changes, bone loss, cardiovascular events, behavioral health — and state honestly which are proxies (e.g., bone loss has no watch signal; show exercise load + a "needs DXA/ground data" flag). | The summary names exactly these outcomes; honest proxies support Validity ("grounded in scientific principles"). | challenge summary (accessed 2026-10-05); criteria wording UNVERIFIED |
| 3 | **Crew-autonomous self-assessment flow** ("Evaluate → Act"): daily self-check, trend vs personal baseline, plain-language status (green/amber/red), and an action card (hydrate, exercise session, sleep hygiene, schedule ground consult). No ground-in-the-loop dependency; include a "comms delay" mode. | Summary: "astronauts carry much of the responsibility for spotting these changes in themselves … enables astronauts to evaluate and act"; HRP hazard "Distance from Earth": "medical care … increasingly challenging to receive from Earth". | challenge summary; https://www.nasa.gov/hrp/hazards/ (accessed 2026-10-05) |
| 4 | **Exercise countermeasure tracker**: log/plan resistance + aerobic sessions; show adherence next to HR/HRV; the challenge's hero image is literally an astronaut doing a leg exercise with health data on a monitor. | Direct visual cue from the challenge page; "Gravity Fields" hazard affects "muscles, bones, inner ear, and organs". | challenge page hero alt text; https://www.nasa.gov/hrp/hazards/ (accessed 2026-10-05) |
| 5 | **Radiation/space-weather context next to vitals**: show current solar events/geomagnetic activity and a "shelter/activity advisory" state. (Feed details are in sibling reports; DONKI/NOAA SWPC are keyless.) | "space radiation … one of the most hazardous aspects of spaceflight"; NASA data as "a core component" (Relevance, UNVERIFIED wording). | https://www.nasa.gov/hrp/hazards/ (accessed 2026-10-05) |
| 6 | **Use NASA human-research baselines where possible**: cite NLSP "Standard Measures" and LSDA (de-identified human spaceflight data) as the reference for which indicators matter; pull OSDR dataset metadata via the biodata API (`/v2/query/datasets/?study.factor%20value.spaceflight=in-flight`) to show "related NASA studies" for an indicator. | Best Use of Data: "best makes space data accessible or leverages it for a unique application"; Best Use of Science. | https://www.nasa.gov/hrp/nlsp/; https://visualization.osdr.nasa.gov/biodata/api/; https://www.spaceappschallenge.org/2025/awards/ (all accessed 2026-10-05) |
| 7 | **Built-in "Sources & licences" screen** listing every dataset/API/library with licence, plus an OSI licence file (Apache-2.0 default) in the repo. | Terms: "You must cite every source…"; NASA may strip awards for missing citations; third-party materials must be open and their licences documented. | https://www.spaceappschallenge.org/legal/ (accessed 2026-10-05) |
| 8 | **Synthetic/own-device data only**; no PII fields; demo video with adults only (or no people). | Terms prohibit PII and under-18 likenesses; the task rule also forbids real personal health data. | https://www.spaceappschallenge.org/legal/ (accessed 2026-10-05) |
| 9 | **Presentation assets**: 1-line problem statement quoting the summary, a 2-minute demo script, and a "mission concept" slide (how this runs on a Moon/Mars transit). | Presentation is a criterion (historic and UNVERIFIED current rubric); Best Mission Concept = "most plausible concept and design"; theme "The Next Frontier … Moon, Mars, and beyond". | https://2017.spaceappschallenge.org/blog/how-develop-winning-space-apps-solution; https://www.spaceappschallenge.org/2025/awards/; FAQ (all accessed 2026-10-05) |
| 10 | **Schedule discipline**: keep pre-Oct-28 work to generic infrastructure (auth-free data adapters, chart components, synthetic vitals generator); fit the challenge-specific product to the Oct 28 statement; build and submit inside Nov 14 09:00 – Nov 15 23:59 local. | FAQ: "Teams are not allowed to begin working on the challenges prior to the hackathon"; submission window on landing page. | FAQ; https://www.spaceappschallenge.org/2026/ (accessed 2026-10-05) |
| 11 | **Difficulty calibration**: challenge is tagged "Intermediate" with skills "Human Exploration", "Software", "Space Exploration" — a working, data-connected web app with sound health logic (not a research-grade model) is the expected bar. | Challenge page tags. | challenge page (accessed 2026-10-05) |

## Open questions

1. **Full challenge statement** (Background, Objectives, Potential Considerations, NASA-listed Resources) is unpublished until **Oct 28, 2026**; everything above about resources is our inference. Re-run this research on/after Oct 28. (FAQ, accessed 2026-10-05)
2. **2026 judging rubric**: the five 1-to-5 criteria (Impact, Creativity, Validity, Relevance, Presentation) are UNVERIFIED — the guide page is a 404 until Nov 13. Confirm whether the criteria and the "NASA data as a core component" language carry over. (judging-awards-guide URL; FAQ, accessed 2026-10-05)
3. **Pre-hackathon work rule**: "Teams are not allowed to begin working on the challenges prior to the hackathon." Does scaffolding a generic vitals + space-data dashboard before Nov 14 breach this? Ask the Local Lead / Space Apps Connect (opens Nov 2). (FAQ, accessed 2026-10-05)
4. **Smartwatch SDKs vs open-licence rule**: proprietary vendor SDKs/terms (Apple HealthKit, Google Health Connect, Fitbit, Garmin) may conflict with "Solution Materials … freely and publicly available … or licensed as open source"; need a position (e.g., open-format export files) before submission. (Legal page, accessed 2026-10-05)
5. **Will NASA list NLSP/LSDA/LSAH/OSDR** in the Oct 28 resources, and do any of them expose human physiological time-series usable in a demo without a data request? NLSP's "Request Data" flow and LSAH access terms are UNVERIFIED. (https://www.nasa.gov/hrp/nlsp/, accessed 2026-10-05)
6. **OSDR Public API (Data File / Metadata / Search) documentation location**: `nasa.gov/reference/osdr-public-api/` and two alternates return 404; only the biodata `/v2` API docs were reachable. (curl results, accessed 2026-10-05)
7. **Client-side Resources tab**: the server payload has `resourcesTabContent: ""`; whether the GraphQL API (`https://api.spaceappschallenge.org/graphql`) would return more for a logged-in user is unknown. (challenge page, accessed 2026-10-05)
8. **Local vs Universal Event**: Universal Event projects are judged only against other Universal submissions; decide which event the team registers in (all members must be in the same event). (FAQ, accessed 2026-10-05)
9. **Enumerate the 14 challenges**: the list page is client-rendered; sibling challenges (e.g., space-weather or sleep topics) could share components — unverified.
