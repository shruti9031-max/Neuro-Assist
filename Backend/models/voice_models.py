from pydantic import BaseModel
from typing import List, Optional, Any

class PageContext(BaseModel):
    url: str = ""
    title: str = ""
    selected_text: str = ""
    visible_buttons: List[str] = []
    visible_headings: List[str] = []
    visible_forms: List[str] = []
    visible_links: List[str] = []   # added for checkout state detection
    text_snippet: str = ""

class VoiceCommandRequest(BaseModel):
    command:str
    page_context: Optional[PageContext] = None

class VoiceCommandResponse(BaseModel):
    action: str
    value: Optional[Any] = None
    speak: str
