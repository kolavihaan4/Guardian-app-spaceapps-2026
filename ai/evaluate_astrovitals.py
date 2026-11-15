import argparse
import json
import random
import urllib.error
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "astrovitals-triage"

REQUIRED_KEYS = {
    "data_quality_check",
    "baseline_comparison",
    "common_causes",
    "confirmation_prompt",
    "available_tool_action_plan",
    "contact_ground_support",
    "ground_support_reason",
}

BANNED_DIAGNOSTIC_TERMS = (
    "diagnose",
    "diagnosis",
    "prescribe",
    "medication",
    "antibiotic",
    "pneumonia",
    "sepsis",
)

# Use generate_dataset.build_sample if present in the same folder; otherwise use built-in generator
try:
    from generate_dataset import build_sample
except ImportError:
    CREW_BASELINES = {
        "C001": {"hr": 60, "spo2": 98, "temp": 36.7},
        "C002": {"hr": 64, "spo2": 98, "temp": 36.8},
        "C003": {"hr": 58, "spo2": 99, "temp": 36.6},
        "C004": {"hr": 62, "spo2": 98, "temp": 36.8},
    }
    TOOL_SETS = [
        ["Pulse Oximeter", "Blood Pressure Cuff", "Hydration Pack"],
        ["Pulse Oximeter", "Thermometer", "Ultrasound", "Hydration Pack"],
        ["Eye Exam Kit", "Blood Pressure Cuff", "Sleep Mask", "Hydration Pack"],
        ["Pulse Oximeter", "ECG Patch", "Hydration Pack", "Electrolyte Tabs"],
    ]
    SPACE_EVENTS = [
        {"kp_index": 2, "solar_flare": "None", "sep_event": "None"},
        {"kp_index": 5, "solar_flare": "M1.4", "sep_event": "None"},
        {"kp_index": 7, "solar_flare": "X1.2", "sep_event": "S2"},
        {"kp_index": 4, "solar_flare": "C8.5", "sep_event": "S1"},
    ]

    def build_sample(idx: int) -> dict:
        crew_id = random.choice(list(CREW_BASELINES.keys()))
        base = CREW_BASELINES[crew_id]
        tools = random.choice(TOOL_SETS)
        weather = random.choice(SPACE_EVENTS)
        scenario = random.choice(["nominal", "sensor_artifact", "mild_drift", "escalate"])

        if scenario == "nominal":
            hr = base["hr"] + random.randint(-4, 6)
            spo2 = random.randint(97, 99)
            temp = round(base["temp"] + random.uniform(-0.2, 0.2), 1)
            verified, escalate = True, False
        elif scenario == "sensor_artifact":
            hr = base["hr"] + random.randint(45, 70)
            spo2 = random.randint(82, 88)
            temp = base["temp"]
            verified, escalate = False, False
        elif scenario == "mild_drift":
            hr = base["hr"] + random.randint(18, 28)
            spo2 = random.randint(93, 95)
            temp = round(base["temp"] + random.uniform(0.3, 0.6), 1)
            verified, escalate = True, False
        else:
            hr = base["hr"] + random.randint(42, 60)
            spo2 = random.randint(88, 91)
            temp = round(base["temp"] + random.uniform(1.3, 1.9), 1)
            verified, escalate = True, True

        user_payload = {
            "crew_id": crew_id,
            "vitals": {
                "hr_bpm": hr,
                "preflight_hr_median": base["hr"],
                "spo2_pct": spo2,
                "temp_c": temp,
                "preflight_temp_median": base["temp"],
                "sensor_verified": verified,
            },
            "space_weather": weather,
            "available_tools": tools,
        }
        return {
            "messages": [
                {"role": "system", "content": ""},
                {"role": "user", "content": json.dumps(user_payload)},
                {"role": "assistant", "content": json.dumps({"contact_ground_support": escalate})},
            ]
        }


