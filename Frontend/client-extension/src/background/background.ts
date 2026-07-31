chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 Neuro-Assist Frontend Extension Successfully Installed & Ready.");
});

let creating: Promise<void> | null = null;
let isVoiceEnabled = false;

async function setupOffscreenDocument(path: string) {
  console.log("DEBUG [background.ts] setupOffscreenDocument called with path:", path);
  if (chrome.runtime.getContexts) {
    const existingContexts = await (chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as any]
    }) as any);
    console.log("DEBUG [background.ts] setupOffscreenDocument: existing contexts found:", existingContexts.length);
    if (existingContexts.length > 0) {
      return;
    }
  }

  if (creating) {
    console.log("DEBUG [background.ts] setupOffscreenDocument: already creating offscreen document, awaiting...");
    await creating;
  } else {
    console.log("DEBUG [background.ts] setupOffscreenDocument: creating new offscreen document");
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Accessing microphone for voice commands"
    });
    await creating;
    creating = null;
    console.log("DEBUG [background.ts] setupOffscreenDocument: offscreen document created successfully");
  }
}

async function closeOffscreenDocument() {
  console.log("DEBUG [background.ts] closeOffscreenDocument called");
  if (chrome.runtime.getContexts) {
    const existingContexts = await (chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as any]
    }) as any);
    if (existingContexts.length === 0) {
      console.log("DEBUG [background.ts] closeOffscreenDocument: no existing offscreen contexts, returning");
      return;
    }
  }
  try {
    await chrome.offscreen.closeDocument();
    console.log("DEBUG [background.ts] closeOffscreenDocument: offscreen document closed successfully");
  } catch (e) {
    console.error("DEBUG [background.ts] closeOffscreenDocument error:", e);
  }
}

async function handleVoiceToggle(state: boolean, temporary: boolean = false) {
  console.log("DEBUG [background.ts] handleVoiceToggle called, state:", state, "temporary:", temporary);
  
  if (state) {
    // Perform pre-flight microphone permission check using the stored flag
    const result = await chrome.storage.local.get(["voiceMicPermissionGranted"]);
    const hasPermission = result.voiceMicPermissionGranted === true;
    console.log("DEBUG [background.ts] Microphone permission flag in storage:", hasPermission);
    
    if (!hasPermission) {
      console.log("DEBUG [background.ts] Permission flag false. Opening permission tab.");
      openPermissionTab();
      
      // Reset state so UI doesn't show listening when it's blocked/prompted
      chrome.storage.local.set({ voiceEngineListening: false }, () => {
        isVoiceEnabled = false;
        chrome.runtime.sendMessage({ type: "VOICE_STATE_CHANGED", isListening: false }).catch(() => {});
        forwardToActiveTab({ type: "VOICE_STATE_CHANGED", isListening: false });
      });
      return;
    }
  }

  // Broadcast state changes to all components
  chrome.runtime.sendMessage({ type: "VOICE_STATE_CHANGED", isListening: state }).catch(() => {});
  forwardToActiveTab({ type: "VOICE_STATE_CHANGED", isListening: state });

  if (state) {
    try {
      await setupOffscreenDocument("offscreen.html");
      console.log("DEBUG [background.ts] handleVoiceToggle: setup finished, sending START_RECOGNITION to offscreen");
      chrome.runtime.sendMessage({
        type: "START_RECOGNITION",
        target: "offscreen"
      });
    } catch (e) {
      console.error("Failed to setup offscreen document:", e);
    }
  } else {
    try {
      console.log("DEBUG [background.ts] handleVoiceToggle: sending STOP_RECOGNITION to offscreen");
      chrome.runtime.sendMessage({
        type: "STOP_RECOGNITION",
        target: "offscreen"
      });
      if (!temporary) {
        await closeOffscreenDocument();
      }
    } catch (e) {
      console.error("Failed to stop offscreen recognition:", e);
    }
  }
}

async function forwardToActiveTab(message: any) {
  console.log("DEBUG [background.ts] forwardToActiveTab called with message type:", message.type);
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("DEBUG [background.ts] forwardToActiveTab: active tabs queried:", tabs.length);
    if (tabs.length > 0 && tabs[0].id) {
      console.log("DEBUG [background.ts] forwardToActiveTab: sending message to tab ID:", tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, message).catch((e) => {
        console.error("DEBUG [background.ts] forwardToActiveTab: sendMessage rejected:", e);
      });
    } else {
      console.warn("DEBUG [background.ts] forwardToActiveTab: no active tab found to forward to");
    }
  } catch (e) {
    console.error("Error forwarding message to active tab:", e);
  }
}

function openPermissionTab() {
  console.log("DEBUG [background.ts] openPermissionTab called");
  chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
}

