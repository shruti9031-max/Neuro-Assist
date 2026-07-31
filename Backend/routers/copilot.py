from __future__ import annotations
import os
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

logger = logging.getLogger("neuro-assist-backend")
router = APIRouter(prefix="/api/copilot", tags=["copilot"])

# ==========================================
# 1. Pydantic Models
# ==========================================

class FormField(BaseModel):
    id: str = ""
    name: str = ""
    type: str = ""
    placeholder: str = ""
    label: str = ""
    autocomplete: Optional[str] = ""
    semanticRole: Optional[str] = ""
    context: Optional[str] = ""
    confidence: Optional[float] = 0.0
    options: Optional[List[str]] = Field(default_factory=list)
    required: Optional[bool] = False
    isFileUpload: Optional[bool] = False
    isPaymentField: Optional[bool] = False

class CopilotFillRequest(BaseModel):
    fields: List[FormField]
    prompt: Optional[str] = ""
    user_profile: Optional[Dict[str, Any]] = None
    form_purpose: Optional[str] = ""

class CopilotFillResponse(BaseModel):
    form_purpose: str = "Web Input Form"
    predictions: Dict[str, str]

class CopilotLogRequest(BaseModel):
    stage: str
    details: str
    url: Optional[str] = ""

class ActionStep(BaseModel):
    action: str # "type", "click", "scroll", "select", "next_page", "add_to_cart", "payment_safety_freeze", "autofill"
    target: Optional[str] = ""
    value: Optional[str] = ""
    message: Optional[str] = ""

class AutonomousNavRequest(BaseModel):
    instruction: str
    page_context: Optional[Dict[str, Any]] = None
    user_profile: Optional[Dict[str, Any]] = None

class AutonomousNavResponse(BaseModel):
    action: str = "plan"
    plan: List[ActionStep] = Field(default_factory=list)
    message: str = ""

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = ""

CopilotFillRequest.model_rebuild()
CopilotFillResponse.model_rebuild()
CopilotLogRequest.model_rebuild()
AutonomousNavRequest.model_rebuild()
AutonomousNavResponse.model_rebuild()
ChatRequest.model_rebuild()

# ==========================================
# 2. Helper Functions
# ==========================================

def local_fallback_fill(fields: List[FormField], user_prompt: str, user_profile: Optional[Dict[str, Any]] = None) -> CopilotFillResponse:
    logger.info("Using local fallback rule-based form autofiller with user profile memory.")
    predictions = {}
    
    prof = user_profile or {}
    prefs = prof.get("preferences", {})
    
    for f in fields:
        if f.isPaymentField:
            continue
            
        key = f.id or f.name or f.label or f.semanticRole or ""
        if not key:
            continue
            
        lower_key = f"{key} {f.semanticRole or ''} {f.label or ''} {f.placeholder or ''}".lower()
        val = ""
        
        if "first" in lower_key:
            val = prof.get("name", "Alex").split()[0]
        elif "last" in lower_key:
            name_parts = prof.get("name", "Alex Morgan").split()
            val = name_parts[-1] if len(name_parts) > 1 else "Morgan"
        elif "name" in lower_key:
            val = prof.get("name", "Alex Morgan")
        elif "email" in lower_key:
            val = prof.get("email", "alex.morgan@example.com")
        elif "phone" in lower_key or "mobile" in lower_key or "contact" in lower_key:
            val = prof.get("phone", "+1-555-019-2834")
        elif "zip" in lower_key or "pin" in lower_key or "postal" in lower_key:
            val = prof.get("pinCode", "62704")
        elif "city" in lower_key:
            val = prof.get("city", "Springfield")
        elif "state" in lower_key:
            val = prof.get("state", "IL")
        elif "country" in lower_key:
            val = prof.get("country", "United States")
        elif "address" in lower_key or "street" in lower_key:
            val = prefs.get("preferredDeliveryAddress") or prof.get("address", "742 Evergreen Terrace")
        elif "dob" in lower_key or "birth" in lower_key:
            val = prof.get("dob", "1995-08-15")
        elif "skill" in lower_key:
            val = prof.get("skills", "TypeScript, Python, FastAPI")
        elif "education" in lower_key or "college" in lower_key or "university" in lower_key:
            val = prof.get("education", "B.S. Computer Science")
        elif "experience" in lower_key or "work" in lower_key:
            val = prof.get("experience", "5 years Software Development")
        elif "resume" in lower_key or "about" in lower_key or "summary" in lower_key:
            val = prof.get("resumeDetails", "Senior Developer experienced in web automation.")
        elif "shipping" in lower_key or "delivery" in lower_key:
            val = prefs.get("preferredShippingOption", "Express Delivery")
        elif "payment" in lower_key:
            val = prefs.get("preferredPaymentMethod", "Credit Card")
        else:
            if f.type == "checkbox" or f.type == "radio":
                val = "true"
            elif f.type == "number":
                val = "1"
            elif f.type == "date":
                val = prof.get("dob", "1995-08-15")
            elif f.options and len(f.options) > 0:
                val = f.options[0]
            else:
                val = f"Value for {f.label or f.placeholder or key}"
                
        field_key = f.id or f.name or f.label or f.semanticRole
        if field_key:
            predictions[field_key] = val
            
    return CopilotFillResponse(form_purpose="Web Form", predictions=predictions)


