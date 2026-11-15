import { z } from "zod";

export const MissionLocationEnum = z.enum([
  "earth_preflight",
  "deep_space_transit",
  "lunar_surface",
  "mars_surface",
]);

export const SpaceWeatherEnum = z.enum(["quiet", "storm"]);

export const IjvFlowStatusEnum = z.enum([
  "normal_forward",
  "mild_stasis",
  "stagnant_retrograde",
  "indeterminate",
]);

export const TelemetrySourceEnum = z.enum([
  "simulated_mission_log",
  "fitbit_web_api",
  "manual_entry",
]);

export const VitalsSchema = z.object({
  hr_bpm: z.number().min(25).max(240),
  preflight_hr_median: z.number().min(35).max(120).default(62),
  spo2_pct: z.number().min(50).max(100),
  temp_c: z.number().min(32.0).max(42.5),
  preflight_temp_median: z.number().min(35.0).max(38.5).default(36.7),
  sleep_hours: z.number().min(0).max(24).optional(),
  sensor_verified: z.boolean().default(true),
});

export const DailyUltrasoundSchema = z.object({
  onsd_mm: z.number().min(2.0).max(9.0),
  preflight_onsd_mm: z.number().min(3.0).max(6.5).default(4.6),
  ijv_flow_status: IjvFlowStatusEnum,
  probe_contact_verified: z.boolean().default(true),
});

export const PupillometrySchema = z.object({
  left_pupil_mm: z.number().min(1.0).max(10.0),
  right_pupil_mm: z.number().min(1.0).max(10.0),
  plr_constriction_pct: z.number().min(0).max(70),
  lighting_lux_verified: z.boolean().default(true),
});

export const TriageRequestSchema = z.object({
  crew_id: z.string().min(1).default("CREW-01"),
  mission_day: z.union([z.number().int().min(1), z.literal("Live")]).default(1),
  location: MissionLocationEnum.default("mars_surface"),
  space_weather: SpaceWeatherEnum.default("quiet"),
  telemetry_source: TelemetrySourceEnum.default("simulated_mission_log"),
  vitals: VitalsSchema,
  daily_ultrasound: DailyUltrasoundSchema.optional(),
  pupillometry: PupillometrySchema.optional(),
  crew_notes: z.string().max(1000).optional(),
});

export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export const TriageDecisionSchema = z.object({
  status: z.enum([
    "NOMINAL",
    "ARTIFACT_BLOCKED",
    "MONITOR_AND_RETEST",
    "FLIGHT_SURGEON_ESCALATION",
  ]),
  escalate_to_flight_surgeon: z.boolean(),
  data_quality_verified: z.boolean(),
  unverified_channels: z.array(z.string()),
  baseline_deltas: z.object({
    hr_delta_bpm: z.number(),
    temp_delta_c: z.number(),
    onsd_delta_mm: z.number().nullable(),
    anisocoria_mm: z.number().nullable(),
    plr_constriction_pct: z.number().nullable(),
  }),
  differential_context: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  disclaimer: z.string(),
});

export type TriageDecision = z.infer<typeof TriageDecisionSchema>;

/**
 * Deterministic evidence-based clinical rules engine.
 * Anchors strictly to personal Earth preflight medians, blocks unverified
 * sensor/probe/lux artifacts, and treats space weather as contextual only.
 */
