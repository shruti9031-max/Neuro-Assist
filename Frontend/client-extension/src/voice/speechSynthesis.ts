import { getLanguage } from "./languageManager";

export function speak(text: string): void {
    if (!window.speechSynthesis) {
        console.warn("SpeechSynthesis is not supported in this browser.");
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = getLanguage().synthesis;

    utterance.rate = 1;

    utterance.pitch = 1;

    utterance.volume = 1;

    const voices = speechSynthesis.getVoices();

    const selected = voices.find(
        voice => voice.lang === getLanguage().synthesis
    );

    if (selected) {
        utterance.voice = selected;
    }

    speechSynthesis.speak(utterance);
}
