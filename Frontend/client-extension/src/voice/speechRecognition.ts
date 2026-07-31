import { getLanguage } from "./languageManager";

const SpeechRecognition =
  (window as any).SpeechRecognition ||
  (window as any).webkitSpeechRecognition;

let recognition: any = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

export function startListening(onResult: (text: string) => void): void {
    if (!recognition) {
        console.warn("SpeechRecognition is not supported in this browser.");
        return;
    }

    recognition.lang = getLanguage().recognition;

    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start SpeechRecognition:", e);
    }

    recognition.onresult = (event: any) => {
        const transcript =
            event.results[event.results.length - 1][0].transcript;

        onResult(transcript);
    };

    recognition.onerror = (e: any) => {
        console.log(e);
    };
}

export function stopListening(): void {
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            console.error("Failed to stop SpeechRecognition:", e);
        }
    }
}