# ==========================================
# 3. API Endpoints
# ==========================================

@router.post("/autofill", response_model=CopilotFillResponse)
async def autofill_form(request: CopilotFillRequest):
    """Generates context-aware form autofill values mapped against user profile memory."""
    logger.info(f"Received request on /api/copilot/autofill for {len(request.fields)} fields. Prompt: '{request.prompt}'")
    
    if not request.fields:
        return CopilotFillResponse(form_purpose="Empty Form", predictions={})
        
    try:
        from routers.voice import gemini_service
        fields_list = [f.model_dump() for f in request.fields]
        predictions = await gemini_service.parse_copilot_autofill(
            fields=fields_list,
            user_prompt=request.prompt or "",
            user_profile=request.user_profile
        )
        
        if predictions is not None:
            return CopilotFillResponse(form_purpose=request.form_purpose or "Web Form", predictions=predictions)
    except Exception as e:
        logger.error(f"Error during Gemini copilot autofill: {e}")
        
    return local_fallback_fill(request.fields, request.prompt or "", request.user_profile)

@router.post("/navigate", response_model=AutonomousNavResponse)
async def autonomous_navigate(request: AutonomousNavRequest):
    """Parses autonomous web navigation goal into executable DOM action plan."""
    logger.info(f"Received autonomous navigation instruction: '{request.instruction}'")
    try:
        from routers.voice import gemini_service
        action_res = await gemini_service.parse_autonomous_navigation(
            instruction=request.instruction,
            page_context=request.page_context,
            user_profile=request.user_profile
        )
        if action_res and isinstance(action_res, dict) and "plan" in action_res:
            steps = [ActionStep(**s) for s in action_res.get("plan", [])]
            return AutonomousNavResponse(action="plan", plan=steps, message=action_res.get("message", "Generated execution plan"))
    except Exception as e:
        logger.error(f"Error parsing autonomous navigation with Gemini: {e}")
        
    inst = request.instruction.lower()
    plan: List[ActionStep] = []
    
    if "search" in inst:
        query = inst.replace("search", "").replace("for", "").replace("and add to cart", "").strip()
        plan.append(ActionStep(
            action="type",
            target="search field",
            value=query or "wireless mouse",
            message=f"Type search query: '{query}'"
        ))
        plan.append(ActionStep(
            action="click",
            target="search button",
            value="Search",
            message="Click Search submit button"
        ))
        if "add to cart" in inst or "cart" in inst:
            plan.append(ActionStep(
                action="add_to_cart",
                target="add to cart button",
                value="Add to Cart",
                message="Click Add to Cart button"
            ))
    elif "add to cart" in inst or "buy now" in inst:
        plan.append(ActionStep(
            action="add_to_cart",
            target="add to cart button",
            value="Add to Cart",
            message="Clicking Add to Cart"
        ))
    elif "checkout" in inst or "proceed" in inst:
        plan.append(ActionStep(
            action="next_page",
            target="checkout continue button",
            value="Proceed to Checkout",
            message="Navigating to checkout step"
        ))
    elif "pay" in inst or "payment" in inst:
        plan.append(ActionStep(
            action="next_page",
            target="payment continue button",
            value="Proceed to Payment",
            message="Navigating to payment authorization page"
        ))
        plan.append(ActionStep(
            action="payment_safety_freeze",
            target="",
            value="",
            message="Payment step reached. Halting autonomous agent for user safety."
        ))
    else:
        plan.append(ActionStep(
            action="autofill",
            target="",
            value=request.instruction,
            message="Perform AI Form Autofill"
        ))
        
    return AutonomousNavResponse(action="plan", plan=plan, message="Generated action plan")

@router.post("/logs")
async def receive_copilot_logs(log: CopilotLogRequest):
    """Logs client execution stage to backend stdout/audit file."""
    logger.info(f"📋 Audit Log [{log.stage}]: {log.details} (URL: {log.url})")
    return {"status": "logged", "stage": log.stage}

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """Handles conversational AI chat and automated accessibility adjustments."""
    logger.info(f"Received chat message: '{request.message}'")
    try:
        from routers.voice import gemini_service
        result = await gemini_service.chat_with_copilot(request.message, request.context)
        return result
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return {"response": "Server error processing chat.", "settings": None, "actions": []}