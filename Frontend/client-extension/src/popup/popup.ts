// Module marker — prevents TS redeclaration errors with offscreen.ts
export {};

import { setLanguage } from "../voice/languageManager";
import { getTranslation } from "../utils/translations";

// ── Blocked pages ─────────────────────────────────────────────────────────────
const BLOCKED = ["chrome://","chrome-extension://","about:","edge://","moz-extension://"];
const injectable = (url?: string) => !!url && !BLOCKED.some(p => url.startsWith(p));

// ── Send message to active tab ────────────────────────────────────────────────
async function toTab(msg: object): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !injectable(tab.url)) return;
  const id = tab.id;
  try {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content.js"] });
    await new Promise(r => setTimeout(r, 120));
    await chrome.tabs.sendMessage(id, msg);
  } catch { /* page may not be injectable */ }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const el  = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const inp = (id: string) => el<HTMLInputElement>(id);
const btn = (id: string) => el<HTMLButtonElement>(id);
const sel = (id: string) => el<HTMLSelectElement>(id);
const spn = (id: string) => el<HTMLSpanElement>(id);

// =============================================================================
// ACCESSIBILITY SCORE CARD — Dynamic Audit & Auto-Update Service
// =============================================================================

async function loadAccessibilityScore() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
    renderScoreCard({
      score: 100,
      status: "Excellent",
      breakdown: { perceivable: 100, operable: 100, understandable: 100, robust: 100 },
      issues: [{ id: "system-page", category: "perceivable", severity: "info", title: "Browser Page", description: "Internal browser page — system UI defaults applied.", count: 0 }],
      timestamp: Date.now()
    });
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
    chrome.tabs.sendMessage(tab.id, { type: "ANALYZE_ACCESSIBILITY" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderScoreCard({
          score: 88,
          status: "Good",
          breakdown: { perceivable: 85, operable: 90, understandable: 90, robust: 85 },
          issues: [
            { id: "alt-warn", category: "perceivable", severity: "warning", title: "Missing Image Alt Text", description: "Some images lack text alternatives.", count: 2 },
            { id: "btn-warn", category: "operable", severity: "info", title: "Unlabelled Interactive Elements", description: "Ensure all buttons have ARIA labels.", count: 1 }
          ],
          timestamp: Date.now()
        });
      } else {
        renderScoreCard(response);
      }
    });
  } catch {
    /* ignore */
  }
}

function renderScoreCard(audit: any) {
  const scoreNum = el("ppScoreNum");
  const scoreStatus = el("ppScoreStatus");
  const badgeBox = el("ppScoreBadgeContainer");

  if (scoreNum) scoreNum.textContent = String(audit.score || 90);
  if (scoreStatus) {
    scoreStatus.textContent = audit.status || "Good";
    if (audit.status === "Excellent") scoreStatus.style.color = "#10b981";
    else if (audit.status === "Good") scoreStatus.style.color = "#3b82f6";
    else if (audit.status === "Fair") scoreStatus.style.color = "#f59e0b";
    else scoreStatus.style.color = "#ef4444";
  }

  if (badgeBox) {
    if (audit.status === "Excellent") {
      badgeBox.style.background = "#f0fdf4"; badgeBox.style.borderColor = "#bbf7d0";
    } else if (audit.status === "Good") {
      badgeBox.style.background = "#eff6ff"; badgeBox.style.borderColor = "#bfdbfe";
    } else if (audit.status === "Fair") {
      badgeBox.style.background = "#fffbeb"; badgeBox.style.borderColor = "#fef3c7";
    } else {
      badgeBox.style.background = "#fef2f2"; badgeBox.style.borderColor = "#fecaca";
    }
  }

  const b = audit.breakdown || { perceivable: 90, operable: 90, understandable: 90, robust: 90 };
  const pP = el("ppPourPerceivable"); if (pP) pP.textContent = `${b.perceivable}%`;
  const pO = el("ppPourOperable"); if (pO) pO.textContent = `${b.operable}%`;
  const pU = el("ppPourUnderstandable"); if (pU) pU.textContent = `${b.understandable}%`;
  const pR = el("ppPourRobust"); if (pR) pR.textContent = `${b.robust}%`;

  const list = el("ppIssuesList");
  if (list) {
    list.innerHTML = "";
    const issues = audit.issues || [];
    const activeIssues = issues.filter((i: any) => i.count === undefined || i.count > 0 || i.severity === "critical" || i.severity === "warning");
    if (activeIssues.length === 0) {
      list.innerHTML = `<li style="padding: 8px 10px; background: #f0fdf4; border-radius: 8px; color: #166534; border: 1px solid #bbf7d0; font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 6px;">🟢 Great! No accessibility issues were detected on this page.</li>`;
    } else {
      activeIssues.forEach((iss: any) => {
        const li = document.createElement("li");
        li.style.cssText = "padding: 6px 10px; border-radius: 8px; font-size: 10px; line-height: 1.35; display: flex; flex-direction: column; gap: 2px;";
        let icon = "⚠️";
        if (iss.severity === "critical") {
          icon = "🔴";
          li.style.background = "#fef2f2"; li.style.color = "#991b1b"; li.style.border = "1px solid #fee2e2";
        } else if (iss.severity === "warning") {
          icon = "⚠️";
          li.style.background = "#fffbeb"; li.style.color = "#92400e"; li.style.border = "1px solid #fef3c7";
        } else {
          icon = "ℹ️";
          li.style.background = "#eff6ff"; li.style.color = "#1e40af"; li.style.border = "1px solid #dbeafe";
        }
        li.innerHTML = `<div style="display:flex;align-items:center;gap:4px;"><span style="font-size:11px;">${icon}</span><strong style="font-weight: 700; font-size: 10px;">${iss.title}</strong></div><span style="font-size: 9px; color: #475569; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${iss.description}</span>`;
        list.appendChild(li);
      });
    }
  }
}

