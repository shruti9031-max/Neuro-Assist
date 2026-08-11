import { NeuroVoiceEngine } from "./voiceEngine";
import { NeuroWebsiteSimplifier } from "./websiteSimplifier";
import { NeuroChatWidget } from "./chatWidget";
import { NeuroCopilotExecutor } from "./copilotExecutor";
import { AccessibilityAnalyzer } from "./accessibilityAnalyzer";
import { getTranslation } from "../utils/translations";

class NeuroAssistUltimateFrontend {
  private fabTrigger: HTMLDivElement | null = null;
  private topActionDock: HTMLDivElement | null = null;
  private backdropOverlay: HTMLDivElement | null = null;
  private isDockOpen: boolean = false;
  private voiceEngine: NeuroVoiceEngine;
  private websiteSimplifier: NeuroWebsiteSimplifier;
  private chatWidget!: NeuroChatWidget;
  private copilotExecutor: NeuroCopilotExecutor;
  private currentLanguage: string = "en";

  // --- DUMMY FUNCTIONS FOR TEAMMATES --- //
  public startGestureTracking(): void {
      console.log("Gesture tracking start triggered. Waiting for teammate's code.");
  }

  public stopGestureTracking(): void {
      console.log("Gesture tracking stop triggered. Waiting for teammate's code.");
  }

  // ... (iske neeche tumhara pehle wala baaki code waise hi rahega jaise constructor() wagarah) ...

  // Visual Comfort preferences state
  private isDyslexiaActive: boolean = false;
  private fontSizeScale: number = 100;
  private lineHeightScale: number = 15; // 1.5x
  private letterSpacingValue: number = 0;
  private contrastTheme: string = "none";
  private colorBlindFilter: string = "none";
  private contrastFactor: number = 100;

  // Gesture Recognition state properties
  private gestureStream: MediaStream | null = null;
  private gestureVideo: HTMLVideoElement | null = null;
  private gestureIntervalId: any = null;

