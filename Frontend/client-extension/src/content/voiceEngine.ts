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
    this.checkAutoplayTrigger();
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
        this.toggleVoiceSystem(true, true);
      }
    });
  }

  private listenForRuntimeMessages() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          console.log("DEBUG [voiceEngine.ts] onMessage received message type:", message.type, message);
          if (message.type === "GET_VOICE_STATE") {
            sendResponse({ isListening: this.isListening });
          } else if (message.type === "TOGGLE_VOICE_SYSTEM") {
            console.log("DEBUG [voiceEngine.ts] TOGGLE_VOICE_SYSTEM state:", message.state);
            this.toggleVoiceSystem(message.state, false);
            sendResponse({ isListening: this.isListening });
          } else if (message.type === "VOICE_COMMAND_INTERIM") {
            this.showVoiceStatusOverlay(`🎙️ Spoken: <strong>${message.transcript}...</strong>`, true);
          } else if (message.type === "VOICE_COMMAND_RECOGNIZED") {
            console.log("🎙️ Stage 4: Received voice command message from background/offscreen:", message.command);
            this.showVoiceStatusOverlay(`🎙️ Spoken: <strong>${message.command}</strong>`, false);
            if (this.isListening && !this.isSpeaking) {
              console.log("DEBUG [voiceEngine.ts] isListening is true, isSpeaking is false. Processing command...");
              this.processCommand(message.command);
            } else {
              console.warn(`🎙️ Content Script: Ignored command because isListening is ${this.isListening} or isSpeaking is ${this.isSpeaking}.`);
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
            this.toggleVoiceSystem(true, false);
          } else if (message.type === "VOICE_STATE_CHANGED") {
            console.log("DEBUG [voiceEngine.ts] VOICE_STATE_CHANGED:", message.isListening);
            this.isListening = message.isListening;
            if (message.isListening) {
              this.isSpeaking = false;
              this.showVoiceStatusOverlay("🎙️ Neuro Voice: Listening...", false);
            } else {
              this.hideVoiceStatusOverlay();
            }
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

  public toggleVoiceSystem(state: boolean, silent: boolean = false) {
    console.log("DEBUG [voiceEngine.ts] toggleVoiceSystem called with state:", state, "current isListening:", this.isListening);
    if (state && !this.isListening) {
      this.isListening = true;
      this.setListeningState(true);
      console.log("DEBUG [voiceEngine.ts] sending TOGGLE_VOICE_RECOGNITION true to background");
      this.safeSendMessage({ type: "TOGGLE_VOICE_RECOGNITION", state: true });
      console.log("🎙️ Live Voice Navigation Activated.");
      if (!silent) {
        this.speakResponse("Voice engine activated.");
      }
      this.showVoiceStatusOverlay("🎙️ Neuro Voice: Listening...", false);
    } else if (!state && this.isListening) {
      this.isListening = false;
      this.setListeningState(false);
      console.log("DEBUG [voiceEngine.ts] sending TOGGLE_VOICE_RECOGNITION false to background");
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
    }

    if (!response || response.action === "unknown") {
      const fallback = this.localFallback(command);
      if (fallback && fallback.action !== "unknown") {
        response = fallback;
        console.log("🎙️ Stage 5 (NLU/Resolver): Backend returned unknown, using local fallback parser resolved:", response);
      }
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

      case "click_video":
      case "play_video":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Executing play_video.");
        const videoElPlay = document.querySelector('video') as HTMLVideoElement | null;
        if (videoElPlay && window.location.href.includes("/watch")) {
          videoElPlay.play();
          console.log("🎙️ Stage 7: Native video.play() executed successfully.");
        } else {
          const firstVideo = document.querySelector('a#video-title, a[href*="/watch?v="]') as HTMLElement | null;
          if (firstVideo && !window.location.href.includes("/watch")) {
            firstVideo.scrollIntoView({ behavior: "smooth", block: "center" });
            firstVideo.click();
          } else {
            const playButton = document.querySelector('.ytp-play-button, .play, [aria-label*="Play" i], button[title*="Play" i]') as HTMLElement | null;
            if (playButton) {
              playButton.click();
            } else {
              this.speakResponse("Could not find any video or play button to click.");
            }
          }
        }
        break;

      case "pause_video":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Executing pause_video.");
        const videoElPause = document.querySelector('video') as HTMLVideoElement | null;
        if (videoElPause && window.location.href.includes("/watch")) {
          videoElPause.pause();
          console.log("🎙️ Stage 7: Native video.pause() executed successfully.");
        } else {
          const pauseButton = document.querySelector('.ytp-play-button, .pause, [aria-label*="Pause" i], button[title*="Pause" i]') as HTMLElement | null;
          if (pauseButton) {
            pauseButton.click();
          } else {
            this.speakResponse("Could not find any pause button to click.");
          }
        }
        break;

      case "stop_listening":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Stopping voice recognition.");
        this.toggleVoiceSystem(false, false);
        break;

      case "close_tab":
        console.log("🎙️ Stage 7 (DOM/Browser Interaction): Closing current tab.");
        chrome.runtime.sendMessage({ type: "CLOSE_ACTIVE_TAB" });
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

    if (cmd === "stop listening" || cmd.startsWith("stop listening") || cmd === "deactivate voice" || cmd === "shut up" || cmd === "band karo") {
      return { action: "stop_listening", value: "stop", speak: "Stopping voice assistant" };
    }
    if (cmd === "pause" || cmd === "stop" || cmd.startsWith("pause ") || cmd.startsWith("stop ") || cmd === "pause video" || cmd === "stop video" || cmd === "video roko" || cmd === "video pause" || cmd === "ruk jao") {
      return { action: "pause_video", value: "pause", speak: "Pausing video" };
    }
    if (cmd === "close" || cmd === "close tab" || cmd === "close website" || cmd === "close window" || cmd === "tab band karo" || cmd.startsWith("close ") || cmd.startsWith("close tab ") || cmd.startsWith("close website ")) {
      return { action: "close_tab", value: "current", speak: "Closing current tab" };
    }

    // Check if command is a video play/open action (supporting English, Hindi, Hinglish variations)
    const hasVideoWord = cmd.includes("video") || cmd.includes("वीडियो") || cmd.includes("ਵੀਡੀਓ");
    const hasPlayActionWord = [
      "play", "open", "click", "run", "start", "chalao", "kholo", "chalu", "chalaye",
      "चलाओ", "खोलो", "खोल", "ਪਲੇ", "ਖੋਲੋ"
    ].some(k => cmd.includes(k));

    if (hasVideoWord && hasPlayActionWord) {
      return { action: "click_video", value: "first", speak: "Playing video" };
    }

    let songTarget = "";
    const playPrefixes = [
      "play song ", "play ", "chalao ", "chala do ", "play karo ", "बजाओ ", "चलाओ "
    ];
    const playSuffixes = [
      " play karo", " chalao", " chala do", " play", " chalaona", " chalana",
      " चलाओ", " चलाएं", " बजाओ", " प्ले करो"
    ];

    for (const pref of playPrefixes) {
      if (cmd.startsWith(pref)) {
        songTarget = cmd.slice(pref.length).trim();
        break;
      }
    }

    if (!songTarget) {
      for (const suff of playSuffixes) {
        if (cmd.endsWith(suff)) {
          songTarget = cmd.slice(0, -suff.length).trim();
          break;
        }
      }
    }

    if (songTarget) {
      const genericTerms = ["video", "song", "that video", "this video", "the video", "it", "वीडियो", "ਵੀਡੀਓ"];
      const isGeneric = genericTerms.includes(songTarget.toLowerCase());
      if (isGeneric) {
        return { action: "click_video", value: "first", speak: "Playing video" };
      } else {
        return {
          action: "open_website",
          value: `https://www.youtube.com/results?search_query=${encodeURIComponent(songTarget)}&autoplay=1`,
          speak: "Playing " + songTarget
        };
      }
    }
    if (cmd === "play" || cmd === "play song" || cmd === "chalao" || cmd === "चलाओ") {
      return { action: "click_video", value: "first", speak: "Playing the first video" };
    }

    const openSiteRes = this.parseOpenWebsiteCommand(command);
    if (openSiteRes) {
      return openSiteRes;
    }
    if (cmd.startsWith("search ") || cmd.startsWith("find ")) {
      const query = cmd.replace("search ", "").replace("find ", "").trim();
      return { action: "search_web_query", value: query, speak: "Searching for " + query };
    }

    if (cmd.includes("fill form") || cmd.includes("autofill") || cmd.includes("form bharo") || cmd.includes("fill application") || cmd.includes("fill details")) {
      return { action: "autofill_form", value: cmd, speak: "Scanning form and generating predictions" };
    }
    if (cmd === "add" || cmd === "add product" || cmd.includes("add to cart") || cmd.includes("add to bag") || cmd.includes("add to basket")) {
      return { action: "click_button", value: "add to cart", speak: "Adding item to cart" };
    }
    if (cmd.includes("buy now")) {
      return { action: "click_button", value: "buy now", speak: "Buying now" };
    }
    if (cmd.includes("proceed to checkout") || cmd.includes("checkout") || cmd.includes("place order")) {
      return { action: "click_button", value: "checkout", speak: "Proceeding to checkout" };
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
    if (!this.ttsEnabled) return;

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

    this.isSpeaking = true;
    console.log("🎙️ Requesting background to speak via chrome.tts:", text, "lang:", matchedLang);
    this.safeSendMessage({
      type: "SPEAK",
      text: text,
      lang: matchedLang
    });
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

  private transliterateDevanagari(text: string): string {
    const charMap: { [key: string]: string } = {
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
    };
    let resVal = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (charMap[char] !== undefined) {
        resVal += charMap[char];
      } else if (/[a-zA-Z0-9\-]/.test(char)) {
        resVal += char;
      }
    }
    return resVal;
  }

  private parseOpenWebsiteCommand(command: string): VoiceCommandResponse | null {
    let cmd = command.toLowerCase().trim().replace(/[.,?!]+$/, "");
    
    // Normalize spoken dots
    cmd = cmd.replace(/\s+dot\s+/g, ".");
    cmd = cmd.replace(/\s+dot-([a-zA-Z]{2,})/g, ".$1");
    cmd = cmd.replace(/\s+dot\s*([a-zA-Z]{2,})/g, ".$1");
    cmd = cmd.replace(/\.\s+/g, ".");

    if (["open settings", "go to settings", "show settings"].some(k => cmd.includes(k))) {
      return { action: "open_website", value: "chrome://settings", speak: "Opening Settings" };
    }
    if (["open downloads", "go to downloads", "show downloads"].some(k => cmd.includes(k))) {
      return { action: "open_website", value: "chrome://downloads", speak: "Opening Downloads" };
    }

    let target = "";
    
    // English prefixes including natural phrases
    const engPrefixRegex = /^(?:please\s+open\s+|can\s+you\s+open\s+|take\s+me\s+to\s+|open\s+the\s+|open\s+|go\s+to\s+the\s+|go\s+to\s+|launch\s+|navigate\s+to\s+the\s+|navigate\s+to\s+|show\s+me\s+the\s+|show\s+me\s+)(.+)$/;
    const match = cmd.match(engPrefixRegex);
    if (match) {
      target = match[1].trim();
    } else {
      // Hindi / Hinglish prefixes (English script)
      const hindiPrefixes = ["kholo ", "chalao ", "open karo ", "chalu karo ", "ko open karo ", "ko kholo "];
      for (const pref of hindiPrefixes) {
        if (cmd.startsWith(pref)) {
          target = cmd.slice(pref.length).trim();
          break;
        }
      }
      // Hindi / Hinglish prefixes (Devanagari script)
      if (!target) {
        const devanagariPrefixes = ["खोलो ", "चलाओ ", "ओपन करो ", "चालू करो ", "खोलना ", "को खोलो ", "को ओपन करो "];
        for (const pref of devanagariPrefixes) {
          if (cmd.startsWith(pref)) {
            target = cmd.slice(pref.length).trim();
            break;
          }
        }
      }

      // Hindi / Hinglish suffixes (English script)
      if (!target) {
        const hindiSuffixes = [" kholo", " khol", " open karo", " open karna", " chalao", " kholna", " chalu karo", " khol do", " kholo na", " ko open karo", " ko kholo", " ko khol do"];
        for (const suff of hindiSuffixes) {
          if (cmd.endsWith(suff)) {
            target = cmd.slice(0, -suff.length).trim();
            break;
          }
        }
      }
      // Hindi / Hinglish suffixes (Devanagari script)
      if (!target) {
        const devanagariSuffixes = [" खोलो", " खोल", " ओपन करो", " चालू करो", " खोल दो", " खोलना", " खोलो ना", " को खोलो", " को खोल दो", " को चालू करो"];
        for (const suff of devanagariSuffixes) {
          if (cmd.endsWith(suff)) {
            target = cmd.slice(0, -suff.length).trim();
            break;
          }
        }
      }
    }

    // If no prefix/suffix matched, check if it contains "open" or "kholo" or "go to" inside
    if (!target) {
      for (const verb of ["open ", "kholo ", "go to ", "खोलो ", "खोल ", " chalao", " chalu karo"]) {
        if (cmd.includes(verb)) {
          const parts = cmd.split(verb);
          if (parts.length > 1 && parts[1].trim()) {
            target = parts[1].trim();
            break;
          }
        }
      }
    }

    // If still not found, check if it's a bare domain or single word
    if (!target) {
      if (!cmd.includes(" ") || /^[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/.test(cmd)) {
        target = cmd;
      }
    }

    if (!target) return null;

    // Strip common website/app filler words from the target
    const fillers = ["website", "web site", "app", "application", "portal", "page", "site", "online", "official"];
    for (const filler of fillers) {
      if (target.endsWith(" " + filler) || target.endsWith("-" + filler)) {
        target = target.slice(0, -filler.length - 1).trim();
      }
      if (target.startsWith(filler + " ") || target.startsWith(filler + "-")) {
        target = target.slice(filler.length + 1).trim();
      }
    }

    // Strip introductory fillers
    for (const filler of ["this ", "that ", "the ", "a ", "an "]) {
      if (target.startsWith(filler)) {
        target = target.slice(filler.length).trim();
        break;
      }
    }

    // Strip fillers again in case of "this website myntra"
    for (const filler of fillers) {
      if (target.endsWith(" " + filler) || target.endsWith("-" + filler)) {
        target = target.slice(0, -filler.length - 1).trim();
      }
      if (target.startsWith(filler + " ") || target.startsWith(filler + "-")) {
        target = target.slice(filler.length + 1).trim();
      }
    }

    if (!target) return null;

    let targetClean = target.replace(/\s+/g, "").replace(/-/g, "").replace(/_/g, "").replace(/\./g, "").toLowerCase();
    if (!targetClean) return null;

    // Transliterate if Devanagari script is found
    const isDevanagari = /[\u0900-\u097F]/.test(targetClean);
    if (isDevanagari) {
      const transliterated = this.transliterateDevanagari(targetClean);
      if (transliterated) {
        targetClean = transliterated;
      }
    }

    const WEBSITE_MAP: { [key: string]: [string, string] } = {
      "myntra": ["https://www.myntra.com", "Myntra"],
      "flipkart": ["https://www.flipkart.com", "Flipkart"],
      "amazon": ["https://www.amazon.in", "Amazon"],
      "amazonin": ["https://www.amazon.in", "Amazon India"],
      "amazoncom": ["https://www.amazon.com", "Amazon US"],
      "shopsy": ["https://www.shopsy.in", "Shopsy"],
      "meesho": ["https://www.meesho.com", "Meesho"],
      "ajio": ["https://www.ajio.com", "Ajio"],
      "nykaa": ["https://www.nykaa.com", "Nykaa"],
      "nykaaman": ["https://www.nykaaman.com", "Nykaa Man"],
      "snapdeal": ["https://www.snapdeal.com", "Snapdeal"],
      "croma": ["https://www.croma.com", "Croma"],
      "reliancedigital": ["https://www.reliancedigital.in", "Reliance Digital"],
      "tatacliq": ["https://www.tatacliq.com", "Tata Cliq"],
      "jiomart": ["https://www.jiomart.com", "JioMart"],
      "ebay": ["https://www.ebay.com", "eBay"],
      "blinkit": ["https://www.blinkit.com", "Blinkit"],
      "zepto": ["https://www.zepto.com", "Zepto"],
      "bigbasket": ["https://www.bigbasket.com", "BigBasket"],
      "swiggyinstamart": ["https://www.swiggy.com/instamart", "Swiggy Instamart"],
      "swiggy": ["https://www.swiggy.com", "Swiggy"],
      "zomato": ["https://www.zomato.com", "Zomato"],
      "lenskart": ["https://www.lenskart.com", "Lenskart"],
      "decathlon": ["https://www.decathlon.in", "Decathlon"],
      "firstcry": ["https://www.firstcry.com", "FirstCry"],
      "urbanic": ["https://www.urbanic.com", "Urbanic"],
      "bewakoof": ["https://www.bewakoof.com", "Bewakoof"],
      "zivame": ["https://www.zivame.com", "Zivame"],
      "limeroad": ["https://www.limeroad.com", "LimeRoad"],
      "pepperfry": ["https://www.pepperfry.com", "Pepperfry"],
      "urbanladder": ["https://www.urbanladder.com", "Urban Ladder"],
      "ikea": ["https://www.ikea.com", "IKEA"],
      "coursera": ["https://www.coursera.org", "Coursera"],
      "udemy": ["https://www.udemy.com", "Udemy"],
      "khanacademy": ["https://www.khanacademy.org", "Khan Academy"],
      "edx": ["https://www.edx.org", "edX"],
      "wikipedia": ["https://www.wikipedia.org", "Wikipedia"],
      "w3schools": ["https://www.w3schools.com", "W3Schools"],
      "w3school": ["https://www.w3schools.com", "W3Schools"],
      "geeksforgeeks": ["https://www.geeksforgeeks.org", "GeeksforGeeks"],
      "gfg": ["https://www.geeksforgeeks.org", "GeeksforGeeks"],
      "stackoverflow": ["https://stackoverflow.com", "Stack Overflow"],
      "tutorialspoint": ["https://www.tutorialspoint.com", "Tutorialspoint"],
      "studyiq": ["https://www.studyiq.com", "StudyIQ"],
      "unacademy": ["https://unacademy.com", "Unacademy"],
      "byjus": ["https://byjus.com", "BYJU'S"],
      "physicswallah": ["https://www.pw.live", "Physics Wallah"],
      "pw": ["https://www.pw.live", "Physics Wallah"],
      "doubtnut": ["https://www.doubtnut.com", "Doubtnut"],
      "brainly": ["https://brainly.in", "Brainly"],
      "meritnation": ["https://www.meritnation.com", "Meritnation"],
      "vedantu": ["https://www.vedantu.com", "Vedantu"],
      "toppr": ["https://www.toppr.com", "Toppr"],
      "testbook": ["https://testbook.com", "Testbook"],
      "adda247": ["https://www.adda247.com", "Adda247"],
      "codecademy": ["https://www.codecademy.com", "Codecademy"],
      "freecodecamp": ["https://www.freecodecamp.org", "freeCodeCamp"],
      "github": ["https://www.github.com", "GitHub"],
      "gitlab": ["https://www.gitlab.com", "GitLab"],
      "bitbucket": ["https://bitbucket.org", "BitBucket"],
      "leetcode": ["https://leetcode.com", "LeetCode"],
      "hackerrank": ["https://www.hackerrank.com", "HackerRank"],
      "hackerearth": ["https://www.hackerearth.com", "HackerEarth"],
      "javatpoint": ["https://www.javatpoint.com", "Javatpoint"],
      "mdn": ["https://developer.mozilla.org", "MDN Web Docs"],
      "developermozilla": ["https://developer.mozilla.org", "MDN Web Docs"],
      "scribd": ["https://www.scribd.com", "Scribd"],
      "researchgate": ["https://www.researchgate.net", "ResearchGate"],
      "academia": ["https://www.academia.edu", "Academia"],
      "jstor": ["https://www.jstor.org", "JSTOR"],
      "duolingo": ["https://www.duolingo.com", "Duolingo"],
      "google": ["https://www.google.com", "Google"],
      "bing": ["https://www.bing.com", "Bing"],
      "yahoo": ["https://www.yahoo.com", "Yahoo"],
      "duckduckgo": ["https://duckduckgo.com", "DuckDuckGo"],
      "chatgpt": ["https://chatgpt.com", "ChatGPT"],
      "chatgptcom": ["https://chatgpt.com", "ChatGPT"],
      "claude": ["https://claude.ai", "Claude AI"],
      "gemini": ["https://gemini.google.com", "Gemini"],
      "perplexity": ["https://www.perplexity.ai", "Perplexity AI"],
      "copilot": ["https://copilot.microsoft.com", "Copilot"],
      "midjourney": ["https://www.midjourney.com", "Midjourney"],
      "youtube": ["https://www.youtube.com", "YouTube"],
      "netflix": ["https://www.netflix.com", "Netflix"],
      "primevideo": ["https://www.primevideo.com", "Prime Video"],
      "hotstar": ["https://www.hotstar.com", "Hotstar"],
      "jiocinema": ["https://www.jiocinema.com", "JioCinema"],
      "zee5": ["https://www.zee5.com", "Zee5"],
      "sonyliv": ["https://www.sonyliv.com", "SonyLIV"],
      "spotify": ["https://www.spotify.com", "Spotify"],
      "jiosaavn": ["https://www.jiosaavn.com", "JioSaavn"],
      "gaana": ["https://gaana.com", "Gaana"],
      "wynk": ["https://wynk.in", "Wynk Music"],
      "youtubemusic": ["https://music.youtube.com", "YouTube Music"],
      "twitch": ["https://www.twitch.tv", "Twitch"],
      "bookmyshow": ["https://in.bookmyshow.com", "BookMyShow"],
      "facebook": ["https://www.facebook.com", "Facebook"],
      "instagram": ["https://www.instagram.com", "Instagram"],
      "twitter": ["https://x.com", "Twitter"],
      "x": ["https://x.com", "Twitter/X"],
      "linkedin": ["https://www.linkedin.com", "LinkedIn"],
      "reddit": ["https://www.reddit.com", "Reddit"],
      "whatsapp": ["https://web.whatsapp.com", "WhatsApp"],
      "telegram": ["https://web.telegram.org", "Telegram"],
      "pinterest": ["https://www.pinterest.com", "Pinterest"],
      "snapchat": ["https://web.snapchat.com", "Snapchat"],
      "discord": ["https://discord.com", "Discord"],
      "quora": ["https://www.quora.com", "Quora"],
      "tumblr": ["https://www.tumblr.com", "Tumblr"],
      "gmail": ["https://mail.google.com", "Gmail"],
      "outlook": ["https://outlook.live.com", "Outlook"],
      "yahoomail": ["https://mail.yahoo.com", "Yahoo Mail"],
      "irctc": ["https://www.irctc.co.in", "IRCTC"],
      "paytm": ["https://paytm.com", "Paytm"],
      "phonepe": ["https://www.phonepe.com", "PhonePe"],
      "gpay": ["https://pay.google.com", "Google Pay"],
      "digilocker": ["https://www.digilocker.gov.in", "DigiLocker"],
      "uidai": ["https://uidai.gov.in", "UIDAI"],
      "incometax": ["https://www.incometax.gov.in", "Income Tax Portal"],
      "sbi": ["https://www.onlinesbi.sbi", "State Bank of India"],
      "hdfc": ["https://www.hdfcbank.com", "HDFC Bank"],
      "icici": ["https://www.icicibank.com", "ICICI Bank"],
      "axisbank": ["https://www.axisbank.com", "Axis Bank"],
      "ndtv": ["https://www.ndtv.com", "NDTV"],
      "timesofindia": ["https://timesofindia.indiatimes.com", "Times of India"],
      "toi": ["https://timesofindia.indiatimes.com", "Times of India"],
      "makemytrip": ["https://www.makemytrip.com", "MakeMyTrip"],
      "goibibo": ["https://www.goibibo.com", "Goibibo"],
      "yatra": ["https://www.yatra.com", "Yatra"],
      "redbus": ["https://www.redbus.in", "RedBus"],
      "ola": ["https://www.olacabs.com", "Ola Cabs"],
      "uber": ["https://www.uber.com", "Uber"],
      "maps": ["https://maps.google.com", "Google Maps"],
      "googlemaps": ["https://maps.google.com", "Google Maps"],
      "drive": ["https://drive.google.com", "Google Drive"],
      "googledrive": ["https://drive.google.com", "Google Drive"],
      "docs": ["https://docs.google.com", "Google Docs"],
      "googledocs": ["https://docs.google.com", "Google Docs"],
      "sheets": ["https://docs.google.com/spreadsheets", "Google Sheets"],
      "googlesheets": ["https://docs.google.com/spreadsheets", "Google Sheets"],
      "slides": ["https://docs.google.com/presentation", "Google Slides"],
      "googleslides": ["https://docs.google.com/presentation", "Google Slides"],
      "meet": ["https://meet.google.com", "Google Meet"],
      "googlemeet": ["https://meet.google.com", "Google Meet"],
      "zoom": ["https://zoom.us", "Zoom"],
      "teams": ["https://teams.microsoft.com", "Microsoft Teams"],
      "microsoftteams": ["https://teams.microsoft.com", "Microsoft Teams"],
      "canva": ["https://www.canva.com", "Canva"],
      "figma": ["https://www.figma.com", "Figma"],
      "notion": ["https://www.notion.so", "Notion"],
      "trello": ["https://trello.com", "Trello"],
      "slack": ["https://slack.com", "Slack"]
    };

    // Hindi/Punjabi scriptMap equivalents
    const scriptMap: { [key: string]: string } = {
      "फ्लिपकार्ट": "flipkart", "मीशो": "meesho", "अमेज़न": "amazon", "एमेझॉन": "amazon",
      "गूगल": "google", "यूट्यूब": "youtube", "फेसबुक": "facebook", "इंਸਟาਗ੍ਰਾਮ": "instagram",
      "ट्विटर": "twitter", "लिंक्डइन": "linkedin", "नेटफ्लिक्स": "netflix", "जीमेल": "gmail",
      "याहू": "yahoo", "विकिपीडिया": "wikipedia", "मिंत्रा": "myntra",
      "ਫਲਿੱਪਕਾਰਟ": "flipkart", "ਮੀਸ਼ੋ": "meesho", "ਐਮਾਜ਼ਾਨ": "amazon", "ਗੂਗਲ": "google",
      "ਯੂਟਿਊਬ": "youtube", "ਫੇਸਬੁੱਕ": "facebook", "ਇੰਸਟਾਗ੍ਰਾਮ": "instagram", "ਟਵਿੱਟਰ": "twitter",
      "ਲਿੰਕਡਇਨ": "linkedin", "ਨੈੱਟਫਲਿਕਸ": "netflix", "जीਮੇਲ": "gmail", "ਮਿੰਤਰਾ": "myntra"
    };

    let mappedTarget = targetClean;
    if (scriptMap[targetClean]) {
      mappedTarget = scriptMap[targetClean];
    }

    if (WEBSITE_MAP[mappedTarget]) {
      const [url, label] = WEBSITE_MAP[mappedTarget];
      return { action: "open_website", value: url, speak: `Opening ${label}` };
    }

    // Substring match in map
    for (const key of Object.keys(WEBSITE_MAP)) {
      if (key.includes(mappedTarget) || mappedTarget.includes(key)) {
        const [url, label] = WEBSITE_MAP[key];
        return { action: "open_website", value: url, speak: `Opening ${label}` };
      }
    }

    // Direct domain match
    let targetDomain = target.toLowerCase().trim();
    if (targetDomain.startsWith("https://")) {
      targetDomain = targetDomain.slice(8);
    } else if (targetDomain.startsWith("http://")) {
      targetDomain = targetDomain.slice(7);
    }
    if (targetDomain.startsWith("www.")) {
      targetDomain = targetDomain.slice(4);
    }

    if (/^[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/.test(targetDomain)) {
      return { action: "open_website", value: "https://" + targetDomain, speak: `Opening ${targetDomain}` };
    }

    // Fallback general-purpose .com
    const urlDomain = mappedTarget.replace(/[^a-zA-Z0-9\-]/g, "");
    if (urlDomain) {
      return {
        action: "open_website",
        value: `https://www.${urlDomain}.com`,
        speak: `Opening ${target.charAt(0).toUpperCase() + target.slice(1)}`
      };
    }

    return null;
  }

  private checkAutoplayTrigger() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("autoplay") === "1") {
        console.log("🎙️ Autoplay trigger detected in URL parameters!");
        setTimeout(() => {
          const selectors = [
            'ytd-video-renderer a#video-title',
            'a#video-title',
            'a[href*="/watch?v="]',
            'ytd-video-renderer a#thumbnail',
            'a#thumbnail'
          ];
          let firstVideo: HTMLAnchorElement | null = null;
          for (const selector of selectors) {
            firstVideo = document.querySelector(selector) as HTMLAnchorElement | null;
            if (firstVideo && firstVideo.href) {
              break;
            }
          }
          if (firstVideo && firstVideo.href) {
            console.log("🎙️ Autoplay: Navigating directly to video:", firstVideo.href);
            // Clean URL query parameter so refreshes don't trigger it again
            const cleanUrl = window.location.href.replace(/[&?]autoplay=1/, "");
            window.history.replaceState({}, document.title, cleanUrl);
            window.location.href = firstVideo.href;
          } else {
            console.warn("🎙️ Autoplay: No video link found with href!");
          }
        }, 2200);
      }
    } catch (e) {
      console.error("🎙️ Error in checkAutoplayTrigger:", e);
    }
  }
}