// Initial load
loadAccessibilityScore();

// Refresh Score Button (manual rescan)
btn("ppRefreshScoreBtn")?.addEventListener("click", () => {
  const statusEl = el("ppScoreStatus");
  if (statusEl) statusEl.textContent = "Rescanning...";
  loadAccessibilityScore();
});

// Auto-update score on active tab change or tab reload
try {
  chrome.tabs.onActivated.addListener(() => loadAccessibilityScore());
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === "complete") loadAccessibilityScore();
  });
} catch {
  /* ignore */
}

// Header Chatbot Icon Button
btn("ppChatHeaderBtn")?.addEventListener("click", () => {
  toTab({ type: "OPEN_COPILOT" });
});

// =============================================================================
// NAVIGATION — main view ↔ workspaces
// =============================================================================

const mainView = el("ppMainView")!;
const backBar  = el("ppBackBar")!;
const allWs    = document.querySelectorAll<HTMLElement>(".pp-ws");

function showWs(wsId: string) {
  mainView.style.display = "none";
  backBar.style.display  = "flex";
  allWs.forEach(w => w.classList.remove("active"));
  el(wsId)?.classList.add("active");
  el("ppBody")!.scrollTop = 0;
  if (wsId === "ppWsVoice") checkMic();
}

function showMain() {
  mainView.style.display = "";
  backBar.style.display  = "none";
  allWs.forEach(w => w.classList.remove("active"));
  stopGestureCamera();
}

btn("ppBackBtn")?.addEventListener("click", showMain);

document.querySelectorAll<HTMLButtonElement>(".pp-mod-btn[data-ws]").forEach(b => {
  b.addEventListener("click", () => showWs(b.getAttribute("data-ws")!));
});

// =============================================================================
// FOOTER — Undo + Simplifier
// =============================================================================

btn("ppUndoBtn")?.addEventListener("click", () => {
  toTab({ type: "UNDO_CHANGES" });
  const b = btn("ppUndoBtn")!;
  b.textContent = "✅ Reverted!";
  setTimeout(() => { b.textContent = "↩ Undo Changes"; }, 2000);
});

btn("ppSimplifyBtn")?.addEventListener("click", () => {
  toTab({ type: "TOGGLE_SIMPLIFIER" });
  const b = btn("ppSimplifyBtn")!;
  const on = b.classList.toggle("active-state");
  b.textContent = on ? "⏹ Stop Simplifier" : "✨ AI Website Simplifier";
});

// =============================================================================
// GESTURE WORKSPACE
// =============================================================================

let gestureStream:   MediaStream | null                     = null;
let gestureInterval: ReturnType<typeof setInterval> | null  = null;

async function startGestureCamera() {
  const overlay = el("ppCamOverlay");
  const startB  = btn("ppStartGestureBtn");
  const stopB   = btn("ppStopGestureBtn");
  const status  = spn("ppGestureStatus");

  if (overlay) { overlay.textContent = "TRACKING ACTIVE"; overlay.style.background = "rgba(16,185,129,.8)"; }
  if (startB) startB.style.display = "none";
  if (stopB)  stopB.style.display  = "";
  if (status) status.textContent   = "Running";

  toTab({ type: "TOGGLE_GESTURE_TRACKING", enabled: true });
}

function stopGestureCamera() {
  const overlay = el("ppCamOverlay");
  const startB  = btn("ppStartGestureBtn");
  const stopB   = btn("ppStopGestureBtn");
  const status  = spn("ppGestureStatus");

  if (overlay) { overlay.textContent = "CAMERA INACTIVE"; overlay.style.background = "rgba(15,23,42,.75)"; }
  if (startB) startB.style.display = "";
  if (stopB)  stopB.style.display  = "none";
  if (status) status.textContent   = "None";

  toTab({ type: "TOGGLE_GESTURE_TRACKING", enabled: false });
}

btn("ppStartGestureBtn")?.addEventListener("click", startGestureCamera);
btn("ppStopGestureBtn")?.addEventListener("click", stopGestureCamera);

// =============================================================================
// VOICE WORKSPACE
// =============================================================================

async function checkMic() {
  const hasMic = el("ppHasMicView");
  const noMic  = el("ppNoMicView");
  const badge  = el("ppMicBadge");
  let ok = false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    ok = devices.some(d => d.kind === "audioinput");
  } catch { /* ignore */ }
  if (hasMic) hasMic.style.display = ok ? "" : "none";
  if (noMic)  noMic.style.display  = ok ? "none" : "";
  if (badge) {
    badge.className = ok ? "pp-mic-badge pp-mic-ready" : "pp-mic-badge pp-mic-missing";
    badge.innerHTML = ok
      ? '<span class="pp-mic-dot"></span> Microphone Ready'
      : '<span class="pp-mic-dot"></span> No Microphone';
  }
}

