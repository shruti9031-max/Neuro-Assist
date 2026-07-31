import os
import sys
import logging
from pathlib import Path

# Setup paths dynamically to ensure relative imports work under uvicorn reload
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(backend_dir.parent) not in sys.path:
    sys.path.insert(0, str(backend_dir.parent))

from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError
from routers.voice import router as voice_router
from routers.copilot import router as copilot_router
from routers.checkout import checkout_router

# Load environment variables
from pathlib import Path
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neuro-assist-backend")

app = FastAPI(title="Neuro-Assist Backend Engine")

# CORS Middleware for Chrome Extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice_router)
app.include_router(copilot_router)
app.include_router(checkout_router)

class SimplifyRequest(BaseModel):
    texts: List[str]

class SimplificationResponse(BaseModel):
    simplified_texts: List[str]

# Simple rule-based mock fallback for text simplification
def fallback_simplify(text: str) -> str:
    if not text or not text.strip():
        return text
    
    replacements = {
        "utilize": "use",
        "utilizing": "using",
        "subsequent": "next",
        "terminate": "end",
        "initiate": "start",
        "assist": "help",
        "frequently": "often",
        "additional": "more",
        "furthermore": "also",
        "consequently": "so",
        "approximately": "about",
        "purchase": "buy",
        "require": "need",
        "request": "ask for",
        "verify": "check",
        "authentication": "sign-in",
        "accessibility": "easy to use",
        "navigation": "moving around",
        "configure": "setup",
    }
    
    words = text.split()
    for i, word in enumerate(words):
        # Extract punctuation
        punc_start = ""
        punc_end = ""
        clean_word = word
        
        while clean_word and not clean_word[0].isalnum():
            punc_start += clean_word[0]
            clean_word = clean_word[1:]
        while clean_word and not clean_word[-1].isalnum():
            punc_end = clean_word[-1] + punc_end
            clean_word = clean_word[:-1]
            
        lower_clean = clean_word.lower()
        if lower_clean in replacements:
            rep = replacements[lower_clean]
            if clean_word and clean_word[0].isupper():
                rep = rep.capitalize()
            words[i] = punc_start + rep + punc_end
            
    simplified = " ".join(words)
    # Append a small tag to longer texts to visually show mock simplification happened
    if len(simplified) > 60:
        simplified = simplified + " (Simplified)"
    return simplified

@app.get("/")
def home():
    api_key_status = "set" if os.environ.get("GEMINI_API_KEY") else "missing (using fallback mock)"
    return {
        "status": "success", 
        "message": "Neuro-Assist Backend Engine is Live!",
        "gemini_api_key": api_key_status
    }

@app.post("/api/simplify", response_model=SimplificationResponse)
async def simplify_text(request: SimplifyRequest):
    if not request.texts:
        return SimplificationResponse(simplified_texts=[])
        
    api_key = os.environ.get("GEMINI_API_KEY")
    
    if not api_key:
        logger.warning("GEMINI_API_KEY environment variable is not set. Using rule-based fallback simplification.")
        simplified = [fallback_simplify(t) for t in request.texts]
        return SimplificationResponse(simplified_texts=simplified)
        
    try:
        # Initialize Google GenAI Client
        client = genai.Client(api_key=api_key)
        
        # Prepare the list of texts to simplify
        # We prompt the model to return a structured JSON conforming to SimplificationResponse
        prompt = (
            "You are a web accessibility assistant specialized in cognitive simplification. "
            "Your task is to simplify the list of web text strings provided below so they are extremely "
            "easy to read and understand for elderly users or individuals with cognitive disabilities "
            "(such as dyslexia, ADHD, or mild cognitive impairment).\n\n"
            "Rules:\n"
            "1. Simplify each text independently and keep the output length similar to or shorter than the input.\n"
            "2. Use simple, direct, active language and a basic vocabulary.\n"
            "3. Keep any critical numbers, proper nouns, and general meaning.\n"
            "4. Return a structured JSON containing a 'simplified_texts' field which is a list/array of simplified texts. "
            "There must be a 1-to-1 match in order and length between the input array and output array.\n\n"
            f"Texts to simplify:\n{request.texts}"
        )
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SimplificationResponse,
                temperature=0.1,
            ),
        )
        
        # Parse the structured JSON response
        result = SimplificationResponse.model_validate_json(response.text)
        
        # Verify response length matches input length
        if len(result.simplified_texts) != len(request.texts):
            logger.warning(
                f"Gemini output list size ({len(result.simplified_texts)}) does not match input size ({len(request.texts)}). "
                "Falling back to element-by-element mock or truncation."
            )
            # Adjust length or fallback
            if len(result.simplified_texts) < len(request.texts):
                diff = len(request.texts) - len(result.simplified_texts)
                result.simplified_texts.extend([fallback_simplify(request.texts[i]) for i in range(len(result.simplified_texts), len(request.texts))])
            else:
                result.simplified_texts = result.simplified_texts[:len(request.texts)]
                
        return result
        
    except Exception as e:
        logger.error(f"Error during Gemini simplification: {e}. Falling back to rule-based simplification.")
        simplified = [fallback_simplify(t) for t in request.texts]
        return SimplificationResponse(simplified_texts=simplified)

