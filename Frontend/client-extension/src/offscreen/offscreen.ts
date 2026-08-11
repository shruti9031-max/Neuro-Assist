let recognition: any = null;
let isListening = false; // Tracks whether the user has toggled the voice engine on
let isSpeechRecognitionRunning = false; // Tracks browser native SpeechRecognition state

console.log("DEBUG [offscreen.ts] Script loaded");

function initRecognition() {
  console.log("DEBUG [offscreen.ts] initRecognition called");
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error("🎙️ DEBUG [offscreen.ts] SpeechRecognition NOT supported in this browser.");
    chrome.runtime.sendMessage({ type: "VOICE_ERROR", error: "not-supported" });
    return;
  }

  console.log("DEBUG [offscreen.ts] SpeechRecognition is supported. Instantiating...");
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN"; // Good for English + Hinglish

  recognition.onstart = () => {
    console.log("🎙️ DEBUG [offscreen.ts] recognition.onstart fired - native browser SpeechRecognition started listening.");
    isSpeechRecognitionRunning = true;
  };

  recognition.onresult = (event: any) => {
    console.log("🎙️ DEBUG [offscreen.ts] recognition.onresult captured native speech event. resultIndex:", event.resultIndex);
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    console.log("DEBUG [offscreen.ts] recognition.onresult: finalTranscript:", finalTranscript, "interimTranscript:", interimTranscript);

    if (finalTranscript.trim()) {
      const command = finalTranscript.trim().toLowerCase();
      console.log("🎙️ DEBUG [offscreen.ts] Generated final transcript:", command);
      chrome.runtime.sendMessage({ type: "VOICE_COMMAND_RECOGNIZED", command });
    } else if (interimTranscript.trim()) {
      const transcript = interimTranscript.trim();
      chrome.runtime.sendMessage({ type: "VOICE_COMMAND_INTERIM", transcript });
    }
  };

  recognition.onerror = (err: any) => {
    console.error("🎙️ DEBUG [offscreen.ts] onerror - SpeechRecognition error:", err.error, err);
    isSpeechRecognitionRunning = false;
    chrome.runtime.sendMessage({ type: "VOICE_ERROR", error: err.error });
  };

  recognition.onend = () => {
    console.log("🎙️ DEBUG [offscreen.ts] onend: Speech recognition service disconnected, isListening is:", isListening);
    isSpeechRecognitionRunning = false;

    // Restart recognition if engine is still supposed to be listening (continuous mode)
    if (isListening) {
      console.log("🎙️ DEBUG [offscreen.ts] Restarting speech recognition after onend...");
      setTimeout(() => {
        if (isListening && !isSpeechRecognitionRunning) {
          try {
            console.log("🎙️ DEBUG [offscreen.ts] recognition.start() [auto-restart]");
            isSpeechRecognitionRunning = true;
            recognition.start();
          } catch (e) {
            isSpeechRecognitionRunning = false;
            console.error("🎙️ DEBUG [offscreen.ts] Error auto-restarting recognition:", e);
          }
        }
      }, 400);
    } else {
      console.log("🎙️ DEBUG [offscreen.ts] Speech recognition intentionally stopped. Remaining offline.");
    }
  };
}

chrome.runtime.onMessage.addListener((message) => {
  console.log("DEBUG [offscreen.ts] onMessage received message:", message);
  if (message.target !== "offscreen") {
    console.log("DEBUG [offscreen.ts] onMessage: ignoring message (not target offscreen)");
    return;
  }

  if (message.type === "START_RECOGNITION") {
    console.log("🎙️ DEBUG [offscreen.ts] Received START_RECOGNITION message");
    isListening = true;
    if (!recognition) {
      initRecognition();
    }
    if (recognition && !isSpeechRecognitionRunning) {
      try {
        console.log("🎙️ DEBUG [offscreen.ts] calling recognition.start()");
        isSpeechRecognitionRunning = true;
        recognition.start();
      } catch (e) {
        isSpeechRecognitionRunning = false;
        console.error("🎙️ DEBUG [offscreen.ts] Error starting recognition:", e);
      }
    } else {
      console.log("🎙️ DEBUG [offscreen.ts] Skip start: recognition is already running");
    }
  } else if (message.type === "STOP_RECOGNITION") {
    console.log("🎙️ DEBUG [offscreen.ts] Received STOP_RECOGNITION message");
    isListening = false;
    if (recognition && isSpeechRecognitionRunning) {
      try {
        console.log("🎙️ DEBUG [offscreen.ts] calling recognition.stop()");
        recognition.stop();
      } catch (e) {
        console.error("🎙️ DEBUG [offscreen.ts] Error stopping recognition:", e);
      }
    } else {
      console.log("🎙️ DEBUG [offscreen.ts] Skip stop: recognition is already stopped");
    }
  }
});

// Notify background that the offscreen document is ready
try {
  console.log("DEBUG [offscreen.ts] sending OFFSCREEN_READY");
  chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
} catch (e) {
  console.warn("🎙️ DEBUG [offscreen.ts] Failed to send OFFSCREEN_READY message:", e);
}
