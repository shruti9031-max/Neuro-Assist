# 🧠 Neuro-Assist: AI-Powered Universal Accessibility Core

An innovative, multi-modal web accessibility assistant designed as a Chrome Extension. This project leverages real-time voice recognition, computer vision-based sign language translation, and cognitive visual adjustments to make the web accessible to everyone.

This repository represents the core deliverables for our **BTech Project**.

---

## 📂 Project Directory Structure

Ensure your local repository mirrors this exact structure:

```text
Btech project/
├── .gitignore
├── README.md
└── Frontend/
    └── client-extension/
        ├── node_modules/             # Local project dependencies (Ignored by Git)
        ├── dist/                     # Production-ready compiled assets (Loaded into Chrome)
        │   ├── background.js         # Compiled service worker handling background tasks
        │   ├── content.js            # Compiled Glassmorphic UI & modal controllers
        │   └── popup.js              # Compiled settings toolbar controller
        │
        ├── src/                      # Source development assets (TypeScript & HTML)
        │   ├── background/
        │   │   └── background.ts     # Core Extension service worker logic
        │   ├── content/
        │   │   ├── content.ts        # Premium floating dock UI & toggle listeners
        │   │   └── voiceEngine.ts    # Web Speech API real-time voice routing engine
        │   └── popup/
        │       ├── popup.html        # Modern extension popup widget layout
        │       └── popup.ts          # Extension toolbar interaction script
        │
        ├── manifest.json             # Manifest V3 configuration mapping
        ├── package.json              # Compilation scripts & node package configurations
        ├── tsconfig.json             # TypeScript compiler rules mapping
        └── webpack.config.js         # Webpack build and bundle orchestrator
