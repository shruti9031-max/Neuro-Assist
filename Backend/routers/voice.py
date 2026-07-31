from fastapi import APIRouter, HTTPException
import logging
from models.voice_models import VoiceCommandRequest, VoiceCommandResponse
from services.gemini_service import GeminiService

logger = logging.getLogger("neuro-assist-backend")
router = APIRouter(prefix="/api", tags=["voice"])

# Initialize the Gemini service
gemini_service = GeminiService()

@router.post("/voice-command", response_model=VoiceCommandResponse)
async def process_voice_command(request: VoiceCommandRequest):
    """Voice command parser endpoint.
    
    Accepts spoken command and page context, handles translation via Gemini NLU,
    and returns a structured action payload.
    """
    logger.info(f"Received request on /api/voice-command: '{request.command}'")
    if not request.command or not request.command.strip():
        logger.warning("Empty command received on voice endpoint.")
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    try:
        response = await gemini_service.parse_voice_command(request.command, request.page_context)
        return response
    except Exception as e:
        logger.error(f"Error processing voice command in router: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error processing voice command: {str(e)}")