  constructor() {
    this.voiceEngine = new NeuroVoiceEngine();
    this.websiteSimplifier = new NeuroWebsiteSimplifier();
    this.copilotExecutor = new NeuroCopilotExecutor();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  private init() {
    this.chatWidget = new NeuroChatWidget();
    this.injectAdvancedStyles();
    this.createLayers();
    this.injectSvgFilters();
    this.loadVisualPreferences();
    this.bindInteractionEvents();
    this.listenForPopupTriggers();
    this.makeDockDraggable();
    this.bindVoiceEngineActions();

    try {
      chrome.storage.local.get(["extensionLanguage"], (r) => {
        const lang = r.extensionLanguage || "en";
        this.applyLanguage(lang);
      });
    } catch { /* ignore */ }
  }

  private injectAdvancedStyles() {
    if (document.getElementById("na-ultimate-frontend-css")) return;
    const style = document.createElement("style");
    style.id = "na-ultimate-frontend-css";
    style.innerHTML = `
      @keyframes dropBounceEntrance {
        0% { transform: translateY(100px) scale(0.8); opacity: 0; }
        60% { transform: translateY(-10px) scale(1.05); opacity: 1; }
        100% { transform: translateY(0) scale(1); }
      }
      .na-master-fab {
        position: fixed !important; bottom: 35px !important; right: 35px !important;
        width: 64px !important; height: 64px !important;
        background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%) !important;
        color: #ffffff !important; border-radius: 50% !important; cursor: pointer !important;
        box-shadow: 0 12px 32px rgba(59, 130, 246, 0.35), inset 0 2px 4px rgba(255,255,255,0.2) !important;
        z-index: 2147483646 !important; display: flex !important; align-items: center !important;
        justify-content: center !important; font-size: 36px !important;
        border: 2px solid #ffffff !important;
        animation: dropBounceEntrance 0.8s cubic-bezier(0.25, 1.1, 0.4, 1) forwards !important;
        transition: all 0.25s ease !important;
      }
      .na-screen-blur {
        position: fixed !important; top: 0 !important; left: 0 !important;
        width: 100vw !important; height: 100vh !important;
        background: rgba(15, 23, 42, 0.15) !important;
        backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
        z-index: 2147483645 !important; display: none !important; opacity: 0 !important;
        transition: opacity 0.3s ease, backdrop-filter 0.25s ease, background 0.25s ease !important;
      }
      .na-screen-blur.visible { display: block !important; opacity: 1 !important; }
      .na-screen-blur.na-backdrop-clear {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        background: transparent !important;
      }
      .na-top-dock {
        position: fixed !important; top: -750px !important; left: 50% !important;
        transform: translateX(-50%) !important; width: 680px !important;
        background: rgba(255, 255, 255, 0.98) !important;
        backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important;
        border-radius: 0 0 28px 28px !important;
        box-shadow: 0 30px 60px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15,23,42,0.05) !important;
        z-index: 2147483647 !important; font-family: system-ui, -apple-system, sans-serif !important;
        padding: 24px !important; display: flex !important; flex-direction: column !important;
        gap: 18px !important; transition: top 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease !important;
      }
      .na-top-dock.na-dock-translucent {
        opacity: 0.22 !important;
      }
      .na-top-dock.open { top: 0 !important; }
      .na-mode-row { display: flex !important; gap: 12px !important; justify-content: space-between !important; }
      .na-mode-btn {
        flex: 1 !important; display: flex !important; align-items: center !important; justify-content: center !important;
        gap: 10px !important; padding: 14px 12px !important; background: #f8fafc !important;
        border: 1px solid #e2e8f0 !important; border-radius: 14px !important; font-size: 13px !important;
        font-weight: 700 !important; color: #334155 !important; cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      .na-mode-btn.active {
        background: #3b82f6 !important; color: #ffffff !important;
        border-color: #3b82f6 !important; box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25) !important;
      }
      .na-dock-workspace {
        display: none !important; background: #f8fafc !important;
        border: 1px solid #e2e8f0 !important; border-radius: 16px !important;
        padding: 18px !important;
        max-height: 420px !important;
        overflow-y: auto !important;
      }
      .na-dock-workspace.active { display: block !important; }
      .na-workspace-title { font-size: 12px !important; font-weight: 800 !important; color: #0f172a !important; text-transform: uppercase !important; margin-bottom: 14px !important; }
      .na-control-grid { display: grid !important; grid-template-columns: 1fr !important; gap: 12px !important; }
      .na-setting-row { display: flex !important; justify-content: space-between !important; align-items: center !important; background: #ffffff !important; padding: 12px 16px !important; border-radius: 12px !important; border: 1px solid #e2e8f0 !important; }
      .na-setting-info { display: flex !important; flex-direction: column !important; gap: 3px !important; }
      .na-setting-label { font-size: 13px !important; font-weight: 700 !important; color: #1e293b !important; }
      .na-setting-desc { font-size: 11px !important; color: #64748b !important; }
      .na-toggle-switch { position: relative !important; display: inline-block !important; width: 42px !important; height: 24px !important; }
      .na-toggle-switch input { opacity: 0; width: 0; height: 0; }
      .na-toggle-slider { position: absolute !important; cursor: pointer !important; top: 0; left: 0; right: 0; bottom: 0 !important; background-color: #cbd5e1 !important; border-radius: 24px !important; transition: 0.2s !important; }
      .na-toggle-slider:before { position: absolute !important; content: "" !important; height: 18px !important; width: 18px !important; left: 3px !important; bottom: 3px !important; background-color: white !important; border-radius: 50% !important; transition: 0.2s !important; }
      input:checked + .na-toggle-slider { background-color: #10b981 !important; }
      input:checked + .na-toggle-slider:before { transform: translateX(18px) !important; }
      .na-card-footer { display: flex !important; justify-content: space-between !important; align-items: center !important; margin-top: 6px !important; padding-top: 14px !important; border-top: 1px solid #f1f5f9 !important; }
      .na-passport-badge { display: flex !important; align-items: center !important; gap: 6px !important; font-size: 12px !important; font-weight: 600 !important; color: #3b82f6 !important; background: #eff6ff !important; padding: 6px 12px !important; border-radius: 20px !important; }
      .na-ai-simplifier-btn { background: #10b981 !important; color: white !important; border: none !important; padding: 10px 16px !important; font-size: 12px !important; font-weight: 800 !important; border-radius: 10px !important; cursor: pointer !important; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2) !important; transition: background 0.2s !important; }
      .na-ai-simplifier-btn.active-state { background: #ef4444 !important; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2) !important; }

      /* Smarter Dyslexia Mode & Text Scaling — applies ONLY to readable text content elements */
      body.na-dyslexia-active p,
      body.na-dyslexia-active article,
      body.na-dyslexia-active section p,
      body.na-dyslexia-active main p,
      body.na-dyslexia-active li,
      body.na-dyslexia-active label,
      body.na-dyslexia-active h1,
      body.na-dyslexia-active h2,
      body.na-dyslexia-active h3,
      body.na-dyslexia-active h4,
      body.na-dyslexia-active h5,
      body.na-dyslexia-active h6 {
        font-family: 'OpenDyslexic', 'Comic Sans MS', 'Comic Neue', sans-serif !important;
        line-height: 1.65 !important;
        letter-spacing: 0.04em !important;
        word-spacing: 0.08em !important;
      }

      /* Custom page text scaling variables — scoped to readable text elements using relative em/% units */
      body.na-text-customized p,
      body.na-text-customized article,
      body.na-text-customized section p,
      body.na-text-customized main p,
      body.na-text-customized li,
      body.na-text-customized label,
      body.na-text-customized h1,
      body.na-text-customized h2,
      body.na-text-customized h3,
      body.na-text-customized h4,
      body.na-text-customized h5,
      body.na-text-customized h6 {
        font-size: var(--na-font-size, 100%) !important;
        line-height: var(--na-line-height, 1.6) !important;
        letter-spacing: var(--na-letter-spacing, normal) !important;
      }

      /* Protect UI components (nav, header, buttons, inputs, icons, logos, sidebars, badges) from font scaling */
      body.na-text-customized nav *,
      body.na-text-customized header *,
      body.na-text-customized button,
      body.na-text-customized input,
      body.na-text-customized select,
      body.na-text-customized textarea,
      body.na-text-customized svg,
      body.na-text-customized .icon,
      body.na-text-customized .logo,
      body.na-text-customized .badge,
      body.na-text-customized .toolbar,
      body.na-text-customized [role="navigation"] * {
        font-size: initial !important;
        letter-spacing: normal !important;
      }

      /* Contrast Themes */
      body.na-theme-hc-dark *:not(.na-top-dock *):not(.na-chat-box *):not(.na-master-fab *):not(.na-coach-card *) {
        background-color: #000000 !important;
        color: #ffff00 !important;
        border-color: #ffff00 !important;
      }
      body.na-theme-hc-light *:not(.na-top-dock *):not(.na-chat-box *):not(.na-master-fab *):not(.na-coach-card *) {
        background-color: #ffffff !important;
        color: #000000 !important;
        border-color: #000000 !important;
      }
      body.na-theme-monochrome {
        filter: grayscale(100%) !important;
      }

      /* Preview box typography styles */
      body.na-dyslexia-active #naLivePreviewBox,
      body.na-dyslexia-active #naLivePreviewBox * {
        font-family: system-ui, -apple-system, sans-serif !important;
      }
      body.na-text-customized #naLivePreviewBox,
      body.na-text-customized #naLivePreviewBox * {
        font-size: var(--na-font-size, inherit) !important;
        line-height: var(--na-line-height, inherit) !important;
        letter-spacing: var(--na-letter-spacing, inherit) !important;
      }
      body.na-theme-hc-dark #naLivePreviewBox,
      body.na-theme-hc-dark #naLivePreviewBox * {
        background-color: #000000 !important;
        color: #ffff00 !important;
        border-color: #ffff00 !important;
      }
      body.na-theme-hc-light #naLivePreviewBox,
      body.na-theme-hc-light #naLivePreviewBox * {
        background-color: #ffffff !important;
        color: #000000 !important;
        border-color: #000000 !important;
      }

      /* Voice Redesign UX Styles */
      .na-voice-container {
        display: flex !important;
        flex-direction: column !important;
        gap: 16px !important;
        width: 100% !important;
        font-family: system-ui, -apple-system, sans-serif !important;
      }
      .na-mic-status-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 6px 12px !important;
        border-radius: 20px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        align-self: flex-start !important;
      }
      .na-mic-ready {
        background: #e6f4ea !important;
        color: #137333 !important;
        border: 1px solid #ceead6 !important;
      }
      .na-mic-missing {
        background: #fce8e6 !important;
        color: #c5221f !important;
        border: 1px solid #fad2cf !important;
      }
      .na-mic-status-dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
      }
      .na-mic-ready .na-mic-status-dot {
        background: #137333 !important;
      }
      .na-mic-missing .na-mic-status-dot {
        background: #c5221f !important;
      }
      .na-voice-button-container {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 10px 0 !important;
        position: relative !important;
      }
      .na-mic-pulse-btn {
        width: 76px !important;
        height: 76px !important;
        border-radius: 50% !important;
        border: none !important;
        background: linear-gradient(135deg, #3b82f6 0%, #10b981 100%) !important;
        color: white !important;
        font-size: 30px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 10px 25px rgba(59, 130, 246, 0.4) !important;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        position: relative !important;
        z-index: 2 !important;
        outline: none !important;
      }
      .na-mic-pulse-btn:hover {
        transform: scale(1.05) !important;
        box-shadow: 0 12px 30px rgba(59, 130, 246, 0.5) !important;
      }
      .na-mic-pulse-btn:active {
        transform: scale(0.95) !important;
      }
      .na-mic-pulse-btn.listening {
        background: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%) !important;
        box-shadow: 0 10px 25px rgba(239, 68, 68, 0.4) !important;
        animation: na-mic-breath 1.6s infinite ease-in-out !important;
      }
      @keyframes na-mic-breath {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
        50% { transform: scale(1.06); box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
      .na-voice-visualizer {
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        height: 24px !important;
        margin-top: 12px !important;
      }
      .na-voice-visualizer.active {
        display: flex !important;
      }
      .na-bar {
        width: 3px !important;
        height: 8px !important;
        background-color: #ef4444 !important;
        border-radius: 3px !important;
        animation: bounce 1.2s infinite ease-in-out !important;
      }
      .na-bar:nth-child(2) { animation-delay: 0.15s !important; height: 16px !important; }
      .na-bar:nth-child(3) { animation-delay: 0.3s !important; height: 20px !important; }
      .na-bar:nth-child(4) { animation-delay: 0.45s !important; height: 14px !important; }
      .na-bar:nth-child(5) { animation-delay: 0.6s !important; height: 8px !important; }
      @keyframes bounce {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(2.2); }
      }
      .na-voice-transcript-box {
        background: #f8fafc !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        padding: 12px 16px !important;
        min-height: 48px !important;
        font-size: 13px !important;
        color: #64748b !important;
        text-align: center !important;
        font-style: italic !important;
        line-height: 1.5 !important;
      }
      .na-voice-transcript-box.has-text {
        font-style: normal !important;
        font-weight: 600 !important;
        color: #0f172a !important;
        border-color: #3b82f6 !important;
        background: #eff6ff !important;
      }
      .na-voice-steps {
        display: flex !important;
        justify-content: space-between !important;
        position: relative !important;
        margin-top: 8px !important;
        padding: 0 10px !important;
      }
      .na-voice-steps::before {
        content: "" !important;
        position: absolute !important;
        top: 8px !important;
        left: 30px !important;
        right: 30px !important;
        height: 2px !important;
        background: #cbd5e1 !important;
        z-index: 1 !important;
      }
      .na-voice-step {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 6px !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        color: #64748b !important;
        position: relative !important;
        z-index: 2 !important;
        min-width: 60px !important;
      }
      .na-voice-step-dot {
        width: 18px !important;
        height: 18px !important;
        border-radius: 50% !important;
        background: #ffffff !important;
        border: 2px solid #cbd5e1 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 9px !important;
        color: #cbd5e1 !important;
        transition: all 0.3s !important;
      }
      .na-voice-step.active {
        color: #3b82f6 !important;
      }
      .na-voice-step.active .na-voice-step-dot {
        border-color: #3b82f6 !important;
        background: #3b82f6 !important;
        color: white !important;
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2) !important;
      }
      .na-voice-step.completed {
        color: #10b981 !important;
      }
      .na-voice-step.completed .na-voice-step-dot {
        border-color: #10b981 !important;
        background: #10b981 !important;
        color: white !important;
      }
      .na-voice-card-missing {
        background: #fff5f5 !important;
        border: 1px dashed #feb2b2 !important;
        border-radius: 16px !important;
        padding: 20px !important;
        text-align: center !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 12px !important;
      }
      .na-voice-card-missing-title {
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #c53030 !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }
      .na-voice-card-missing-desc {
        font-size: 12px !important;
        color: #742a2a !important;
        line-height: 1.5 !important;
        margin: 0 !important;
      }
      .na-voice-card-btn-row {
        display: flex !important;
        gap: 8px !important;
        width: 100% !important;
        margin-top: 4px !important;
      }
      .na-voice-card-btn {
        flex: 1 !important;
        padding: 8px 12px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        border-radius: 8px !important;
        border: none !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        text-align: center !important;
      }
      .na-voice-card-btn.retry {
        background: #c53030 !important;
        color: white !important;
      }
      .na-voice-card-btn.settings {
        background: white !important;
        color: #4a5568 !important;
        border: 1px solid #cbd5e0 !important;
      }
      .na-voice-card-btn.simulate {
        background: #edf2f7 !important;
        color: #2d3748 !important;
      }
      .na-voice-card-btn:hover {
        transform: translateY(-1px) !important;
      }
      .na-voice-card-btn:active {
        transform: translateY(0) !important;
      }
      .na-voice-dev-toggle {
        margin-top: 8px !important;
        background: none !important;
        border: none !important;
        color: #64748b !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        padding: 4px 0 !important;
        align-self: flex-start !important;
        outline: none !important;
      }
      .na-voice-dev-toggle:hover {
        color: #334155 !important;
      }
      .na-voice-dev-panel {
        display: none;
        background: #f8fafc !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 12px !important;
        padding: 12px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .na-voice-dev-panel.open {
        display: block !important;
      }
      .na-dock-workspace::-webkit-scrollbar {
        width: 6px !important;
      }
      .na-dock-workspace::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .na-dock-workspace::-webkit-scrollbar-thumb {
        background: #cbd5e1 !important;
        border-radius: 4px !important;
      }
      .na-dock-workspace::-webkit-scrollbar-thumb:hover {
        background: #94a3b8 !important;
      }
      @keyframes na-autofill-pulse {
        0% { outline: 3px solid rgba(59, 130, 246, 0.9) !important; box-shadow: 0 0 10px rgba(59, 130, 246, 0.7) !important; }
        50% { outline: 3px solid rgba(16, 185, 129, 0.9) !important; box-shadow: 0 0 14px rgba(16, 185, 129, 0.7) !important; }
        100% { outline: 0px solid transparent !important; box-shadow: none !important; }
      }
      .na-autofilled-flash {
        animation: na-autofill-pulse 2.2s ease-out !important;
      }
    `;
    document.head.appendChild(style);
  }

  private createLayers() {
    // Clean up any existing duplicate elements from previous injections
    document.querySelectorAll(".na-screen-blur, .na-master-fab, .na-top-dock").forEach(el => el.remove());

    this.backdropOverlay = document.createElement("div");
    this.backdropOverlay.className = "na-screen-blur";
    document.body.appendChild(this.backdropOverlay);

    this.fabTrigger = document.createElement("div");
    this.fabTrigger.className = "na-master-fab";
    this.fabTrigger.innerHTML = "🧠";
    document.body.appendChild(this.fabTrigger);

    this.topActionDock = document.createElement("div");
    this.topActionDock.className = "na-top-dock";
    this.topActionDock.innerHTML = `
      <div class="na-mode-row">
        <button class="na-mode-btn" id="btnSignMode">✋ Gestures & Sign</button>
        <button class="na-mode-btn" id="btnVoiceMode">🎙️ Voice Engine</button>
        <button class="na-mode-btn" id="btnVisualMode">🎨 Visual Comfort & Dyslexia</button>
        <button class="na-mode-btn" id="btnAutomationMode">🤖 Copilot Task Fill</button>
        <button class="na-mode-btn" id="btnChatMode">💬 Assistant Chat</button>
      </div>

      <div class="na-dock-workspace" id="spaceSignMode">
        <div class="na-workspace-title" id="naSignWorkspaceTitle">✋ Local Edge Sign Translator & Tracking Parameters</div>
        <div style="display: flex !important; gap: 14px !important; align-items: flex-start !important;">
          <!-- Camera Feed container -->
          <div style="flex: 1 !important; border: 1px solid #cbd5e1 !important; border-radius: 12px !important; overflow: hidden !important; background: #000000 !important; height: 180px !important; display: flex !important; align-items: center !important; justify-content: center !important; position: relative !important;">
            <video id="naGestureVideo" autoplay playsinline style="width: 100% !important; height: 100% !important; object-fit: cover !important; transform: scaleX(-1) !important;"></video>
            <div id="naGestureStatusOverlay" style="position: absolute !important; top: 10px !important; left: 10px !important; background: rgba(15, 23, 42, 0.75) !important; color: white !important; font-size: 10px !important; font-weight: bold !important; padding: 4px 8px !important; border-radius: 6px !important; font-family: monospace !important; border: 1px solid rgba(255,255,255,0.15) !important;">CAMERA INACTIVE</div>
          </div>
          <!-- Settings / Detected action card -->
          <div style="flex: 1 !important; display: flex !important; flex-direction: column !important; gap: 10px !important;">
            <div style="background: white !important; border: 1px solid #e2e8f0 !important; padding: 12px !important; border-radius: 12px !important; display: flex !important; flex-direction: column !important; gap: 4px !important;">
              <span id="naGestureStatusLabel" style="font-size: 11px !important; font-weight: 700 !important; color: #64748b !important; text-transform: uppercase !important;">Gesture Status</span>
              <span id="naGestureActionBadge" style="font-size: 16px !important; font-weight: 800 !important; color: #3b82f6 !important;">None</span>
            </div>
            <div style="background: white !important; border: 1px solid #e2e8f0 !important; padding: 12px !important; border-radius: 12px !important;">
              <div style="display: flex !important; justify-content: space-between !important; align-items: center !important;">
                <div class="na-setting-info" style="max-width: 75% !important;">
                  <span class="na-setting-label" id="naGestureDomLabel" style="font-size: 11px !important; font-weight: bold !important;">Active DOM Actions</span>
                  <span class="na-setting-desc" id="naGestureDomDesc" style="font-size: 9px !important; color: #64748b !important;">Allows hand signs to trigger SCROLL and CLICK commands.</span>
                </div>
                <label class="na-toggle-switch" style="transform: scale(0.75) !important;"><input type="checkbox" id="naGestureEnableToggle" checked><span class="na-toggle-slider"></span></label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="na-dock-workspace" id="spaceVoiceMode">
        <div class="na-workspace-title" id="naVoiceWorkspaceTitle" style="margin-bottom: 12px !important;">🎙️ Multilingual Vocal Navigation</div>
        <div class="na-voice-container">
          
          <!-- View A: Microphone Connected (Active by default, but hidden if no mic is found) -->
          <div id="naVoiceActiveView" style="display: flex !important; flex-direction: column !important; gap: 14px !important;">
            <div class="na-mic-status-badge na-mic-ready" id="naVoiceMicBadge">
              <span class="na-mic-status-dot"></span>
              Microphone Ready
            </div>
            
            <div class="na-voice-button-container">
              <button class="na-mic-pulse-btn" id="naVoiceStartBtn" title="Start Listening">🎙️</button>
              
              <!-- Listening indicator wave anim -->
              <div class="na-voice-visualizer" id="naVoiceVisualizer">
                <span class="na-bar"></span>
                <span class="na-bar"></span>
                <span class="na-bar"></span>
                <span class="na-bar"></span>
                <span class="na-bar"></span>
              </div>
            </div>

            <!-- Execution Status Bar -->
            <div class="na-voice-steps">
              <div class="na-voice-step active" id="naVoiceStepListening">
                <span class="na-voice-step-dot">1</span>
                <span id="naVoiceStepListeningLabel">Listening</span>
              </div>
              <div class="na-voice-step" id="naVoiceStepProcessing">
                <span class="na-voice-step-dot">2</span>
                <span id="naVoiceStepProcessingLabel">Processing</span>
              </div>
              <div class="na-voice-step" id="naVoiceStepExecuted">
                <span class="na-voice-step-dot">3</span>
                <span id="naVoiceStepExecutedLabel">Executed</span>
              </div>
            </div>

            <!-- Live speech transcript container -->
            <div class="na-voice-transcript-box" id="naVoiceTranscript">
              Say a command (e.g. "scroll down", "go back")...
            </div>
          </div>

          <!-- View B: Microphone Missing (Hidden by default, shown if no mic) -->
          <div id="naVoiceMissingView" style="display: none !important;">
            <div class="na-voice-card-missing">
              <div class="na-voice-card-missing-title" id="naVoiceNoMicTitle">⚠️ Microphone Not Detected</div>
              <p class="na-voice-card-missing-desc" id="naVoiceNoMicDesc">
                We couldn't detect any audio input hardware. Please plug in a microphone, check your system privacy settings, or use the developer text simulator below.
              </p>
              <div class="na-voice-card-btn-row">
                <button class="na-voice-card-btn retry" id="naVoiceBtnRetry">🔄 Retry Check</button>
                <button class="na-voice-card-btn settings" id="naVoiceBtnSettings">⚙️ Open Settings</button>
                <button class="na-voice-card-btn simulate" id="naVoiceBtnSimulateBypass">⌨️ Text Simulator</button>
              </div>
            </div>
          </div>

          <!-- Collapsible Developer Testing Section -->
          <div style="border-top: 1px solid #e2e8f0 !important; padding-top: 8px !important; display: flex !important; flex-direction: column !important;">
            <button class="na-voice-dev-toggle" id="naVoiceDevToggle">
              <span id="naVoiceDevArrow">▶</span> Developer Simulator Tools
            </button>
            <div class="na-voice-dev-panel" id="naVoiceDevPanel">
              <div style="display: flex !important; gap: 8px !important; align-items: center !important;">
                <input type="text" id="naVoiceSimInput" placeholder="Type a simulated voice command..." style="flex: 1 !important; padding: 6px 12px !important; border: 1px solid #cbd5e1 !important; border-radius: 8px !important; font-size: 11px !important; outline: none !important; color: #0f172a !important; background: #ffffff !important;">
                <button id="naVoiceSimBtn" style="background: #3b82f6 !important; color: white !important; border: none !important; padding: 6px 14px !important; border-radius: 8px !important; font-size: 11px !important; font-weight: bold !important; cursor: pointer !important;">Send</button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div class="na-dock-workspace" id="spaceVisualMode">
        <div class="na-workspace-title" id="naVisualWorkspaceTitle">🎨 AI Cognitive Refinement & Layout Customizer</div>
        <div class="na-control-grid" style="gap: 8px !important;">
          
          <!-- Simplifier & Dyslexia Checkboxes side-by-side -->
          <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important;">
            <div style="display: flex !important; align-items: center !important; justify-content: space-between !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px 10px !important; border-radius: 10px !important;">
              <span id="naSimplifierLabel" style="font-size: 11px !important; font-weight: 700 !important; color: #334155 !important;">AI Website Simplifier</span>
              <label class="na-toggle-switch" style="transform: scale(0.8) !important;"><input type="checkbox" id="naAiSimplifierCheckbox"><span class="na-toggle-slider"></span></label>
            </div>
            
            <div style="display: flex !important; align-items: center !important; justify-content: space-between !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px 10px !important; border-radius: 10px !important;">
              <span id="naDyslexiaLabel" style="font-size: 11px !important; font-weight: 700 !important; color: #334155 !important;">Dyslexia Font</span>
              <label class="na-toggle-switch" style="transform: scale(0.8) !important;"><input type="checkbox" id="naDyslexiaCheckbox"><span class="na-toggle-slider"></span></label>
            </div>
          </div>

          <!-- Typography button groups side-by-side -->
          <div style="display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 8px !important;">
            <!-- Font Size Button Group -->
            <div style="display: flex !important; flex-direction: column !important; align-items: center !important; gap: 4px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px !important; border-radius: 10px !important;">
              <span id="naFontSizeLabel" style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important; text-transform: uppercase !important;">Font Size</span>
              <div style="display: flex !important; align-items: center !important; gap: 6px !important;">
                <button id="btnFontSizeDec" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">-</button>
                <span id="lblFontSize" style="font-size: 11px !important; font-weight: 800 !important; color: #3b82f6 !important; min-width: 32px !important; text-align: center !important;">100%</span>
                <button id="btnFontSizeInc" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">+</button>
              </div>
            </div>

            <!-- Line Height Button Group -->
            <div style="display: flex !important; flex-direction: column !important; align-items: center !important; gap: 4px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px !important; border-radius: 10px !important;">
              <span id="naLineSpacingLabel" style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important; text-transform: uppercase !important;">Line Spacing</span>
              <div style="display: flex !important; align-items: center !important; gap: 6px !important;">
                <button id="btnLineHeightDec" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">-</button>
                <span id="lblLineHeight" style="font-size: 11px !important; font-weight: 800 !important; color: #3b82f6 !important; min-width: 28px !important; text-align: center !important;">1.5x</span>
                <button id="btnLineHeightInc" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">+</button>
              </div>
            </div>

            <!-- Letter Spacing Button Group -->
            <div style="display: flex !important; flex-direction: column !important; align-items: center !important; gap: 4px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px !important; border-radius: 10px !important;">
              <span id="naLetterSpacingLabel" style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important; text-transform: uppercase !important;">Letter Spacing</span>
              <div style="display: flex !important; align-items: center !important; gap: 6px !important;">
                <button id="btnLetterSpacingDec" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">-</button>
                <span id="lblLetterSpacing" style="font-size: 11px !important; font-weight: 800 !important; color: #3b82f6 !important; min-width: 28px !important; text-align: center !important;">0px</span>
                <button id="btnLetterSpacingInc" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">+</button>
              </div>
            </div>
          </div>

          <!-- Color settings & Contrast button group side-by-side -->
          <div style="display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 8px !important;">
            <!-- Contrast Theme -->
            <div style="display: flex !important; flex-direction: column !important; gap: 4px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px !important; border-radius: 10px !important;">
              <span id="naThemeLabel" style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important; text-transform: uppercase !important;">Contrast Theme</span>
              <select id="naContrastThemeSelect" style="padding: 2px 4px !important; font-size: 10px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; background: white !important; outline: none !important; width: 100% !important; color: #334155 !important;">
                <option value="none">Default</option>
                <option value="hc-dark">HC Dark</option>
                <option value="hc-light">HC Light</option>
                <option value="monochrome">Grayscale</option>
              </select>
            </div>

            <!-- Color Blindness -->
            <div style="display: flex !important; flex-direction: column !important; gap: 4px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px !important; border-radius: 10px !important;">
              <span id="naColorBlindLabel" style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important; text-transform: uppercase !important;">Color-Blind</span>
              <select id="naColorBlindSelect" style="padding: 2px 4px !important; font-size: 10px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; background: white !important; outline: none !important; width: 100% !important; color: #334155 !important;">
                <option value="none">None</option>
                <option value="protanopia">Protanopia</option>
                <option value="deuteranopia">Deuteranopia</option>
                <option value="tritanopia">Tritanopia</option>
              </select>
            </div>

            <!-- Contrast Factor -->
            <div style="display: flex !important; flex-direction: column !important; align-items: center !important; gap: 4px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 6px !important; border-radius: 10px !important;">
              <span id="naContrastLabel" style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important; text-transform: uppercase !important;">Contrast Level</span>
              <div style="display: flex !important; align-items: center !important; gap: 6px !important;">
                <button id="btnContrastDec" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">-</button>
                <span id="lblContrast" style="font-size: 11px !important; font-weight: 800 !important; color: #3b82f6 !important; min-width: 32px !important; text-align: center !important;">100%</span>
                <button id="btnContrastInc" style="width: 22px !important; height: 22px !important; border-radius: 6px !important; border: 1px solid #cbd5e1 !important; background: #f1f5f9 !important; font-weight: bold !important; cursor: pointer !important; padding: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 14px !important;">+</button>
              </div>
            </div>
          </div>

          <!-- Compact Preview Box -->
          <div id="naLivePreviewBox" class="na-preview-content" style="padding: 8px 12px !important; background: #eff6ff !important; border: 1px dashed #bfdbfe !important; border-radius: 10px !important; max-height: 48px !important; overflow-y: auto !important; transition: all 0.2s !important; text-align: center !important;">
            <p style="margin: 0 !important; font-size: 11px !important; line-height: 1.4 !important; color: #1e3a8a !important; transition: inherit !important;" id="naLivePreviewText">
              Real-time Preview: Spacing, font scale, contrast and visual theme apply here instantly.
            </p>
          </div>

        </div>
      </div>

      <div class="na-dock-workspace" id="spaceAutomationMode">
        <div class="na-workspace-title" id="naAutomationWorkspaceTitle">🤖 AI Autonomous Copilot & Profile Memory</div>
        <div class="na-voice-container" style="gap: 14px !important;">
          
          <div style="display: flex !important; flex-direction: column !important; gap: 8px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 12px !important; border-radius: 12px !important;">
            <div id="naCopilotTitle" style="font-size: 12px !important; font-weight: 800 !important; color: #1e293b !important; text-transform: uppercase !important; letter-spacing: 0.05em !important;">✨ Form Autofill & Navigation Agent</div>
            <span style="font-size: 11px !important; color: #64748b !important; line-height: 1.4 !important;" id="naCopilotDesc">
              Scans all fields across E-commerce, Jobs, Login, and Checkout pages, generating predictions mapped against your Profile Memory with permission approval overlay.
            </span>
            
            <div style="display: flex !important; flex-direction: column !important; gap: 4px !important; margin-bottom: 4px !important;">
              <span style="font-size: 10px !important; font-weight: 700 !important; color: #475569 !important;" id="naCopilotGoalLabel">Goal Instruction / Custom Prompt:</span>
              <input type="text" id="naCopilotPrompt" placeholder="e.g. Autofill job application, or search mouse and add to cart..." style="width: 100% !important; padding: 8px 12px !important; border: 1px solid #cbd5e1 !important; border-radius: 8px !important; font-size: 11px !important; outline: none !important; color: #0f172a !important; background: #ffffff !important;">
            </div>

            <div style="display: flex !important; gap: 8px !important;">
              <button class="na-ai-simplifier-btn" id="naBtnTriggerCopilot" style="flex: 1 !important; border-radius: 8px !important; font-size: 12px !important; padding: 10px 14px !important; font-weight: 800 !important; background: #3b82f6 !important;">✨ Scan & Fill Form</button>
              <button class="na-ai-simplifier-btn" id="naBtnTriggerAutonomousNav" style="flex: 1 !important; border-radius: 8px !important; font-size: 12px !important; padding: 10px 14px !important; font-weight: 800 !important; background: #10b981 !important;">🚀 Execute Goal Action</button>
            </div>
          </div>

          <!-- User Profile Memory Quick Editor -->
          <div style="display: flex !important; flex-direction: column !important; gap: 8px !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; padding: 12px !important; border-radius: 12px !important;">
            <div style="font-size: 11px !important; font-weight: 800 !important; color: #0f172a !important; text-transform: uppercase !important;" id="naCopilotProfileTitle">👤 Saved Profile Memory</div>
            <div style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 6px !important;">
              <input type="text" id="naProfName" placeholder="Full Name" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfEmail" placeholder="Email Address" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfPhone" placeholder="Phone Number" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfDob" placeholder="Date of Birth (YYYY-MM-DD)" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfAddress" placeholder="Address" style="grid-column: span 2 !important; padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfCity" placeholder="City" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfState" placeholder="State" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfCountry" placeholder="Country" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfPostalCode" placeholder="Postal Code" style="padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
              <input type="text" id="naProfGender" placeholder="Gender (optional)" style="grid-column: span 2 !important; padding: 5px 8px !important; font-size: 11px !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important;">
            </div>
            <div style="display: flex !important; gap: 6px !important;">
              <button id="naSaveProfileBtn" style="flex: 1 !important; background: #0f172a !important; color: white !important; border: none !important; padding: 6px 12px !important; border-radius: 6px !important; font-size: 11px !important; font-weight: bold !important; cursor: pointer !important;">💾 Save Profile Memory</button>
              <button id="naResetProfileBtn" style="flex: 1 !important; background: #f1f5f9 !important; color: #334155 !important; border: 1px solid #cbd5e1 !important; padding: 6px 12px !important; border-radius: 6px !important; font-size: 11px !important; font-weight: bold !important; cursor: pointer !important;">↺ Reset</button>
              <button id="naDeleteProfileBtn" style="flex: 1 !important; background: #fee2e2 !important; color: #991b1b !important; border: 1px solid #fecaca !important; padding: 6px 12px !important; border-radius: 6px !important; font-size: 11px !important; font-weight: bold !important; cursor: pointer !important;">🗑 Delete</button>
            </div>
          </div>

          <!-- Autofill Status Display -->
          <div id="naCopilotStatusBox" style="padding: 10px 14px !important; background: #f8fafc !important; border: 1px solid #e2e8f0 !important; border-radius: 12px !important; display: none; align-items: center !important; gap: 10px !important; font-size: 11px !important; color: #334155 !important;">
            <span style="display: inline-block; width: 8px; height: 8px; background-color: #3b82f6; border-radius: 50%;" id="naCopilotStatusDot"></span>
            <span id="naCopilotStatusText" style="font-weight: 600 !important;">Scanner idle...</span>
          </div>

        </div>
      </div>

      <div class="na-card-footer">
        <div class="na-passport-badge" id="naPassportBadge">🛡️ Global Accessibility Passport: Active</div>
        <button class="na-ai-simplifier-btn" id="naAiSimplifierTriggerBtn" data-active="false">✨ AI WEBSITE SIMPLIFIER</button>
      </div>
    `;
    // document.body.appendChild(this.topActionDock);

    const simplifierBtn = document.getElementById("naAiSimplifierTriggerBtn") as HTMLButtonElement | null;
    const simplifierCheckbox = document.getElementById("naAiSimplifierCheckbox") as HTMLInputElement | null;
    if (simplifierBtn) {
      this.websiteSimplifier.setTriggerButton(simplifierBtn);
    }
    if (simplifierCheckbox) {
      this.websiteSimplifier.setCheckbox(simplifierCheckbox);
    }
  }

  private bindInteractionEvents() {
    this.fabTrigger?.addEventListener("click", () => {
      this.chatWidget.setVisible(!this.chatWidget.isVisible());
    });
    this.backdropOverlay?.addEventListener("click", () => {
      this.chatWidget.setVisible(false);
      this.backdropOverlay?.classList.remove("visible");
    });

    document.addEventListener("neuro-apply-gesture-eye-tracking", (evt: any) => {
      const enabled = evt.detail?.enabled === true;
      this.toggleWebcamTracking(enabled);
    });

    document.addEventListener("neuro-apply-settings", (evt: any) => {
      const settings = evt.detail;
      if (!settings) return;
      
      if (settings.dyslexia !== undefined && settings.dyslexia !== null) {
        this.isDyslexiaActive = settings.dyslexia;
        this.saveSetting("na_dyslexia_active", this.isDyslexiaActive);
      }
      if (settings.fontSize !== undefined && settings.fontSize !== null) {
        this.fontSizeScale = settings.fontSize;
        this.saveSetting("na_font_size_scale", this.fontSizeScale);
      }
      if (settings.lineHeight !== undefined && settings.lineHeight !== null) {
        this.lineHeightScale = settings.lineHeight;
        this.saveSetting("na_line_height_scale", this.lineHeightScale);
      }
      if (settings.letterSpacing !== undefined && settings.letterSpacing !== null) {
        this.letterSpacingValue = settings.letterSpacing;
        this.saveSetting("na_letter_spacing_value", this.letterSpacingValue);
      }
      if (settings.contrastTheme !== undefined && settings.contrastTheme !== null) {
        this.contrastTheme = settings.contrastTheme;
        this.saveSetting("na_contrast_theme", this.contrastTheme);
      }
      if (settings.colorBlindFilter !== undefined && settings.colorBlindFilter !== null) {
        this.colorBlindFilter = settings.colorBlindFilter;
        this.saveSetting("na_color_blind_filter", this.colorBlindFilter);
      }
      if (settings.contrastFactor !== undefined && settings.contrastFactor !== null) {
        this.contrastFactor = settings.contrastFactor;
        this.saveSetting("na_contrast_factor", this.contrastFactor);
      }
      
      this.applyVisualAdjustments();
      this.syncSettingsUI();
      
      if (settings.simplifyWebsite !== undefined && settings.simplifyWebsite !== null) {
        if (this.websiteSimplifier.isActive() !== settings.simplifyWebsite) {
          this.websiteSimplifier.toggle();
        }
      }
      
      try {
        const vs = {
          dyslexia: this.isDyslexiaActive,
          simplifier: this.websiteSimplifier.isActive(),
          fontSize: this.fontSizeScale,
          lineHeight: this.lineHeightScale,
          letterSpacing: this.letterSpacingValue,
          theme: this.contrastTheme,
          colorBlind: this.colorBlindFilter,
          contrast: this.contrastFactor
        };
        chrome.storage.local.set({ "na_visual_popup_v3": JSON.stringify(vs) });
      } catch (e) { /* ignore */ }
    });

    // Listen for custom voice & chat copilot trigger events
    document.addEventListener("neuro-copilot-trigger", (evt: any) => {
      const detail = evt.detail || {};
      if (detail.type === "navigate") {
        this.copilotExecutor.executeAutonomousGoal(detail.instruction || detail.prompt || "");
      } else {
        this.copilotExecutor.executeAutofillWorkflow(detail.prompt || "");
      }
    });

    // Profile memory binding
    const profNameInp = document.getElementById("naProfName") as HTMLInputElement | null;
    const profEmailInp = document.getElementById("naProfEmail") as HTMLInputElement | null;
    const profPhoneInp = document.getElementById("naProfPhone") as HTMLInputElement | null;
    const profDobInp = document.getElementById("naProfDob") as HTMLInputElement | null;
    const profAddressInp = document.getElementById("naProfAddress") as HTMLInputElement | null;
    const profCityInp = document.getElementById("naProfCity") as HTMLInputElement | null;
    const profStateInp = document.getElementById("naProfState") as HTMLInputElement | null;
    const profCountryInp = document.getElementById("naProfCountry") as HTMLInputElement | null;
    const profPostalCodeInp = document.getElementById("naProfPostalCode") as HTMLInputElement | null;
    const profGenderInp = document.getElementById("naProfGender") as HTMLInputElement | null;
    const saveProfBtn = document.getElementById("naSaveProfileBtn") as HTMLButtonElement | null;
    const resetProfBtn = document.getElementById("naResetProfileBtn") as HTMLButtonElement | null;
    const deleteProfBtn = document.getElementById("naDeleteProfileBtn") as HTMLButtonElement | null;

    // Load profile memory into UI fields
    const loadProfileUi = async () => {
      const prof = await this.copilotExecutor.profileManager.loadProfile();
      if (profNameInp) profNameInp.value = prof.name || "";
      if (profEmailInp) profEmailInp.value = prof.email || "";
      if (profPhoneInp) profPhoneInp.value = prof.phone || "";
      if (profDobInp) profDobInp.value = prof.dob || "";
      if (profAddressInp) profAddressInp.value = prof.address || "";
      if (profCityInp) profCityInp.value = prof.city || "";
      if (profStateInp) profStateInp.value = prof.state || "";
      if (profCountryInp) profCountryInp.value = prof.country || "";
      if (profPostalCodeInp) profPostalCodeInp.value = prof.postalCode || prof.pinCode || "";
      if (profGenderInp) profGenderInp.value = prof.gender || "";
    };
    loadProfileUi();

    if (saveProfBtn) {
      saveProfBtn.addEventListener("click", async () => {
        const updated = {
          name: profNameInp?.value || "Alex Morgan",
          fullName: profNameInp?.value || "Alex Morgan",
          email: profEmailInp?.value || "alex.morgan@example.com",
          phone: profPhoneInp?.value || "+1-555-019-2834",
          dob: profDobInp?.value || "1995-08-15",
          address: profAddressInp?.value || "742 Evergreen Terrace",
          city: profCityInp?.value || "Springfield",
          state: profStateInp?.value || "IL",
          country: profCountryInp?.value || "United States",
          pinCode: profPostalCodeInp?.value || "62704",
          postalCode: profPostalCodeInp?.value || "62704",
          gender: profGenderInp?.value || "",
        };
        await this.copilotExecutor.profileManager.updateProfile(updated);
        saveProfBtn.innerText = "✓ Saved!";
        setTimeout(() => { saveProfBtn.innerText = "💾 Save Profile Memory"; }, 2000);
      });
    }

    resetProfBtn?.addEventListener("click", async () => {
      await this.copilotExecutor.profileManager.resetProfile();
      await loadProfileUi();
      if (saveProfBtn) {
        saveProfBtn.innerText = "✓ Reset";
        setTimeout(() => { saveProfBtn.innerText = "💾 Save Profile Memory"; }, 2000);
      }
    });

    deleteProfBtn?.addEventListener("click", async () => {
      await this.copilotExecutor.profileManager.deleteProfile();
      await loadProfileUi();
      if (saveProfBtn) {
        saveProfBtn.innerText = "✓ Deleted";
        setTimeout(() => { saveProfBtn.innerText = "💾 Save Profile Memory"; }, 2000);
      }
    });

    // Copilot Auto Fill Button Handler
    const triggerCopilotBtn = document.getElementById("naBtnTriggerCopilot") as HTMLButtonElement | null;
    const triggerAutoNavBtn = document.getElementById("naBtnTriggerAutonomousNav") as HTMLButtonElement | null;
    const copilotPromptInput = document.getElementById("naCopilotPrompt") as HTMLInputElement | null;
    const copilotStatusBox = document.getElementById("naCopilotStatusBox") as HTMLDivElement | null;
    const copilotStatusText = document.getElementById("naCopilotStatusText") as HTMLSpanElement | null;
    const copilotStatusDot = document.getElementById("naCopilotStatusDot") as HTMLSpanElement | null;

    triggerCopilotBtn?.addEventListener("click", async () => {
      if (copilotStatusBox) copilotStatusBox.style.display = "flex";
      if (copilotStatusText) copilotStatusText.innerText = "Scanning page DOM fields & generating AI predictions...";
      if (copilotStatusDot) copilotStatusDot.style.backgroundColor = "#3b82f6";

      const customPrompt = copilotPromptInput?.value.trim() || "";
      const success = await this.copilotExecutor.executeAutofillWorkflow(customPrompt);

      if (copilotStatusText) {
        copilotStatusText.innerText = success ? "Form autofilled successfully!" : "Autofill workflow completed or cancelled.";
      }
      if (copilotStatusDot) {
        copilotStatusDot.style.backgroundColor = success ? "#10b981" : "#ef4444";
      }
    });

    triggerAutoNavBtn?.addEventListener("click", async () => {
      if (copilotStatusBox) copilotStatusBox.style.display = "flex";
      if (copilotStatusText) copilotStatusText.innerText = "Planning & executing autonomous goal actions...";
      if (copilotStatusDot) copilotStatusDot.style.backgroundColor = "#3b82f6";

      const customPrompt = copilotPromptInput?.value.trim() || "search product and proceed to checkout";
      await this.copilotExecutor.executeAutonomousGoal(customPrompt);

      if (copilotStatusText) copilotStatusText.innerText = "Goal action execution plan completed!";
      if (copilotStatusDot) copilotStatusDot.style.backgroundColor = "#10b981";
    });

    const signBtn = document.getElementById("btnSignMode") as HTMLButtonElement | null;
    const voiceBtn = document.getElementById("btnVoiceMode") as HTMLButtonElement | null;
    const visualBtn = document.getElementById("btnVisualMode") as HTMLButtonElement | null;
    const autoBtn = document.getElementById("btnAutomationMode") as HTMLButtonElement | null;
    const chatBtn = document.getElementById("btnChatMode") as HTMLButtonElement | null;

    const signSpace = document.getElementById("spaceSignMode") as HTMLDivElement | null;
    const voiceSpace = document.getElementById("spaceVoiceMode") as HTMLDivElement | null;
    const visualSpace = document.getElementById("spaceVisualMode") as HTMLDivElement | null;
    const autoSpace = document.getElementById("spaceAutomationMode") as HTMLDivElement | null;

    signBtn?.addEventListener("click", () => {
      this.clearActiveModes();
      signBtn.classList.add("active");
      signSpace?.classList.add("active");
      this.chatWidget.setVisible(false);
      this.backdropOverlay?.classList.remove("na-backdrop-clear");
      this.startGestureTracking();
    });

    voiceBtn?.addEventListener("click", () => {
      this.clearActiveModes();
      voiceBtn.classList.add("active");
      voiceSpace?.classList.add("active");
      this.chatWidget.setVisible(false);
      this.backdropOverlay?.classList.remove("na-backdrop-clear");
      this.checkMicrophoneAvailability();
    });

    visualBtn?.addEventListener("click", () => {
      this.clearActiveModes();
      visualBtn.classList.add("active");
      visualSpace?.classList.add("active");
      this.chatWidget.setVisible(false);
      // Remove backdrop blur when visual comfort is active so they can see webpage text
      this.backdropOverlay?.classList.add("na-backdrop-clear");
    });

    autoBtn?.addEventListener("click", () => {
      this.clearActiveModes();
      autoBtn.classList.add("active");
      autoSpace?.classList.add("active");
      this.chatWidget.setVisible(false);
      this.backdropOverlay?.classList.remove("na-backdrop-clear");
    });

    chatBtn?.addEventListener("click", () => {
      this.clearActiveModes();
      chatBtn.classList.add("active");
      this.chatWidget.setVisible(true);
      this.backdropOverlay?.classList.remove("na-backdrop-clear");
    });

    // Voice Start button binding
    document.getElementById("naVoiceStartBtn")?.addEventListener("click", () => {
      const isListening = this.voiceEngine.isListening;
      this.voiceEngine.toggleVoiceSystem(!isListening);
    });

    // Retry checking microphone
    document.getElementById("naVoiceBtnRetry")?.addEventListener("click", () => {
      this.checkMicrophoneAvailability();
    });

    // Open Settings panel
    document.getElementById("naVoiceBtnSettings")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_MIC_SETTINGS" });
    });

