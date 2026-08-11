import logging
from typing import Any, Dict, Optional
from models.voice_models import VoiceCommandResponse, PageContext

logger = logging.getLogger("neuro-assist-backend")

# ── Keywords that identify a shopping / checkout intent ───────────────────────
_SHOPPING_INTENTS = {
    "add to cart", "add to bag", "add to basket", "cart mein dalo",
    "buy now", "buy this", "buy this product", "buy",          # broadened
    "purchase", "order", "get this",                           # broadened
    "checkout", "proceed to checkout",
    "place order", "checkout karo", "open cart", "view cart", "go to cart",
    "my cart", "show cart", "cart kholo", "proceed", "continue to payment",
    "deliver here", "continue", "next", "apply coupon", "use coupon",
    "promo code", "coupon code", "discount code", "coupon lagao",
    "cash on delivery", "cod", "pay on delivery", "upi", "net banking",
    "credit card", "debit card", "select payment", "payment method",
    "review order", "review my order", "order review", "check order",
    # payment-page commands (STATE D)
    "pay now", "confirm payment", "confirm order", "complete payment",
    "make payment", "submit payment", "pay", "complete purchase",
    # ordinal product-selection commands (STATE 0)
    "first", "second", "third", "fourth", "fifth",
    "1st", "2nd", "3rd", "4th", "5th",
    "click the", "open the", "select the", "buy the",
}

def _is_shopping_intent(cmd: str) -> bool:
    """Return True if the lowercased command matches any known shopping intent."""
    return any(k in cmd for k in _SHOPPING_INTENTS)


# ─────────────────────────────────────────────────────────────────────────────
# Checkout State Dispatcher
# ─────────────────────────────────────────────────────────────────────────────
# Determines which step of the e-commerce funnel the user is currently on by
# inspecting visible_buttons, visible_links, and the page URL / text snippet
# from PageContext, then returns the correct click_button action.
#
# STATE A — Product page  : "Add to Cart" / "Buy Now" / "Add to Bag"
# STATE B — Cart page     : "Proceed to Checkout" / "Place Order"
# STATE C — Address page  : "Deliver Here" / "Continue" / "Next"
# STATE D — Payment page  : stop — show safety overlay, never auto-click Pay
#
# Returns None when the command is not a checkout intent or context is missing,
# so the caller can fall through to the normal Gemini / rule-based path.
# ─────────────────────────────────────────────────────────────────────────────