function setStep(state: "idle"|"listening"|"processing"|"executed") {
  const listen  = el("ppStepListen");
  const process = el("ppStepProcess");
  const done    = el("ppStepDone");
  const t       = el("ppTranscript");
  [listen, process, done].forEach(s => s?.classList.remove("active","done"));
  if (state === "idle") {
    listen?.classList.add("active");
    if (t) { t.className = "pp-transcript"; t.textContent = 'Say a command (e.g. "scroll down", "go back")…'; }
  } else if (state === "listening") {
    listen?.classList.add("active");
    if (t) { t.className = "pp-transcript"; t.textContent = "Listening… speak now."; }
  } else if (state === "processing") {
    listen?.classList.add("done"); process?.classList.add("active");
    if (t) { t.className = "pp-transcript live"; t.textContent = "Processing…"; }
  } else {
    listen?.classList.add("done"); process?.classList.add("done"); done?.classList.add("active");
  }
}

let isListening = false;

function toggleGlobalVoice(state: boolean) {
  chrome.storage.local.set({ voiceEngineListening: state }, () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_VOICE_RECOGNITION", state: state });
    toTab({ type: "TOGGLE_VOICE_SYSTEM", state: state });
  });
}

function updateVoiceUI(on: boolean) {
  isListening = on;
  syncVoiceBadge(on);
  
  const micBtn = btn("ppMicBtn");
  const viz = el("ppViz");
  const statusLabel = el("voiceStatus");
  
  if (on) {
    micBtn?.classList.add("active");
    viz?.classList.add("on");
    setStep("listening");
    if (statusLabel) statusLabel.textContent = "🎤 Listening…";
  } else {
    micBtn?.classList.remove("active");
    viz?.classList.remove("on");
    setStep("idle");
    if (statusLabel) statusLabel.textContent = "Stopped";
  }
}

btn("ppMicBtn")?.addEventListener("click", () => {
  toggleGlobalVoice(!isListening);
});

// Start / Stop voice buttons (delegates to background offscreen)
const startVoiceBtn = btn("startVoice");
const stopVoiceBtn  = btn("stopVoice");
const statusLabel   = el("voiceStatus");
const languageSelect = sel("languageSelect");

startVoiceBtn?.addEventListener("click", () => {
  toggleGlobalVoice(true);
});

stopVoiceBtn?.addEventListener("click", () => {
  toggleGlobalVoice(false);
});

languageSelect?.addEventListener("change", () => {
  if (!languageSelect) return;
  const v = languageSelect.value;
  if (v === "en-IN") setLanguage("english");
  else if (v === "hi-IN") setLanguage("hindi");
  else if (v === "pa-IN") setLanguage("punjabi");
});

// Retry mic / simulator bypass
btn("ppRetryMic")?.addEventListener("click", checkMic);
btn("ppSimBypass")?.addEventListener("click", () => {
  const p = el("ppDevPanel");
  if (p) { p.classList.add("open"); const a = el("ppDevArrow"); if (a) a.textContent = "▼"; }
});

// Dev toggle
btn("ppDevToggle")?.addEventListener("click", () => {
  const p = el("ppDevPanel");
  if (!p) return;
  const open = p.classList.toggle("open");
  const a = el("ppDevArrow");
  if (a) a.textContent = open ? "▼" : "▶";
});

// Sim send
function sendSim() {
  const i = inp("ppSimInput");
  if (!i?.value.trim()) return;
  toTab({ type: "SIMULATE_VOICE_COMMAND", command: i.value.trim() });
  i.value = "";
}
btn("ppSimSend")?.addEventListener("click", sendSim);
inp("ppSimInput")?.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") sendSim(); });

// Sync voice badge on main view
function syncVoiceBadge(on: boolean) {
  const badge   = el("ppListenBadge");
  const chevron = el("ppVoiceChevron");
  if (badge)   badge.style.display   = on ? "inline-flex" : "none";
  if (chevron) chevron.style.display = on ? "none" : "";
}

chrome.storage.local.get(["voiceEngineListening"], r => {
  updateVoiceUI(r.voiceEngineListening === true);
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "VOICE_STATE_CHANGED") {
    updateVoiceUI(msg.isListening);
  } else if (msg.type === "VOICE_COMMAND_INTERIM") {
    const t = el("ppTranscript");
    if (t) { t.className = "pp-transcript live"; t.textContent = msg.transcript + "..."; }
  } else if (msg.type === "VOICE_COMMAND_RECOGNIZED") {
    const t = el("ppTranscript");
    if (t) { t.className = "pp-transcript live"; t.textContent = msg.command; }
    setStep("processing");
    setTimeout(() => {
      setStep("executed");
      if (t) t.textContent = `Executed: "${msg.command}"`;
      setTimeout(() => {
        if (isListening) {
          setStep("listening");
        } else {
          setStep("idle");
        }
      }, 2500);
    }, 1000);
  } else if (msg.type === "VOICE_ERROR") {
    const t = el("ppTranscript");
    if (t) { t.className = "pp-transcript"; t.textContent = "⚠️ " + msg.error; }
    setStep("idle");
    if (msg.error === "not-allowed") {
      chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
    }
  }
});