    // Simulate bypass button (toggles developer simulator open)
    document.getElementById("naVoiceBtnSimulateBypass")?.addEventListener("click", () => {
      const devPanel = document.getElementById("naVoiceDevPanel");
      if (devPanel && !devPanel.classList.contains("open")) {
        document.getElementById("naVoiceDevToggle")?.click();
      }
    });

    // Collapsible developer tools toggle
    document.getElementById("naVoiceDevToggle")?.addEventListener("click", () => {
      console.log("🖱️ Developer tools toggle clicked.");
      const panel = document.getElementById("naVoiceDevPanel");
      const toggleBtn = document.getElementById("naVoiceDevToggle");
      if (panel && toggleBtn) {
        const isOpen = panel.classList.toggle("open");
        console.log("  Developer panel isOpen:", isOpen);
        if (isOpen) {
          panel.style.setProperty("display", "block", "important");
        } else {
          panel.style.setProperty("display", "none", "important");
        }
        const indicator = toggleBtn.querySelector("span");
        if (indicator) {
          indicator.textContent = isOpen ? "▼" : "▶";
        }
      } else {
        console.warn("  Could not find panel or toggleBtn in DOM.");
      }
    });

    // Send simulator text command
    document.getElementById("naVoiceSimBtn")?.addEventListener("click", () => {
      console.log("🖱️ Send simulator button clicked.");
      const input = document.getElementById("naVoiceSimInput") as HTMLInputElement | null;
      if (input && input.value.trim()) {
        this.voiceEngine.simulateCommand(input.value.trim());
        input.value = "";
      }
    });

