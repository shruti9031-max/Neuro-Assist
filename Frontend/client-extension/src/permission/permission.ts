import { getTranslation } from "../utils/translations";

const requestBtn = document.getElementById("btnRequest");
const statusMsg = document.getElementById("statusMsg");
const simulateBtn = document.getElementById("btnSimulate");

let selectedLang = "en";

// Load language and apply
chrome.storage.local.get(["extensionLanguage"], (r) => {
  selectedLang = r.extensionLanguage || "en";
  applyTranslations();
});

function applyTranslations() {
  const permTitle = document.getElementById("permTitle");
  if (permTitle) permTitle.textContent = getTranslation("permTitle", selectedLang);
  
  const permDesc = document.getElementById("permDesc");
  if (permDesc) {
    let descText = getTranslation("permDesc", selectedLang);
    if (selectedLang === "en") {
      descText = descText.replace("Allow", "<strong>Allow</strong>");
    } else if (selectedLang === "es") {
      descText = descText.replace("Permitir", "<strong>Permitir</strong>");
    } else if (selectedLang === "fr") {
      descText = descText.replace("Autoriser", "<strong>Autoriser</strong>");
    } else if (selectedLang === "de") {
      descText = descText.replace("Zulassen", "<strong>Zulassen</strong>");
    } else if (selectedLang === "hi") {
      descText = descText.replace("अनुमति दें", "<strong>अनुमति दें</strong>");
    }
    permDesc.innerHTML = descText;
  }
  
  const btnRequest = document.getElementById("btnRequest");
  if (btnRequest) btnRequest.textContent = getTranslation("permGrantBtn", selectedLang);
  
  const btnSimulate = document.getElementById("btnSimulate");
  if (btnSimulate) btnSimulate.textContent = getTranslation("permSimBtn", selectedLang);
}

async function requestPermission() {
  if (statusMsg) statusMsg.innerText = "";
  if (simulateBtn) simulateBtn.style.display = "none";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately to turn off mic active indicator light
    stream.getTracks().forEach((track) => track.stop());

    // Notify background script that permission has been granted
    chrome.runtime.sendMessage({ type: "VOICE_PERMISSION_GRANTED" });

    // Close the tab
    window.close();
  } catch (err: any) {
    console.error("Failed to acquire microphone permission:", err);
    if (statusMsg) {
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError" || err.message?.includes("device not found")) {
        statusMsg.innerText = getTranslation("permErrNoMic", selectedLang);
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        statusMsg.innerText = getTranslation("permErrBusy", selectedLang);
      } else {
        statusMsg.innerText = getTranslation("permErrDenied", selectedLang);
      }
    }
    // Show the simulation mode button as a developer/user fallback bypass
    if (simulateBtn) {
      simulateBtn.style.display = "inline-flex";
    }
  }
}

requestBtn?.addEventListener("click", requestPermission);

simulateBtn?.addEventListener("click", () => {
  // Bypasses the mic hardware check and close tab
  chrome.runtime.sendMessage({ type: "VOICE_PERMISSION_GRANTED" });
  window.close();
});
