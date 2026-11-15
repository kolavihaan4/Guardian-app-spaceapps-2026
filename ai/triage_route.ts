import { NextRequest, NextResponse } from "next/server";
import {
  TriageRequestSchema,
  evaluateDeterministicTriage,
  type TriageRequest,
} from "./triage_shared";

/**
 * Normalizes raw Fitbit Web API intraday payloads if submitted directly
 * by the Fitbit integration service before Zod validation.
 */
function normalizeIncomingPayload(raw: Record<string, unknown>): Record<string, unknown> {
  if ("activities-heart" in raw || "activities-heart-intraday" in raw || "spo2" in raw) {
    const heartList = raw["activities-heart"] as Array<{ value?: { restingHeartRate?: number } }> | undefined;
    const intradayObj = raw["activities-heart-intraday"] as { dataset?: Array<{ value: number }> } | undefined;
    const spo2Obj = raw["spo2"] as { value?: { avg?: number } } | undefined;
    const sleepList = raw["sleep"] as Array<{ summary?: { totalMinutesAsleep?: number } }> | undefined;

    const dataset = intradayObj?.dataset ?? [];
    const restingHr = heartList?.[0]?.value?.restingHeartRate ?? 62;
    const latestHr = dataset.length > 0 ? dataset[dataset.length - 1].value : restingHr;
    const spo2Avg = spo2Obj?.value?.avg ?? 98;
    const minsAsleep = sleepList?.[0]?.summary?.totalMinutesAsleep ?? 420;

    return {
      crew_id: (raw.crew_id as string) ?? "CREW-01",
      mission_day: "Live",
      location: (raw.location as string) ?? "mars_surface",
      space_weather: (raw.space_weather as string) ?? "quiet",
      telemetry_source: "fitbit_web_api",
      vitals: {
        hr_bpm: Number(latestHr),
        preflight_hr_median: Number(restingHr),
        spo2_pct: Math.round(Number(spo2Avg)),
        temp_c: 36.9,
        preflight_temp_median: 36.7,
        sleep_hours: Number((minsAsleep / 60).toFixed(1)),
        sensor_verified: raw.sensor_verified !== false,
      },
      daily_ultrasound: raw.daily_ultrasound,
      pupillometry: raw.pupillometry,
      crew_notes: raw.crew_notes,
    };
  }

  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const normalized = normalizeIncomingPayload(body);

    const parsed = TriageRequestSchema.safeParse(normalized);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid AstroVitals telemetry payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const triageInput: TriageRequest = parsed.data;
    const decision = evaluateDeterministicTriage(triageInput);

    return NextResponse.json(
      {
        crew_id: triageInput.crew_id,
        mission_day: triageInput.mission_day,
        location: triageInput.location,
        space_weather: triageInput.space_weather,
        telemetry_source: triageInput.telemetry_source,
        triage: decision,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Malformed JSON request body",
        detail: err instanceof Error ? err.message : "Unknown parsing error",
      },
      { status: 400 }
    );
  }
}
