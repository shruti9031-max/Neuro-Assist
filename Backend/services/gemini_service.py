from pathlib import Path
from dotenv import load_dotenv
import os
import logging
import asyncio
from google import genai
from google.genai import types
from models.voice_models import PageContext, VoiceCommandResponse
from services.command_parser import local_fallback_parser, checkout_state_dispatcher, _is_shopping_intent, check_open_website_command

logger = logging.getLogger("neuro-assist-backend")

from pydantic import BaseModel
from typing import Optional, List

class ChatSettings(BaseModel):
    dyslexia: Optional[bool] = None
    fontSize: Optional[int] = None
    lineHeight: Optional[int] = None
    letterSpacing: Optional[float] = None
    contrastTheme: Optional[str] = None
    colorBlindFilter: Optional[str] = None
    contrastFactor: Optional[int] = None
    simplifyWebsite: Optional[bool] = None

class ChatbotResponse(BaseModel):
    response: str
    settings: Optional[ChatSettings] = None
    actions: Optional[List[str]] = []

class GeminiService:
    def __init__(self):
        env_path = Path(__file__).resolve().parents[1] / ".env"
        load_dotenv(dotenv_path=env_path)
        
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            logger.warning("GEMINI_API_KEY environment variable is not set. Falling back to local rule-based parsing.")
            self.client = None
        else:
            try:
                self.client = genai.Client(api_key=self.api_key)
                logger.info("Gemini Service initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini Client: {e}")
                self.client = None

    async def parse_voice_command(self, command: str, page_context: PageContext = None) -> VoiceCommandResponse:
        # ── Open Website Pre-parser ──
        # Intercepts commands like "open myntra", "open flipkart", "open wikipedia"
        # and resolves them instantly to a VoiceCommandResponse.
        open_site_result = check_open_website_command(command)
        if open_site_result is not None:
            logger.info(
                f"Open website resolver matched: '{command}' -> "
                f"action='{open_site_result.action}', value='{open_site_result.value}'"
            )
            return open_site_result

        # ── Shopping / checkout state machine runs FIRST ─────────────────────
        # If the command is a shopping intent and page_context has button/link
        # labels, the dispatcher returns the exact click_button action without
        # calling Gemini at all. This is faster, free, and 100% deterministic.
        dispatcher_result = checkout_state_dispatcher(command, page_context)
        if dispatcher_result is not None:
            logger.info(
                f"Checkout dispatcher resolved: '{command}' -> "
                f"action='{dispatcher_result.action}', value='{dispatcher_result.value}'"
            )
            return dispatcher_result

        if not self.client:
            return local_fallback_parser(command)

        # ── CRITICAL GUARD: block LLM form-autofill for shopping intents ─────
        # The dispatcher already ran above. If it returned None it means either:
        #   (a) page_context had no useful buttons/links, or
        #   (b) the command was a noisy transcription variant (e.g. "by" for "buy")
        # In both cases the command is still a shopping intent and must NEVER be
        # sent to Gemini, which would misinterpret it as a form-autofill request.
        # We check both the raw command and a lowercased strip of it to handle
        # minor transcription noise (extra spaces, trailing punctuation, etc.).
        _cmd_clean = command.lower().strip().rstrip(".,?!")
        if _is_shopping_intent(command) or _is_shopping_intent(_cmd_clean):
            logger.warning(
                f"Shopping intent guard triggered for '{command}' — "
                "dispatcher found no matching button. Returning actionable speak."
            )
            return VoiceCommandResponse(
                action="unknown",
                value=None,
                speak=(
                    "I couldn't find that specific product or button on the screen. "
                    "Please scroll a bit to make sure it is visible and try again."
                ),
            )

        ctx_parts = []
        if page_context:
            pc = page_context
            if pc.url:              ctx_parts.append(f"Page URL: {pc.url}")
            if pc.title:            ctx_parts.append(f"Page Title: {pc.title}")
            if pc.selected_text:    ctx_parts.append(f"User Selected Text: {pc.selected_text}")
            if pc.visible_headings: ctx_parts.append(f"Visible Headings: {', '.join(pc.visible_headings[:8])}")
            if pc.visible_buttons:  ctx_parts.append(f"Visible Buttons: {', '.join(pc.visible_buttons[:12])}")
            if pc.visible_links:    ctx_parts.append(f"Visible Links: {', '.join(pc.visible_links[:12])}")
            if pc.visible_forms:    ctx_parts.append(f"Visible Form Fields: {', '.join(pc.visible_forms[:8])}")
            if pc.text_snippet:     ctx_parts.append(f"Page Text Snippet: {pc.text_snippet[:400]}")
        context_block = "\n".join(ctx_parts) if ctx_parts else "No page context available."

        system_instruction = (
            "You are a smart browser accessibility voice assistant. "
            "The user speaks commands in English, Hinglish, Punjabi, Hindi, Tamil, Telugu, Bengali, or other languages. "
            "1. Auto-detect the language the user is speaking in. "
            "2. Translate and interpret the user's voice command into a single browser action. "
            "3. Generate the response spoken confirmation message (in the 'speak' field) IN THE EXACT SAME LANGUAGE the user used. "
            "If they speak in Hindi, speak back in Hindi. If they speak Punjabi, speak back in Punjabi. "
            "Otherwise respond in English.\n\n"
            "SUPPORTED ACTIONS:\n"
            "1. scroll_up, 2. scroll_down, 3. scroll_top, 4. scroll_bottom, 5. click_button, 6. click_link, "
            "7. go_back, 8. go_forward, 9. refresh_page, 10. zoom_in, 11. zoom_out, 12. open_accessibility_dock, "
            "13. close_accessibility_dock, 14. simplify_website, 15. dark_mode, 16. light_mode, 17. read_selected_text, "
            "18. stop_speaking, 19. increase_font, 20. decrease_font, 21. highlight_headings, 22. open_chatbot, "
            "23. open_website (opens a website URL like google.com, value is the URL string), "
            "24. search_web_query (searches for a query, value is the search query string), "
            "25. search_product (search for a product on a shopping site, value is the search URL or query), "
            "26. add_to_cart (add the current product to cart), "
            "27. open_cart (navigate to the cart page), "
            "28. proceed_to_checkout (proceed from cart to checkout), "
            "29. apply_coupon (apply a promo or coupon code), "
            "30. select_payment_method (select a payment option, value is the method name), "
            "31. review_order (open the order summary or review page), "
            "32. payment_safety_freeze (stop automation on payment/OTP page — never click Pay/OTP/CVV), "
            "33. play_video (plays or resumes video playback on the page), "
            "34. pause_video (pauses video playback on the page), "
            "35. next_video (plays the next video on the page), "
            "36. like_video (likes the current video), "
            "37. comment_video (adds a comment text to the video, value is the comment string)\n\n"
            "E-COMMERCE CHECKOUT RULES (CRITICAL — follow exactly):\n"
            "When the user gives a shopping or checkout command, inspect the Visible Buttons and Visible Links "
            "to determine which step of the checkout funnel is currently active, then return ONLY the next step:\n"
            "  STATE A — Product page: If you see 'Add to Cart', 'Buy Now', or 'Add to Bag' in Visible Buttons, "
            "use action='click_button' with value set to that exact button label.\n"
            "  STATE B — Cart page: If the URL contains '/cart' or you see 'Proceed to Checkout' / 'Place Order', "
            "use action='click_button' with value set to that exact button label.\n"
            "  STATE C — Address/delivery page: If URL contains '/address' or '/delivery', or you see "
            "'Deliver Here' / 'Continue' / 'Next', use action='click_button' with that label.\n"
            "  STATE D — Payment page (OTP / CVV / UPI PIN entry visible in page text, "
            "or URL contains 'pay/confirm' / 'pay-now'): "
            "ALWAYS use action='payment_safety_freeze'. "
            "NEVER click Pay Now, Submit OTP, Enter CVV, or Confirm Payment. "
            "speak must tell the user to complete payment manually.\n"
            "  NOTE: A payment *method selection* page (showing UPI, Card, COD options) "
            "is NOT a STATE D page — respond with action='click_button' on the chosen method.\n"
            "FALLBACK: If the required button is not visible in page context, "
            "tell the user to scroll to the product or navigate to the correct page first.\n"
        )

        prompt = (
            f"CURRENT PAGE CONTEXT:\n{context_block}\n\n"
            f"USER VOICE COMMAND: \"{command}\"\n\n"
            "Analyze the command and output structured JSON matching the VoiceCommandResponse schema."
        )

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=VoiceCommandResponse,
                        temperature=0.0,
                    )
                ),
                timeout=4.0
            )
            result = VoiceCommandResponse.model_validate_json(response.text)
            logger.info(f"Gemini parsed: '{command}' -> action='{result.action}', value='{result.value}', speak='{result.speak}'")
            return result
        except asyncio.TimeoutError:
            logger.error("Gemini API call timed out. Falling back to rule-based fallback.")
            return local_fallback_parser(command)
        except Exception as e:
            logger.error(f"Gemini API error: {e}. Falling back to rule-based fallback.")
            return local_fallback_parser(command)

    async def parse_copilot_autofill(self, fields: list, user_prompt: str, user_profile: dict = None) -> dict:
        if not self.client:
            return None

        profile_str = ""
        if user_profile:
            profile_str = f"\nSAVED USER PROFILE MEMORY:\n{user_profile}\n"

        prompt = (
            "You are an AI Form Filling Assistant. "
            "Analyze input form fields and generate context-aware values to autofill.\n"
            "STRICT PRIVACY RULE: NEVER predict or return payment PINs, OTPs, CVVs, Passkeys, or passwords.\n\n"
            f"USER PROMPT / INSTRUCTION: \"{user_prompt}\"\n"
            f"{profile_str}\n"
            "FORM FIELDS LIST:\n"
        )
        for f in fields:
            prompt += (
                f"- ID: '{f.get('id', '')}', Name: '{f.get('name', '')}', Type: '{f.get('type', '')}', "
                f"Label: '{f.get('label', '')}', Placeholder: '{f.get('placeholder', '')}', "
                f"Autocomplete: '{f.get('autocomplete', '')}', SemanticRole: '{f.get('semanticRole', '')}', "
                f"Context: '{f.get('context', '')}', Confidence: {f.get('confidence', 0.0)}, Options: {f.get('options', [])}\n"
            )
            
        prompt += (
            "\nReturn a JSON object: { \"predictions\": { \"field_id_or_name\": \"value\" } }. "
            "Use the most semantic field key available. Prefer field labels, semantic roles, and autocomplete hints."
        )

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                    )
                ),
                timeout=6.0
            )
            import json
            res_data = json.loads(response.text)
            return res_data.get("predictions", {})
        except Exception as e:
            logger.error(f"Gemini copilot autofill error: {e}")
            return None

    async def parse_autonomous_navigation(self, instruction: str, page_context: dict = None, user_profile: dict = None) -> dict:
        if not self.client:
            return None

        prompt = (
            "You are an Autonomous Web Navigation Agent. "
            "Convert user goal instructions into a sequence of DOM actions.\n"
            "Do not emit CSS selectors, website-specific IDs, or fixed DOM paths. Use semantic target descriptions such as 'search field', 'add to cart button', 'checkout button', or 'shipping address field'.\n\n"
            f"Goal Instruction: \"{instruction}\"\n"
            f"Page Context: {page_context or {}}\n"
            f"User Profile: {user_profile or {}}\n\n"
            "Supported Actions: type, click, scroll, select, next_page, add_to_cart, payment_safety_freeze, autofill\n"
            "Return JSON matching: { \"plan\": [ { \"action\": \"...\", \"target\": \"...\", \"value\": \"...\", \"message\": \"...\" } ], \"message\": \"...\" }"
        )

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    )
                ),
                timeout=5.0
            )
            import json
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Gemini autonomous navigation error: {e}")
            return None

    async def chat_with_copilot(self, message: str, context: str) -> dict:
        if not self.client:
            return self._local_chat_fallback(message)

        system_instruction = (
            "You are Neuro assist, an empathetic and intelligent Accessibility Copilot. "
            "STRICT LANGUAGE RULE: You MUST reply in the EXACT SAME LANGUAGE that the user used in their message. "
            "If the user types in English, reply in English. If they type in Hindi/Hinglish, reply in Hindi/Hinglish. Never switch languages arbitrarily.\n\n"
            "SPECIFIC USER SCENARIOS & MAPPINGS:\n"
            "1. If the user says they cannot use their hands, have hand mobility issues, or can't use a mouse/keyboard: "
            "Set actions to: ['enable_voice', 'enable_gesture'] so both voice and gesture controls appear.\n"
            "2. If the user mentions reading difficulty, can't read properly, or has dyslexia: "
            "Set 'dyslexia': true and adjust 'fontSize' or 'lineHeight' to make reading easy.\n"
            "3. If the user says they don't understand the website, find it too cluttered, messy, or confusing: "
            "Set 'simplifyWebsite': true to clean up the page.\n"
            "4. If the user says 'undo', 'reset', 'normal', 'revert', or wants to go back to default settings: "
            "Set dyslexia: false, simplifyWebsite: false, contrastTheme: 'none', colorBlindFilter: 'none', fontSize: 100, and include action 'reset_settings'.\n\n"
            "VALID SETTINGS (Only include what needs to change, leave others null unless resetting):\n"
            "- dyslexia: boolean\n"
            "- fontSize: int (50 to 200)\n"
            "- lineHeight: int (15 to 25)\n"
            "- letterSpacing: float (0 to 4)\n"
            "- contrastTheme: 'none', 'hc-dark', 'hc-light', 'monochrome'\n"
            "- colorBlindFilter: 'none', 'protanopia', 'deuteranopia', 'tritanopia'\n"
            "- contrastFactor: int (50 to 180)\n"
            "- simplifyWebsite: boolean\n\n"
            "VALID ACTIONS (List of strings):\n"
            "- 'enable_voice': to enable voice navigation.\n"
            "- 'enable_gesture': to enable gesture/hand tracking.\n"
            "- 'reset_settings': to reset all accessibility settings back to default.\n\n"
            "Always return the data in strict JSON matching the schema."
        )

        prompt = f"Page Context: {context[:500]}\nUser Message: {message}"

        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_schema=ChatbotResponse,
                        temperature=0.3,
                    )
                ),
                timeout=6.0
            )
            import json
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Chatbot error or Quota limit hit: {e}. Switching to local rule-based fallback.")
            return self._local_chat_fallback(message)

    def _local_chat_fallback(self, message: str) -> dict:
        msg = message.lower()
        settings = {}
        actions = []
        response_text = "I am helping you with that right now."

        if "undo" in msg or "reset" in msg or "normal" in msg or "revert" in msg or "wapas" in msg or "default" in msg:
            settings = {
                "dyslexia": False,
                "fontSize": 100,
                "simplifyWebsite": False,
                "contrastTheme": "none",
                "colorBlindFilter": "none"
            }
            actions = ["reset_settings"]
            response_text = "I have undone the changes and reset all accessibility settings back to normal."
        elif "hand" in msg or "unable" in msg or "haath" in msg or "mouse" in msg:
            actions = ["enable_voice", "enable_gesture"]
            response_text = "I have enabled both voice and gesture controls for you since you cannot use your hands."
        elif "read" in msg or "dyslexia" in msg or "dylexsia" in msg or "pdhne" in msg:
            settings["dyslexia"] = True
            settings["fontSize"] = 120
            response_text = "I have activated dyslexia-friendly mode and adjusted the font for easier reading."
        elif "understand" in msg or "clutter" in msg or "smjh" in msg or "confusing" in msg or "mess" in msg:
            settings["simplifyWebsite"] = True
            response_text = "I have simplified the website to make it clean and easy to understand."
        elif "dark" in msg or "black" in msg or "night" in msg:
            settings["contrastTheme"] = "hc-dark"
            response_text = "Dark mode has been enabled."
        elif "large" in msg or "big" in msg or "zoom" in msg:
            settings["fontSize"] = 130
            response_text = "Font size has been increased."
        else:
            response_text = "I have applied the necessary accessibility adjustments for you."

        return {
            "response": response_text,
            "settings": settings if settings else None,
            "actions": actions
        }