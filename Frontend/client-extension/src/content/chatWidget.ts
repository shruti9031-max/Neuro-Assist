import { getTranslation } from "../utils/translations";

export class NeuroChatWidget {
  private chatWidgetContainer: HTMLDivElement | null = null;
  private chatBody: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    this.injectStyles();
    this.createLayers();
    this.bindEvents();
    this.checkFirstLaunchAutoOpen();
    try {
      chrome.storage.local.get(["extensionLanguage"], (r) => {
        const lang = r.extensionLanguage || "en";
        this.setLanguage(lang);
      });
    } catch { /* ignore */ }
  }

  private checkFirstLaunchAutoOpen() {
    try {
      chrome.storage.local.get(["na_has_opened_welcome"], (res) => {
        if (!res || !res.na_has_opened_welcome) {
          chrome.storage.local.set({ na_has_opened_welcome: true });
          this.setVisible(true);
        }
      });
    } catch { /* ignore non-extension context */ }
  }

  private injectStyles() {
    if (document.getElementById("na-chat-widget-css")) return;

    this.styleElement = document.createElement("style");
    this.styleElement.id = "na-chat-widget-css";
    this.styleElement.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
      .na-chat-box {
        position: fixed !important; 
        bottom: 115px !important; 
        right: 35px !important;
        width: 365px !important; 
        height: 440px !important; 
        background: #ffffff !important;
        border-radius: 24px !important; 
        box-shadow: 0 20px 50px rgba(15,23,42,0.18) !important;
        border: 1px solid rgba(226,232,240,0.8) !important; 
        z-index: 2147483647 !important;
        display: none !important; 
        flex-direction: column !important; 
        overflow: hidden !important;
        font-family: 'Outfit', system-ui, -apple-system, sans-serif !important;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .na-chat-box.visible { 
        display: flex !important; 
      }
      .na-chat-head { 
        background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%) !important; 
        color: white !important; 
        padding: 16px 20px !important; 
        display: flex !important; 
        justify-content: space-between !important; 
        align-items: center !important; 
        border-bottom: 1px solid rgba(255,255,255,0.08) !important;
      }
      #naChatSettingsBtn {
        cursor: pointer !important;
        font-size: 15px !important;
        opacity: 0.85 !important;
        transition: all 0.25s ease !important;
      }
      #naChatSettingsBtn:hover {
        transform: rotate(45deg) scale(1.15) !important;
        opacity: 1 !important;
      }
      #naCloseChat {
        cursor: pointer !important;
        font-size: 12px !important;
        opacity: 0.85 !important;
        transition: all 0.2s ease !important;
      }
      #naCloseChat:hover {
        color: #ef4444 !important;
        opacity: 1 !important;
      }
      .na-chat-body { 
        flex: 1 !important; 
        padding: 16px !important; 
        background: #f8fafc !important; 
        overflow-y: auto !important; 
        display: flex !important; 
        flex-direction: column !important; 
        gap: 12px !important; 
      }
      .na-chat-body::-webkit-scrollbar {
        width: 4px !important;
      }
      .na-chat-body::-webkit-scrollbar-thumb {
        background: #cbd5e1 !important;
        border-radius: 4px !important;
      }
      .na-chat-input-area { 
        padding: 12px 16px !important; 
        background: white !important; 
        border-top: 1px solid #e2e8f0 !important; 
        display: flex !important; 
        align-items: center !important;
        gap: 10px !important; 
      }
      .na-chat-input { 
        flex: 1 !important; 
        border: 1px solid #cbd5e1 !important; 
        padding: 10px 14px !important; 
        border-radius: 12px !important; 
        font-size: 13.5px !important; 
        outline: none !important; 
        font-family: inherit !important;
        transition: all 0.25s ease !important;
      }
      .na-chat-input:focus {
        border-color: #3b82f6 !important;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.12) !important;
      }
      #naChatMicBtn {
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        width: 38px !important;
        height: 38px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        font-size: 16px !important;
        transition: all 0.2s ease !important;
        flex-shrink: 0 !important;
        outline: none !important;
      }
      #naChatMicBtn:hover {
        background: #e2e8f0 !important;
        transform: scale(1.05) !important;
      }
      #naChatMicBtn.recording {
        background: #fee2e2 !important;
        border-color: #fecaca !important;
        animation: naChatMicPulse 1.5s infinite !important;
      }
      @keyframes naChatMicPulse {
        0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
        70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
      }
      .na-chat-send { 
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important; 
        color: white !important; 
        border: none !important; 
        height: 38px !important;
        padding: 0 16px !important; 
        border-radius: 12px !important; 
        font-weight: 600 !important; 
        font-size: 13px !important;
        cursor: pointer !important; 
        transition: all 0.2s ease !important;
        flex-shrink: 0 !important;
        box-shadow: 0 4px 12px rgba(59,130,246,0.2) !important;
      }
      .na-chat-send:hover {
        background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%) !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 6px 14px rgba(59,130,246,0.3) !important;
      }
      .na-msg-bot { 
        background: white !important; 
        border: 1px solid #e2e8f0 !important; 
        padding: 12px 14px !important; 
        border-radius: 0 16px 16px 16px !important; 
        font-size: 12.5px !important; 
        max-width: 85% !important; 
        color: #334155 !important; 
        align-self: flex-start !important; 
        line-height: 1.45 !important;
        box-shadow: 0 2px 6px rgba(15,23,42,0.02) !important;
      }
      .na-msg-user { 
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important; 
        color: white !important; 
        padding: 12px 14px !important; 
        border-radius: 16px 0 16px 16px !important; 
        font-size: 12.5px !important; 
        max-width: 82% !important; 
        align-self: flex-end !important; 
        line-height: 1.45 !important;
        box-shadow: 0 4px 12px rgba(59,130,246,0.18) !important; 
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  private createLayers() {
    if (document.querySelector(".na-chat-box")) return;

    this.chatWidgetContainer = document.createElement("div");
    this.chatWidgetContainer.className = "na-chat-box";
    this.chatWidgetContainer.innerHTML = `
      <div class="na-chat-head">
        <span id="naChatTitle" style="font-weight:700; font-size:14px;">♿ Accessibility Copilot</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="naChatSettingsBtn" style="cursor:pointer;font-size:14px;opacity:.75;transition:opacity .2s;" title="Open Settings">⚙️</span>
          <span style="cursor:pointer; font-size:12px;" id="naCloseChat">✕</span>
        </div>
      </div>
      <div class="na-chat-body">
        <div class="na-msg-bot" id="naChatWelcomeContainer">
          <span id="naChatWelcomeText">👋 Welcome to Neuro Assist!<br>I'm your Accessibility Copilot. Tell me what accessibility difficulty you're facing, and I'll automatically configure the best accessibility settings for you.</span>
          <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;" id="naWelcomeQuickActions">
            <button class="na-quick-action-btn" id="naChatQaReadTextBtn" data-msg="I can't read the text" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 7px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; transition: all 0.15s; font-family: inherit;">👓 I can't read the text</button>
            <button class="na-quick-action-btn" id="naChatQaTypeBtn" data-msg="I can't type" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 7px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; transition: all 0.15s; font-family: inherit;">🎤 I can't type</button>
            <button class="na-quick-action-btn" id="naChatQaMouseBtn" data-msg="I have difficulty using the mouse" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 7px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; transition: all 0.15s; font-family: inherit;">🖱️ I have difficulty using the mouse</button>
          </div>
        </div>
      </div>
      <div class="na-chat-input-area">
        <input type="text" class="na-chat-input" placeholder="Type or ask anything...">
        <button id="naChatMicBtn" style="background:transparent; border:none; font-size:16px; cursor:pointer; padding:0 6px; display:flex; align-items:center; justify-content:center; outline:none;" title="Speak command">🎙️</button>
        <button class="na-chat-send" id="naChatSendBtn">Send</button>
      </div>
    `;
    document.body.appendChild(this.chatWidgetContainer);
    
    this.chatBody = this.chatWidgetContainer.querySelector(".na-chat-body");
    this.chatInput = this.chatWidgetContainer.querySelector(".na-chat-input");
  }

  private bindEvents() {
    if (!this.chatWidgetContainer) return;

    const closeBtn = this.chatWidgetContainer.querySelector("#naCloseChat");
    const sendBtn = this.chatWidgetContainer.querySelector("#naChatSendBtn");
    const micBtn = this.chatWidgetContainer.querySelector("#naChatMicBtn") as HTMLButtonElement | null;

    closeBtn?.addEventListener("click", () => {
      this.setVisible(false);
      const chatBtn = document.getElementById("btnChatMode");
      chatBtn?.classList.remove("active");
    });

    // ⚙️ Settings gear → ask background to open the extension popup
    const settingsBtn = this.chatWidgetContainer.querySelector("#naChatSettingsBtn") as HTMLElement | null;
    settingsBtn?.addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_POPUP" });
      } catch { /* non-extension context */ }
      this._showSettingsHint();
    });

    sendBtn?.addEventListener("click", () => this.sendMessage());

    this.chatWidgetContainer.querySelectorAll(".na-quick-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const msgText = btn.getAttribute("data-msg");
        if (msgText && this.chatInput) {
          this.chatInput.value = msgText;
          this.sendMessage();
        }
      });
    });
    
    this.chatInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.sendMessage();
      }
    });

    // Speech recognition inside chat input
    let isRecording = false;
    let recognitionInstance: any = null;

    micBtn?.addEventListener("click", () => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }

      if (isRecording && recognitionInstance) {
        recognitionInstance.stop();
        return;
      }

      try {
        recognitionInstance = new SR();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = "en-IN";

        recognitionInstance.onstart = () => {
          isRecording = true;
          micBtn.classList.add("recording");
          micBtn.title = "Listening... Tap to stop";
        };

        recognitionInstance.onresult = (e: any) => {
          let final = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              final += e.results[i][0].transcript;
            }
          }
          if (final && this.chatInput) {
            this.chatInput.value = final;
          }
        };

        recognitionInstance.onerror = () => {
          isRecording = false;
          micBtn.classList.remove("recording");
        };

        recognitionInstance.onend = () => {
          isRecording = false;
          micBtn.classList.remove("recording");
          micBtn.title = "Speak command";
          if (this.chatInput && this.chatInput.value.trim()) {
            this.sendMessage();
          }
        };

        recognitionInstance.start();
      } catch (err) {
        console.error("Speech recognition error:", err);
        isRecording = false;
        micBtn.classList.remove("recording");
      }
    });
  }

  private _showSettingsHint() {
    let hint = document.getElementById("na-popup-hint");
    if (hint) hint.remove();
    hint = document.createElement("div");
    hint.id = "na-popup-hint";
    Object.assign(hint.style, {
      position: "fixed", bottom: "110px", right: "20px",
      background: "#0f172a", color: "#fff",
      padding: "12px 16px", borderRadius: "12px",
      fontSize: "12px", fontWeight: "600",
      fontFamily: "system-ui,sans-serif", lineHeight: "1.5",
      zIndex: "2147483647", boxShadow: "0 8px 30px rgba(0,0,0,.3)",
      maxWidth: "220px", border: "1px solid rgba(255,255,255,.1)",
      cursor: "pointer",
    });
    hint.innerHTML = `<div style="font-size:14px;margin-bottom:4px;">⚙️ Open Neuroooo Settings</div><div style="color:#94a3b8;font-size:11px;">Click the <strong style="color:#fff;">🤖</strong> icon in your Chrome toolbar to open the Settings panel.</div><div style="margin-top:8px;font-size:10px;color:#64748b;">Tap to dismiss</div>`;
    hint.addEventListener("click", () => hint!.remove());
    document.body.appendChild(hint);
    setTimeout(() => hint!.remove(), 6000);
  }

  public setVisible(visible: boolean) {
    if (!this.chatWidgetContainer) return;
    if (visible) {
      this.chatWidgetContainer.classList.add("visible");
      this.chatInput?.focus();
    } else {
      this.chatWidgetContainer.classList.remove("visible");
    }
  }

  public isVisible(): boolean {
    return this.chatWidgetContainer?.classList.contains("visible") ?? false;
  }

  private async sendMessage() {
    if (!this.chatInput || !this.chatBody) return;
    const text = this.chatInput.value.trim();
    if (!text) return;

    this.appendMessage(text, "user");
    this.chatInput.value = "";

    const loadingEl = document.createElement("div");
    loadingEl.className = "na-msg-bot";
    loadingEl.innerText = getTranslation("chatThinking", this.currentLanguage);
    this.chatBody.appendChild(loadingEl);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;

    try {
      const contextText = document.body.innerText.substring(0, 500);
      const res = await fetch("http://localhost:8000/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: contextText })
      });
      const data = await res.json();
      loadingEl.remove();

      if (data.response) {
        this.appendMessage(data.response, "bot");
      }
      if (data.settings) {
        chrome.storage.local.set({ na_visual_popup_v3: JSON.stringify(data.settings) });
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "APPLY_CONFIG", config: data.settings });
        }
      }
    } catch {
      loadingEl.remove();
      this.appendMessage(getTranslation("chatFallbackResponse", this.currentLanguage), "bot");
    }
  }

  private appendMessage(text: string, sender: "user" | "bot") {
    if (!this.chatBody) return;
    const msgEl = document.createElement("div");
    msgEl.className = sender === "user" ? "na-msg-user" : "na-msg-bot";
    msgEl.innerText = text;
    this.chatBody.appendChild(msgEl);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;
  }

  private currentLanguage: string = "en";

  public setLanguage(lang: string) {
    this.currentLanguage = lang;
    if (!this.chatWidgetContainer) return;

    const selectEl = <T extends HTMLElement>(selStr: string) => this.chatWidgetContainer!.querySelector(selStr) as T | null;

    const chatTitle = selectEl<HTMLElement>("#naChatTitle");
    if (chatTitle) chatTitle.textContent = getTranslation("chatTitle", lang);

    const settingsBtn = selectEl<HTMLElement>("#naChatSettingsBtn");
    if (settingsBtn) settingsBtn.setAttribute("title", getTranslation("chatSettingsTitle", lang));

    const welcomeText = selectEl<HTMLElement>("#naChatWelcomeText");
    if (welcomeText) welcomeText.innerHTML = getTranslation("chatWelcomeMsg", lang);

    const qaReadBtn = selectEl<HTMLButtonElement>("#naChatQaReadTextBtn");
    if (qaReadBtn) {
      const txt = getTranslation("chatQaReadText", lang);
      qaReadBtn.textContent = txt;
      qaReadBtn.setAttribute("data-msg", txt);
    }

    const qaTypeBtn = selectEl<HTMLButtonElement>("#naChatQaTypeBtn");
    if (qaTypeBtn) {
      const txt = getTranslation("chatQaType", lang);
      qaTypeBtn.textContent = txt;
      qaTypeBtn.setAttribute("data-msg", txt);
    }

    const qaMouseBtn = selectEl<HTMLButtonElement>("#naChatQaMouseBtn");
    if (qaMouseBtn) {
      const txt = getTranslation("chatQaMouse", lang);
      qaMouseBtn.textContent = txt;
      qaMouseBtn.setAttribute("data-msg", txt);
    }

    const input = selectEl<HTMLInputElement>(".na-chat-input");
    if (input) input.placeholder = getTranslation("chatPlaceholder", lang);

    const sendBtn = selectEl<HTMLButtonElement>("#naChatSendBtn");
    if (sendBtn) sendBtn.textContent = getTranslation("chatSendBtn", lang);

    const micBtn = selectEl<HTMLButtonElement>("#naChatMicBtn");
    if (micBtn) {
      const isRec = micBtn.classList.contains("recording");
      micBtn.title = isRec ? getTranslation("chatMicTitleStop", lang) : getTranslation("chatMicTitleListen", lang);
    }
  }
}