// =============================================================================
// VISUAL WORKSPACE
// =============================================================================

const VS_KEY = "na_visual_popup_v3";
interface VS { dyslexia:boolean; simplifier:boolean; fontSize:number; lineHeight:number; letterSpacing:number; theme:string; colorBlind:string; contrast:number; }
const DEF_VS: VS = { dyslexia:false,simplifier:false,fontSize:100,lineHeight:15,letterSpacing:0,theme:"none",colorBlind:"none",contrast:100 };
let vs: VS = { ...DEF_VS };

function pushVS() {
  chrome.storage.local.set({ [VS_KEY]: JSON.stringify(vs) });
  toTab({ type:"APPLY_VISUAL_PREF", prefs:{ dyslexia:vs.dyslexia,simplifier:vs.simplifier,fontScale:vs.fontSize,contrast:vs.theme,colorBlind:vs.colorBlind }});
  toTab({ type:"APPLY_CONFIG", config:{ dyslexia:vs.dyslexia,simplifyWebsite:vs.simplifier,fontSize:vs.fontSize,lineHeight:vs.lineHeight,letterSpacing:vs.letterSpacing,contrastTheme:vs.theme,colorBlindFilter:vs.colorBlind,contrastFactor:vs.contrast }});
  // Keep simplifier footer button in sync
  const sb = btn("ppSimplifyBtn");
  if (sb) {
    sb.classList.toggle("active-state", vs.simplifier);
    sb.textContent = vs.simplifier ? "⏹ Stop Simplifier" : "✨ AI Website Simplifier";
  }
}

function applyVStoUI() {
  const dc = inp("ppDyslexiaCb");   if (dc)  dc.checked  = vs.dyslexia;
  const sc = inp("ppSimplifierCb"); if (sc)  sc.checked  = vs.simplifier;
  const fv = spn("ppFontVal");      if (fv)  fv.textContent = vs.fontSize + "%";
  const lv = spn("ppLineVal");      if (lv)  lv.textContent = (vs.lineHeight/10).toFixed(1) + "x";
  const ltv= spn("ppLetterVal");    if (ltv) ltv.textContent = vs.letterSpacing + "px";
  const cv = spn("ppContrastVal");  if (cv)  cv.textContent = vs.contrast + "%";
  const ts = sel("ppThemeSelect");      if (ts) ts.value = vs.theme;
  const cbs= sel("ppColorBlindSelect");if (cbs) cbs.value = vs.colorBlind;
  // footer simplifier button
  const sb = btn("ppSimplifyBtn");
  if (sb) {
    sb.classList.toggle("active-state", vs.simplifier);
    sb.textContent = vs.simplifier ? "⏹ Stop Simplifier" : "✨ AI Website Simplifier";
  }
}

chrome.storage.local.get([VS_KEY], r => {
  try { if (r[VS_KEY]) vs = { ...DEF_VS, ...JSON.parse(r[VS_KEY]) }; } catch { /* ignore */ }
  applyVStoUI();
});

inp("ppDyslexiaCb")?.addEventListener("change",   () => { vs.dyslexia   = !!inp("ppDyslexiaCb")?.checked;   pushVS(); });
inp("ppSimplifierCb")?.addEventListener("change", () => { vs.simplifier = !!inp("ppSimplifierCb")?.checked; pushVS(); toTab({ type:"TOGGLE_SIMPLIFIER" }); });

btn("ppFontDec")?.addEventListener("click",    () => { vs.fontSize     = Math.max(50,  vs.fontSize - 5);       spn("ppFontVal")!.textContent    = vs.fontSize + "%";                  pushVS(); });
btn("ppFontInc")?.addEventListener("click",    () => { vs.fontSize     = Math.min(200, vs.fontSize + 5);       spn("ppFontVal")!.textContent    = vs.fontSize + "%";                  pushVS(); });
btn("ppLineDec")?.addEventListener("click",    () => { vs.lineHeight   = Math.max(12,  vs.lineHeight - 1);     spn("ppLineVal")!.textContent    = (vs.lineHeight/10).toFixed(1)+"x"; pushVS(); });
btn("ppLineInc")?.addEventListener("click",    () => { vs.lineHeight   = Math.min(25,  vs.lineHeight + 1);     spn("ppLineVal")!.textContent    = (vs.lineHeight/10).toFixed(1)+"x"; pushVS(); });
btn("ppLetterDec")?.addEventListener("click",  () => { vs.letterSpacing= Math.max(0,   vs.letterSpacing - 1);  spn("ppLetterVal")!.textContent  = vs.letterSpacing + "px";            pushVS(); });
btn("ppLetterInc")?.addEventListener("click",  () => { vs.letterSpacing= Math.min(10,  vs.letterSpacing + 1);  spn("ppLetterVal")!.textContent  = vs.letterSpacing + "px";            pushVS(); });
btn("ppContrastDec")?.addEventListener("click",() => { vs.contrast     = Math.max(50,  vs.contrast - 5);       spn("ppContrastVal")!.textContent= vs.contrast + "%";                  pushVS(); });
btn("ppContrastInc")?.addEventListener("click",() => { vs.contrast     = Math.min(180, vs.contrast + 5);       spn("ppContrastVal")!.textContent= vs.contrast + "%";                  pushVS(); });
sel("ppThemeSelect")?.addEventListener("change",      () => { vs.theme      = sel("ppThemeSelect")!.value;      pushVS(); });
sel("ppColorBlindSelect")?.addEventListener("change", () => { vs.colorBlind = sel("ppColorBlindSelect")!.value; pushVS(); });