def checkout_state_dispatcher(
    command: str,
    page_context: Optional[PageContext],
) -> Optional[VoiceCommandResponse]:
    """
    Inspect page_context to decide the correct next checkout step.
    Returns a VoiceCommandResponse with action='click_button' and the best
    matching button label, or None if this is not a checkout situation.
    """
    if page_context is None:
        return None

    cmd = command.lower().strip()
    if not _is_shopping_intent(cmd):
        return None

    # Merge all interactive labels into one searchable pool (lower-cased)
    all_labels = [
        lbl.lower()
        for lbl in (page_context.visible_buttons + page_context.visible_links)
    ]
    url   = (page_context.url   or "").lower()
    text  = (page_context.text_snippet or "").lower()
    title = (page_context.title or "").lower()

    # ── Helper: find the first label in all_labels that matches any keyword ──
    def _first_match(keywords: list[str]) -> Optional[str]:
        for kw in keywords:
            for lbl in all_labels:
                if kw in lbl:
                    return lbl          # return actual button text from page
        return None

    # ── STATE 0 — Search Results / Product Listing (ordinal selection) ───────
    # Intercepts commands like "buy second mouse", "click the first one",
    # "open third result", "select 2nd item" BEFORE any other state logic.
    # Maps the ordinal word to an index and returns the matching visible_link.
    # This prevents the command from ever reaching the LLM form-autofill path.

    _ORDINAL_MAP = {
        # word forms
        "first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4,
        "sixth": 5, "seventh": 6, "eighth": 7, "ninth": 8, "tenth": 9,
        # numeric suffix forms
        "1st": 0, "2nd": 1, "3rd": 2, "4th": 3, "5th": 4,
        "6th": 5, "7th": 6, "8th": 7, "9th": 8, "10th": 9,
    }

    import re as _re_ord

    def _extract_ordinal(text: str) -> Optional[int]:
        """Return the 0-based index for the first ordinal word found, or None."""
        # numeric ordinal e.g. "2nd", "3rd"
        m = _re_ord.search(r'\b(\d+)(?:st|nd|rd|th)\b', text)
        if m:
            n = int(m.group(1))
            return n - 1 if n >= 1 else None
        # word ordinal
        for word, idx in _ORDINAL_MAP.items():
            if _re_ord.search(rf'\b{word}\b', text):
                return idx
        return None

    ordinal_idx = _extract_ordinal(cmd)
    if ordinal_idx is not None:
        # Use visible_links first (product titles on search/listing pages),
        # then fall back to visible_buttons if links are empty.
        link_pool = page_context.visible_links or []
        btn_pool  = page_context.visible_buttons or []
        # Filter out navigation noise (cart, login, home, etc.)
        _nav_noise = {"home", "login", "sign in", "cart", "wishlist", "account",
                      "menu", "search", "back", "help", "contact"}
        def _is_product_item(label: str) -> bool:
            low = label.lower().strip()
            return (
                len(low) > 3
                and not any(n == low for n in _nav_noise)
                and not low.startswith("http")
            )

        candidates = [lbl for lbl in link_pool if _is_product_item(lbl)]
        if not candidates:
            candidates = [lbl for lbl in btn_pool if _is_product_item(lbl)]

        if candidates and ordinal_idx < len(candidates):
            chosen = candidates[ordinal_idx]
            ordinal_word = next(
                (w for w, i in _ORDINAL_MAP.items() if i == ordinal_idx),
                str(ordinal_idx + 1)
            )
            return VoiceCommandResponse(
                action="click_link",
                value=chosen,
                speak=f"Opening the {ordinal_word} result: {chosen}.",
            )

        # Ordinal detected but not enough items visible — helpful message
        total = len(candidates)
        ordinal_word = next(
            (w for w, i in _ORDINAL_MAP.items() if i == ordinal_idx),
            str(ordinal_idx + 1)
        )
        if total == 0:
            msg = (
                f"I couldn't find any product links on this page. "
                f"Please navigate to a search results page first."
            )
        else:
            msg = (
                f"I can only see {total} item{'s' if total > 1 else ''} on this page. "
                f"Please scroll down to load more results and try again."
            )
        return VoiceCommandResponse(action="unknown", value=None, speak=msg)

    # ── STATE D — Payment page: ALWAYS stop, never auto-click ───────────────
    # Only freeze when sensitive credential entry is visible (OTP, CVV, PIN).
    # A payment *method selection* page (no OTP/CVV) should NOT be frozen —
    # the user still needs to pick Cash on Delivery, UPI, etc.
    payment_credential_signals = [
        "enter otp", "otp verification", "enter your otp",
        "enter cvv", "cvv number", "card verification value",
        "enter upi pin", "upi pin", "enter mpin", "mpin",
        "enter card number", "card number", "secure payment gateway",
    ]
    payment_url_signals = [
        "pay-now", "pay/confirm", "payment/confirm", "payment/otp",
        "payment/cvv", "payment-gateway",
    ]
    on_payment_page = (
        any(s in text for s in payment_credential_signals) or
        any(s in url  for s in payment_url_signals)
    )
    if on_payment_page:
        return VoiceCommandResponse(
            action="payment_safety_freeze",
            value=None,
            speak=(
                "Your order is ready. "
                "Please review and complete the payment manually. "
                "The AI assistant will never enter OTP, CVV, or UPI PIN."
            ),
        )

    # ── STATE C — Address / delivery details page ───────────────────────────
    address_page_signals = [
        "/address", "/delivery", "/shipping", "deliver-here",
        "delivery address", "shipping address", "add address",
    ]
    on_address_page = any(s in url or s in text or s in title for s in address_page_signals)

    if on_address_page:
        btn = _first_match([
            "deliver here", "use this address", "continue", "next",
            "save and continue", "proceed", "ship to this address",
        ])
        if btn:
            return VoiceCommandResponse(
                action="click_button",
                value=btn,
                speak=f"Clicking '{btn}' to continue with this address.",
            )
        return VoiceCommandResponse(
            action="click_button",
            value="Deliver Here",
            speak="Clicking Deliver Here to proceed.",
        )

    # ── STATE B — Cart page ──────────────────────────────────────────────────
    cart_page_signals = [
        "/cart", "/basket", "/bag", "/viewcart", "view-cart",
        "your cart", "shopping cart", "items in cart",
    ]
    on_cart_page = any(s in url or s in text or s in title for s in cart_page_signals)

    if on_cart_page or any(k in cmd for k in [
        "checkout", "proceed to checkout", "place order", "checkout karo",
        "open cart", "view cart", "go to cart", "my cart",
    ]):
        btn = _first_match([
            "proceed to checkout", "checkout", "place order",
            "buy now", "place your order", "continue to checkout",
            "proceed to buy", "go to checkout",
        ])
        if btn:
            return VoiceCommandResponse(
                action="click_button",
                value=btn,
                speak=f"Clicking '{btn}' to proceed to checkout.",
            )
        # If "open cart" / "view cart" — navigate to cart URL instead of clicking
        if any(k in cmd for k in ["open cart", "view cart", "go to cart", "my cart", "cart kholo"]):
            return VoiceCommandResponse(
                action="open_cart",
                value=None,
                speak="Opening your cart.",
            )

    # ── STATE A — Product page (default) ────────────────────────────────────
    # Triggered by any "buy / add to cart" intent — including broad forms like
    # "buy this product", "get this", "order this", "purchase" etc.
    # Button matching is aggressive: scans for any label that contains "buy",
    # "add to cart", "add to bag", "add to basket", or "cart".
    state_a_cmd_triggers = [
        "add to cart", "add to bag", "add to basket", "cart mein dalo",
        "buy now", "buy this", "buy this product", "buy",
        "purchase", "order", "get this",
    ]
    if any(k in cmd for k in state_a_cmd_triggers):
        btn = _first_match([
            # most specific first so exact labels win over substrings
            "add to cart", "add to bag", "add to basket",
            "buy now", "buy this", "buy",
            "add", "cart",
        ])
        if btn:
            return VoiceCommandResponse(
                action="click_button",
                value=btn,
                speak=f"Clicking '{btn}' to add the product.",
            )
        # Button not visible — ask user to navigate to product first
        return VoiceCommandResponse(
            action="unknown",
            value=None,
            speak=(
                "I couldn't find an Add to Cart or Buy Now button on this page. "
                "Please scroll to the product and try again."
            ),
        )

    # ── Coupon / promo ───────────────────────────────────────────────────────
    if any(k in cmd for k in [
        "apply coupon", "use coupon", "promo code", "coupon code",
        "discount code", "coupon lagao",
    ]):
        btn = _first_match([
            "apply coupon", "have a promo code", "coupon", "apply",
            "enter coupon", "add promo", "apply discount",
        ])
        return VoiceCommandResponse(
            action="click_button",
            value=btn or "Apply Coupon",
            speak=f"Clicking '{btn or 'Apply Coupon'}' to apply a discount.",
        )

    # ── Payment method selection ─────────────────────────────────────────────
    method_map = {
        "cash on delivery": ["cash on delivery", "cod", "pay on delivery"],
        "upi":              ["upi", "google pay", "phonepe", "paytm"],
        "net banking":      ["net banking", "netbanking"],
        "credit card":      ["credit card"],
        "debit card":       ["debit card"],
    }
    for method, keywords in method_map.items():
        if any(k in cmd for k in keywords):
            btn = _first_match(keywords)
            return VoiceCommandResponse(
                action="click_button",
                value=btn or method.title(),
                speak=f"Selecting {method.title()} as payment method.",
            )

    # ── Review order ─────────────────────────────────────────────────────────
    if any(k in cmd for k in ["review order", "review my order", "order review", "check order"]):
        btn = _first_match(["review", "order summary", "view order", "check order"])
        return VoiceCommandResponse(
            action="click_button",
            value=btn or "Review Order",
            speak=f"Opening order review: {btn or 'Review Order'}.",
        )

    # Not matched by state machine — let Gemini / rule parser handle it
    return None

