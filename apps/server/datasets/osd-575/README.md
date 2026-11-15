# OSD-575 — Inspiration4 Comprehensive Metabolic Panel

| | |
|---|---|
| Dataset | NASA OSDR **OSD-575**, "SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays" |
| DOI | [10.26030/mc5d-p710](https://doi.org/10.26030/mc5d-p710) |
| Licence | **CC0-1.0** (public domain dedication), per the DataCite record |
| Landing page | https://osdr.nasa.gov/bio/repo/data/studies/OSD-575 |
| File | `LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv`, unmodified |
| Downloaded | 2026-10-11 from `https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=…` |
| SHA-256 | `5eb1e7f025dd8443a9e70111e62bc32afae3432753024489c5c013e401d709d9` |
| Papers | "The Space Omics and Medical Atlas (SOMA) and international astronaut biobank", *Nature* 2024, [10.1038/s41586-024-07639-y](https://doi.org/10.1038/s41586-024-07639-y) ; "Collection of Biospecimens from the Inspiration4 Mission Establishes the Standards for SOMA", *Nat Commun* 2024, [10.1038/s41467-024-48806-z](https://doi.org/10.1038/s41467-024-48806-z) |

**Contents.** 4 crew (C001–C004) × 7 serum draws: L-92, L-44, L-3 (days before launch) and R+1, R+45,
R+82, R+194 (days after return). 19 analytes with the lab's per-person reference range. Missing values
appear as `NA`, `N/A` or blank.

**How the app uses it.** The median of the three pre-launch draws is each person's baseline (Mission Baseline page). eGFR is left out: the
file carries only the race-based 2009 CKD-EPI variants, which labs retired in 2021; creatinine, the
measurement it is computed from, is shown instead.

**Limits.** Inspiration4 was a 3-day mission in low Earth orbit, not a long-duration one. There are no
in-flight draws and no illness labels, so this supports a retrospective demonstration of the method,
not prediction. The crew are publicly known; the app never maps a code to a name.
