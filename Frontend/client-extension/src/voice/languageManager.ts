export interface LanguageConfig {
    recognition: string;
    synthesis: string;
    name: string;
}

export const LANGUAGES: { [key: string]: LanguageConfig } = {
    english: {
        recognition: "en-IN",
        synthesis: "en-IN",
        name: "English"
    },

    hindi: {
        recognition: "hi-IN",
        synthesis: "hi-IN",
        name: "Hindi"
    },

    punjabi: {
        recognition: "pa-IN",
        synthesis: "pa-IN",
        name: "Punjabi"
    }
};

let currentLanguage: LanguageConfig = LANGUAGES.english;

export function setLanguage(language: string): void {
    if (LANGUAGES[language]) {
        currentLanguage = LANGUAGES[language];
    }
}

export function getLanguage(): LanguageConfig {
    return currentLanguage;
}
