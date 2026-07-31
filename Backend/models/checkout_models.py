# ─────────────────────────────────────────────────────────────────────────────
# checkout_models.py — Pydantic contracts for the voice-triggered checkout flow
#
# Naming rationale:
#   VoiceIntentPayload   — what the client sends (the resolved shopping intent)
#   CheckoutLineItem     — a single product the user wants to purchase
#   AccessibleCheckoutTrigger — the envelope the endpoint returns to the frontend
#   BiometricIntentPayload  — nested payload that drives the Zero-Type UI
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class CheckoutLineItem(BaseModel):
    """A single product resolved from the voice command context."""

    item_id: str = Field(
        ...,
        description="Stable product/SKU identifier from the originating page.",
        examples=["SKU-IPHONE-17-256-BLK"],
    )
    name: str = Field(
        ...,
        description="Human-readable product name shown in the review UI.",
        examples=["Apple iPhone 17 — 256 GB, Midnight Black"],
    )
    amount: str = Field(
        ...,
        description="Display-ready price string including currency symbol.",
        examples=["₹89,900"],
    )
    quantity: int = Field(default=1, ge=1, description="Units the user intends to buy.")


class VoiceIntentPayload(BaseModel):
    """
    Incoming request body sent by the Chrome extension after the checkout
    state-machine resolves a confirmed 'buy' or 'proceed to checkout' intent.
    """

    session_id: str = Field(
        ...,
        description="Extension-side UUID that links this request to the active voice session.",
    )
    confirmed_intent: str = Field(
        ...,
        description="The canonical shopping action that was confirmed (e.g. 'buy', 'proceed_to_checkout').",
    )
    line_items: List[CheckoutLineItem] = Field(
        ...,
        min_length=1,
        description="One or more products the user has confirmed purchasing.",
    )
    preferred_payment_method: Optional[str] = Field(
        default=None,
        description="Payment method already voiced by the user, if any (e.g. 'UPI', 'Cash on Delivery').",
    )
    originating_url: Optional[str] = Field(
        default=None,
        description="The page URL where the intent was captured — used for merchant context.",
    )
    # Ordinal extracted from commands like "buy the second one" → item_position=1
    item_position: Optional[int] = Field(
        default=None,
        ge=0,
        description=(
            "0-based index of the product the user referred to by ordinal "
            "(e.g. 'first'→0, 'second'→1). Forwarded verbatim to the frontend."
        ),
    )

    @field_validator("confirmed_intent", mode="before")
    @classmethod
    def _validate_intent(cls, value: str) -> str:
        value_lower = value.lower().strip()
        
        # Map common mic transcription errors to valid backend intents
        transcription_fallbacks = {
            "add to cut": "add_to_cart",
            "add to card": "add_to_cart",
            "at to cart": "add_to_cart",
            "add 2 cart": "add_to_cart",
            "by this product": "buy_this_product",
            "by this": "buy_this",
            "by now": "buy_now",
            "check out": "proceed_to_checkout"
        }
        
        # Apply corrections before standard validation
        for typo, correct_intent in transcription_fallbacks.items():
            if typo in value_lower:
                value_lower = value_lower.replace(typo, correct_intent)

        normalised = value_lower.replace(" ", "_")

        allowed = {
            "buy", "buy_now", "buy_this", "buy_this_product",
            "add_to_cart", "proceed_to_checkout", "place_order",
        }
        
        if normalised not in allowed:
            raise ValueError(
                f"'{value}' (normalized to '{normalised}') is not a recognised checkout intent. "
                f"Allowed values: {sorted(allowed)}"
            )
        return normalised


class BiometricIntentPayload(BaseModel):
    """
    Nested payload forwarded to the frontend's AccessibleGatewayManager.
    Drives the Zero-Type biometric / UPI push flow instead of card-form inputs.
    """

    item_id: str = Field(description="Primary SKU for the biometric auth request.")
    item_name: str = Field(description="Display name shown in the payment bento card.")
    amount: str = Field(description="Authorisation amount with currency symbol.")
    quantity: int = Field(default=1)
    payment_method: str = Field(
        default="UPI_PUSH",
        description=(
            "Resolved payment channel. "
            "'UPI_PUSH' triggers a silent UPI intent; "
            "'COD' skips biometric and confirms directly."
        ),
    )
    session_id: str = Field(description="Echoed from the incoming VoiceIntentPayload.")
    aria_announcement: str = Field(
        description="Pre-composed ARIA live-region text read aloud by the screen reader.",
    )
    # 0-based position of the product card / "Add to Cart" button on the page.
    # None  → click the first (and usually only) match.
    # 1     → click the second button ("buy second item").
    item_position: int | None = Field(
        default=None,
        ge=0,
        description=(
            "0-based index of the 'Add to Cart' button to click on the current page. "
            "Null means click the first visible match. "
            "Populated from the ordinal in the user's voice command."
        ),
    )


class AccessibleCheckoutTrigger(BaseModel):
    """
    Top-level response contract.  The frontend VoiceCheckoutBridge inspects
    `action` first; if it equals 'trigger_accessible_checkout' it hands the
    `payload` to AccessibleGatewayManager.
    """

    action: str = Field(
        default="trigger_accessible_checkout",
        description="Sentinel value the frontend listens for.",
    )
    payload: BiometricIntentPayload
    speak: str = Field(
        description="TTS confirmation string for the voice engine's speakResponse().",
    )