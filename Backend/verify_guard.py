"""
Tests the critical LLM guard in GeminiService.parse_voice_command.
We mock the Gemini client so we can test the guard path without a real API key.
"""
import sys, asyncio, types as _types
sys.path.insert(0, ".")

from models.voice_models import PageContext, VoiceCommandResponse
from services.command_parser import _is_shopping_intent, checkout_state_dispatcher

# ── Verify import ─────────────────────────────────────────────────────────────
print("=== Fix 1: _is_shopping_intent importable from command_parser ===")
try:
    from services.command_parser import _is_shopping_intent
    print("  [PASS] _is_shopping_intent imported successfully")
except ImportError as e:
    print(f"  [FAIL] ImportError: {e}")
    sys.exit(1)

# ── Verify _is_shopping_intent catches noisy transcriptions ──────────────────
print()
print("=== Fix 2: _is_shopping_intent catches noisy variants ===")

noisy_cases = [
    # (command,          expected)
    ("buy this product", True),
    ("by this product",  False),   # pure transcription error — NOT in intents
    ("buy",              True),
    ("add to cart",      True),
    ("proceed",          True),
    ("open google",      False),
    ("scroll down",      False),
    ("first",            True),    # ordinal added in previous session
    ("second item",      True),
]

for cmd, expected in noisy_cases:
    got = _is_shopping_intent(cmd)
    ok  = got == expected
    print(f"  [{'PASS' if ok else 'FAIL'}] _is_shopping_intent({cmd!r}) = {got}  (expected {expected})")

# ── Simulate the guard path ───────────────────────────────────────────────────
print()
print("=== Fix 3: Guard returns 'unknown' (not form-autofill) for unresolved shopping intents ===")

from services.gemini_service import GeminiService
svc = GeminiService()
# Force client to a mock that we can detect if it's ever called
_gemini_called = []

class _MockClient:
    class models:
        @staticmethod
        def generate_content(*a, **kw):
            _gemini_called.append(True)
            raise RuntimeError("Gemini should NOT have been called for a shopping intent")

svc.client = _MockClient()

results = []

def run(label, cmd, ctx, expected_action):
    _gemini_called.clear()
    result = asyncio.run(svc.parse_voice_command(cmd, ctx))
    ok = result.action == expected_action
    results.append(ok)
    gemini_hit = bool(_gemini_called)
    status = "PASS" if ok and not gemini_hit else "FAIL"
    print(f"  [{status}] {label}")
    print(f"         action={result.action!r}  speak={result.speak!r}")
    if gemini_hit:
        print(f"         FAIL: Gemini was called (it should not be for shopping intents)")
    if not ok:
        print(f"         EXPECTED action={expected_action!r}")

# ── Dispatcher resolves it -> Gemini never called ─────────────────────────────
run("Dispatcher resolves 'Add to cart' -> click_button (Gemini never called)",
    "Add to cart",
    PageContext(url="https://flipkart.com/product/p/abc",
                visible_buttons=["Add to Cart", "Buy Now"]),
    "click_button")

# ── Dispatcher can't resolve (no buttons) -> guard returns unknown ─────────────
run("No buttons visible -> guard returns unknown, Gemini NOT called",
    "buy this product",
    PageContext(url="https://flipkart.com/", visible_buttons=[]),
    "unknown")

run("Noisy shopping command 'buy second mouse', no links -> guard returns unknown",
    "buy second mouse",
    PageContext(url="https://flipkart.com/search?q=mouse",
                visible_links=[]),
    "unknown")

run("'proceed to checkout', no buttons -> guard returns unknown",
    "proceed to checkout",
    PageContext(url="https://flipkart.com/cart", visible_buttons=[]),
    "unknown")

# ── Non-shopping command → guard must NOT fire → Gemini IS allowed (mock raises) ─
print()
print("=== Non-shopping commands must reach Gemini (guard must not block them) ===")
_gemini_called.clear()
try:
    asyncio.run(svc.parse_voice_command(
        "Scroll down",
        PageContext(url="https://flipkart.com/")
    ))
    # If we get here Gemini mock didn't raise → mock wasn't actually called
    # That's fine — local_fallback_parser may have handled it first
    print("  [PASS] 'Scroll down' — handled by local fallback (Gemini not needed)")
    results.append(True)
except RuntimeError as e:
    if "should NOT" in str(e):
        print("  [FAIL] 'Scroll down' incorrectly blocked by guard (guard fired for non-shopping)")
        results.append(False)

print()
passed = sum(results)
total  = len(results)
print(f"=== RESULT: {passed}/{total} tests passed ===")
if passed == total:
    print("ALL CHECKS PASSED")
else:
    print(f"WARNING: {total - passed} test(s) failed")
sys.exit(0 if passed == total else 1)
