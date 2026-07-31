const requestBtn = document.getElementById("btnRequest");
const statusMsg = document.getElementById("statusMsg");
const simulateBtn = document.getElementById("btnSimulate");

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
        statusMsg.innerText = "No microphone detected. Please connect an input device (microphone) and try again.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        statusMsg.innerText = "Microphone is busy. Please close other applications using your microphone.";
      } else {
        statusMsg.innerText = "Permission denied or dismissed. Please make sure to allow microphone access.";
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