export function evaluateDeterministicTriage(req: TriageRequest): TriageDecision {
  const { vitals, daily_ultrasound, pupillometry, location, space_weather } = req;

  const hrDelta = Number((vitals.hr_bpm - vitals.preflight_hr_median).toFixed(1));
  const tempDelta = Number((vitals.temp_c - vitals.preflight_temp_median).toFixed(2));
  const onsdDelta = daily_ultrasound
    ? Number((daily_ultrasound.onsd_mm - daily_ultrasound.preflight_onsd_mm).toFixed(2))
    : null;
  const anisocoriaMm = pupillometry
    ? Number(Math.abs(pupillometry.left_pupil_mm - pupillometry.right_pupil_mm).toFixed(2))
    : null;
  const plrPct = pupillometry ? pupillometry.plr_constriction_pct : null;

  // 1. Artifact & Calibration Guardrail
  const unverifiedChannels: string[] = [];
  if (!vitals.sensor_verified) unverifiedChannels.push("wearable_strap_contact");
  if (daily_ultrasound && !daily_ultrasound.probe_contact_verified) {
    unverifiedChannels.push("ultrasound_probe_contact");
  }
  if (pupillometry && !pupillometry.lighting_lux_verified) {
    unverifiedChannels.push("pupillometry_ambient_lux");
  }

  const dataQualityVerified = unverifiedChannels.length === 0;

  // 2. Verified Clinical Escalation Checks
  const vitalsRedFlag =
    vitals.sensor_verified &&
    (hrDelta >= 35 || vitals.spo2_pct <= 91 || vitals.temp_c >= 38.0);

  const ultrasoundRedFlag =
    Boolean(daily_ultrasound?.probe_contact_verified) &&
    daily_ultrasound !== undefined &&
    (daily_ultrasound.onsd_mm >= 5.5 ||
      (onsdDelta !== null && onsdDelta >= 0.8) ||
      daily_ultrasound.ijv_flow_status === "stagnant_retrograde");

  const pupillometryRedFlag =
    Boolean(pupillometry?.lighting_lux_verified) &&
    pupillometry !== undefined &&
    ((anisocoriaMm !== null && anisocoriaMm >= 1.0) ||
      pupillometry.plr_constriction_pct < 15);

  const escalate = dataQualityVerified && (vitalsRedFlag || ultrasoundRedFlag || pupillometryRedFlag);

  // 3. Mild Sub-Threshold Drift Check
  const mildDrift =
    dataQualityVerified &&
    !escalate &&
    (hrDelta >= 12 ||
      (onsdDelta !== null && onsdDelta >= 0.4) ||
      daily_ultrasound?.ijv_flow_status === "mild_stasis" ||
      (pupillometry !== undefined && pupillometry.plr_constriction_pct < 20));

  let status: TriageDecision["status"] = "NOMINAL";
  if (!dataQualityVerified) {
    status = "ARTIFACT_BLOCKED";
  } else if (escalate) {
    status = "FLIGHT_SURGEON_ESCALATION";
  } else if (mildDrift) {
    status = "MONITOR_AND_RETEST";
  }

  // 4. Differential & Non-Deterministic Space-Weather Context
  const differentialContext: string[] = [
    `Cephalad fluid shift in ${location}, recent EVA/resistive workout, or cabin ppCO2/hydration variance`,
  ];

  if (!dataQualityVerified) {
    differentialContext.push(
      `Unverified telemetry channel(s): ${unverifiedChannels.join(", ")} — artifact suppression active`
    );
  } else {
    differentialContext.push(
      "Verified neuro-ocular and cardiopulmonary telemetry compared directly against personal Earth preflight medians"
    );
  }

  if (space_weather === "storm") {
    differentialContext.push(
      "Elevated geomagnetic/solar activity (Kp 7 / SEP) logged as contextual environmental stressor — correlate with crew dosimeter without applying synthetic vital-sign offsets"
    );
  }

  // 5. Action Plan
  const recommendedActions: string[] = [];
  if (!dataQualityVerified) {
    if (!vitals.sensor_verified) {
      recommendedActions.push("Re-seat wearable strap and confirm skin contact before trusting HR/SpO2");
    }
    if (daily_ultrasound && !daily_ultrasound.probe_contact_verified) {
      recommendedActions.push("Re-apply ultrasound gel over closed eyelid and confirm optic nerve acoustic window");
    }
    if (pupillometry && !pupillometry.lighting_lux_verified) {
      recommendedActions.push("Standardize ambient cabin lighting lux and repeat 3-second pupillometry scan");
    }
    recommendedActions.push("Re-run triage once all active channels report verified acquisition");
  } else if (escalate) {
    recommendedActions.push("Transmit verified vitals, ONSD/IJV ultrasound, and pupillometry log to Flight Surgeon");
    recommendedActions.push("Inspect cabin ppCO2, hydration log, and perform visual acuity check (Amsler grid)");
    recommendedActions.push("Defer high-strain resistive exercise until ground medical review completes");
  } else if (mildDrift) {
    recommendedActions.push("Hydrate, rest 30 minutes post-EVA/exercise, and repeat ocular ultrasound + pupillometry");
    recommendedActions.push("Log follow-up reading to confirm return toward personal preflight median");
  } else {
    recommendedActions.push("Continue routine daily wearable, ocular ultrasound, and pupillometry logging");
  }

  return {
    status,
    escalate_to_flight_surgeon: escalate,
    data_quality_verified: dataQualityVerified,
    unverified_channels: unverifiedChannels,
    baseline_deltas: {
      hr_delta_bpm: hrDelta,
      temp_delta_c: tempDelta,
      onsd_delta_mm: onsdDelta,
      anisocoria_mm: anisocoriaMm,
      plr_constriction_pct: plrPct,
    },
    differential_context: differentialContext,
    recommended_actions: recommendedActions,
    disclaimer:
      "Not a medical device. Exploratory NASA Space Apps crew decision-support prototype only; does not diagnose or treat.",
  };
}
