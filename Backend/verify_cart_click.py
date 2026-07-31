"""
Verify the item_position field flows correctly from VoiceIntentPayload
→ resolve_voice_checkout_intent → AccessibleCheckoutTrigger.payload.item_position
"""
import sys, asyncio
sys.path.insert(0, ".")

from models.checkout_models import (
    VoiceIntentPayload, CheckoutLineItem,
    BiometricIntentPayload, AccessibleCheckoutTrigger,
)
from routers.checkout import resolve_voice_checkout_intent
import json

results = []

def check(label, ok):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}")

# ── Model accepts item_position ─────────────────────────────────────────────
item = CheckoutLineItem(item_id="SKU-MOUSE-HP", name="HP X1000 USB Mouse", amount="₹599")

print("=== VoiceIntentPayload: item_position field ===")

intent_default = VoiceIntentPayload(
    session_id="vs-test-001", confirmed_intent="buy",
    line_items=[item],
)
check("item_position defaults to None",        intent_default.item_position is None)

intent_second = VoiceIntentPayload(
    session_id="vs-test-002", confirmed_intent="buy",
    line_items=[item], item_position=1,
)
check("item_position=1 accepted",              intent_second.item_position == 1)

intent_first = VoiceIntentPayload(
    session_id="vs-test-003", confirmed_intent="buy",
    line_items=[item], item_position=0,
)
check("item_position=0 accepted (first item)", intent_first.item_position == 0)

try:
    VoiceIntentPayload(
        session_id="x", confirmed_intent="buy",
        line_items=[item], item_position=-1,
    )
    check("Negative item_position rejected",   False)
except Exception:
    check("Negative item_position rejected",   True)

# ── Endpoint threads item_position into response ─────────────────────────────
print()
print("=== Endpoint: item_position threaded through ===")

async def call(intent):
    return await resolve_voice_checkout_intent(intent)

for label, intent, expected_pos in [
    ("None → payload.item_position is None",    intent_default, None),
    ("0    → payload.item_position == 0",        intent_first,  0),
    ("1    → payload.item_position == 1",        intent_second, 1),
]:
    resp = asyncio.run(call(intent))
    body = json.loads(resp.body)
    got  = body["payload"].get("item_position")
    check(label, got == expected_pos)
    if got != expected_pos:
        print(f"         got={got!r}  expected={expected_pos!r}")

# ── BiometricIntentPayload: field is Optional[int] ───────────────────────────
print()
print("=== BiometricIntentPayload: item_position field ===")

bip_none = BiometricIntentPayload(
    item_id="x", item_name="y", amount="z",
    session_id="s", aria_announcement="a",
)
check("item_position defaults to None",  bip_none.item_position is None)

bip_with = BiometricIntentPayload(
    item_id="x", item_name="y", amount="z",
    session_id="s", aria_announcement="a", item_position=1,
)
check("item_position=1 stored correctly", bip_with.item_position == 1)

# ── Full JSON structure ───────────────────────────────────────────────────────
print()
print("=== Full JSON response structure ===")
resp = asyncio.run(call(intent_second))
body = json.loads(resp.body)
check('action == "trigger_accessible_checkout"', body["action"] == "trigger_accessible_checkout")
check("payload.item_position == 1",              body["payload"]["item_position"] == 1)
check("payload.item_id present",                 body["payload"]["item_id"] == "SKU-MOUSE-HP")
check("speak non-empty",                         len(body.get("speak","")) > 5)
print()
print("Response JSON:")
print(json.dumps(body, indent=2, ensure_ascii=False))

print()
passed = sum(results)
total  = len(results)
print(f"=== RESULT: {passed}/{total} tests passed ===")
if passed == total:
    print("ALL CHECKS PASSED")
sys.exit(0 if passed == total else 1)