    document.getElementById("naVoiceSimInput")?.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const input = e.target as HTMLInputElement;
        if (input && input.value.trim()) {
          this.voiceEngine.simulateCommand(input.value.trim());
          input.value = "";
        }
      }
    });

    document.getElementById("naEmergencyTriggerBtn")?.addEventListener("click", () => {
      alert("🚨 SOS Panic Activated! Sharing system tracking vectors and coordinates with emergency contacts.");
    });

    document.getElementById("naAiSimplifierTriggerBtn")?.addEventListener("click", async () => {
      const isEnabled = await this.websiteSimplifier.toggle();
      if (isEnabled && this.isDockOpen) {
        this.toggleActionDockSystem();
      }
    });

    document.getElementById("naAiSimplifierCheckbox")?.addEventListener("change", async () => {
      const isEnabled = await this.websiteSimplifier.toggle();
      if (isEnabled && this.isDockOpen) {
        this.toggleActionDockSystem();
      }
    });

    // Dyslexia Font Checkbox
    const dyslexiaCb = document.getElementById("naDyslexiaCheckbox") as HTMLInputElement | null;
    if (dyslexiaCb) {
      dyslexiaCb.checked = this.isDyslexiaActive;
      dyslexiaCb.addEventListener("change", (e: any) => {
        this.isDyslexiaActive = e.target.checked;
        this.saveSetting("na_dyslexia_active", this.isDyslexiaActive);
        this.applyVisualAdjustments();
      });
    }

    // Font Size Buttons
    const lblFontSize = document.getElementById("lblFontSize");
    document.getElementById("btnFontSizeDec")?.addEventListener("click", () => {
      this.fontSizeScale = Math.max(50, this.fontSizeScale - 5);
      if (lblFontSize) lblFontSize.innerText = `${this.fontSizeScale}%`;
      this.saveSetting("na_font_size_scale", this.fontSizeScale);
      this.applyVisualAdjustments();
    });
    document.getElementById("btnFontSizeInc")?.addEventListener("click", () => {
      this.fontSizeScale = Math.min(200, this.fontSizeScale + 5);
      if (lblFontSize) lblFontSize.innerText = `${this.fontSizeScale}%`;
      this.saveSetting("na_font_size_scale", this.fontSizeScale);
      this.applyVisualAdjustments();
    });

    // Line Height Buttons
    const lblLineHeight = document.getElementById("lblLineHeight");
    document.getElementById("btnLineHeightDec")?.addEventListener("click", () => {
      this.lineHeightScale = Math.max(15, this.lineHeightScale - 1);
      if (lblLineHeight) lblLineHeight.innerText = `${this.lineHeightScale / 10}x`;
      this.saveSetting("na_line_height_scale", this.lineHeightScale);
      this.applyVisualAdjustments();
    });
    document.getElementById("btnLineHeightInc")?.addEventListener("click", () => {
      this.lineHeightScale = Math.min(25, this.lineHeightScale + 1);
      if (lblLineHeight) lblLineHeight.innerText = `${this.lineHeightScale / 10}x`;
      this.saveSetting("na_line_height_scale", this.lineHeightScale);
      this.applyVisualAdjustments();
    });

    // Letter Spacing Buttons
    const lblLetterSpacing = document.getElementById("lblLetterSpacing");
    document.getElementById("btnLetterSpacingDec")?.addEventListener("click", () => {
      this.letterSpacingValue = Math.max(0, this.letterSpacingValue - 1);
      if (lblLetterSpacing) lblLetterSpacing.innerText = `${this.letterSpacingValue}px`;
      this.saveSetting("na_letter_spacing_value", this.letterSpacingValue);
      this.applyVisualAdjustments();
    });
    document.getElementById("btnLetterSpacingInc")?.addEventListener("click", () => {
      this.letterSpacingValue = Math.min(4, this.letterSpacingValue + 1);
      if (lblLetterSpacing) lblLetterSpacing.innerText = `${this.letterSpacingValue}px`;
      this.saveSetting("na_letter_spacing_value", this.letterSpacingValue);
      this.applyVisualAdjustments();
    });

    // Contrast Theme Selector
    const contrastThemeSelect = document.getElementById("naContrastThemeSelect") as HTMLSelectElement | null;
    if (contrastThemeSelect) {
      contrastThemeSelect.value = this.contrastTheme;
      contrastThemeSelect.addEventListener("change", (e: any) => {
        this.contrastTheme = e.target.value;
        this.saveSetting("na_contrast_theme", this.contrastTheme);
        this.applyVisualAdjustments();
      });
    }

    // Color Blind Select
    const colorBlindSelect = document.getElementById("naColorBlindSelect") as HTMLSelectElement | null;
    if (colorBlindSelect) {
      colorBlindSelect.value = this.colorBlindFilter;
      colorBlindSelect.addEventListener("change", (e: any) => {
        this.colorBlindFilter = e.target.value;
        this.saveSetting("na_color_blind_filter", this.colorBlindFilter);
        this.applyVisualAdjustments();
      });
    }

    // Contrast Buttons
    const lblContrast = document.getElementById("lblContrast");
    document.getElementById("btnContrastDec")?.addEventListener("click", () => {
      this.contrastFactor = Math.max(50, this.contrastFactor - 5);
      if (lblContrast) lblContrast.innerText = `${this.contrastFactor}%`;
      this.saveSetting("na_contrast_factor", this.contrastFactor);
      this.applyVisualAdjustments();
    });
    document.getElementById("btnContrastInc")?.addEventListener("click", () => {
      this.contrastFactor = Math.min(180, this.contrastFactor + 5);
      if (lblContrast) lblContrast.innerText = `${this.contrastFactor}%`;
      this.saveSetting("na_contrast_factor", this.contrastFactor);
      this.applyVisualAdjustments();
    });
  }

  private listenForPopupTriggers() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "EXTENSION_LANGUAGE_CHANGED") {
        this.applyLanguage(message.language);
      } else if (message.type === "ANALYZE_ACCESSIBILITY") {
        try {
          const audit = AccessibilityAnalyzer.analyzeDocument(document);
          sendResponse(audit);
        } catch (err) {
          console.error("Error analyzing page accessibility:", err);
          sendResponse(null);
        }
        return true;
      } else if (message.type === "TRIGGER_ACCESSIBILITY_DOCK") {
        this.chatWidget.setVisible(!this.chatWidget.isVisible());
      } else if (message.type === "TOGGLE_SIMPLIFIER") {
        this.websiteSimplifier.toggle();
      } else if (message.type === "OPEN_COPILOT") {
        this.chatWidget.setVisible(true);
      } else if (message.type === "OPEN_SETTINGS_POPUP") {
        this._showPopupHint();
      } else if (message.type === "ACTIVATE_MODE") {
        this.chatWidget.setVisible(true);
      } else if (message.type === "APPLY_CONFIG" || message.type === "APPLY_VISUAL_PREF") {
        const config = message.config || message.prefs;
        if (config) {
          if (config.dyslexia !== undefined) this.isDyslexiaActive = config.dyslexia;
          if (config.fontSize !== undefined) this.fontSizeScale = config.fontSize;
          if (config.fontScale !== undefined) this.fontSizeScale = config.fontScale;
          if (config.lineHeight !== undefined) this.lineHeightScale = config.lineHeight;
          if (config.letterSpacing !== undefined) this.letterSpacingValue = config.letterSpacing;
          if (config.contrastTheme !== undefined) this.contrastTheme = config.contrastTheme;
          if (config.contrast !== undefined) this.contrastTheme = config.contrast;
          if (config.colorBlindFilter !== undefined) this.colorBlindFilter = config.colorBlindFilter;
          if (config.colorBlind !== undefined) this.colorBlindFilter = config.colorBlind;
          if (config.contrastFactor !== undefined) this.contrastFactor = config.contrastFactor;
          
          this.applyVisualAdjustments();
          this.syncSettingsUI();
          
          const targetSimplifier = config.simplifyWebsite !== undefined ? config.simplifyWebsite : config.simplifier;
          if (targetSimplifier !== undefined) {
            if (this.websiteSimplifier.isActive() !== targetSimplifier) {
              this.websiteSimplifier.toggle();
            }
          }
        }
      } else if (message.type === "TRIGGER_COPILOT") {
        this.copilotExecutor.executeAutofillWorkflow(message.prompt || "");
      } else if (message.type === "TRIGGER_AUTONOMOUS_NAV") {
        this.copilotExecutor.executeAutonomousGoal(message.prompt || "");
      } else if (message.type === "UNDO_CHANGES") {
        this.revertVisualAdjustments();
        this.isDyslexiaActive = false;
        this.fontSizeScale = 100;
        this.lineHeightScale = 15;
        this.letterSpacingValue = 0;
        this.contrastTheme = "none";
        this.colorBlindFilter = "none";
        this.contrastFactor = 100;
        this.syncSettingsUI();
        chrome.storage.local.set({
          na_dyslexia_active: false,
          na_font_size_scale: 100,
          na_line_height_scale: 15,
          na_letter_spacing_value: 0,
          na_contrast_theme: "none",
          na_color_blind_filter: "none",
          na_contrast_factor: 100
        });
        if (this.websiteSimplifier.isActive()) {
          this.websiteSimplifier.toggle();
        }
      } else if (message.type === "TOGGLE_GESTURE_TRACKING") {
        this.toggleWebcamTracking(message.enabled);
      } else if (message.type === "SIMULATE_GESTURE") {
        if (message.action === "scroll_down") {
          window.scrollBy({ top: 300, behavior: "smooth" });
        } else if (message.action === "scroll_up") {
          window.scrollBy({ top: -300, behavior: "smooth" });
        }
      }
    });

    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local") {
          this.loadVisualPreferences();
        }
      });
    } catch (e) { /* ignore */ }
  }

  private clearActiveModes() {
    this.stopGestureTracking();
    document.querySelectorAll(".na-mode-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".na-dock-workspace").forEach(s => s.classList.remove("active"));
  }

  // ── Popup hint shown when settings button is pressed ─────────────────────
  private _showPopupHint() {
    let hint = document.getElementById("na-popup-hint");
    if (hint) { hint.remove(); }
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

  private toggleActionDockSystem() {
    this.isDockOpen = !this.isDockOpen;
    if (this.isDockOpen) {
      this.backdropOverlay?.classList.add("visible");
      this.topActionDock?.classList.add("open");
      this.applyVisualAdjustments();
    } else {
      this.backdropOverlay?.classList.remove("visible");
      this.backdropOverlay?.classList.remove("na-backdrop-clear");
      this.topActionDock?.classList.remove("open");
      if (this.topActionDock) {
        this.topActionDock.style.left = "";
        this.topActionDock.style.top = "";
        this.topActionDock.style.transform = "";
      }
      this.chatWidget.setVisible(false);
      this.clearActiveModes();
      this.revertVisualAdjustments();
    }
  }

  private makeDockDraggable() {
    if (!this.topActionDock) return;

    const header = this.topActionDock.querySelector(".na-mode-row") as HTMLElement | null;
    if (!header) return;

    header.style.cursor = "move";

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    header.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return; // Only drag on primary (left) button click
      if ((e.target as HTMLElement).closest("button")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.topActionDock!.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      this.topActionDock!.style.transition = "none";
      this.topActionDock!.style.transform = "none";
      this.topActionDock!.style.left = `${initialX}px`;
      this.topActionDock!.style.top = `${initialY}px`;
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    header.addEventListener("pointermove", (e: PointerEvent) => {
      if (!isDragging || !this.topActionDock) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.topActionDock.style.left = `${initialX + dx}px`;
      this.topActionDock.style.top = `${initialY + dy}px`;
    });

    header.addEventListener("pointerup", (e: PointerEvent) => {
      if (isDragging && this.topActionDock) {
        isDragging = false;
        header.releasePointerCapture(e.pointerId);
        this.topActionDock.style.transition = "top 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease";
      }
    });
  }

  // Visual Comfort Helper Methods
  private injectSvgFilters() {
    if (document.getElementById("na-svg-filters-container")) return;

    const svgFilters = document.createElement("div");
    svgFilters.id = "na-svg-filters-container";
    svgFilters.innerHTML = `
      <svg style="display:none">
        <defs>
          <filter id="na-protanopia-matrix">
            <feColorMatrix type="matrix" values="0.567, 0.433, 0, 0, 0, 0.558, 0.442, 0, 0, 0, 0, 0.242, 0.758, 0, 0, 0, 0, 0, 1, 0" />
          </filter>
          <filter id="na-deuteranopia-matrix">
            <feColorMatrix type="matrix" values="0.625, 0.375, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0.3, 0.7, 0, 0, 0, 0, 0, 1, 0" />
          </filter>
          <filter id="na-tritanopia-matrix">
            <feColorMatrix type="matrix" values="0.95, 0.05, 0, 0, 0, 0, 0.433, 0.567, 0, 0, 0, 0.475, 0.525, 0, 0, 0, 0, 0, 1, 0" />
          </filter>
        </defs>
      </svg>
    `;
    document.body.appendChild(svgFilters);
  }

  private loadVisualPreferences() {
    try {
      chrome.storage.local.get([
        "na_visual_popup_v3",
        "na_dyslexia_active",
        "na_font_size_scale",
        "na_line_height_scale",
        "na_letter_spacing_value",
        "na_contrast_theme",
        "na_color_blind_filter",
        "na_contrast_factor"
      ], (result) => {
        if (result.na_visual_popup_v3) {
          try {
            const vs = JSON.parse(result.na_visual_popup_v3);
            this.isDyslexiaActive = vs.dyslexia === true;
            this.fontSizeScale = parseInt(vs.fontSize || "100", 10);
            this.lineHeightScale = parseInt(vs.lineHeight || "15", 10);
            this.letterSpacingValue = parseFloat(vs.letterSpacing || "0");
            this.contrastTheme = vs.theme || "none";
            this.colorBlindFilter = vs.colorBlind || "none";
            this.contrastFactor = parseInt(vs.contrast || "100", 10);
            this.syncSettingsUI();
            this.applyVisualAdjustments();
            if (vs.simplifier !== undefined) {
              if (this.websiteSimplifier.isActive() !== vs.simplifier) {
                this.websiteSimplifier.toggle();
              }
            }
            return;
          } catch (e) { /* ignore */ }
        }

        this.isDyslexiaActive = result.na_dyslexia_active === true;
        this.fontSizeScale = parseInt(result.na_font_size_scale || "100", 10);
        this.lineHeightScale = parseInt(result.na_line_height_scale || "15", 10);
        this.letterSpacingValue = parseFloat(result.na_letter_spacing_value || "0");
        this.contrastTheme = result.na_contrast_theme || "none";
        this.colorBlindFilter = result.na_color_blind_filter || "none";
        this.contrastFactor = parseInt(result.na_contrast_factor || "100", 10);

        this.syncSettingsUI();
        this.applyVisualAdjustments();
      });
    } catch (e) {
      console.warn("Failed to load visual preferences from chrome.storage.local, falling back to localStorage:", e);
      this.isDyslexiaActive = localStorage.getItem("na_dyslexia_active") === "true";
      this.fontSizeScale = parseInt(localStorage.getItem("na_font_size_scale") || "100", 10);
      this.lineHeightScale = parseInt(localStorage.getItem("na_line_height_scale") || "15", 10);
      this.letterSpacingValue = parseFloat(localStorage.getItem("na_letter_spacing_value") || "0");
      this.contrastTheme = localStorage.getItem("na_contrast_theme") || "none";
      this.colorBlindFilter = localStorage.getItem("na_color_blind_filter") || "none";
      this.contrastFactor = parseInt(localStorage.getItem("na_contrast_factor") || "100", 10);
      this.applyVisualAdjustments();
    }
  }

  private saveSetting(key: string, value: any) {
    try {
      chrome.storage.local.set({ [key]: value });
    } catch (e) {
      console.warn(`Failed to save ${key} to chrome.storage.local:`, e);
    }
    try {
      localStorage.setItem(key, value.toString());
    } catch (e) {
      console.warn(`Failed to save ${key} to localStorage:`, e);
    }
  }

  private syncSettingsUI() {
    const dyslexiaCb = document.getElementById("naDyslexiaCheckbox") as HTMLInputElement | null;
    if (dyslexiaCb) dyslexiaCb.checked = this.isDyslexiaActive;

    const fontSizeLabel = document.getElementById("lblFontSize");
    if (fontSizeLabel) {
      fontSizeLabel.innerText = `${this.fontSizeScale}%`;
    }

    const lineHeightLabel = document.getElementById("lblLineHeight");
    if (lineHeightLabel) {
      lineHeightLabel.innerText = `${this.lineHeightScale / 10}x`;
    }

    const letterSpacingLabel = document.getElementById("lblLetterSpacing");
    if (letterSpacingLabel) {
      letterSpacingLabel.innerText = `${this.letterSpacingValue}px`;
    }

    const contrastThemeSelect = document.getElementById("naContrastThemeSelect") as HTMLSelectElement | null;
    if (contrastThemeSelect) contrastThemeSelect.value = this.contrastTheme;

    const colorBlindSelect = document.getElementById("naColorBlindSelect") as HTMLSelectElement | null;
    if (colorBlindSelect) colorBlindSelect.value = this.colorBlindFilter;

    const contrastLabel = document.getElementById("lblContrast");
    if (contrastLabel) {
      contrastLabel.innerText = `${this.contrastFactor}%`;
    }
  }

  private applyVisualAdjustments() {
    // 1. Dyslexia Font
    if (this.isDyslexiaActive) {
      document.body.classList.add("na-dyslexia-active");
    } else {
      document.body.classList.remove("na-dyslexia-active");
    }

    // 2. Custom text classes
    if (this.fontSizeScale !== 100 || this.lineHeightScale > 15 || this.letterSpacingValue > 0) {
      document.body.classList.add("na-text-customized");
      document.body.style.setProperty("--na-font-size", `${this.fontSizeScale}%`);
      document.body.style.setProperty("--na-line-height", `${this.lineHeightScale / 10}`);
      document.body.style.setProperty("--na-letter-spacing", `${this.letterSpacingValue}px`);
    } else {
      document.body.classList.remove("na-text-customized");
      document.body.style.removeProperty("--na-font-size");
      document.body.style.removeProperty("--na-line-height");
      document.body.style.removeProperty("--na-letter-spacing");
    }

    // 3. Contrast Theme
    document.body.classList.remove("na-theme-hc-dark", "na-theme-hc-light", "na-theme-monochrome");
    if (this.contrastTheme === "hc-dark") {
      document.body.classList.add("na-theme-hc-dark");
    } else if (this.contrastTheme === "hc-light") {
      document.body.classList.add("na-theme-hc-light");
    } else if (this.contrastTheme === "monochrome") {
      document.body.classList.add("na-theme-monochrome");
    }

    // 4. Contrast factor and color blind matrix filters
    let filterStr = `contrast(${this.contrastFactor}%)`;
    if (this.colorBlindFilter !== "none") {
      filterStr += ` url(#na-${this.colorBlindFilter}-matrix)`;
    }
    if (this.contrastFactor !== 100 || this.colorBlindFilter !== "none") {
      document.documentElement.style.filter = filterStr;
    } else {
      document.documentElement.style.filter = "";
    }
  }

  private revertVisualAdjustments() {
    this.isDyslexiaActive = false;
    this.fontSizeScale = 100;
    this.lineHeightScale = 15;
    this.letterSpacingValue = 0;
    this.contrastTheme = "none";
    this.colorBlindFilter = "none";
    this.contrastFactor = 100;

    document.body.classList.remove(
      "na-dyslexia-active",
      "na-text-customized",
      "na-theme-hc-dark",
      "na-theme-hc-light",
      "na-theme-monochrome",
      "na-simplified-mode"
    );

    document.body.style.removeProperty("--na-font-size");
    document.body.style.removeProperty("--na-line-height");
    document.body.style.removeProperty("--na-letter-spacing");
    document.documentElement.style.filter = "";

    if (this.headingsHighlighted) {
      this.toggleHeadingHighlight();
    }

    if (this.websiteSimplifier.isActive()) {
      this.websiteSimplifier.disable();
    }

    try {
      chrome.storage.local.remove([
        "na_visual_popup_v3",
        "na_dyslexia_active",
        "na_font_size_scale",
        "na_line_height_scale",
        "na_letter_spacing_value",
        "na_contrast_theme",
        "na_color_blind_filter",
        "na_contrast_factor"
      ]);
    } catch (e) { /* ignore */ }

    this.syncSettingsUI();
  }

  private headingsHighlighted: boolean = false;
  private toggleHeadingHighlight() {
    this.headingsHighlighted = !this.headingsHighlighted;
    const headings = document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
    headings.forEach((h) => {
      if (this.headingsHighlighted) {
        h.style.outline = "3px dashed #ef4444";
        h.style.outlineOffset = "2px";
        h.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
      } else {
        h.style.outline = "";
        h.style.outlineOffset = "";
        h.style.backgroundColor = "";
      }
    });
  }
  private async checkMicrophoneAvailability() {
    const activeView = document.getElementById("naVoiceActiveView");
    const missingView = document.getElementById("naVoiceMissingView");

    let hasMic = false;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        hasMic = devices.some((d) => d.kind === "audioinput");
      }
    } catch (e) {
      console.warn("🎙️ Error checking microphone devices:", e);
    }

    if (hasMic) {
      if (activeView) activeView.style.setProperty("display", "flex", "important");
      if (missingView) missingView.style.setProperty("display", "none", "important");
    } else {
      if (activeView) activeView.style.setProperty("display", "none", "important");
      if (missingView) missingView.style.setProperty("display", "block", "important");
    }
  }

  private updateVoiceSteps(state: "idle" | "listening" | "processing" | "executed") {
    const stepListening = document.getElementById("naVoiceStepListening");
    const stepProcessing = document.getElementById("naVoiceStepProcessing");
    const stepExecuted = document.getElementById("naVoiceStepExecuted");
    const transcriptBox = document.getElementById("naVoiceTranscript");

    [stepListening, stepProcessing, stepExecuted].forEach((step) => {
      step?.classList.remove("active", "completed");
    });

    switch (state) {
      case "idle":
        stepListening?.classList.add("active");
        if (transcriptBox) {
          transcriptBox.innerText = "Say a command (e.g. \"scroll down\", \"go back\")...";
          transcriptBox.classList.remove("has-text");
        }
        break;
      case "listening":
        stepListening?.classList.add("active");
        if (transcriptBox) {
          transcriptBox.innerText = "Listening... Speak your command now.";
          transcriptBox.classList.remove("has-text");
        }
        break;
      case "processing":
        stepListening?.classList.add("completed");
        stepProcessing?.classList.add("active");
        if (transcriptBox) {
          transcriptBox.innerText = "Processing command...";
          transcriptBox.classList.add("has-text");
        }
        break;
      case "executed":
        stepListening?.classList.add("completed");
        stepProcessing?.classList.add("completed");
        stepExecuted?.classList.add("active");
        break;
    }
  }

  private bindVoiceEngineActions() {
    document.addEventListener("neuro-assist-action", (e: any) => {
      const { action, value, isListening } = e.detail;
      switch (action) {
        case "voice_state_changed":
          const startBtn = document.getElementById("naVoiceStartBtn");
          const visualizer = document.getElementById("naVoiceVisualizer");
          if (startBtn) {
            if (isListening) {
              startBtn.classList.add("listening");
              startBtn.title = "Stop Listening";
              visualizer?.classList.add("active");
              this.updateVoiceSteps("listening");
            } else {
              startBtn.classList.remove("listening");
              startBtn.title = "Start Listening";
              visualizer?.classList.remove("active");
              this.updateVoiceSteps("idle");
            }
          }
          break;

        case "voice_interim":
          const transcriptBoxInterim = document.getElementById("naVoiceTranscript");
          if (transcriptBoxInterim) {
            transcriptBoxInterim.innerText = `Spoken: "${e.detail.transcript}..."`;
            transcriptBoxInterim.classList.add("has-text");
          }
          break;

        case "voice_processing":
          this.updateVoiceSteps("processing");
          const transcriptBoxProc = document.getElementById("naVoiceTranscript");
          if (transcriptBoxProc) {
            transcriptBoxProc.innerText = `Recognized: "${e.detail.command}"`;
            transcriptBoxProc.classList.add("has-text");
          }
          break;

        case "voice_executed":
          this.updateVoiceSteps("executed");
          const transcriptBoxExec = document.getElementById("naVoiceTranscript");
          if (transcriptBoxExec) {
            transcriptBoxExec.innerText = `Executed: "${e.detail.speak}"`;
            transcriptBoxExec.classList.add("has-text");
          }
          setTimeout(() => {
            if (this.voiceEngine.isListening) {
              this.updateVoiceSteps("listening");
            } else {
              this.updateVoiceSteps("idle");
            }
          }, 2500);
          break;

        case "open_accessibility_dock":
          if (!this.isDockOpen) {
            this.toggleActionDockSystem();
          }
          break;

        case "close_accessibility_dock":
          if (this.isDockOpen) {
            this.toggleActionDockSystem();
          }
          break;

        case "simplify_website":
          this.websiteSimplifier.toggle().then((isEnabled) => {
            if (isEnabled && this.isDockOpen) {
              this.toggleActionDockSystem();
            }
          });
          break;

        case "dark_mode":
          this.contrastTheme = "hc-dark";
          this.saveSetting("na_contrast_theme", this.contrastTheme);
          this.syncSettingsUI();
          this.applyVisualAdjustments();
          break;

        case "light_mode":
          this.contrastTheme = "none";
          this.saveSetting("na_contrast_theme", this.contrastTheme);
          this.syncSettingsUI();
          this.applyVisualAdjustments();
          break;

        case "increase_font":
          this.fontSizeScale = Math.min(200, this.fontSizeScale + 10);
          this.saveSetting("na_font_size_scale", this.fontSizeScale);
          this.syncSettingsUI();
          this.applyVisualAdjustments();
          break;

        case "decrease_font":
          this.fontSizeScale = Math.max(50, this.fontSizeScale - 10);
          this.saveSetting("na_font_size_scale", this.fontSizeScale);
          this.syncSettingsUI();
          this.applyVisualAdjustments();
          break;

        case "highlight_headings":
          this.toggleHeadingHighlight();
          break;

        case "open_chatbot":
          if (!this.isDockOpen) {
            this.toggleActionDockSystem();
          }
          (document.getElementById("btnChatMode") as HTMLButtonElement | null)?.click();
          break;
      }
    });
  }

  private toggleWebcamTracking(enabled: boolean) {
    console.log("Gesture tracking toggled:", enabled, "— camera & tracking disabled until teammate's backend module is merged.");
  }

  private applyLanguage(lang: string) {
    this.currentLanguage = lang;
    if (this.chatWidget) {
      this.chatWidget.setLanguage(lang);
    }

    const docEl = (id: string) => document.getElementById(id);
    const setText = (id: string, key: string) => {
      const elObj = docEl(id);
      if (elObj) elObj.textContent = getTranslation(key as any, lang);
    };
    const setPlaceholder = (id: string, key: string) => {
      const elObj = docEl(id) as HTMLInputElement | null;
      if (elObj) elObj.placeholder = getTranslation(key as any, lang);
    };

    // Header Mode Buttons
    setText("btnSignMode", "modGesture");
    setText("btnVoiceMode", "modVoice");
    setText("btnVisualMode", "modVisual");
    setText("btnAutomationMode", "wsCopilotTitle");
    setText("btnChatMode", "chatTitle");

    // Workspace Titles
    setText("naSignWorkspaceTitle", "wsGestureTitle");
    setText("naVoiceWorkspaceTitle", "wsVoiceTitle");
    setText("naVisualWorkspaceTitle", "wsVisualTitle");
    setText("naAutomationWorkspaceTitle", "wsCopilotTitle");

    // Gesture Workspace
    setText("naGestureStatusLabel", "gestureStatusLabel");
    const gestureActionBadge = docEl("naGestureActionBadge");
    if (gestureActionBadge) {
      const txt = gestureActionBadge.textContent || "";
      if (["None", "Ninguno", "Aucun", "Keine", "कोई नहीं"].includes(txt)) {
        gestureActionBadge.textContent = getTranslation("gestureStatusNone", lang);
      } else if (["Running", "Ejecutando", "Actif", "Aktiv", "चालू है"].includes(txt)) {
        gestureActionBadge.textContent = getTranslation("gestureStatusRunning", lang);
      }
    }
    setText("naGestureDomLabel", "gestureDomLabel");
    setText("naGestureDomDesc", "gestureDomDesc");

    // Voice Workspace
    const micBadge = docEl("naVoiceMicBadge");
    if (micBadge) {
      const isOk = micBadge.classList.contains("na-mic-ready");
      micBadge.innerHTML = `<span class="na-mic-status-dot"></span> ` + (isOk ? getTranslation("micReady", lang) : getTranslation("noMic", lang));
    }
    setText("naVoiceStepListeningLabel", "stepListen");
    setText("naVoiceStepProcessingLabel", "stepProcess");
    setText("naVoiceStepExecutedLabel", "stepExecuted");

    const voiceTranscript = docEl("naVoiceTranscript");
    if (voiceTranscript) {
      const text = voiceTranscript.textContent || "";
      if (text.includes("Say a command") || text.includes("Diga un") || text.includes("Dites une") || text.includes("Sagen Sie") || text.includes("कोई कमांड")) {
        voiceTranscript.textContent = getTranslation("transcriptSayCmd", lang);
      } else if (text.includes("Listening… speak now") || text.includes("Escuchando...") || text.includes("Écoute en cours") || text.includes("Hören...") || text.includes("सुन रहा है")) {
        voiceTranscript.textContent = getTranslation("transcriptListening", lang);
      } else if (text.includes("Processing…") || text.includes("Procesando…") || text.includes("Traitement…") || text.includes("Verarbeiten…") || text.includes("प्रोसेस किया जा रहा है")) {
        voiceTranscript.textContent = getTranslation("transcriptProcessing", lang);
      } else if (text.includes("Executed:") || text.includes("Ejecutado:") || text.includes("Exécuté:") || text.includes("Ausgeführt:") || text.includes("निष्पादित:")) {
        const parts = text.split('"');
        const cmd = parts.length > 1 ? parts[1] : "";
        voiceTranscript.textContent = `${getTranslation("transcriptExecutedPrefix", lang)}"${cmd}"`;
      }
    }

    setText("naVoiceNoMicTitle", "noMicTitle");
    setText("naVoiceNoMicDesc", "noMicDesc");
    setText("naVoiceBtnRetry", "retryBtn");
    setText("naVoiceBtnSettings", "chatSettingsTitle");
    setText("naVoiceBtnSimulateBypass", "simBypassBtn");

    const devToggle = docEl("naVoiceDevToggle");
    if (devToggle) {
      const isExpanded = devToggle.textContent?.includes("▼");
      devToggle.innerHTML = `<span id="naVoiceDevArrow">${isExpanded ? "▼" : "▶"}</span> ` + getTranslation("devToggleTitle", lang);
    }
    setPlaceholder("naVoiceSimInput", "devSimInputPlaceholder");
    setText("naVoiceSimBtn", "devSimSend");

    // Visual Workspace
    setText("naSimplifierLabel", "simplifierLabel");
    setText("naDyslexiaLabel", "dyslexiaLabel");
    setText("naFontSizeLabel", "fontSizeLabel");
    setText("naLineSpacingLabel", "lineSpacingLabel");
    setText("naLetterSpacingLabel", "lettersLabel");
    setText("naThemeLabel", "themeLabel");

    const contrastThemeSelect = docEl("naContrastThemeSelect") as HTMLSelectElement | null;
    if (contrastThemeSelect) {
      contrastThemeSelect.options[0].text = getTranslation("themeDefault", lang);
      contrastThemeSelect.options[1].text = getTranslation("themeHcDark", lang);
      contrastThemeSelect.options[2].text = getTranslation("themeHcLight", lang);
      contrastThemeSelect.options[3].text = getTranslation("themeGrayscale", lang);
    }

    setText("naColorBlindLabel", "colorBlindLabel");
    const colorBlindSelect = docEl("naColorBlindSelect") as HTMLSelectElement | null;
    if (colorBlindSelect) {
      colorBlindSelect.options[0].text = getTranslation("cbNone", lang);
      colorBlindSelect.options[1].text = getTranslation("cbProtan", lang);
      colorBlindSelect.options[2].text = getTranslation("cbDeuter", lang);
      colorBlindSelect.options[3].text = getTranslation("cbTritan", lang);
    }
    setText("naContrastLabel", "contrastLabel");
    setText("naLivePreviewText", "visualPreviewText");

    // Copilot Workspace
    setText("naCopilotTitle", "copilotAutofillTitle");
    setText("naCopilotDesc", "copilotAutofillDesc");
    setText("naCopilotGoalLabel", "copilotGoalLabel");
    setPlaceholder("naCopilotPrompt", "copilotGoalPlaceholder");
    setText("naBtnTriggerCopilot", "copilotScanBtn");
    setText("naBtnTriggerAutonomousNav", "copilotExecBtn");
    setText("naCopilotProfileTitle", "copilotProfTitle");

    setPlaceholder("naProfName", "profNamePh");
    setPlaceholder("naProfEmail", "profEmailPh");
    setPlaceholder("naProfPhone", "profPhonePh");
    setPlaceholder("naProfDob", "profDobPh");
    setPlaceholder("naProfAddress", "profAddressPh");
    setPlaceholder("naProfCity", "profCityPh");
    setPlaceholder("naProfState", "profStatePh");
    setPlaceholder("naProfCountry", "profCountryPh");
    setPlaceholder("naProfPostalCode", "profPostalPh");
    setPlaceholder("naProfGender", "profGenderPh");

    setText("naSaveProfileBtn", "profSaveBtn");
    setText("naResetProfileBtn", "profResetBtn");
    setText("naDeleteProfileBtn", "profDeleteBtn");

    const copilotStatusText = docEl("naCopilotStatusText");
    if (copilotStatusText) {
      const text = copilotStatusText.textContent || "";
      if (text.includes("idle") || text.includes("inactivo") || text.includes("inactif") || text.includes("निष्क्रिय")) {
        copilotStatusText.textContent = getTranslation("copilotStatusIdle", lang);
      } else if (text.includes("Scanning page") || text.includes("Escaneando") || text.includes("Analyse") || text.includes("Scanne") || text.includes("स्कैन")) {
        copilotStatusText.textContent = getTranslation("copilotStatusScanning", lang);
      } else if (text.includes("triggered") || text.includes("activado") || text.includes("déclenché") || text.includes("gestartet") || text.includes("शुरू")) {
        copilotStatusText.textContent = getTranslation("copilotStatusTriggered", lang);
      } else if (text.includes("Planning") || text.includes("Planificando") || text.includes("Planification") || text.includes("Plane") || text.includes("योजना")) {
        copilotStatusText.textContent = getTranslation("copilotStatusPlanning", lang);
      } else if (text.includes("completed") || text.includes("completado") || text.includes("complété") || text.includes("abgeschlossen") || text.includes("पूरी हुई")) {
        copilotStatusText.textContent = getTranslation("copilotStatusCompleted", lang);
      }
    }

    // Footer
    setText("naPassportBadge", "footerBadge");
    const simplifyBtn = docEl("naAiSimplifierTriggerBtn");
    if (simplifyBtn) {
      const isActive = simplifyBtn.getAttribute("data-active") === "true";
      simplifyBtn.textContent = getTranslation(isActive ? "simplifyBtnActive" : "simplifyBtn", lang);
    }
  }
}

new NeuroAssistUltimateFrontend();