def check_open_website_command(command: str) -> Optional[VoiceCommandResponse]:
    import re
    cmd = command.lower().strip().rstrip(".,?!")
    
    # 1. Normalize spoken dots (e.g. "dot com", "dot-com", "dot org") to "."
    cmd = re.sub(r'\s+dot\s+', '.', cmd)
    cmd = re.sub(r'\s+dot-([a-zA-Z]{2,})', r'.\1', cmd)
    cmd = re.sub(r'\s+dot\s*([a-zA-Z]{2,})', r'.\1', cmd)
    cmd = re.sub(r'\.\s+', '.', cmd)
    
    # 1a. First check for setting/download pages
    if any(k in cmd for k in ["open settings", "go to settings", "show settings"]):
        return VoiceCommandResponse(action="open_website", value="chrome://settings", speak="Opening Settings")
    if any(k in cmd for k in ["open downloads", "go to downloads", "show downloads"]):
        return VoiceCommandResponse(action="open_website", value="chrome://downloads", speak="Opening Downloads")
        
    # Check if this is an "open" or "go to" command (supporting English prefixes and Hindi prefixes/suffixes)
    target = None
    
    # English prefixes
    eng_prefix_pattern = r'^(?:please\s+open\s+|can\s+you\s+open\s+|take\s+me\s+to\s+|open\s+the\s+|open\s+|go\s+to\s+the\s+|go\s+to\s+|launch\s+|navigate\s+to\s+the\s+|navigate\s+to\s+|show\s+me\s+the\s+|show\s+me\s+)(.+)$'
    m = re.match(eng_prefix_pattern, cmd)
    if m:
        target = m.group(1).strip()
    else:
        # Hindi / Hinglish prefixes (English script)
        hindi_prefixes = ["kholo ", "chalao ", "open karo ", "chalu karo ", "ko open karo ", "ko kholo "]
        for pref in hindi_prefixes:
            if cmd.startswith(pref):
                target = cmd[len(pref):].strip()
                break
                
        # Hindi / Hinglish prefixes (Devanagari script)
        if not target:
            devanagari_prefixes = ["खोलो ", "चलाओ ", "ओपन करो ", "चालू करो ", "खोलना ", "को खोलो ", "को ओपन करो "]
            for pref in devanagari_prefixes:
                if cmd.startswith(pref):
                    target = cmd[len(pref):].strip()
                    break

        # Hindi / Hinglish suffixes (English script)
        if not target:
            hindi_suffixes = [" kholo", " khol", " open karo", " open karna", " chalao", " kholna", " chalu karo", " khol do", " kholo na", " ko open karo", " ko kholo", " ko khol do"]
            for suff in hindi_suffixes:
                if cmd.endswith(suff):
                    target = cmd[:-len(suff)].strip()
                    break
                    
        # Hindi / Hinglish suffixes (Devanagari script)
        if not target:
            devanagari_suffixes = [" खोलो", " खोल", " ओपन करो", " चालू करो", " खोल दो", " खोलना", " खोलो ना", " को खोलो", " को खोल दो", " को चालू करो"]
            for suff in devanagari_suffixes:
                if cmd.endswith(suff):
                    target = cmd[:-len(suff)].strip()
                    break

    # If no prefix/suffix matched, but it contains "open" or "kholo" or "खोलो" inside
    if not target:
        for verb in ["open ", "kholo ", "go to ", "खोलो ", "खोल ", " chalao", " chalu karo"]:
            if verb in cmd:
                parts = cmd.split(verb, 1)
                if len(parts) > 1 and parts[1].strip():
                    target = parts[1].strip()
                    break

    # If still not found, check if it's a bare domain or single word
    if not target:
        if " " not in cmd or re.match(r'^[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?$', cmd):
            target = cmd
        
    if not target:
        return None

    # Strip common website/app filler words from the target (e.g. "myntra website" -> "myntra")
    fillers = ["website", "web site", "app", "application", "portal", "page", "site", "online", "official"]
    for filler in fillers:
        if target.endswith(" " + filler) or target.endswith("-" + filler):
            target = target[:-len(filler) - 1].strip()
        if target.startswith(filler + " ") or target.startswith(filler + "-"):
            target = target[len(filler) + 1:].strip()

    # Strip common introductory or demonstrative fillers from target
    # e.g., "this myntra" -> "myntra", "that wikipedia" -> "wikipedia"
    if target:
        target_lower = target.lower().strip()
        for filler in ["this ", "that ", "the ", "a ", "an "]:
            if target_lower.startswith(filler):
                target = target[len(filler):].strip()
                break
                
        # Run fillers strip again in case it was "this website myntra"
        for filler in fillers:
            if target.endswith(" " + filler) or target.endswith("-" + filler):
                target = target[:-len(filler) - 1].strip()
            if target.startswith(filler + " ") or target.startswith(filler + "-"):
                target = target[len(filler) + 1:].strip()

    if not target:
        return None

    # Clean the target: remove extra spaces or dots
    target_clean = target.replace(" ", "").replace("-", "").replace("_", "").replace(".", "").lower()
    if not target_clean:
        return None

    # Transliterate Devanagari target if it contains Hindi script characters
    is_devanagari = any(ord(char) >= 0x0900 and ord(char) <= 0x097F for char in target_clean)
    if is_devanagari:
        def _transliterate(text: str) -> str:
            char_map = {
                'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
                'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
                'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
                'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
                'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
                'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
                'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
                'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
                'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy',
                'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
                'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h', 'ँ': 'n',
                '़': '', '्': ''
            }
            res_list = []
            for c in text:
                if c in char_map:
                    res_list.append(char_map[c])
                elif c.isalnum() or c == '-':
                    res_list.append(c)
            return "".join(res_list)

        transliterated = _transliterate(target_clean)
        if transliterated:
            target_clean = transliterated

    DEVANAGARI_WEBSITES = {
        "मीशो": "meesho",
        "मीषो": "meesho",
        "अमेज़न": "amazon",
        "अमेजन": "amazon",
        "एमेझॉन": "amazon",
        "फ्लिपकार्ट": "flipkart",
        "इंस्टाग्राम": "instagram",
        "इन्स्टाग्राम": "instagram",
        "यूट्यूब": "youtube",
        "युट्युब": "youtube",
        "मिंत्रा": "myntra",
        "मिन्त्रा": "myntra",
        "उबर": "uber",
        "ऊबर": "uber",
        "रैपिडो": "rapido",
        "गूगल": "google",
        "गुगल": "google",
        "फेसबुक": "facebook",
        "व्हाट्सएप": "whatsapp",
        "ट्विटर": "twitter",
        "लिंक्डइन": "linkedin",
        "नेटफ्लिक्स": "netflix",
        "जीमेल": "gmail"
    }

    if target_clean in DEVANAGARI_WEBSITES:
        target_clean = DEVANAGARI_WEBSITES[target_clean]

    # Comprehensive website dictionary mapping clean names to correct URLs and friendly display labels
    WEBSITE_MAP = {
        # E-Commerce & Shopping
        "myntra": ("https://www.myntra.com", "Myntra"),
        "flipkart": ("https://www.flipkart.com", "Flipkart"),
        "amazon": ("https://www.amazon.in", "Amazon"), # Default to .in for Indian shopping context
        "amazonin": ("https://www.amazon.in", "Amazon India"),
        "amazoncom": ("https://www.amazon.com", "Amazon US"),
        "shopsy": ("https://www.shopsy.in", "Shopsy"),
        "meesho": ("https://www.meesho.com", "Meesho"),
        "ajio": ("https://www.ajio.com", "Ajio"),
        "nykaa": ("https://www.nykaa.com", "Nykaa"),
        "nykaaman": ("https://www.nykaaman.com", "Nykaa Man"),
        "snapdeal": ("https://www.snapdeal.com", "Snapdeal"),
        "croma": ("https://www.croma.com", "Croma"),
        "reliancedigital": ("https://www.reliancedigital.in", "Reliance Digital"),
        "tatacliq": ("https://www.tatacliq.com", "Tata Cliq"),
        "jiomart": ("https://www.jiomart.com", "JioMart"),
        "ebay": ("https://www.ebay.com", "eBay"),
        "blinkit": ("https://www.blinkit.com", "Blinkit"),
        "zepto": ("https://www.zepto.com", "Zepto"),
        "bigbasket": ("https://www.bigbasket.com", "BigBasket"),
        "swiggyinstamart": ("https://www.swiggy.com/instamart", "Swiggy Instamart"),
        "swiggy": ("https://www.swiggy.com", "Swiggy"),
        "zomato": ("https://www.zomato.com", "Zomato"),
        "lenskart": ("https://www.lenskart.com", "Lenskart"),
        "decathlon": ("https://www.decathlon.in", "Decathlon"),
        "firstcry": ("https://www.firstcry.com", "FirstCry"),
        "urbanic": ("https://www.urbanic.com", "Urbanic"),
        "bewakoof": ("https://www.bewakoof.com", "Bewakoof"),
        "zivame": ("https://www.zivame.com", "Zivame"),
        "limeroad": ("https://www.limeroad.com", "LimeRoad"),
        "pepperfry": ("https://www.pepperfry.com", "Pepperfry"),
        "urbanladder": ("https://www.urbanladder.com", "Urban Ladder"),
        "ikea": ("https://www.ikea.com", "IKEA"),
        
        # Education & Study
        "coursera": ("https://www.coursera.org", "Coursera"),
        "udemy": ("https://www.udemy.com", "Udemy"),
        "khanacademy": ("https://www.khanacademy.org", "Khan Academy"),
        "edx": ("https://www.edx.org", "edX"),
        "wikipedia": ("https://www.wikipedia.org", "Wikipedia"),
        "w3schools": ("https://www.w3schools.com", "W3Schools"),
        "w3school": ("https://www.w3schools.com", "W3Schools"),
        "geeksforgeeks": ("https://www.geeksforgeeks.org", "GeeksforGeeks"),
        "gfg": ("https://www.geeksforgeeks.org", "GeeksforGeeks"),
        "stackoverflow": ("https://stackoverflow.com", "Stack Overflow"),
        "tutorialspoint": ("https://www.tutorialspoint.com", "Tutorialspoint"),
        "studyiq": ("https://www.studyiq.com", "StudyIQ"),
        "unacademy": ("https://unacademy.com", "Unacademy"),
        "byjus": ("https://byjus.com", "BYJU'S"),
        "physicswallah": ("https://www.pw.live", "Physics Wallah"),
        "pw": ("https://www.pw.live", "Physics Wallah"),
        "doubtnut": ("https://www.doubtnut.com", "Doubtnut"),
        "brainly": ("https://brainly.in", "Brainly"),
        "meritnation": ("https://www.meritnation.com", "Meritnation"),
        "vedantu": ("https://www.vedantu.com", "Vedantu"),
        "toppr": ("https://www.toppr.com", "Toppr"),
        "testbook": ("https://testbook.com", "Testbook"),
        "adda247": ("https://www.adda247.com", "Adda247"),
        "codecademy": ("https://www.codecademy.com", "Codecademy"),
        "freecodecamp": ("https://www.freecodecamp.org", "freeCodeCamp"),
        "github": ("https://www.github.com", "GitHub"),
        "gitlab": ("https://www.gitlab.com", "GitLab"),
        "bitbucket": ("https://bitbucket.org", "BitBucket"),
        "leetcode": ("https://leetcode.com", "LeetCode"),
        "hackerrank": ("https://www.hackerrank.com", "HackerRank"),
        "hackerearth": ("https://www.hackerearth.com", "HackerEarth"),
        "javatpoint": ("https://www.javatpoint.com", "Javatpoint"),
        "mdn": ("https://developer.mozilla.org", "MDN Web Docs"),
        "developermozilla": ("https://developer.mozilla.org", "MDN Web Docs"),
        "scribd": ("https://www.scribd.com", "Scribd"),
        "researchgate": ("https://www.researchgate.net", "ResearchGate"),
        "academia": ("https://www.academia.edu", "Academia"),
        "jstor": ("https://www.jstor.org", "JSTOR"),
        "duolingo": ("https://www.duolingo.com", "Duolingo"),
        
        # Search & AI Tools
        "google": ("https://www.google.com", "Google"),
        "bing": ("https://www.bing.com", "Bing"),
        "yahoo": ("https://www.yahoo.com", "Yahoo"),
        "duckduckgo": ("https://duckduckgo.com", "DuckDuckGo"),
        "chatgpt": ("https://chatgpt.com", "ChatGPT"),
        "chatgptcom": ("https://chatgpt.com", "ChatGPT"),
        "claude": ("https://claude.ai", "Claude AI"),
        "gemini": ("https://gemini.google.com", "Gemini"),
        "perplexity": ("https://www.perplexity.ai", "Perplexity AI"),
        "copilot": ("https://copilot.microsoft.com", "Copilot"),
        "midjourney": ("https://www.midjourney.com", "Midjourney"),
        
        # Entertainment & Streaming
        "youtube": ("https://www.youtube.com", "YouTube"),
        "netflix": ("https://www.netflix.com", "Netflix"),
        "primevideo": ("https://www.primevideo.com", "Prime Video"),
        "hotstar": ("https://www.hotstar.com", "Hotstar"),
        "jiocinema": ("https://www.jiocinema.com", "JioCinema"),
        "zee5": ("https://www.zee5.com", "Zee5"),
        "sonyliv": ("https://www.sonyliv.com", "SonyLIV"),
        "spotify": ("https://www.spotify.com", "Spotify"),
        "jiosaavn": ("https://www.jiosaavn.com", "JioSaavn"),
        "gaana": ("https://gaana.com", "Gaana"),
        "wynk": ("https://wynk.in", "Wynk Music"),
        "youtubemusic": ("https://music.youtube.com", "YouTube Music"),
        "twitch": ("https://www.twitch.tv", "Twitch"),
        "bookmyshow": ("https://in.bookmyshow.com", "BookMyShow"),
        
        # Social Media
        "facebook": ("https://www.facebook.com", "Facebook"),
        "instagram": ("https://www.instagram.com", "Instagram"),
        "twitter": ("https://x.com", "Twitter"),
        "x": ("https://x.com", "Twitter/X"),
        "linkedin": ("https://www.linkedin.com", "LinkedIn"),
        "reddit": ("https://www.reddit.com", "Reddit"),
        "whatsapp": ("https://web.whatsapp.com", "WhatsApp"),
        "telegram": ("https://web.telegram.org", "Telegram"),
        "pinterest": ("https://www.pinterest.com", "Pinterest"),
        "snapchat": ("https://web.snapchat.com", "Snapchat"),
        "discord": ("https://discord.com", "Discord"),
        "quora": ("https://www.quora.com", "Quora"),
        "tumblr": ("https://www.tumblr.com", "Tumblr"),
        
        # Utility & Communication
        "gmail": ("https://mail.google.com", "Gmail"),
        "outlook": ("https://outlook.live.com", "Outlook"),
        "yahoomail": ("https://mail.yahoo.com", "Yahoo Mail"),
        "irctc": ("https://www.irctc.co.in", "IRCTC"),
        "paytm": ("https://paytm.com", "Paytm"),
        "phonepe": ("https://www.phonepe.com", "PhonePe"),
        "gpay": ("https://pay.google.com", "Google Pay"),
        "digilocker": ("https://www.digilocker.gov.in", "DigiLocker"),
        "uidai": ("https://uidai.gov.in", "UIDAI"),
        "incometax": ("https://www.incometax.gov.in", "Income Tax Portal"),
        "sbi": ("https://www.onlinesbi.sbi", "State Bank of India"),
        "hdfc": ("https://www.hdfcbank.com", "HDFC Bank"),
        "icici": ("https://www.icicibank.com", "ICICI Bank"),
        "axisbank": ("https://www.axisbank.com", "Axis Bank"),
        "ndtv": ("https://www.ndtv.com", "NDTV"),
        "timesofindia": ("https://timesofindia.indiatimes.com", "Times of India"),
        "toi": ("https://timesofindia.indiatimes.com", "Times of India"),
        "makemytrip": ("https://www.makemytrip.com", "MakeMyTrip"),
        "goibibo": ("https://www.goibibo.com", "Goibibo"),
        "yatra": ("https://www.yatra.com", "Yatra"),
        "redbus": ("https://www.redbus.in", "RedBus"),
        "ola": ("https://www.olacabs.com", "Ola Cabs"),
        "uber": ("https://www.uber.com", "Uber"),
        "maps": ("https://maps.google.com", "Google Maps"),
        "googlemaps": ("https://maps.google.com", "Google Maps"),
        "drive": ("https://drive.google.com", "Google Drive"),
        "googledrive": ("https://drive.google.com", "Google Drive"),
        "docs": ("https://docs.google.com", "Google Docs"),
        "googledocs": ("https://docs.google.com", "Google Docs"),
        "sheets": ("https://docs.google.com/spreadsheets", "Google Sheets"),
        "googlesheets": ("https://docs.google.com/spreadsheets", "Google Sheets"),
        "slides": ("https://docs.google.com/presentation", "Google Slides"),
        "googleslides": ("https://docs.google.com/presentation", "Google Slides"),
        "meet": ("https://meet.google.com", "Google Meet"),
        "googlemeet": ("https://meet.google.com", "Google Meet"),
        "zoom": ("https://zoom.us", "Zoom"),
        "teams": ("https://teams.microsoft.com", "Microsoft Teams"),
        "microsoftteams": ("https://teams.microsoft.com", "Microsoft Teams"),
        "canva": ("https://www.canva.com", "Canva"),
        "figma": ("https://www.figma.com", "Figma"),
        "notion": ("https://www.notion.so", "Notion"),
        "trello": ("https://trello.com", "Trello"),
        "slack": ("https://slack.com", "Slack"),
    }

    # First check if the clean target is a direct key in our WEBSITE_MAP
    if target_clean in WEBSITE_MAP:
        url, label = WEBSITE_MAP[target_clean]
        return VoiceCommandResponse(action="open_website", value=url, speak=f"Opening {label}")

    # Check for substring match in map
    for key, (url, label) in WEBSITE_MAP.items():
        if key in target_clean or target_clean in key:
            return VoiceCommandResponse(action="open_website", value=url, speak=f"Opening {label}")

    # Check for fuzzy match using SequenceMatcher for spelling errors
    import difflib
    best_key = None
    best_ratio = 0.0
    for key in WEBSITE_MAP.keys():
        ratio = difflib.SequenceMatcher(None, target_clean, key).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_key = key
            
    if best_ratio >= 0.78:
        url, label = WEBSITE_MAP[best_key]
        return VoiceCommandResponse(action="open_website", value=url, speak=f"Opening {label}")

    # Fallback logic for arbitrary websites
    target_domain = target.lower().strip()
    if target_domain.startswith("https://"):
        target_domain = target_domain[8:]
    elif target_domain.startswith("http://"):
        target_domain = target_domain[7:]
    if target_domain.startswith("www."):
        target_domain = target_domain[4:]

    domain_match = re.search(r'^[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$', target_domain)
    if domain_match:
        url = "https://" + target_domain
        return VoiceCommandResponse(action="open_website", value=url, speak=f"Opening {target_domain}")
    
    # Clean the name for a valid URL: alphanumeric characters only
    url_domain = re.sub(r'[^a-zA-Z0-9\-]', '', target.lower())
    if url_domain:
        url = f"https://www.{url_domain}.com"
        friendly_label = target.title()
        return VoiceCommandResponse(action="open_website", value=url, speak=f"Opening {friendly_label}")

    return None

