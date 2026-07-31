chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 Neuro-Assist Frontend Extension Successfully Installed & Ready.");
});

let creating: Promise<void> | null = null;
let isVoiceEnabled = false;

async function setupOffscreenDocument(path: string) {
  if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN" as any]
    });
    if (existingContexts.length > 0) {
      return;
    }
  }

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Accessing microphone for voice commands"
    });
    await creating;
    creating = null;
  }
}

async function closeOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN" as any]
    });
    if (existingContexts.length === 0) {
      return;
    }
  }
  try {
    await chrome.offscreen.closeDocument();
  } catch (_) {}
}

async function handleVoiceToggle(state: boolean, temporary: boolean = false) {
  if (state) {
    try {
      await setupOffscreenDocument("dist/offscreen.html");
      chrome.runtime.sendMessage({
        type: "START_RECOGNITION",
        target: "offscreen"
      });
    } catch (e) {
      console.error("Failed to setup offscreen document:", e);
    }
  } else {
    try {
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
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    }
  } catch (e) {
    console.error("Error forwarding message to active tab:", e);
  }
}

function openPermissionTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL("dist/permission.html") });
}

// Communication link with content and offscreen scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_STATUS") {
    sendResponse({ status: "active", localOnly: true });
  } else if (message.type === "TOGGLE_VOICE_RECOGNITION") {
    isVoiceEnabled = message.state;
    handleVoiceToggle(message.state, message.temporary);
    sendResponse({ success: true });
  } else if (message.type === "VOICE_COMMAND_RECOGNIZED") {
    // Forward to the active web page content script
    forwardToActiveTab({ type: "VOICE_COMMAND_RECOGNIZED", command: message.command });
  } else if (message.type === "VOICE_ERROR") {
    if (message.error === "not-allowed") {
      isVoiceEnabled = false;
      closeOffscreenDocument().catch(() => {});
      forwardToActiveTab({ type: "VOICE_PERMISSION_DENIED" });
      openPermissionTab();
    }
  } else if (message.type === "VOICE_PERMISSION_GRANTED") {
    isVoiceEnabled = true;
    handleVoiceToggle(true, false);
    forwardToActiveTab({ type: "VOICE_PERMISSION_GRANTED" });
  } else if (message.type === "OPEN_MIC_SETTINGS") {
    chrome.tabs.create({ url: "chrome://settings/content/microphone" });
  } else if (message.type === "OPEN_SETTINGS_POPUP" || message.type === "OPEN_POPUP") {
    // Called by the ⚙ gear button in the chat widget
    if (chrome.action && typeof (chrome.action as any).openPopup === "function") {
      (chrome.action as any).openPopup().catch(() => {
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
    if (isVoiceEnabled) {
      chrome.runtime.sendMessage({
        type: "START_RECOGNITION",
        target: "offscreen"
      });
    }
  }
  return true;
});