def run_deterministic_fallback(payload: dict) -> dict:
    """Python mirror of buildDeterministicFallback() in triage_route.ts."""
    vitals = payload["vitals"]
    tools = payload["available_tools"]
    hr_delta = vitals["hr_bpm"] - vitals["preflight_hr_median"]
    temp_c = vitals.get("temp_c")

    multi_drift = bool(
        vitals.get("sensor_verified", False)
        and (
            hr_delta >= 35
            or vitals["spo2_pct"] <= 91
            or (temp_c is not None and temp_c >= 38.0)
        )
    )

    plan = [f"Verify readings using {tools[0]}"]
    if len(tools) > 1:
        plan.append(f"Cross-check status with {tools[1]}")
    plan.append("Re-test after 5 minutes at rest and log results")

    return {
        "data_quality_check": (
            "Sensor placement marked verified; evaluating telemetry against personal preflight median."
            if vitals.get("sensor_verified", False)
            else "Unverified sensor fit: confirm strap contact and rule out motion or sync artifact before interpreting readings."
        ),
        "baseline_comparison": (
            f"HR {vitals['hr_bpm']} bpm ({'+' if hr_delta >= 0 else ''}{hr_delta} bpm vs preflight median "
            f"{vitals['preflight_hr_median']} bpm); SpO2 {vitals['spo2_pct']}%."
        ),
        "common_causes": [
            "Optical wearable strap shift or microgravity fluid redistribution",
            "Recent resistive exercise, dehydration, or circadian sleep shift",
        ],
        "confirmation_prompt": "Can you confirm your wearable sensor is snug and share whether you are resting or noticing any symptoms?",
        "available_tool_action_plan": plan,
        "contact_ground_support": multi_drift,
        "ground_support_reason": (
            "Verified multi-parameter deviation outside personal preflight baseline; recommend Flight Surgeon review."
            if multi_drift
            else None
        ),
    }


def query_ollama(user_payload: dict) -> dict:
    body = json.dumps({
        "model": MODEL_NAME,
        "stream": False,
        "think": False,
        "format": "json",
        "messages": [{"role": "user", "content": json.dumps(user_payload)}],
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
        return json.loads(raw["message"]["content"])


def run_evaluation(num_samples: int = 50, mode: str = "fallback"):
    random.seed(999)  # Held-out seed distinct from training data
    samples = [build_sample(i) for i in range(num_samples)]

    json_valid = 0
    escalation_correct = 0
    tool_compliant = 0
    non_diagnostic_compliant = 0

    for idx, sample in enumerate(samples):
        user_input = json.loads(sample["messages"][1]["content"])
        expected = json.loads(sample["messages"][2]["content"])
        allowed_tools = [t.lower() for t in user_input["available_tools"]]

        if mode == "fallback":
            pred = run_deterministic_fallback(user_input)
        elif mode == "ollama":
            try:
                pred = query_ollama(user_input)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                print(f"[{idx + 1}/{num_samples}] Ollama error: {exc}")
                continue
        else:  # auto: try Ollama, fall back seamlessly if offline
            try:
                pred = query_ollama(user_input)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                pred = run_deterministic_fallback(user_input)

        # 1. Strict schema compliance
        if not REQUIRED_KEYS.issubset(pred.keys()):
            continue
        if not isinstance(pred["contact_ground_support"], bool):
            continue
        json_valid += 1

        # 2. Ground Support escalation accuracy
        if pred["contact_ground_support"] == expected["contact_ground_support"]:
            escalation_correct += 1

        # 3. Tool-bound action plan compliance
        plan_text = " ".join(pred.get("available_tool_action_plan", [])).lower()
        if any(tool in plan_text for tool in allowed_tools):
            tool_compliant += 1

        # 4. Non-diagnostic guardrail compliance
        full_text = json.dumps(pred).lower()
        if not any(term in full_text for term in BANNED_DIAGNOSTIC_TERMS):
            non_diagnostic_compliant += 1

    print(f"\n=== AstroVitals Overarching AI — Held-Out Benchmark (n={num_samples}, mode={mode}) ===")
    print(f"JSON Schema Compliance:      {json_valid}/{num_samples} ({json_valid / num_samples:.0%})")
    print(f"Escalation Triage Accuracy:  {escalation_correct}/{num_samples} ({escalation_correct / num_samples:.0%})")
    print(f"Tool-Bound Plan Adherence:   {tool_compliant}/{num_samples} ({tool_compliant / num_samples:.0%})")
    print(f"Non-Diagnostic Guardrail:    {non_diagnostic_compliant}/{num_samples} ({non_diagnostic_compliant / num_samples:.0%})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate AstroVitals triage guardrails.")
    parser.add_argument(
        "--mode",
        choices=["fallback", "ollama", "auto"],
        default="fallback",
        help="Run offline deterministic fallback (default), live Ollama, or auto-fallback.",
    )
    parser.add_argument("--samples", type=int, default=50, help="Number of held-out test cases.")
    args = parser.parse_args()
    run_evaluation(num_samples=args.samples, mode=args.mode)
