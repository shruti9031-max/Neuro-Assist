import { startListening } from "./speechRecognition";
import { speak } from "./speechSynthesis";

export async function initializeVoice(chatbot: (text: string) => Promise<string>): Promise<void> {
    startListening(async (text) => {
        console.log("User :", text);
        const reply = await chatbot(text);
        console.log("Bot :", reply);
        speak(reply);
    });
}