def local_fallback_parser(command: str) -> VoiceCommandResponse:
    """Fallback rule-based parser when Gemini API is unavailable or fails."""
    cmd = command.lower().strip()
    # 0a. video play commands
    has_video_word = "video" in cmd or "वीडियो" in cmd or "ਵੀਡੀਓ" in cmd
    has_play_action = any(k in cmd for k in [
        "play", "open", "click", "run", "start", "chalao", "kholo", "chalu", "chalaye",
        "चलाओ", "खोलो", "खोल", "ਪਲੇ", "ਖੋਲੋ"
    ])
    if has_video_word and has_play_action:
        return VoiceCommandResponse(action="click_video", value="first", speak="Playing video")

    # 1. scroll commands
    if any(k in cmd for k in ["go to top", "top pe jao", "shuruaat", "beginning", "scroll to top"]):
        return VoiceCommandResponse(action="scroll_top", speak="Scrolling to top")
    if any(k in cmd for k in ["go to bottom", "end pe jao", "niche tak", "page end", "scroll to bottom"]):
        return VoiceCommandResponse(action="scroll_bottom", speak="Scrolling to bottom")
    if any(k in cmd for k in ["scroll up", "upar jao", "upar scroll", "scroll upar", "oopar", "go up"]):
        return VoiceCommandResponse(action="scroll_up", value=400, speak="Scrolling up")
    if any(k in cmd for k in ["scroll down", "niche jao", "niche scroll", "scroll niche", "neechay", "go down"]):
        return VoiceCommandResponse(action="scroll_down", value=400, speak="Scrolling down")

    # 2. go back / forward
    if any(k in cmd for k in ["go back", "piche jao", "wapas jao", "back", "peeche"]):
        return VoiceCommandResponse(action="go_back", speak="Going back")
    if any(k in cmd for k in ["go forward", "aage jao", "forward"]):
        return VoiceCommandResponse(action="go_forward", speak="Going forward")

    # 3. refresh page
    if any(k in cmd for k in ["refresh", "reload", "dobara load", "page refresh", "naya load"]):
        return VoiceCommandResponse(action="refresh_page", speak="Refreshing page")

    # 4. zoom in / out
    if any(k in cmd for k in ["zoom in", "bada karo", "zoom bada"]):
        return VoiceCommandResponse(action="zoom_in", speak="Zooming in")
    if any(k in cmd for k in ["zoom out", "chhota karo", "zoom chhota"]):
        return VoiceCommandResponse(action="zoom_out", speak="Zooming out")

    # 5. open/close accessibility dock
    if any(k in cmd for k in ["open accessibility dock", "dock kholo", "open dock", "kholo dock"]):
        return VoiceCommandResponse(action="open_accessibility_dock", speak="Opening accessibility dock")
    if any(k in cmd for k in ["close accessibility dock", "dock band karo", "close dock", "band karo dock"]):
        return VoiceCommandResponse(action="close_accessibility_dock", speak="Closing accessibility dock")

    # 6. simplify website
    if any(k in cmd for k in ["simplify", "website simplify", "easy karo", "aasan karo"]):
        return VoiceCommandResponse(action="simplify_website", speak="Simplifying website text")

    # 7. dark mode / light mode
    if any(k in cmd for k in ["dark mode", "black mode", "kala karo", "dark karo"]):
        return VoiceCommandResponse(action="dark_mode", speak="Switching to dark mode")
    if any(k in cmd for k in ["light mode", "white mode", "safed karo", "light karo"]):
        return VoiceCommandResponse(action="light_mode", speak="Switching to light mode")

    # 8. increase / decrease font
    if any(k in cmd for k in ["increase font", "font bada", "text bada", "font size increase"]):
        return VoiceCommandResponse(action="increase_font", speak="Increasing font size")
    if any(k in cmd for k in ["decrease font", "font chhota", "text chhota", "font size decrease"]):
        return VoiceCommandResponse(action="decrease_font", speak="Decreasing font size")

    # 9. highlight headings
    if any(k in cmd for k in ["highlight headings", "heading highlight", "headings highlight"]):
        return VoiceCommandResponse(action="highlight_headings", speak="Highlighting headings")

    # 10. open chatbot
    if any(k in cmd for k in ["open chatbot", "chat widget", "kholo chat", "chatbot kholo", "chat kholo"]):
        return VoiceCommandResponse(action="open_chatbot", speak="Opening assistant chatbot")

    # 11. read selected text
    if any(k in cmd for k in ["read selected text", "read text", "selected text pado", "read selected"]):
        return VoiceCommandResponse(action="read_selected_text", speak="Reading selected text")

    # 12. stop speaking
    if any(k in cmd for k in ["stop speaking", "chup ho jao", "stop talk", "stop synthesis"]):
        return VoiceCommandResponse(action="stop_speaking", speak="Stopping playback")

    # 13. click button / click link
    if "click button" in cmd or "button click" in cmd or "button pe click" in cmd:
        target = cmd.replace("click button", "").replace("button click", "").replace("button pe click", "").strip()
        return VoiceCommandResponse(action="click_button", value=target or None, speak=f"Clicking button {target}" if target else "Clicking button")
    if "click link" in cmd or "link click" in cmd or "link pe click" in cmd:
        target = cmd.replace("click link", "").replace("link click", "").replace("link pe click", "").strip()
        return VoiceCommandResponse(action="click_link", value=target or None, speak=f"Clicking link {target}" if target else "Clicking link")
    if any(k in cmd for k in ["click", "select", "press"]):
        target = cmd.replace("click", "").replace("select", "").replace("press", "").strip()
        target = _re.sub(r'^(?:on\s+the|on|the)\s+', '', target, flags=_re.I).strip()
        return VoiceCommandResponse(
            action="click_button",
            value=target or None,
            speak=f"Selecting {target}" if any(k in cmd for k in ["select", "press"]) else f"Clicking {target}" if target else "Clicking element"
        )

    # 14. open website
    open_site_res = check_open_website_command(command)
    if open_site_res is not None:
        return open_site_res

    # 14b. Shopping product search — must come BEFORE the generic search rule (#15)
    # so "Search iPhone 17 on Flipkart" routes to search_product, not search_web_query.
    _SHOP_URLS_EARLY = {
        "amazon":   "https://www.amazon.in/s?k={q}",
        "flipkart": "https://www.flipkart.com/search?q={q}",
        "myntra":   "https://www.myntra.com/{q}",
        "ajio":     "https://www.ajio.com/search/?text={q}",
        "meesho":   "https://www.meesho.com/search?q={q}",
        "snapdeal": "https://www.snapdeal.com/search?keyword={q}",
        "nykaa":    "https://www.nykaa.com/search/result/?q={q}",
        "croma":    "https://www.croma.com/searchB?q={q}",
    }
    import re as _re2
    from urllib.parse import quote_plus as _qp2

    _shop_match = _re2.match(
        r'^(?:search|find|search for|look up|look for)\s+(.+)$', cmd, _re2.I
    )
    if _shop_match:
        _raw = _shop_match.group(1).strip()
        # Detect "on <site>" suffix
        _site_m = _re2.search(r'\b(?:on|at|from|in)\s+(\w+)\s*$', _raw, _re2.I)
        _site_name = (_site_m.group(1).lower() if _site_m and _site_m.group(1).lower() in _SHOP_URLS_EARLY else "")
        # Or site mentioned anywhere in the query
        if not _site_name:
            for _s in _SHOP_URLS_EARLY:
                if _s in _raw.lower():
                    _site_name = _s
                    break
        if _site_name:
            # Strip site name and "on/at" suffix from query
            _query = _re2.sub(r'\s+(?:on|at|from|in)\s+\w+\s*$', '', _raw, flags=_re2.I)
            _query = _re2.sub(rf'\b{_site_name}\b', '', _query, flags=_re2.I).strip()
            _url   = _SHOP_URLS_EARLY[_site_name].replace("{q}", _qp2(_query))
            return VoiceCommandResponse(
                action="search_product",
                value=_url,
                speak=f"Searching for {_query} on {_site_name.capitalize()}"
            )
        # No site hint → still return search_product (voiceEngine handles it)
        # Only if query looks like a product (not a generic web search)
        # We keep it as search_web_query for generic queries without a shop context.

    # 15. search web query
    if any(k in cmd for k in ["search chatgpt", "google chatgpt", "find chatgpt"]):
        return VoiceCommandResponse(action="search_web_query", value="ChatGPT", speak="Searching Google for ChatGPT")
    if "search" in cmd or "find" in cmd or "look up" in cmd:
        target = command.strip()
        # strip leading verb variants
        for prefix in ["search for ", "search ", "find ", "look up "]:
            if target.lower().startswith(prefix):
                target = target[len(prefix):]
                break
        target = target.strip()
        if target:
            return VoiceCommandResponse(action="search_web_query", value=target, speak=f"Searching Google for {target}")

    # ── 16. Shopping Automation ──────────────────────────────────────────────
    # These rules extend the existing parser — nothing above is modified.
    # Supported sites (add more entries to SHOP_URLS to extend):

    SHOP_URLS = {
        "amazon":   "https://www.amazon.in/s?k={q}",
        "flipkart": "https://www.flipkart.com/search?q={q}",
        "myntra":   "https://www.myntra.com/{q}",
        "ajio":     "https://www.ajio.com/search/?text={q}",
        "meesho":   "https://www.meesho.com/search?q={q}",
        "snapdeal": "https://www.snapdeal.com/search?keyword={q}",
        "nykaa":    "https://www.nykaa.com/search/result/?q={q}",
        "croma":    "https://www.croma.com/searchB?q={q}",
    }

    import re as _re
    from urllib.parse import quote_plus as _qp

    def _get_site(text: str) -> str:
        """Extract a known shopping site name from a query string."""
        m = _re.search(r'\b(?:on|at|from|in)\s+(\w+)\s*$', text, _re.I)
        if m:
            candidate = m.group(1).lower()
            if candidate in SHOP_URLS:
                return candidate
        for site in SHOP_URLS:
            if site in text:
                return site
        return ""

    def _strip_site(text: str) -> str:
        """Remove the 'on <site>' suffix and site names from a query."""
        text = _re.sub(r'\s+(?:on|at|from|in)\s+\w+\s*$', '', text, flags=_re.I)
        for site in SHOP_URLS:
            text = _re.sub(rf'\b{site}\b', '', text, flags=_re.I)
        return text.strip()

    # 16a. "search <product> on <site>" / "find <product> on flipkart"
    shop_search_match = _re.match(
        r'^(?:search|find|search for|look up|look for)\s+(.+)$', cmd, _re.I
    )
    if shop_search_match:
        raw     = shop_search_match.group(1).strip()
        site    = _get_site(raw)
        query   = _strip_site(raw)
        if site and query:
            url    = SHOP_URLS[site].replace("{q}", _qp(query))
            speak  = f"Searching for {query} on {site.capitalize()}"
            return VoiceCommandResponse(action="search_product", value=url, speak=speak)
        elif query:
            # no site hint — return generic search_product so voiceEngine can handle
            return VoiceCommandResponse(action="search_product", value=query, speak=f"Searching for {query}")

    # 16b. add to cart
    if any(k in cmd for k in ["add to cart", "add to bag", "add to basket", "cart mein dalo", "add to card", "add to cut", "at to cart", "add 2 cart"]):
        return VoiceCommandResponse(action="add_to_cart", speak="Adding to cart")

    # 16c. open / view cart
    if any(k in cmd for k in ["open cart", "view cart", "go to cart", "show cart", "my cart", "cart kholo"]):
        return VoiceCommandResponse(action="open_cart", speak="Opening cart")

    # 16d. proceed to checkout / place order
    if any(k in cmd for k in ["proceed to checkout", "checkout", "buy now", "place order", "checkout karo"]):
        return VoiceCommandResponse(action="proceed_to_checkout", speak="Proceeding to checkout")

    # 16e. apply coupon / promo code
    if any(k in cmd for k in ["apply coupon", "use coupon", "promo code", "coupon code", "discount code", "coupon lagao"]):
        return VoiceCommandResponse(action="apply_coupon", speak="Applying coupon")

    # 16f. select payment method — NEVER enters OTP / CVV / PIN
    payment_method = ""
    if any(k in cmd for k in ["cash on delivery", "cod", "pay on delivery"]):
        payment_method = "Cash on Delivery"
    elif "upi" in cmd:
        payment_method = "UPI"
    elif "net banking" in cmd:
        payment_method = "Net Banking"
    elif "credit card" in cmd:
        payment_method = "Credit Card"
    elif "debit card" in cmd:
        payment_method = "Debit Card"
    elif any(k in cmd for k in ["select payment", "payment method", "choose payment"]):
        payment_method = "payment method"
    if payment_method:
        return VoiceCommandResponse(
            action="select_payment_method",
            value=payment_method,
            speak=f"Selecting {payment_method}"
        )

    # 16g. review order
    if any(k in cmd for k in ["review order", "review my order", "order review", "check order"]):
        return VoiceCommandResponse(action="review_order", speak="Reviewing your order")

    # 16h. click product result by position
    product_ord_match = _re.match(
        r'^(?:click|open|select|show|choose|pick|press|go\s+to)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)(?:\s+\w+){0,3}$',
        cmd,
        _re.I
    )
    if product_ord_match:
        ord_str = product_ord_match.group(1).lower()
        idx = 0
        if ord_str in ["second", "2nd"]: idx = 1
        elif ord_str in ["third", "3rd"]: idx = 2
        elif ord_str in ["fourth", "4th"]: idx = 3
        elif ord_str in ["fifth", "5th"]: idx = 4
        elif ord_str in ["sixth", "6th"]: idx = 5
        elif ord_str in ["seventh", "7th"]: idx = 6
        elif ord_str in ["eighth", "8th"]: idx = 7
        elif ord_str in ["ninth", "9th"]: idx = 8
        elif ord_str in ["tenth", "10th"]: idx = 9
        return VoiceCommandResponse(
            action="click_product_result",
            value=idx,
            speak=f"Selecting the {ord_str} product"
        )

    # ── End Shopping Automation ──────────────────────────────────────────────

    return VoiceCommandResponse(
        action="unknown",
        speak="Sorry, I did not understand that command."
    )
