import { z } from 'zod';

export const MissionLocationSchema = z.enum([
  'earth_preflight',
  'deep_space_transit',
  'lunar_surface',
  'mars_surface',
]);

export const TriageRequestSchema = z.object({
  mission_day: z.number().int().min(1).max(1000).optional(),
  mission_location: MissionLocationSchema.default('mars_surface'),
  crew_id: z.string().min(1).max(32),
  crew_name: z.string().max(64).optional(),
  vitals: z.object({
    hr_bpm: z.number().min(20).max(260),
    preflight_hr_median: z.number().min(30).max(150),
    spo2_pct: z.number().min(50).max(100),
    temp_c: z.number().min(30).max(43).optional(),
    preflight_temp_median: z.number().min(35).max(38.5).optional(),
    sleep_hours: z.number().min(0).max(24).optional(),
    sensor_verified: z.boolean().default(false),
  }),
  daily_ultrasound: z
    .object({
      onsd_mm: z.number().min(2.0).max(10.0),
      preflight_onsd_mm: z.number().min(2.0).max(8.0),
      ijv_flow_status: z.enum([
        'normal_forward',
        'mild_stasis',
        'stagnant_retrograde',
        'indeterminate',
      ]),
      probe_contact_verified: z.boolean().default(false),
    })
    .optional(),
  space_weather: z
    .object({
      kp_index: z.number().min(0).max(9).optional(),
      solar_flare: z.string().max(32).optional(),
      sep_event: z.string().max(32).optional(),
    })
    .optional(),
  available_tools: z.array(z.string().min(1).max(64)).min(1).max(20),
});

export const TriageResponseSchema = z.object({
  data_quality_check: z.string(),
  baseline_comparison: z.string(),
  common_causes: z.array(z.string()),
  confirmation_prompt: z.string(),
  available_tool_action_plan: z.array(z.string()),
  contact_ground_support: z.boolean(),
  ground_support_reason: z.string().nullable(),
});

export type MissionLocation = z.infer<typeof MissionLocationSchema>;
export type TriageRequest = z.infer<typeof TriageRequestSchema>;
export type TriageResponse = z.infer<typeof TriageResponseSchema>;