// Communication link with content and offscreen scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("DEBUG [background.ts] onMessage received type:", message.type, "from sender:", sender.id || "unknown");
  if (message.type === "CHECK_STATUS") {
    sendResponse({ status: "active", localOnly: true });
  } else if (message.type === "TOGGLE_VOICE_RECOGNITION") {
    console.log("DEBUG [background.ts] onMessage: TOGGLE_VOICE_RECOGNITION state:", message.state, "temporary:", message.temporary);
    isVoiceEnabled = message.state;
    handleVoiceToggle(message.state, message.temporary);
    sendResponse({ success: true });
  } else if (message.type === "VOICE_COMMAND_RECOGNIZED") {
    console.log("DEBUG [background.ts] onMessage: VOICE_COMMAND_RECOGNIZED command:", message.command);
    // Forward to the active web page content script
    forwardToActiveTab({ type: "VOICE_COMMAND_RECOGNIZED", command: message.command });
    chrome.runtime.sendMessage({ type: "VOICE_COMMAND_RECOGNIZED", command: message.command }).catch(() => {});
  } else if (message.type === "VOICE_COMMAND_INTERIM") {
    console.log("DEBUG [background.ts] onMessage: VOICE_COMMAND_INTERIM transcript:", message.transcript);
    // Forward interim speech results to the content script
    forwardToActiveTab({ type: "VOICE_COMMAND_INTERIM", transcript: message.transcript });
    chrome.runtime.sendMessage({ type: "VOICE_COMMAND_INTERIM", transcript: message.transcript }).catch(() => {});
  } else if (message.type === "VOICE_ERROR") {
    console.log("DEBUG [background.ts] onMessage: VOICE_ERROR:", message.error);
    chrome.runtime.sendMessage({ type: "VOICE_ERROR", error: message.error }).catch(() => {});
    if (message.error === "not-allowed") {
      chrome.storage.local.set({ voiceEngineListening: false, voiceMicPermissionGranted: false }, () => {
        isVoiceEnabled = false;
        closeOffscreenDocument().catch(() => {});
        forwardToActiveTab({ type: "VOICE_PERMISSION_DENIED" });
        openPermissionTab();
      });
    }
  } else if (message.type === "SPEAK") {
    console.log("DEBUG [background.ts] speaking via chrome.tts:", message.text, "lang:", message.lang);
    const wasListening = isVoiceEnabled;
    if (wasListening) {
      handleVoiceToggle(false, true);
    }
    chrome.tts.speak(message.text, {
      lang: message.lang || "en-IN",
      rate: 1.0,
      onEvent: (event) => {
        console.log("DEBUG [background.ts] tts event:", event.type);
        if (event.type === 'end' || event.type === 'error' || event.type === 'interrupted') {
          if (wasListening) {
            console.log("DEBUG [background.ts] tts finished, resuming voice engine");
            handleVoiceToggle(true, true);
          }
        }
      }
    });
  } else if (message.type === "VOICE_PERMISSION_GRANTED") {
    console.log("DEBUG [background.ts] onMessage: VOICE_PERMISSION_GRANTED");
    chrome.storage.local.set({ voiceEngineListening: true, voiceMicPermissionGranted: true }, () => {
      isVoiceEnabled = true;
      handleVoiceToggle(true, false);
      forwardToActiveTab({ type: "VOICE_PERMISSION_GRANTED" });
    });
  } else if (message.type === "CLOSE_ACTIVE_TAB") {
    console.log("DEBUG [background.ts] onMessage: CLOSE_ACTIVE_TAB");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.remove(tabs[0].id);
      }
    });
  } else if (message.type === "OPEN_MIC_SETTINGS") {
    console.log("DEBUG [background.ts] onMessage: OPEN_MIC_SETTINGS");
    chrome.tabs.create({ url: "chrome://settings/content/microphone" });
  } else if (message.type === "OPEN_SETTINGS_POPUP" || message.type === "OPEN_POPUP") {
    console.log("DEBUG [background.ts] onMessage: OPEN_SETTINGS_POPUP / OPEN_POPUP");
    // Called by the ⚙ gear button in the chat widget
    if (chrome.action && typeof (chrome.action as any).openPopup === "function") {
      (chrome.action as any).openPopup().catch((e: any) => {
        console.error("DEBUG [background.ts] openPopup error:", e);
        // Fallback: notify content script to show the in-page hint
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, { type: "OPEN_SETTINGS_POPUP" }).catch(() => {});
        }
      });
    } else if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: "OPEN_SETTINGS_POPUP" }).catch(() => {});
    }
    sendResponse({ ok: true });
  } else if (message.type === "OFFSCREEN_READY") {
    chrome.storage.local.get(["voiceEngineListening"], (result) => {
      const isListening = result.voiceEngineListening === true;
      console.log("DEBUG [background.ts] onMessage: OFFSCREEN_READY, voiceEngineListening is:", isListening);
      if (isListening) {
        console.log("DEBUG [background.ts] onMessage: sending START_RECOGNITION because voice is enabled");
        chrome.runtime.sendMessage({
          type: "START_RECOGNITION",
          target: "offscreen"
        });
      }
    });
  }
  return true;
});