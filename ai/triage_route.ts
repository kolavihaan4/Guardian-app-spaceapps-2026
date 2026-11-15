import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  TriageRequestSchema,
  TriageResponseSchema,
  type MissionLocation,
  type TriageRequest,
  type TriageResponse,
} from './triage_shared';

const router = Router();
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_TRIAGE_MODEL ?? 'astrovitals-triage';

const LOCATION_CONTEXT: Record<MissionLocation, string> = {
  earth_preflight: 'Earth Preflight (1.0g)',
  deep_space_transit: 'Deep-Space Transit (0g)',
  lunar_surface: 'Lunar Surface (1/6g)',
  mars_surface: 'Mars Surface (3/8g)',
};

function buildDeterministicFallback(input: TriageRequest): TriageResponse {
  const { vitals, daily_ultrasound, available_tools, mission_location, space_weather } = input;
  const locationLabel = LOCATION_CONTEXT[mission_location];

  const hrDelta = vitals.hr_bpm - vitals.preflight_hr_median;

  // Hard clinical safety limits anchored strictly to personal Earth preflight medians
  const vitalsMultiDrift =
    vitals.sensor_verified &&
    (hrDelta >= 35 ||
      vitals.spo2_pct <= 91 ||
      (vitals.temp_c !== undefined && vitals.temp_c >= 38.0));

  const onsdDelta = daily_ultrasound
    ? +(daily_ultrasound.onsd_mm - daily_ultrasound.preflight_onsd_mm).toFixed(2)
    : 0;

  const ultrasoundEscalation = Boolean(
    daily_ultrasound &&
      daily_ultrasound.probe_contact_verified &&
      (daily_ultrasound.onsd_mm >= 5.5 ||
        onsdDelta >= 0.8 ||
        daily_ultrasound.ijv_flow_status === 'stagnant_retrograde')
  );

  const shouldEscalate = vitalsMultiDrift || ultrasoundEscalation;

  const hasElevatedSpaceWeather = Boolean(
    space_weather &&
      ((space_weather.kp_index !== undefined && space_weather.kp_index >= 5) ||
        Boolean(space_weather.sep_event))
  );

  const radiationContextNote = hasElevatedSpaceWeather
    ? ' Concurrent elevated solar/geomagnetic activity logged as environmental context (correlate with crew dosimeter without assuming deterministic vital-sign causality).'
    : '';

  const ultrasoundQualityNote = daily_ultrasound
    ? daily_ultrasound.probe_contact_verified
      ? ` Ultrasound probe placement verified (ONSD ${daily_ultrasound.onsd_mm} mm, IJV flow: ${daily_ultrasound.ijv_flow_status}).`
      : ' Unverified ultrasound probe contact: re-seat transducer and verify acoustic window before interpreting ONSD.'
    : '';

  const ultrasoundBaselineNote = daily_ultrasound
    ? ` | Daily Ultrasound ONSD: ${daily_ultrasound.onsd_mm} mm (${onsdDelta >= 0 ? '+' : ''}${onsdDelta} mm vs personal preflight ${daily_ultrasound.preflight_onsd_mm} mm).`
    : '';

  return {
    data_quality_check:
      (vitals.sensor_verified
        ? `Wearable sensor placement verified in ${locationLabel}; evaluating telemetry strictly against personal preflight baseline.`
        : 'Unverified wearable sensor fit: confirm strap contact and rule out motion artifact before interpreting readings.') +
      ultrasoundQualityNote,
    baseline_comparison: `HR ${vitals.hr_bpm} bpm (${hrDelta >= 0 ? '+' : ''}${hrDelta} bpm vs personal preflight ${vitals.preflight_hr_median} bpm); SpO2 ${vitals.spo2_pct}%.${ultrasoundBaselineNote}`,
    common_causes: [
      `Cephalad fluid redistribution in ${locationLabel}, recent EVA/resistive exercise, or cabin hydration/CO2 shift`,
      'Wearable strap shift or acoustic probe alignment variance',
    ],
    confirmation_prompt:
      'Can you confirm probe/sensor placement is snug and note any visual changes, headache, fever, or pressure sensations?',
    available_tool_action_plan: [
      `Verify readings using ${available_tools[0]}`,
      ...(available_tools[1] ? [`Cross-check status with ${available_tools[1]}`] : []),
      'Re-test after 5 minutes at rest and review dosimeter log if space weather is elevated',
    ],
    contact_ground_support: shouldEscalate,
    ground_support_reason: shouldEscalate
      ? ultrasoundEscalation
        ? `Verified daily ultrasound drift in ${locationLabel} (ONSD ${daily_ultrasound?.onsd_mm} mm, +${onsdDelta} mm over personal preflight; IJV ${daily_ultrasound?.ijv_flow_status}) warrants Flight Surgeon consultation.${radiationContextNote}`
        : `Verified multi-parameter vital deviation in ${locationLabel} outside personal preflight baseline; recommend Flight Surgeon review.${radiationContextNote}`
      : null,
  };
}

router.post('/', async (req: Request, res: Response) => {
  const parsed = TriageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid triage payload',
      issues: parsed.error.issues,
    });
    return;
  }

  const payload = parsed.data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        think: false,
        format: z.toJSONSchema(TriageResponseSchema),
        messages: [
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      }),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama returned HTTP ${ollamaRes.status}`);
    }

    const data = (await ollamaRes.json()) as { message?: { content?: string } };
    const rawContent = data.message?.content ?? '{}';
    const validatedOutput = TriageResponseSchema.parse(JSON.parse(rawContent));

    res.json({
      source: `local-ollama:${OLLAMA_MODEL}`,
      disclaimer:
        'Not a medical device. Exploratory crew decision-support prototype only; does not diagnose or treat.',
      triage: validatedOutput,
    });
  } catch {
    req.log?.warn(
      { route: '/api/ai/triage' },
      'Ollama unavailable or timed out; serving offline baseline fallback'
    );
    res.json({
      source: 'offline-deterministic-fallback',
      disclaimer:
        'Not a medical device. Exploratory crew decision-support prototype only; does not diagnose or treat.',
      triage: buildDeterministicFallback(payload),
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