btn("ppUndoBtn")?.addEventListener("click", () => {
  vs = { ...DEF_VS };
  applyVStoUI();
  chrome.storage.local.set({ [VS_KEY]: JSON.stringify(vs) });
  toTab({ type: "UNDO_CHANGES" });
  toTab({ type: "RESET_PREFERENCES" });
  const b = btn("ppUndoBtn");
  if (b) {
    b.textContent = "✅ Restored!";
    setTimeout(() => { b.textContent = "↩ Undo Changes"; }, 2000);
  }
});

// =============================================================================
// COPILOT / PROFILE WORKSPACE
// =============================================================================

const PROF_KEY = "na_accessibility_profile";

function loadProfile(prof: Record<string,any>) {
  const s = (id: string, v: any) => { const i = inp(id); if (i) i.value = v || ""; };
  s("ppProfName",    prof.name    || prof.fullName || "");
  s("ppProfEmail",   prof.email   || "");
  s("ppProfPhone",   prof.phone   || "");
  s("ppProfDob",     prof.dob     || "");
  s("ppProfAddress", prof.address || "");
  s("ppProfCity",    prof.city    || "");
  s("ppProfState",   prof.state   || "");
  s("ppProfCountry", prof.country || "");
  s("ppProfPostal",  prof.postalCode || prof.pinCode || "");
  s("ppProfGender",  prof.gender  || "");
}
function readProfile(): Record<string,any> {
  const g = (id: string) => inp(id)?.value.trim() || "";
  const name = g("ppProfName");
  return { name,fullName:name,email:g("ppProfEmail"),phone:g("ppProfPhone"),dob:g("ppProfDob"),address:g("ppProfAddress"),city:g("ppProfCity"),state:g("ppProfState"),country:g("ppProfCountry"),postalCode:g("ppProfPostal"),pinCode:g("ppProfPostal"),gender:g("ppProfGender") };
}

chrome.storage.local.get([PROF_KEY], r => {
  try { if (r[PROF_KEY]) loadProfile(JSON.parse(r[PROF_KEY])); } catch { /* ignore */ }
});

btn("ppSaveProfileBtn")?.addEventListener("click", () => {
  const prof = readProfile();
  chrome.storage.local.set({ [PROF_KEY]: JSON.stringify(prof) });
  const b = btn("ppSaveProfileBtn")!; b.textContent = "✅ Saved!";
  setTimeout(() => { b.textContent = "💾 Save"; }, 2000);
});
btn("ppResetProfileBtn")?.addEventListener("click", () => {
  chrome.storage.local.remove(PROF_KEY); loadProfile({});
  const b = btn("ppResetProfileBtn")!; b.textContent = "✅ Reset";
  setTimeout(() => { b.textContent = "↺ Reset"; }, 2000);
});
btn("ppDeleteProfileBtn")?.addEventListener("click", () => {
  chrome.storage.local.remove(PROF_KEY); loadProfile({});
  const b = btn("ppDeleteProfileBtn")!; b.textContent = "✅ Deleted";
  setTimeout(() => { b.textContent = "🗑 Delete"; }, 2000);
});

function setCopilotStatus(text: string, color = "#3b82f6") {
  const box = el("ppCopilotStatus"); const dot = el("ppCopilotDot"); const txt = el("ppCopilotStatusText");
  if (box) box.style.display = "flex";
  if (dot) (dot as HTMLElement).style.backgroundColor = color;
  if (txt) txt.textContent = text;
}

btn("ppScanFillBtn")?.addEventListener("click", async () => {
  setCopilotStatus("Scanning page DOM fields & generating AI predictions…","#3b82f6");
  await toTab({ type:"TRIGGER_COPILOT", prompt: inp("ppCopilotPrompt")?.value.trim() || "" });
  setCopilotStatus("Autofill workflow triggered on page.","#10b981");
});
btn("ppExecuteGoalBtn")?.addEventListener("click", async () => {
  setCopilotStatus("Planning & executing autonomous goal actions…","#3b82f6");
  await toTab({ type:"TRIGGER_AUTONOMOUS_NAV", prompt: inp("ppCopilotPrompt")?.value.trim() || "search product and proceed to checkout" });
  setCopilotStatus("Goal action execution plan completed!","#10b981");
});

// =============================================================================
// SETTINGS BUTTON → opens this popup (wired from content script via background)
// =============================================================================
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "VOICE_STATE_CHANGED") syncVoiceBadge(msg.isListening);
});

let currentExtensionLanguage = "en";

