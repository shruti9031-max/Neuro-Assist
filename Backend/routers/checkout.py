# ─────────────────────────────────────────────────────────────────────────────
# routers/checkout.py — Voice-triggered Zero-Type checkout endpoint
#
# Route  : POST /api/checkout/voice-intent
# Purpose: Receives a confirmed shopping intent from the Chrome extension's
#          checkout state-machine, resolves the preferred payment channel,
#          and returns a structured AccessibleCheckoutTrigger that the
#          frontend VoiceCheckoutBridge intercepts to launch the biometric
#          / UPI-push UI instead of any traditional card-input form.
#
# Safety : This endpoint NEVER processes, stores, or forwards card numbers,
#          OTPs, CVVs, or UPI PINs.  It only emits an intent trigger.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from models.checkout_models import (
    VoiceIntentPayload,
    AccessibleCheckoutTrigger,
    BiometricIntentPayload,
)

logger = logging.getLogger("neuro-assist-backend")

# ── Router declaration ────────────────────────────────────────────────────────
checkout_router = APIRouter(
    prefix="/api/checkout",
    tags=["Accessible Checkout"],
)


# ── Payment channel resolution ────────────────────────────────────────────────

_PAYMENT_CHANNEL_MAP: dict[str, str] = {
    # voiced method      → internal channel token
    "upi":               "UPI_PUSH",
    "upi push":          "UPI_PUSH",
    "google pay":        "UPI_PUSH",
    "phonepe":           "UPI_PUSH",
    "paytm":             "UPI_PUSH",
    "cash on delivery":  "COD",
    "cod":               "COD",
    "pay on delivery":   "COD",
    "net banking":       "NET_BANKING",
    "credit card":       "CARD",
    "debit card":        "CARD",
}

_ARIA_TEMPLATES: dict[str, str] = {
    "UPI_PUSH":    (
        "Your order for {name} at {amount} is ready. "
        "A silent UPI payment request has been sent to your registered device. "
        "Please approve it on your phone — no typing required."
    ),
    "COD":         (
        "Your order for {name} at {amount} is confirmed for Cash on Delivery. "
        "No payment is needed right now. Please review your order summary."
    ),
    "NET_BANKING": (
        "Your order for {name} at {amount} is ready. "
        "Please complete the net-banking authorisation on the next screen."
    ),
    "CARD":        (
        "Your order for {name} at {amount} is ready. "
        "Please approve the payment on the next screen. "
        "The AI assistant will never enter your card details automatically."
    ),
}

def _resolve_payment_channel(voiced_method: Optional[str]) -> str:
    """Map a voiced payment preference to an internal channel token.

    Defaults to UPI_PUSH when no preference was captured — the most
    frictionless zero-type channel for Indian users.
    """
    if not voiced_method:
        return "UPI_PUSH"
    return _PAYMENT_CHANNEL_MAP.get(voiced_method.lower().strip(), "UPI_PUSH")


def _compose_aria_announcement(channel: str, item_name: str, amount: str) -> str:
    template = _ARIA_TEMPLATES.get(channel, _ARIA_TEMPLATES["UPI_PUSH"])
    return template.format(name=item_name, amount=amount)


def _compose_tts_confirmation(channel: str, item_name: str, amount: str) -> str:
    """Short spoken confirmation for voiceEngine.speakResponse()."""
    if channel == "COD":
        return f"Order confirmed for {item_name}. Cash on Delivery — no payment needed now."
    if channel == "CARD":
        return (
            f"Ready to pay {amount} for {item_name}. "
            "Please complete the payment on screen — I will not enter any card details."
        )
    return (
        f"Sending a silent UPI request for {item_name} at {amount}. "
        "Please approve on your phone."
    )


# ── Endpoint ──────────────────────────────────────────────────────────────────

@checkout_router.post(
    "/voice-intent",
    response_model=AccessibleCheckoutTrigger,
    summary="Resolve a confirmed voice shopping intent into a biometric/UPI checkout trigger",
    response_description=(
        "An AccessibleCheckoutTrigger whose `action` field equals "
        "'trigger_accessible_checkout'. The frontend VoiceCheckoutBridge "
        "intercepts this and launches the Zero-Type payment UI."
    ),
)
async def resolve_voice_checkout_intent(
    intent: VoiceIntentPayload,
) -> JSONResponse:
    """
    Accept a confirmed shopping intent from the Chrome extension and return
    a structured trigger that the frontend can intercept.

    **What this endpoint does:**
    1. Validates the incoming `VoiceIntentPayload` (Pydantic handles this).
    2. Resolves the preferred payment channel from the voiced method (or defaults to UPI_PUSH).
    3. Composes accessibility-first ARIA and TTS strings.
    4. Returns an `AccessibleCheckoutTrigger` — the frontend sentinel that
       bypasses all card-form autofill and launches the biometric UI.

    **What this endpoint never does:**
    - Processes card numbers, OTPs, CVVs, or UPI PINs.
    - Submits or confirms any actual payment transaction.
    - Stores any personally identifiable payment data.
    """

    logger.info(
        "voice-checkout-intent received | session=%s intent=%s items=%d",
        intent.session_id,
        intent.confirmed_intent,
        len(intent.line_items),
    )

    # Use the first line item as the primary product for the UI.
    # Multi-item orders show the first item name + a count suffix.
    primary = intent.line_items[0]
    display_name = (
        primary.name
        if len(intent.line_items) == 1
        else f"{primary.name} + {len(intent.line_items) - 1} more"
    )

    # Aggregate display amount (simple sum string for single-item; label for multi)
    display_amount = primary.amount

    # Resolve payment channel
    channel = _resolve_payment_channel(intent.preferred_payment_method)

    # Compose accessibility strings
    aria_text = _compose_aria_announcement(channel, display_name, display_amount)
    tts_text  = _compose_tts_confirmation(channel, display_name, display_amount)

    # Build and return the trigger
    trigger = AccessibleCheckoutTrigger(
        action="trigger_accessible_checkout",
        payload=BiometricIntentPayload(
            item_id           = primary.item_id,
            item_name         = display_name,
            amount            = display_amount,
            quantity          = primary.quantity,
            payment_method    = channel,
            session_id        = intent.session_id,
            aria_announcement = aria_text,
            item_position     = intent.item_position,   # thread ordinal through
        ),
        speak=tts_text,
    )

    logger.info(
        "voice-checkout-trigger emitted | session=%s channel=%s item=%s amount=%s",
        intent.session_id,
        channel,
        primary.item_id,
        display_amount,
    )

    # Return as JSONResponse so the raw dict is forwarded unchanged to the
    # frontend VoiceCheckoutBridge without any Pydantic serialisation alias
    # surprises on older FastAPI versions.
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=trigger.model_dump(),
    )