# (Voice Command Models migrated to Backend/models/voice_models.py)


class AccessibilitySettings(BaseModel):
    dyslexia: Optional[bool] = None
    simplifyWebsite: Optional[bool] = None
    fontSize: Optional[int] = None
    lineHeight: Optional[int] = None
    letterSpacing: Optional[int] = None
    contrastTheme: Optional[str] = None
    colorBlindFilter: Optional[str] = None
    contrastFactor: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    settings: Optional[AccessibilitySettings] = None
    actions: Optional[List[str]] = None

@app.post(("/api/copilot/chat"), response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not request.message or not request.message.strip():
        return ChatResponse(response="Please enter a message.")
        
    api_key = os.environ.get("GEMINI_API_KEY")
    
    # Simple rule-based mock helper for fallback
    def get_fallback_settings_and_response(msg: str) -> ChatResponse:
        lower_msg = msg.lower()
        settings = {}
        actions = None
        
        # Check for hand disability mention
        is_hand_disabled = any(x in lower_msg for x in ["hand", "cant use my hand", "cannot use my hand", "cant use hand", "no hand", "broken hand", "paralyzed", "हाथ", "ਹੱਥ"])
        
        if is_hand_disabled:
            resp = "I understand you have difficulty using your hands. I can enable alternative navigation modes for you. Please choose one of the options below:"
            actions = ["enable_voice", "enable_gesture"]
        # Undo / Revert settings to original
        elif "undo" in lower_msg or "revert" in lower_msg or "reset" in lower_msg or "original" in lower_msg or "हटाओ" in lower_msg or "ਵਾਪਸ" in lower_msg:
            settings["dyslexia"] = False
            settings["simplifyWebsite"] = False
            settings["fontSize"] = 100
            settings["lineHeight"] = 15
            settings["letterSpacing"] = 0
            settings["contrastTheme"] = "none"
            settings["colorBlindFilter"] = "none"
            settings["contrastFactor"] = 100
            resp = "I have undone all AI settings and restored the page to its original style. You can open the Settings panel anytime to customize them."
        # English rules
        elif "dyslexia" in lower_msg or "read letter" in lower_msg or "overlap" in lower_msg:
            settings["dyslexia"] = True
            resp = "I have activated the Dyslexia-friendly font to help make the text easier to read."
        elif "bigger" in lower_msg or "large" in lower_msg or "increase font" in lower_msg or "small font" in lower_msg:
            settings["fontSize"] = 130
            resp = "I have increased the font size to 130% to improve readability."
        elif "smaller" in lower_msg or "reduce font" in lower_msg:
            settings["fontSize"] = 85
            resp = "I have decreased the font size to 85%."
        elif "simplify" in lower_msg or "clutter" in lower_msg or "remove ads" in lower_msg or "popups" in lower_msg:
            settings["simplifyWebsite"] = True
            resp = "I have enabled the AI website simplifier to remove unnecessary clutter and banners."
        elif "dark mode" in lower_msg or "hc-dark" in lower_msg or "high contrast dark" in lower_msg:
            settings["contrastTheme"] = "hc-dark"
            resp = "I have applied the High Contrast Dark theme for better visibility."
        elif "light mode" in lower_msg or "hc-light" in lower_msg or "high contrast light" in lower_msg:
            settings["contrastTheme"] = "hc-light"
            resp = "I have applied the High Contrast Light theme."
        elif "grayscale" in lower_msg or "monochrome" in lower_msg:
            settings["contrastTheme"] = "monochrome"
            resp = "I have applied the Grayscale theme."
        elif "colorblind" in lower_msg or "color-blind" in lower_msg or "blind" in lower_msg:
            settings["colorBlindFilter"] = "deuteranopia"
            resp = "I have activated the Deuteranopia color-blind filter."
        elif "line spacing" in lower_msg or "line height" in lower_msg or "spacing" in lower_msg:
            settings["lineHeight"] = 18
            resp = "I have adjusted the line spacing to 1.8x."
        elif "letter spacing" in lower_msg:
            settings["letterSpacing"] = 2
            resp = "I have increased the letter spacing to 2px."
            
        # Hindi rules
        elif "बड़ा" in lower_msg or "फॉन्ट बड़ा" in lower_msg or "दिखने में दिक्कत" in lower_msg:
            settings["fontSize"] = 130
            resp = "मैंने फॉन्ट का आकार बढ़ाकर 130% कर दिया है ताकि आपको पढ़ने में आसानी हो।"
        elif "छोटा" in lower_msg or "फॉन्ट छोटा" in lower_msg:
            settings["fontSize"] = 85
            resp = "मैंने फॉन्ट का आकार घटाकर 85% कर दिया है।"
        elif "ਡਾਰਕ ਮੋਡ" in lower_msg or "ਕਾਲਾ" in lower_msg or "डार्क मोड" in lower_msg or "काला" in lower_msg:
            settings["contrastTheme"] = "hc-dark"
            resp = "मैंने आपके लिए हाई-कॉन्ट्रास्ट डार्क मोड लागू कर दिया है।"
        elif "ਸਰਲ" in lower_msg or "ਸਾਫ਼" in lower_msg or "सरਲ" in lower_msg or "साफ" in lower_msg or "विज्ञापन हटाओ" in lower_msg:
            settings["simplifyWebsite"] = True
            resp = "मैंने पेज को सरल बना दिया है और विज्ञापन/पॉप-अप हटा दिए हैं।"
            
        # Punjabi rules
        elif "ਵੱਡਾ" in lower_msg or "ਅੱਖਰ ਵੱਡੇ" in lower_msg:
            settings["fontSize"] = 130
            resp = "ਮੈਂ ਅੱਖਰਾਂ ਦਾ ਅਕਾਰ ਵਧਾ ਕੇ 130% ਕਰ ਦਿੱਤਾ ਹੈ ਤਾਂ ਜੋ ਤੁਸੀਂ ਆਸਾਨੀ ਨਾਲ ਪੜ੍ਹ ਸਕੋ।"
        elif "ਛੋਟਾ" in lower_msg:
            settings["fontSize"] = 85
            resp = "ਮੈਂ ਅੱਖਰਾਂ ਦਾ ਅਕਾਰ ਘਟਾ ਕੇ 85% ਕਰ ਦਿੱਤਾ ਹੈ।"
            
        else:
            resp = f"Hello! I received your message: '{msg}'. Since I didn't detect specific accessibility commands, how else can I assist you today?"
            
        return ChatResponse(
            response=resp,
            settings=AccessibilitySettings(**settings) if settings else None,
            actions=actions
        )

    if not api_key:
        logger.warning("GEMINI_API_KEY environment variable is not set. Using rule-based fallback chat.")
        return get_fallback_settings_and_response(request.message)
        
    try:
        client = genai.Client(api_key=api_key)
        
        prompt = (
            "You are a web accessibility assistant companion named Neuro-Assist. "
            "You help first-time, elderly, or disabled users understand and navigate websites by explaining content and applying accessibility adjustments.\n\n"
            "STRICT RULES:\n"
            "1. Auto-detect the language of the User's Question (e.g. Hindi, Punjabi, Tamil, Telugu, Bengali, Spanish, English, etc.).\n"
            "2. Respond in the exact same language in the 'response' field (e.g. if the user asks in Hindi, write the response in Hindi. If in English, write in English).\n"
            "3. Answer in a clear, friendly, direct, and helpful way. Keep sentences short and easy to understand.\n"
            "4. Analyze the user's message. If they describe an accessibility problem or request a change, populate the 'settings' field to apply the change on their behalf.\n"
            "   - If they say: text is too small, hard to read, need larger fonts -> set 'fontSize' (e.g., increase to 120, 130, 140, 160 based on how small they say it is; current default is 100).\n"
            "   - If they say: hard to read letters, they have dyslexia, letters are overlapping -> set 'dyslexia' to true (toggles Dyslexia font).\n"
            "   - If they say: too much clutter, ads, popups, simplify the page -> set 'simplifyWebsite' to true.\n"
            "   - If they say: low contrast, can't see the text, too bright, dark mode -> set 'contrastTheme' to 'hc-dark' (for high contrast dark) or 'hc-light' (for high contrast light) or 'monochrome' (for grayscale).\n"
            "   - If they say: they are colorblind (e.g., to red, green, blue) -> set 'colorBlindFilter' to 'protanopia' (red), 'deuteranopia' (green), or 'tritanopia' (blue).\n"
            "   - If they say: text is too compressed, need more space between lines -> set 'lineHeight' (e.g., increase from 15 to 18, 20, or 22).\n"
            "   - If they say: letters are too close, need letter spacing -> set 'letterSpacing' (e.g., increase from 0 to 2, 3, or 4).\n"
            "   - Only populate fields in 'settings' if the user asks/indicates a need. Keep them null/None otherwise.\n"
            "5. If the user asks to 'undo', 'revert', 'reset', 'remove settings', or 'go back to normal', populate the 'settings' field with the default values to restore the original page layout:\n"
            "   - set 'dyslexia' to false\n"
            "   - set 'simplifyWebsite' to false\n"
            "   - set 'fontSize' to 100\n"
            "   - set 'lineHeight' to 15\n"
            "   - set 'letterSpacing' to 0\n"
            "   - set 'contrastTheme' to 'none'\n"
            "   - set 'colorBlindFilter' to 'none'\n"
            "   - set 'contrastFactor' to 100\n"
            "6. If the user mentions that they cannot use their hand, are paralyzed, have physical/motor disabilities in their hands, or need hands-free control, write a response asking them to select a navigation mode, and populate the 'actions' field with exactly: [\"enable_voice\", \"enable_gesture\"]. Otherwise keep 'actions' null.\n\n"
            f"Webpage Context (current text on screen):\n{request.context}\n\n"
            f"User's Question:\n{request.message}"
        )
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ChatResponse,
                temperature=0.4,
            ),
        )
        
        return ChatResponse.model_validate_json(response.text)
        
    except Exception as e:
        logger.error(f"Error during Gemini chat: {e}. Falling back to rule-based parser.")
        try:
            return get_fallback_settings_and_response(request.message)
        except Exception as inner_e:
            logger.error(f"Fallback parser failed: {inner_e}")
            return ChatResponse(response="I'm sorry, I encountered an error while processing that message. How else can I help you?")
        
    except Exception as e:
        logger.error(f"Error during Gemini chat: {e}.")
        return ChatResponse(response="I'm sorry, I encountered an error while processing that message. Is there anything else I can help you with?")


# (Voice Command Endpoint migrated to Backend/routers/voice.py)


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = ""

@app.post("/api/chat")
async def chat_legacy_endpoint(request: ChatRequest):
    """Handles chat messages and returns AI response with optional settings."""
    logger.info(f"Received chat message on /api/chat: '{request.message}'")
    try:
        from routers.voice import gemini_service
        result = await gemini_service.chat_with_copilot(request.message, request.context)
        return result
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return {"response": "Server error processing chat.", "settings": None, "actions": []}