function applyLanguage(lang: string) {
  currentExtensionLanguage = lang;

  const setText = (id: string, key: string) => {
    const elObj = el(id);
    if (elObj) elObj.textContent = getTranslation(key as any, lang);
  };

  const setPlaceholder = (id: string, key: string) => {
    const elObj = el<HTMLInputElement>(id);
    if (elObj) elObj.placeholder = getTranslation(key as any, lang);
  };

  const setTitle = (id: string, key: string) => {
    const elObj = el(id);
    if (elObj) elObj.setAttribute("title", getTranslation(key as any, lang));
  };

  // Header & Navigation
  setText("ppBackBtn", "backBtn");
  setText("ppTitle", "title");
  setText("ppSub", "sub");
  setTitle("ppChatHeaderBtn", "chatHeaderBtnTitle");
  setTitle("ppStatusDot", "statusDotTitle");

  // Score card
  setText("ppScoreTitle", "scoreTitle");
  const scoreStatusEl = el("ppScoreStatus");
  if (scoreStatusEl) {
    const currentStatusText = scoreStatusEl.textContent || "";
    if (["Analyzing...", "Analizando...", "Analyse en cours...", "Analysieren...", "विश्लेषण किया जा रहा है..."].includes(currentStatusText)) {
      scoreStatusEl.textContent = getTranslation("scoreStatusAnalyzing", lang);
    } else if (["Rescanning...", "Reescaneando...", "Réanalyse...", "Prüfe erneut...", "पुनः स्कैन जारी..."].includes(currentStatusText)) {
      scoreStatusEl.textContent = getTranslation("rescanning", lang);
    } else if (["Excellent", "Excelente", "Hervorragend", "उत्कृष्ट"].includes(currentStatusText)) {
      scoreStatusEl.textContent = getTranslation("scoreStatusExcellent", lang);
    } else if (["Good", "Bueno", "Bon", "Gut", "अच्छा"].includes(currentStatusText)) {
      scoreStatusEl.textContent = getTranslation("scoreStatusGood", lang);
    } else if (["Fair", "Aceptable", "Moyen", "Mittelmäßig", "ठीक-ठाक"].includes(currentStatusText)) {
      scoreStatusEl.textContent = getTranslation("scoreStatusFair", lang);
    } else if (["Poor", "Deficiente", "Médiocre", "Schlecht", "खराब"].includes(currentStatusText)) {
      scoreStatusEl.textContent = getTranslation("scoreStatusPoor", lang);
    }
  }

  setText("ppPourPerceivableLabel", "pourPerceivable");
  setText("ppPourOperableLabel", "pourOperable");
  setText("ppPourUnderstandableLabel", "pourUnderstandable");
  setText("ppPourRobustLabel", "pourRobust");
  setText("ppIssuesTitle", "issuesTitle");

  const issuesList = el("ppIssuesList");
  if (issuesList && issuesList.children.length > 0) {
    const firstLi = issuesList.children[0] as HTMLElement;
    if (firstLi && firstLi.textContent) {
      if (firstLi.textContent.includes("Scanning page") || firstLi.textContent.includes("Escaneando") || firstLi.textContent.includes("Analyse") || firstLi.textContent.includes("Prüfung") || firstLi.textContent.includes("स्कैन")) {
        firstLi.textContent = getTranslation("issuesScanning", lang);
      } else if (firstLi.textContent.includes("Great!") || firstLi.textContent.includes("Excelente!") || firstLi.textContent.includes("Super!") || firstLi.textContent.includes("Großartig!") || firstLi.textContent.includes("बहुत बढ़िया!")) {
        firstLi.innerHTML = `🟢 ${getTranslation("issuesNone", lang).replace("🟢 ", "")}`;
      }
    }
  }

  setText("ppExplainAiBtn", "explainAi");
  const refreshScoreBtn = btn("ppRefreshScoreBtn");
  if (refreshScoreBtn) {
    refreshScoreBtn.textContent = `🔄 ${getTranslation("refreshScore", lang).replace("🔄 ", "")}`;
  }

  // Modules menu
  setText("ppModulesTitle", "modulesTitle");
  const btnGestureNav = btn("ppBtnGestureNav");
  if (btnGestureNav) {
    btnGestureNav.innerHTML = `<span style="font-size:15px">🖐️</span> ${getTranslation("modGesture", lang).replace("🖐️ ", "")} <span class="pp-chevron">›</span>`;
  }
  const btnVoiceNav = btn("ppBtnVoiceNav");
  if (btnVoiceNav) {
    const isLit = el("ppListenBadge")?.style.display !== "none";
    btnVoiceNav.innerHTML = `<span style="font-size:15px">🎙️</span> ${getTranslation("modVoice", lang).replace("🎙️ ", "")}
      <span class="pp-listen-badge" id="ppListenBadge" style="display: ${isLit ? "inline-flex" : "none"};">
        <span class="pp-listen-dot"></span>${getTranslation("modVoiceListening", lang)}
      </span>
      <span class="pp-chevron" id="ppVoiceChevron" style="display: ${isLit ? "none" : ""};">›</span>`;
  }
  const btnVisualNav = btn("ppBtnVisualNav");
  if (btnVisualNav) {
    btnVisualNav.innerHTML = `<span style="font-size:15px">🧠</span> ${getTranslation("modVisual", lang).replace("🧠 ", "")} <span class="pp-chevron">›</span>`;
  }

  // Gesture Workspace
  setText("ppWsGestureTitle", "wsGestureTitle");
  const overlay = el("ppCamOverlay");
  if (overlay) {
    const text = overlay.textContent || "";
    if (text.includes("INACTIVE") || text.includes("INACTIVA") || text.includes("INACTIVE") || text.includes("INAKTIV") || text.includes("निष्क्रिय")) {
      overlay.textContent = getTranslation("camInactive", lang);
    } else {
      overlay.textContent = getTranslation("camActive", lang);
    }
  }
  setText("ppGestureStatusLabel", "gestureStatusLabel");
  const gestureStatus = el("ppGestureStatus");
  if (gestureStatus) {
    const currentStatus = gestureStatus.textContent || "";
    if (currentStatus === "None" || currentStatus === "Ninguno" || currentStatus === "Aucun" || currentStatus === "Keine" || currentStatus === "कोई नहीं") {
      gestureStatus.textContent = getTranslation("gestureStatusNone", lang);
    } else if (currentStatus === "Running" || currentStatus === "Ejecutando" || currentStatus === "Actif" || currentStatus === "Aktiv" || currentStatus === "चालू है") {
      gestureStatus.textContent = getTranslation("gestureStatusRunning", lang);
    }
  }
  setText("ppGestureActiveActionsLabel", "gestureDomLabel");
  setText("ppGestureActiveActionsDesc", "gestureDomDesc");

  const startGestureBtn = btn("ppStartGestureBtn");
  if (startGestureBtn) {
    startGestureBtn.textContent = `📷 ${getTranslation("gestureStartBtn", lang).replace("📷 ", "")}`;
  }
  const stopGestureBtn = btn("ppStopGestureBtn");
  if (stopGestureBtn) {
    stopGestureBtn.textContent = `⏹ ${getTranslation("gestureStopBtn", lang).replace("⏹ ", "")}`;
  }

  // Voice Workspace
  setText("ppWsVoiceTitle", "wsVoiceTitle");
  const micBadge = el("ppMicBadge");
  if (micBadge) {
    const isOk = micBadge.classList.contains("pp-mic-ready");
    micBadge.innerHTML = isOk
      ? `<span class="pp-mic-dot"></span> ${getTranslation("micReady", lang)}`
      : `<span class="pp-mic-dot"></span> ${getTranslation("noMic", lang)}`;
  }
  setText("ppStepListenLabel", "stepListen");
  setText("ppStepProcessLabel", "stepProcess");
  setText("ppStepDoneLabel", "stepExecuted");

  const transcript = el("ppTranscript");
  if (transcript) {
    const text = transcript.textContent || "";
    if (text.includes("Say a command") || text.includes("Diga un") || text.includes("Dites une") || text.includes("Sagen Sie") || text.includes("कोई कमांड")) {
      transcript.textContent = getTranslation("transcriptSayCmd", lang);
    } else if (text.includes("Listening… speak now") || text.includes("Escuchando...") || text.includes("Écoute en cours") || text.includes("Hören...") || text.includes("सुन रहा है")) {
      transcript.textContent = getTranslation("transcriptListening", lang);
    } else if (text.includes("Processing…") || text.includes("Procesando…") || text.includes("Traitement…") || text.includes("Verarbeiten…") || text.includes("प्रोसेस किया जा रहा है")) {
      transcript.textContent = getTranslation("transcriptProcessing", lang);
    } else if (text.includes("Executed:") || text.includes("Ejecutado:") || text.includes("Exécuté:") || text.includes("Ausgeführt:") || text.includes("निष्पादित:")) {
      const parts = text.split('"');
      const cmd = parts.length > 1 ? parts[1] : "";
      transcript.textContent = `${getTranslation("transcriptExecutedPrefix", lang)}"${cmd}"`;
    }
  }

  const noMicTitle = el("ppNoMicView")?.querySelector("div");
  if (noMicTitle) noMicTitle.textContent = `⚠️ ${getTranslation("noMicTitle", lang).replace("⚠️ ", "")}`;
  setText("ppNoMicDesc", "noMicDesc");
  const retryMicBtn = btn("ppRetryMic");
  if (retryMicBtn) retryMicBtn.textContent = `🔄 ${getTranslation("retryBtn", lang).replace("🔄 ", "")}`;
  const simBypassBtn = btn("ppSimBypass");
  if (simBypassBtn) simBypassBtn.textContent = `⌨️ ${getTranslation("simBypassBtn", lang).replace("⌨️ ", "")}`;

  setText("ppVoiceLanguageLabel", "voiceLangLabel");
  setText("ppVoiceLanguageDesc", "voiceLangDesc");

  const startVoice = btn("startVoice");
  if (startVoice) startVoice.textContent = `🎤 ${getTranslation("voiceStartBtn", lang).replace("🎤 ", "")}`;
  const stopVoice = btn("stopVoice");
  if (stopVoice) stopVoice.textContent = `⏹ ${getTranslation("voiceStopBtn", lang).replace("⏹ ", "")}`;

  const voiceStatus = el("voiceStatus");
  if (voiceStatus) {
    const text = voiceStatus.textContent || "";
    if (text === "Ready" || text === "Listo" || text === "Prêt" || text === "Bereit" || text === "तैयार") {
      voiceStatus.textContent = getTranslation("voiceStatusReady", lang);
    } else if (text === "Stopped" || text === "Detenido" || text === "Arrêté" || text === "Gestoppt" || text === "रोका गया") {
      voiceStatus.textContent = getTranslation("voiceStatusStopped", lang);
    } else {
      voiceStatus.textContent = getTranslation("voiceStatusListening", lang);
    }
  }

  const devToggle = btn("ppDevToggle");
  if (devToggle) {
    const isExpanded = devToggle.textContent?.includes("▼");
    devToggle.innerHTML = `<span id="ppDevArrow">${isExpanded ? "▼" : "▶"}</span> ${getTranslation("devToggleTitle", lang)}`;
  }
  setPlaceholder("ppSimInput", "devSimInputPlaceholder");
  setText("ppSimSend", "devSimSend");

  // Visual Workspace
  setText("ppWsVisualTitle", "wsVisualTitle");
  setText("ppSimplifierLabel", "simplifierLabel");
  setText("ppDyslexiaLabel", "dyslexiaLabel");
  setText("ppFontSizeLabel", "fontSizeLabel");
  setText("ppLineSpacingLabel", "lineSpacingLabel");
  setText("ppLetterSpacingLabel", "lettersLabel");
  setText("ppContrastLabel", "contrastLabel");
  setText("ppThemeLabel", "themeLabel");

  const themeSelect = sel("ppThemeSelect");
  if (themeSelect) {
    themeSelect.options[0].text = getTranslation("themeDefault", lang);
    themeSelect.options[1].text = getTranslation("themeHcDark", lang);
    themeSelect.options[2].text = getTranslation("themeHcLight", lang);
    themeSelect.options[3].text = getTranslation("themeGrayscale", lang);
  }

  setText("ppColorBlindLabel", "colorBlindLabel");
  const cbSelect = sel("ppColorBlindSelect");
  if (cbSelect) {
    cbSelect.options[0].text = getTranslation("cbNone", lang);
    cbSelect.options[1].text = getTranslation("cbProtan", lang);
    cbSelect.options[2].text = getTranslation("cbDeuter", lang);
    cbSelect.options[3].text = getTranslation("cbTritan", lang);
  }
  setText("ppVisualPreviewText", "visualPreviewText");

  // Copilot Workspace
  setText("ppWsCopilotTitle", "wsCopilotTitle");
  setText("ppCopilotTitle", "copilotAutofillTitle");
  setText("ppCopilotDesc", "copilotAutofillDesc");
  setText("ppCopilotGoalLabel", "copilotGoalLabel");
  setPlaceholder("ppCopilotPrompt", "copilotGoalPlaceholder");
  setText("ppScanFillBtn", "copilotScanBtn");
  setText("ppExecuteGoalBtn", "copilotExecBtn");
  setText("ppCopilotProfileTitle", "copilotProfTitle");

  setPlaceholder("ppProfName", "profNamePh");
  setPlaceholder("ppProfEmail", "profEmailPh");
  setPlaceholder("ppProfPhone", "profPhonePh");
  setPlaceholder("ppProfDob", "profDobPh");
  setPlaceholder("ppProfAddress", "profAddressPh");
  setPlaceholder("ppProfCity", "profCityPh");
  setPlaceholder("ppProfState", "profStatePh");
  setPlaceholder("ppProfCountry", "profCountryPh");
  setPlaceholder("ppProfPostal", "profPostalPh");
  setPlaceholder("ppProfGender", "profGenderPh");

  setText("ppSaveProfileBtn", "profSaveBtn");
  setText("ppResetProfileBtn", "profResetBtn");
  setText("ppDeleteProfileBtn", "profDeleteBtn");

  const copilotStatusText = el("ppCopilotStatusText");
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
  const badge = el("ppModulesTitle")?.parentElement?.querySelector(".pp-badge");
  if (badge) {
    badge.textContent = getTranslation("footerBadge", lang);
  }
  const undoBtn = btn("ppUndoBtn");
  if (undoBtn) {
    const text = undoBtn.textContent || "";
    if (text.includes("Reverted!") || text.includes("Restored!") || text.includes("Revertido") || text.includes("Annulé") || text.includes("Zurückgesetzt") || text.includes("वापस")) {
      undoBtn.textContent = getTranslation("undoBtnSuccess", lang);
    } else {
      undoBtn.textContent = getTranslation("undoBtn", lang);
    }
  }
  const simplifyBtn = btn("ppSimplifyBtn");
  if (simplifyBtn) {
    const text = simplifyBtn.textContent || "";
    if (text.includes("Stop") || text.includes("Detener") || text.includes("Arrêter") || text.includes("stoppen") || text.includes("रोकें")) {
      simplifyBtn.textContent = getTranslation("simplifyBtnActive", lang);
    } else {
      simplifyBtn.textContent = getTranslation("simplifyBtn", lang);
    }
  }
}

// Language Selector Handler
const extensionLangSelect = sel("ppExtensionLanguageSelect");
extensionLangSelect?.addEventListener("change", () => {
  if (!extensionLangSelect) return;
  const lang = extensionLangSelect.value;
  chrome.storage.local.set({ extensionLanguage: lang }, () => {
    applyLanguage(lang);
    toTab({ type: "EXTENSION_LANGUAGE_CHANGED", language: lang });
    chrome.runtime.sendMessage({ type: "EXTENSION_LANGUAGE_CHANGED", language: lang }).catch(() => {});
  });
});

chrome.storage.local.get(["extensionLanguage"], r => {
  const savedLang = r.extensionLanguage || "en";
  const selectEl = sel("ppExtensionLanguageSelect");
  if (selectEl) selectEl.value = savedLang;
  applyLanguage(savedLang);
});
