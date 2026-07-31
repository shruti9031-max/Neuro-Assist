let recognition: any = null;
let isListening = false; // Tracks whether the user has toggled the voice engine on
let isSpeechRecognitionRunning = false; // Tracks browser native SpeechRecognition state

function initRecognition() {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error("🎙️ SpeechRecognition not supported in this browser.");
    chrome.runtime.sendMessage({ type: "VOICE_ERROR", error: "not-supported" });
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN"; // Good for English + Hinglish

  recognition.onstart = () => {
    console.log("🎙️ Stage 2 (SpeechRecognition Events): onstart - native browser SpeechRecognition started listening.");
    isSpeechRecognitionRunning = true;
  };

  recognition.onresult = (event: any) => {
    console.log("🎙️ Stage 2 (SpeechRecognition Events): onresult - captured native speech event.");
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript.trim()) {
      const command = finalTranscript.trim().toLowerCase();
      console.log("🎙️ Stage 3 (Transcript Generation): Generated final transcript:", command);
      chrome.runtime.sendMessage({ type: "VOICE_COMMAND_RECOGNIZED", command });
    } else if (interimTranscript.trim()) {
      const transcript = interimTranscript.trim();
      chrome.runtime.sendMessage({ type: "VOICE_COMMAND_INTERIM", transcript });
    }
  };

  recognition.onerror = (err: any) => {
    console.error("🎙️ Stage 1 & 2 (Mic Capture / Recognition Events): onerror - SpeechRecognition error:", err.error, err);
    isSpeechRecognitionRunning = false;
    chrome.runtime.sendMessage({ type: "VOICE_ERROR", error: err.error });
  };

  recognition.onend = () => {
    console.log("🎙️ onend: Speech recognition service disconnected");
    isSpeechRecognitionRunning = false;

    // Restart recognition if engine is still supposed to be listening (continuous mode)
    if (isListening) {
      console.log("🎙️ Restarting speech recognition after onend...");
      setTimeout(() => {
        if (isListening && !isSpeechRecognitionRunning) {
          try {
            console.log("🎙️ recognition.start() [auto-restart]");
            recognition.start();
          } catch (e) {
            console.error("🎙️ Error auto-restarting recognition:", e);
          }
        }
      }, 400);
    } else {
      console.log("🎙️ Speech recognition intentionally stopped. Remaining offline.");
    }
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;

  if (message.type === "START_RECOGNITION") {
    console.log("🎙️ Received START_RECOGNITION message");
    isListening = true;
    if (!recognition) {
      initRecognition();
    }
    if (recognition && !isSpeechRecognitionRunning) {
      try {
        console.log("🎙️ recognition.start()");
        recognition.start();
      } catch (e) {
        console.error("🎙️ Error starting recognition:", e);
      }
    } else {
      console.log("🎙️ Skip start: recognition is already running");
    }
  } else if (message.type === "STOP_RECOGNITION") {
    console.log("🎙️ Received STOP_RECOGNITION message");
    isListening = false;
    if (recognition && isSpeechRecognitionRunning) {
      try {
        console.log("🎙️ recognition.stop()");
        recognition.stop();
      } catch (e) {
        console.error("🎙️ Error stopping recognition:", e);
      }
    } else {
      console.log("🎙️ Skip stop: recognition is already stopped");
    }
  }
});

// Notify background that the offscreen document is ready
try {
  chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
} catch (e) {
  console.warn("🎙️ Failed to send OFFSCREEN_READY message:", e);
}
