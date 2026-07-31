// ─────────────────────────────────────────────────────────────────────────────
// NeuroVoiceEngine — Gemini AI-powered multilingual (English + Hinglish)
// voice command engine for the Neuro-Assist accessibility extension.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = "http://localhost:8000";

interface VoiceCommandResponse {
  action: string;
  value?: any;
  speak: string;
}

interface PageContext {
  url: string;
  title: string;
  selected_text: string;
  visible_buttons: string[];
  visible_headings: string[];
  visible_forms: string[];
  text_snippet: string;
}

export class NeuroVoiceEngine {
  public isListening: boolean = false;
  private micIndicator: HTMLDivElement | null = null;
  private ttsEnabled: boolean = true;
  private isSpeaking: boolean = false;

  constructor() {
    this.injectMicIndicator();
    this.initListeningStateFromStorage();
    this.listenForRuntimeMessages();
  }

  private safeSendMessage(message: any, callback?: (res: any) => void) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        if (callback) {
          chrome.runtime.sendMessage(message, callback);
        } else {
          chrome.runtime.sendMessage(message).catch(() => {});
        }
      }
    } catch (e: any) {
      if (e.message?.includes("context invalidated")) {
        console.warn("🎙️ Extension context invalidated. Please refresh the page to reload Neuro-Assist.");
      } else {
        console.error("🎙️ safeSendMessage error:", e);
      }
    }
  }

  private safeStorageSet(data: any) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(data);
      }
    } catch (e: any) {
      if (e.message?.includes("context invalidated")) {
        console.warn("🎙️ Extension context invalidated. Please refresh the page.");
      } else {
        console.error("🎙️ safeStorageSet error:", e);
      }
    }
  }

  private safeStorageGet(keys: string[], callback: (result: any) => void) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, callback);
      }
    } catch (e: any) {
      if (e.message?.includes("context invalidated")) {
        console.warn("🎙️ Extension context invalidated. Please refresh the page.");
      } else {
        console.error("🎙️ safeStorageGet error:", e);
      }
    }
  }

  // Persists and synchronizes state
  private setListeningState(state: boolean) {
    this.isListening = state;
    this.setMicIndicator(state);

    this.safeStorageSet({ voiceEngineListening: state });
    // Notify content.ts checkbox UI
    document.dispatchEvent(new CustomEvent("neuro-assist-action", {
      detail: { action: "voice_state_changed", isListening: state }
    }));
    // Notify extension popup UI
    this.safeSendMessage({ type: "VOICE_STATE_CHANGED", isListening: state });
  }

  private initListeningStateFromStorage() {
    this.safeStorageGet(["voiceEngineListening"], (result) => {
      if (result && result.voiceEngineListening === true) {
        console.log("🎙️ Restoring voice listening state from storage.");
        this.toggleVoiceSystem(true);
      }
    });
  }

  private listenForRuntimeMessages() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.type === "GET_VOICE_STATE") {
            sendResponse({ isListening: this.isListening });
          } else if (message.type === "TOGGLE_VOICE_SYSTEM") {
            this.toggleVoiceSystem(message.state);
            sendResponse({ isListening: this.isListening });
          } else if (message.type === "VOICE_COMMAND_INTERIM") {
            this.showVoiceStatusOverlay(`🎙️ Spoken: <strong>${message.transcript}...</strong>`, true);
          } else if (message.type === "VOICE_COMMAND_RECOGNIZED") {
            console.log("🎙️ Stage 4: Received voice command message from background/offscreen:", message.command);
            this.showVoiceStatusOverlay(`🎙️ Spoken: <strong>${message.command}</strong>`, false);
            if (this.isListening && !this.isSpeaking) {
              this.processCommand(message.command);
            } else {
              console.warn("🎙️ Content Script: Ignored command because isListening is false or isSpeaking is true.");
            }
          } else if (message.type === "SIMULATE_VOICE_COMMAND") {
            console.log("🎙️ Received simulated voice command message:", message.command);
            this.simulateCommand(message.command);
          } else if (message.type === "VOICE_PERMISSION_DENIED") {
            console.warn("🎙️ Microphone permission denied from background.");
            this.setListeningState(false);
            this.speakResponse("Microphone access is not allowed. Please grant permission in the opened tab.");
          } else if (message.type === "VOICE_PERMISSION_GRANTED") {
            console.log("🎙️ Microphone permission granted. Activating engine.");
            this.toggleVoiceSystem(true);
          }
          return true;
        });
      }
    } catch (e: any) {
      if (e.message?.includes("context invalidated")) {
        console.warn("🎙️ Extension context invalidated. Please refresh the page.");
      } else {
        console.warn("🎙️ Failed to bind runtime message listener:", e);
      }
    }
  }

  // ──────────────────────────────────────────
  // Public toggle
  // ──────────────────────────────────────────

  public toggleVoiceSystem(state: boolean) {
    if (state && !this.isListening) {
      this.isListening = true;
      this.setListeningState(true);
      this.safeSendMessage({ type: "TOGGLE_VOICE_RECOGNITION", state: true });
      console.log("🎙️ Live Voice Navigation Activated.");
      this.speakResponse("Voice engine activated.");
      this.showVoiceStatusOverlay("🎙️ Neuro Voice: Listening...", false);
    } else if (!state && this.isListening) {
      this.isListening = false;
      this.setListeningState(false);
      this.safeSendMessage({ type: "TOGGLE_VOICE_RECOGNITION", state: false });
      console.log("🎙️ Live Voice Navigation Deactivated.");
      this.speakResponse("Voice engine deactivated.");
      this.hideVoiceStatusOverlay();
    }
  }

  public simulateCommand(command: string) {
    console.log("🎙️ Simulating voice command:", command);
    this.processCommand(command);
  }

  // ──────────────────────────────────────────
  // Command processor
  // ──────────────────────────────────────────

  private async processCommand(command: string) {
    console.log(`🎙️ Stage 4: Starting processCommand() for "${command}"`);
    document.dispatchEvent(new CustomEvent("neuro-assist-action", {
      detail: { action: "voice_processing", command }
    }));
    let response: VoiceCommandResponse | null = null;

    try {
      console.log(`🎙️ Stage 5 (NLU/Resolver): Attempting backend resolution at ${BACKEND_URL}/api/voice-command`);
      response = await this.sendCommandToBackend(command);
      console.log("🎙️ Stage 5 (NLU/Resolver): Backend resolved successfully:", response);
    } catch (err) {
      console.warn("🎙️ Stage 5 (NLU/Resolver): Backend unreachable — using local fallback:", err);
      response = this.localFallback(command);
      console.log("🎙️ Stage 5 (NLU/Resolver): Local fallback parser resolved:", response);
    }

    if (!response) {
      response = this.localFallback(command);
      console.log("🎙️ Stage 5 (NLU/Resolver): Fallback resolver resolved:", response);
    }

    console.log("🎙️ Stage 6 (Executor): Dispatching to executeAction() with resolved action payload:", response);
    this.executeAction(response);
  }

  // ──────────────────────────────────────────
  // Backend API call
  // ──────────────────────────────────────────

  private async sendCommandToBackend(
    command: string
  ): Promise<VoiceCommandResponse> {
    const pageContext = this.collectPageContext();

    const res = await fetch(`${BACKEND_URL}/api/voice-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, page_context: pageContext }),
      signal: AbortSignal.timeout(6000), // Snap snappy 6s timeout
    });

    if (!res.ok) {
      throw new Error(`Backend HTTP error: ${res.status}`);
    }
    return (await res.json()) as VoiceCommandResponse;
  }

  // ──────────────────────────────────────────
  // Rich page context collector
  // ──────────────────────────────────────────

  private collectPageContext(): PageContext {
    const buttons: string[] = [];
    document
      .querySelectorAll<HTMLElement>(
        "button, [role='button'], input[type='button'], input[type='submit'], a"
      )
      .forEach((el) => {
        const label = (el.textContent || (el as HTMLInputElement).value || "")
          .trim()
          .slice(0, 40);
        if (label && !buttons.includes(label) && buttons.length < 12) {
          buttons.push(label);
        }
      });

    const headings: string[] = [];
    document.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((el) => {
      const text = el.textContent?.trim().slice(0, 60) || "";
      if (text && headings.length < 8) headings.push(text);
    });

    const forms: string[] = [];
    document
      .querySelectorAll<HTMLInputElement>(
        "input:not([type='hidden']):not([type='submit']), select, textarea"
      )
      .forEach((el) => {
        const label =
          el.placeholder ||
          el.name ||
          el.getAttribute("aria-label") ||
          el.id ||
          "";
        if (label && forms.length < 8) forms.push(label.slice(0, 40));
      });

    const selectedText = window.getSelection()?.toString().trim().slice(0, 200) || "";
    const textSnippet = (document.body.innerText || "").trim().slice(0, 500);

    return {
      url: window.location.href,
      title: document.title,
      selected_text: selectedText,
      visible_buttons: buttons,
      visible_headings: headings,
      visible_forms: forms,
      text_snippet: textSnippet,
    };
  }

  // ──────────────────────────────────────────
  // Action executor for all 22 commands
  // ──────────────────────────────────────────

  private executeAction(res: VoiceCommandResponse) {
    if (!res || !res.action) {
      console.warn("🎙️ Stage 6: executeAction() received empty action response.");
      return;
    }

    console.log(`🎙️ Stage 6 (Executor): Executing action "${res.action}" with value:`, res.value);
    const val = res.value;

    switch (res.action) {
      case "scroll_up":
        this.doScroll("up", typeof val === "number" ? val : 400);
        break;

      case "scroll_down":
        this.doScroll("down", typeof val === "number" ? val : 400);
        break;

      case "scroll_top":
        this.doScroll("top", 0);
        break;

      case "scroll_bottom":
        this.doScroll("bottom", 0);
        break;

      case "click_button":
        this.doClick(val || "");
        break;

      case "click_link":
        this.doClick(val || "");
        break;

      case "go_back":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Navigating back in history.");
        window.history.back();
        break;

      case "go_forward":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Navigating forward in history.");
        window.history.forward();
        break;

      case "refresh_page":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Reloading the current page.");
        window.location.reload();
        break;

      case "zoom_in":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Toggling Zoom In.");
        this.doZoom(0.15);
        break;

      case "zoom_out":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Toggling Zoom Out.");
        this.doZoom(-0.15);
        break;

      case "read_selected_text":
        const selected = window.getSelection()?.toString().trim();
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Reading selected text:", selected);
        if (selected) {
          this.speakResponse(selected);
          return; // Skip standard speak confirmation since we read the text itself
        } else {
          this.speakResponse("No text is selected to read.");
          return;
        }

      case "stop_speaking":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Cancelling active speech synthesis.");
        window.speechSynthesis.cancel();
        break;

      case "open_website":
        let url = val || "";
        if (url) {
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
          }
          console.log("🎙️ Stage 7 (DOM/Browser Interaction): Opening website:", url);
          window.location.href = url;
        }
        break;

      case "search_web_query":
        const query = val || "";
        if (query) {
          console.log("🎙️ Stage 7 (DOM/Browser Interaction): Searching web for:", query);
          const searchInput = document.querySelector('input[type="search"], input[name="q"], input[placeholder*="search" i]') as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
            searchInput.value = query;
            const form = searchInput.form;
            if (form) {
              form.submit();
            } else {
              const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
              searchInput.dispatchEvent(event);
            }
          } else {
            window.open("https://www.google.com/search?q=" + encodeURIComponent(query));
          }
        }
        break;

      // Copilot Form Filling & Autonomous Navigation
      case "autofill_form":
      case "fill_form":
        console.log(`🎙️ Stage 7: Dispatching Copilot Form Fill for command: ${res.value || val}`);
        document.dispatchEvent(new CustomEvent("neuro-copilot-trigger", {
          detail: { type: "autofill", prompt: res.value || val || "" }
        }));
        break;

      case "autonomous_navigate":
      case "navigate_checkout":
        console.log(`🎙️ Stage 7: Dispatching Autonomous Navigation for command: ${res.value || val}`);
        document.dispatchEvent(new CustomEvent("neuro-copilot-trigger", {
          detail: { type: "navigate", instruction: res.value || val || "" }
        }));
        break;

      // Accessibility / Layout actions delegated to content.ts
      case "open_accessibility_dock":
      case "close_accessibility_dock":
      case "simplify_website":
      case "dark_mode":
      case "light_mode":
      case "increase_font":
      case "decrease_font":
      case "highlight_headings":
      case "open_chatbot":
        console.log(`🎙️ Stage 7 (DOM/Browser Interaction): Dispatching CustomEvent "neuro-assist-action" for: ${res.action}`);
        document.dispatchEvent(new CustomEvent("neuro-assist-action", {
          detail: { action: res.action, value: val }
        }));
        break;

      case "unknown":
      default:
        console.warn("🎙️ Stage 6: Action delegated to Copilot NLU fallback:", res.action);
        document.dispatchEvent(new CustomEvent("neuro-copilot-trigger", {
          detail: { type: "autofill", prompt: val || res.speak || "" }
        }));
        break;
    }

    // Dispatch execution feedback details to content.ts UI
    document.dispatchEvent(new CustomEvent("neuro-assist-action", {
      detail: { action: "voice_executed", speak: res.speak || res.action }
    }));

    // Speak the confirmation/feedback
    if (res.speak) {
      this.speakResponse(res.speak);
    } else {
      this.resumeListeningIfNeeded();
    }
  }

  // ── Scroll helper ──
  private doScroll(direction: string, amount: number) {
    console.log(`🎙️ Stage 7 (DOM/Browser Interaction): doScroll(direction="${direction}", amount=${amount})`);
    
    // Find all scrollable containers or default to document elements
    const scrollableElements: HTMLElement[] = [];
    
    // Check documentElement and body first
    if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
      scrollableElements.push(document.documentElement);
    }
    if (document.body.scrollHeight > document.body.clientHeight) {
      scrollableElements.push(document.body);
    }

    // Traverse DOM to find overflow containers
    try {
      const allElems = document.querySelectorAll("*");
      allElems.forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.scrollHeight > htmlEl.clientHeight) {
          const style = window.getComputedStyle(htmlEl);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            scrollableElements.push(htmlEl);
          }
        }
      });
    } catch (e) {
      console.warn("🎙️ Error detecting nested scrollable containers:", e);
    }

    console.log(`🎙️ Stage 7 (DOM/Browser Interaction): Found ${scrollableElements.length} scrollable container elements.`);

    if (scrollableElements.length === 0) {
      console.log("🎙️ Stage 7 (DOM/Browser Interaction): Scrolling main window fallback.");
      if (direction === "up") {
        window.scrollBy({ top: -amount, behavior: "smooth" });
      } else if (direction === "down") {
        window.scrollBy({ top: amount, behavior: "smooth" });
      } else if (direction === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (direction === "bottom") {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      }
      return;
    }

    // Scroll all matching elements
    scrollableElements.forEach((el, index) => {
      console.log(`🎙️ Stage 7 (DOM/Browser Interaction): Scrolling container index ${index}: tag=${el.tagName}, id=${el.id}, class=${el.className}`);
      try {
        if (direction === "up") {
          el.scrollBy({ top: -amount, behavior: "smooth" });
        } else if (direction === "down") {
          el.scrollBy({ top: amount, behavior: "smooth" });
        } else if (direction === "top") {
          el.scrollTo({ top: 0, behavior: "smooth" });
        } else if (direction === "bottom") {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      } catch (e) {
        console.warn("🎙️ Error scrolling container element:", e);
      }
    });
  }

  // ── Zoom helper ──
  private doZoom(factor: number) {
    const bodyStyle = document.body.style as any;
    const currentZoom = parseFloat(bodyStyle.zoom || "1.0");
    const nextZoom = Math.max(0.5, Math.min(3, currentZoom + factor));
    bodyStyle.zoom = nextZoom.toString();
    console.log(`🔍 Zoom factor updated to: ${nextZoom}`);
  }

  // ── Click helper ──
  private doClick(selector: string) {
    console.log(`🎙️ Stage 7 (DOM/Browser Interaction): doClick(selector/text="${selector}")`);
    
    let el: HTMLElement | null = null;
    
    // 1. Try treating it as a CSS selector query
    if (selector && selector.trim()) {
      try {
        el = document.querySelector<HTMLElement>(selector);
        if (el) {
          console.log(`🎙️ Stage 7 (DOM/Browser Interaction): Found element matching CSS selector "${selector}":`, el);
        }
      } catch (_) { }
    }

    // 2. Find by text label matching (case-insensitive substring match)
    if (!el && selector && selector.trim()) {
      const lowerSelector = selector.toLowerCase().trim();
      const candidates = document.querySelectorAll<HTMLElement>(
        "button, [role='button'], a, input[type='submit'], input[type='button']"
      );
      for (const candidate of Array.from(candidates)) {
        const text = (
          candidate.textContent ||
          (candidate as HTMLInputElement).value ||
          ""
        )
          .trim()
          .toLowerCase();
        if (text.includes(lowerSelector)) {
          el = candidate;
          console.log(`🎙️ Stage 7 (DOM/Browser Interaction): Found element matching text substring "${selector}":`, el);
          break;
        }
      }
    }

    // 3. Fallback: if no element was matched but the intent is "click button", click the first valid visible button
    if (!el) {
      console.log("🎙️ Stage 7 (DOM/Browser Interaction): No target matched. Searching for first valid visible button on screen.");
      const buttons = document.querySelectorAll<HTMLElement>(
        "button, [role='button'], input[type='button'], input[type='submit']"
      );
      for (const btn of Array.from(buttons)) {
        // Exclude our own extension dock elements from being clicked by general fallback
        if (btn.closest(".na-top-dock") || btn.closest(".na-chat-box") || btn.closest(".na-master-fab")) {
          continue;
        }
        const style = window.getComputedStyle(btn);
        const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0 && style.display !== "none" && style.visibility !== "hidden";
        const isDisabled = btn.hasAttribute("disabled") || (btn as any).disabled === true;
        
        if (isVisible && !isDisabled) {
          el = btn;
          console.log("🎙️ Stage 7 (DOM/Browser Interaction): Found first valid visible button on page:", el);
          break;
        }
      }
    }

    // 4. Perform click
    if (el) {
      console.log("🎙️ Stage 7 (DOM/Browser Interaction): Scrolling element into view and clicking:", el);
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.click();
        console.log("🖱️ Elements clicked successfully:", el);
      } catch (e) {
        console.warn("🎙️ Stage 7 (DOM/Browser Interaction): Failed to click target element:", e);
      }
    } else {
      console.warn("🎙️ Stage 7 (DOM/Browser Interaction): Could not find any valid element to click for selector:", selector);
    }
  }

  // ──────────────────────────────────────────
  // Local fallback parser
  // ──────────────────────────────────────────

  private localFallback(command: string): VoiceCommandResponse {
    const cmd = command.toLowerCase().trim();

    if (cmd.startsWith("open ") || cmd.startsWith("go to ")) {
      const target = cmd.replace("open ", "").replace("go to ", "").trim();
      return { action: "open_website", value: target, speak: "Opening website " + target };
    }
    if (cmd.startsWith("search ") || cmd.startsWith("find ")) {
      const query = cmd.replace("search ", "").replace("find ", "").trim();
      return { action: "search_web_query", value: query, speak: "Searching for " + query };
    }

    if (cmd.includes("fill form") || cmd.includes("autofill") || cmd.includes("form bharo") || cmd.includes("fill application") || cmd.includes("fill details")) {
      return { action: "autofill_form", value: cmd, speak: "Scanning form and generating predictions" };
    }
    if (cmd.includes("add to cart") || cmd.includes("buy now") || cmd.includes("proceed to checkout") || cmd.includes("checkout")) {
      return { action: "autonomous_navigate", value: cmd, speak: "Executing autonomous navigation" };
    }

    if (cmd.includes("scroll down") || cmd.includes("niche jao") || cmd.includes("niche scroll")) {
      return { action: "scroll_down", value: 400, speak: "Scrolling down" };
    }
    if (cmd.includes("scroll up") || cmd.includes("upar jao") || cmd.includes("upar scroll")) {
      return { action: "scroll_up", value: 400, speak: "Scrolling up" };
    }
    if (cmd.includes("top pe jao") || cmd.includes("shuruaat") || cmd.includes("scroll to top")) {
      return { action: "scroll_top", speak: "Scrolling to top" };
    }
    if (cmd.includes("end pe jao") || cmd.includes("niche tak") || cmd.includes("scroll to bottom")) {
      return { action: "scroll_bottom", speak: "Scrolling to bottom" };
    }
    if (cmd.includes("go back") || cmd.includes("wapas jao") || cmd.includes("peeche")) {
      return { action: "go_back", speak: "Going back" };
    }
    if (cmd.includes("go forward") || cmd.includes("aage jao")) {
      return { action: "go_forward", speak: "Going forward" };
    }
    if (cmd.includes("refresh") || cmd.includes("reload") || cmd.includes("dobara load")) {
      return { action: "refresh_page", speak: "Refreshing page" };
    }
    if (cmd.includes("zoom in") || cmd.includes("bada karo")) {
      return { action: "zoom_in", speak: "Zooming in" };
    }
    if (cmd.includes("zoom out") || cmd.includes("chhota karo")) {
      return { action: "zoom_out", speak: "Zooming out" };
    }
    if (cmd.includes("open accessibility dock") || cmd.includes("dock kholo")) {
      return { action: "open_accessibility_dock", speak: "Opening accessibility dock" };
    }
    if (cmd.includes("close accessibility dock") || cmd.includes("dock band karo")) {
      return { action: "close_accessibility_dock", speak: "Closing accessibility dock" };
    }
    if (cmd.includes("simplify") || cmd.includes("easy karo") || cmd.includes("aasan karo")) {
      return { action: "simplify_website", speak: "Simplifying website text" };
    }
    if (cmd.includes("dark mode") || cmd.includes("kala karo")) {
      return { action: "dark_mode", speak: "Switching to dark mode" };
    }
    if (cmd.includes("light mode") || cmd.includes("safed karo")) {
      return { action: "light_mode", speak: "Switching to light mode" };
    }
    if (cmd.includes("increase font") || cmd.includes("text bada")) {
      return { action: "increase_font", speak: "Increasing font size" };
    }
    if (cmd.includes("decrease font") || cmd.includes("text chhota")) {
      return { action: "decrease_font", speak: "Decreasing font size" };
    }
    if (cmd.includes("highlight headings") || cmd.includes("heading highlight")) {
      return { action: "highlight_headings", speak: "Highlighting headings" };
    }
    if (cmd.includes("open chatbot") || cmd.includes("chatbot kholo")) {
      return { action: "open_chatbot", speak: "Opening chatbot" };
    }
    if (cmd.includes("read selected text") || cmd.includes("read text")) {
      return { action: "read_selected_text", speak: "Reading selected text" };
    }
    if (cmd.includes("stop speaking") || cmd.includes("chup ho jao")) {
      return { action: "stop_speaking", speak: "Stopping playback" };
    }
    if (cmd.includes("click button") || cmd.includes("button click")) {
      const val = cmd.replace("click button", "").replace("button click", "").trim();
      return { action: "click_button", value: val || undefined, speak: `Clicking button ${val}` };
    }
    if (cmd.includes("click link") || cmd.includes("link click")) {
      const val = cmd.replace("click link", "").replace("link click", "").trim();
      return { action: "click_link", value: val || undefined, speak: `Clicking link ${val}` };
    }

    // Generic fallback triggers for natural commands
    if (cmd.startsWith("click ") || cmd.startsWith("press ") || cmd.startsWith("select ")) {
      let val = cmd
        .replace(/^click on\s+the\s+/, "")
        .replace(/^click on\s+/, "")
        .replace(/^click\s+the\s+/, "")
        .replace(/^click\s+/, "")
        .replace(/^press\s+the\s+/, "")
        .replace(/^press\s+/, "")
        .replace(/^select\s+the\s+/, "")
        .replace(/^select\s+/, "")
        .trim();
      if (val === "button" || val === "link") val = "";
      return { action: "click_button", value: val || undefined, speak: val ? `Clicking ${val}` : "Clicking element" };
    }

    if (cmd.startsWith("open ") || cmd.startsWith("go to ") || cmd.startsWith("search ")) {
      const val = cmd
        .replace(/^open\s+the\s+/, "")
        .replace(/^open\s+/, "")
        .replace(/^go\s+to\s+the\s+/, "")
        .replace(/^go\s+to\s+/, "")
        .replace(/^search\s+for\s+/, "")
        .replace(/^search\s+/, "")
        .trim();
      return { action: "click_link", value: val || undefined, speak: `Opening ${val}` };
    }

    return {
      action: "unknown",
      speak: "Action not understood."
    };
  }

  // ──────────────────────────────────────────
  // TTS — Spoken feedback via browser synthesis
  // ──────────────────────────────────────────

  private speakResponse(text: string) {
    if (!this.ttsEnabled || !window.speechSynthesis) return;

    const wasListening = this.isListening;
    this.isSpeaking = true;

    // Temporarily halt recognition to avoid microphone feedback loops
    if (wasListening) {
      this.safeSendMessage({
        type: "TOGGLE_VOICE_RECOGNITION",
        state: false,
        temporary: true
      });
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Automatically detect synthesis language locale
    let matchedLang = "en-US";
    const lowercaseText = text.toLowerCase();
    
    // Hindi detection (Devanagari script or common words/phrases)
    if (/[\u0900-\u097F]/.test(text) || lowercaseText.includes("नमस्ते") || lowercaseText.includes("कॉल") || lowercaseText.includes("नया") || lowercaseText.includes("मदद")) {
      matchedLang = "hi-IN";
    }
    // Punjabi detection (Gurmukhi script or common words/phrases)
    else if (/[\u0A00-\u0A7F]/.test(text) || lowercaseText.includes("ਸਤਿ") || lowercaseText.includes("ਕਰੋ") || lowercaseText.includes("ਜੀ")) {
      matchedLang = "pa-IN";
    }
    // Tamil detection (Tamil script)
    else if (/[\u0B80-\u0BFF]/.test(text)) {
      matchedLang = "ta-IN";
    }
    // Telugu detection (Telugu script)
    else if (/[\u0C00-\u0C7F]/.test(text)) {
      matchedLang = "te-IN";
    }
    // Bengali detection (Bengali script)
    else if (/[\u0980-\u09FF]/.test(text)) {
      matchedLang = "bn-IN";
    }
    
    utterance.lang = matchedLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith(matchedLang.split("-")[0]) &&
        (v.name.includes("Google") ||
          v.name.includes("Natural") ||
          v.name.includes("Female") ||
          v.name.includes("Local"))
    );
    if (preferred) utterance.voice = preferred;

    const resume = () => {
      this.isSpeaking = false;
      if (wasListening && this.isListening) {
        this.safeSendMessage({
          type: "TOGGLE_VOICE_RECOGNITION",
          state: true,
          temporary: true
        });
      }
    };

    utterance.onend = resume;
    utterance.onerror = resume;

    window.speechSynthesis.speak(utterance);
  }

  private resumeListeningIfNeeded() {
    if (this.isListening && !this.isSpeaking) {
      this.safeSendMessage({
        type: "TOGGLE_VOICE_RECOGNITION",
        state: true,
        temporary: true
      });
    }
  }

  // ──────────────────────────────────────────
  // Visual mic indicator (pulse animation)
  // ──────────────────────────────────────────

  private injectMicIndicator() {
    if (document.getElementById("na-voice-mic-indicator")) return;

    const style = document.createElement("style");
    style.id = "na-voice-mic-indicator-css";
    style.innerHTML = `
      #na-voice-mic-indicator {
        position: fixed !important;
        bottom: 108px !important;
        right: 35px !important;
        width: 18px !important;
        height: 18px !important;
        border-radius: 50% !important;
        background: #22c55e !important;
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6) !important;
        z-index: 2147483647 !important;
        display: none !important;
        pointer-events: none !important;
      }
      #na-voice-mic-indicator.active {
        display: block !important;
        animation: na-mic-pulse 1.4s ease-in-out infinite !important;
      }
      @keyframes na-mic-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); transform: scale(1); }
        50%  { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); transform: scale(1.15); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    this.micIndicator = document.createElement("div");
    this.micIndicator.id = "na-voice-mic-indicator";
    document.body.appendChild(this.micIndicator);
  }

  private setMicIndicator(active: boolean) {
    if (!this.micIndicator) return;
    if (active) {
      this.micIndicator.classList.add("active");
    } else {
      this.micIndicator.classList.remove("active");
    }
  }

  private voiceStatusOverlay: HTMLDivElement | null = null;
  private overlayTimeout: any = null;

  private injectVoiceStatusOverlay() {
    if (document.getElementById("na-voice-status-overlay")) return;

    this.voiceStatusOverlay = document.createElement("div");
    this.voiceStatusOverlay.id = "na-voice-status-overlay";
    this.voiceStatusOverlay.innerHTML = "🎙️ Neuro Voice: Ready";
    
    Object.assign(this.voiceStatusOverlay.style, {
      position: "fixed",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%) translateY(-20px)",
      background: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.95) 100%)",
      color: "white",
      padding: "12px 24px",
      borderRadius: "30px",
      fontSize: "13px",
      fontWeight: "500",
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
      border: "1px solid rgba(255,255,255,0.1)",
      zIndex: "2147483647",
      fontFamily: "'Outfit', system-ui, sans-serif",
      display: "none",
      alignItems: "center",
      gap: "10px",
      pointerEvents: "none",
      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      opacity: "0"
    });

    document.body.appendChild(this.voiceStatusOverlay);
  }

  private showVoiceStatusOverlay(text: string, isLive: boolean = false) {
    if (!this.voiceStatusOverlay) {
      this.injectVoiceStatusOverlay();
    }
    if (this.voiceStatusOverlay) {
      this.voiceStatusOverlay.style.display = "flex";
      // Trigger browser reflow for CSS transition
      this.voiceStatusOverlay.offsetHeight;
      this.voiceStatusOverlay.style.opacity = "1";
      this.voiceStatusOverlay.style.transform = "translateX(-50%) translateY(0px)";
      this.voiceStatusOverlay.innerHTML = text;
      
      if (!isLive) {
        if (this.overlayTimeout) clearTimeout(this.overlayTimeout);
        this.overlayTimeout = setTimeout(() => {
          if (this.isListening && this.voiceStatusOverlay) {
            this.voiceStatusOverlay.innerHTML = "🎙️ Neuro Voice: Listening...";
          }
        }, 3000);
      }
    }
  }

  private hideVoiceStatusOverlay() {
    if (this.voiceStatusOverlay) {
      this.voiceStatusOverlay.style.opacity = "0";
      this.voiceStatusOverlay.style.transform = "translateX(-50%) translateY(-20px)";
      setTimeout(() => {
        if (this.voiceStatusOverlay) this.voiceStatusOverlay.style.display = "none";
      }, 300);
    }
  }
}