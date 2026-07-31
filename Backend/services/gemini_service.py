from pathlib import Path
from dotenv import load_dotenv
import os
import logging
import asyncio
from google import genai
from google.genai import types

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
            try:
                self.client = genai.Client(api_key=self.api_key)
                logger.info("Gemini Service initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini Client: {e}")
                self.client = None

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

gemini_service = GeminiService()