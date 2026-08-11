chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 Neuro-Assist Frontend Extension Successfully Installed & Ready.");
});

let creating: Promise<void> | null = null;
let isVoiceEnabled = false;

async function setupOffscreenDocument(path: string) {
  console.log("DEBUG [background.ts] setupOffscreenDocument called with path:", path);
  if (chrome.runtime.getContexts) {
    const existingContexts = await (chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as any]
    }) as any);
    console.log("DEBUG [background.ts] setupOffscreenDocument: existing contexts found:", existingContexts.length);
    if (existingContexts.length > 0) {
      return;
    }
  }

  if (creating) {
    console.log("DEBUG [background.ts] setupOffscreenDocument: already creating offscreen document, awaiting...");
    await creating;
  } else {
    console.log("DEBUG [background.ts] setupOffscreenDocument: creating new offscreen document");
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Accessing microphone for voice commands"
    });
    await creating;
    creating = null;
    console.log("DEBUG [background.ts] setupOffscreenDocument: offscreen document created successfully");
  }
}

async function closeOffscreenDocument() {
  console.log("DEBUG [background.ts] closeOffscreenDocument called");
  if (chrome.runtime.getContexts) {
    const existingContexts = await (chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as any]
    }) as any);
    if (existingContexts.length === 0) {
      console.log("DEBUG [background.ts] closeOffscreenDocument: no existing offscreen contexts, returning");
      return;
    }
  }
  try {
    await chrome.offscreen.closeDocument();
    console.log("DEBUG [background.ts] closeOffscreenDocument: offscreen document closed successfully");
  } catch (e) {
    console.error("DEBUG [background.ts] closeOffscreenDocument error:", e);
  }
}

async function handleVoiceToggle(state: boolean, temporary: boolean = false) {
  console.log("DEBUG [background.ts] handleVoiceToggle called, state:", state, "temporary:", temporary);
  
  if (state) {
    // Perform pre-flight microphone permission check using the stored flag
    const result = await chrome.storage.local.get(["voiceMicPermissionGranted"]);
    const hasPermission = result.voiceMicPermissionGranted === true;
    console.log("DEBUG [background.ts] Microphone permission flag in storage:", hasPermission);
    
    if (!hasPermission) {
      console.log("DEBUG [background.ts] Permission flag false. Opening permission tab.");
      openPermissionTab();
      
      // Reset state so UI doesn't show listening when it's blocked/prompted
      chrome.storage.local.set({ voiceEngineListening: false }, () => {
        isVoiceEnabled = false;
        chrome.runtime.sendMessage({ type: "VOICE_STATE_CHANGED", isListening: false }).catch(() => {});
        forwardToActiveTab({ type: "VOICE_STATE_CHANGED", isListening: false });
      });
      return;
    }
  }

  // Broadcast state changes to all components
  chrome.runtime.sendMessage({ type: "VOICE_STATE_CHANGED", isListening: state }).catch(() => {});
  forwardToActiveTab({ type: "VOICE_STATE_CHANGED", isListening: state });

  if (state) {
    try {
      await setupOffscreenDocument("offscreen.html");
      console.log("DEBUG [background.ts] handleVoiceToggle: setup finished, sending START_RECOGNITION to offscreen");
      chrome.runtime.sendMessage({
        type: "START_RECOGNITION",
        target: "offscreen"
      });
    } catch (e) {
      console.error("Failed to setup offscreen document:", e);
    }
  } else {
    try {
      console.log("DEBUG [background.ts] handleVoiceToggle: sending STOP_RECOGNITION to offscreen");
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
  console.log("DEBUG [background.ts] forwardToActiveTab called with message type:", message.type);
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log("DEBUG [background.ts] forwardToActiveTab: active tabs queried:", tabs.length);
    if (tabs.length > 0 && tabs[0].id) {
      console.log("DEBUG [background.ts] forwardToActiveTab: sending message to tab ID:", tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, message).catch((e) => {
        const msg = e.message || String(e);
        if (msg.includes("Could not establish connection") || msg.includes("back/forward cache") || msg.includes("message channel is closed")) {
          console.warn("DEBUG [background.ts] forwardToActiveTab: tab communication offline (expected on system/blocked pages or bfcache):", msg);
        } else {
          console.error("DEBUG [background.ts] forwardToActiveTab: sendMessage rejected:", e);
        }
      });
    } else {
      console.warn("DEBUG [background.ts] forwardToActiveTab: no active tab found to forward to");
    }
  } catch (e) {
    console.error("Error forwarding message to active tab:", e);
  }
}

function openPermissionTab() {
  console.log("DEBUG [background.ts] openPermissionTab called");
  chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
}

// Communication link with content and offscreen scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("DEBUG [background.ts] onMessage received type:", message.type, "from sender:", sender.id || "unknown");
  if (message.type === "CHECK_STATUS") {
    sendResponse({ status: "active", localOnly: true });
  } else if (message.type === "TOGGLE_VOICE_RECOGNITION") {
    console.log("DEBUG [background.ts] onMessage: TOGGLE_VOICE_RECOGNITION state:", message.state, "temporary:", message.temporary);
    isVoiceEnabled = message.state;
    handleVoiceToggle(message.state, message.temporary);
    sendResponse({ success: true });
  } else if (message.type === "VOICE_COMMAND_RECOGNIZED") {
    console.log("DEBUG [background.ts] onMessage: VOICE_COMMAND_RECOGNIZED command:", message.command);
    
    // Check if it's an open website command
    const openSiteRes = parseOpenWebsiteCommand(message.command);
    if (openSiteRes) {
      console.log("DEBUG [background.ts] VOICE_COMMAND_RECOGNIZED: matched open website command:", openSiteRes);
      
      // 1. Speak the confirmation
      const wasListening = isVoiceEnabled;
      if (wasListening) {
        handleVoiceToggle(false, true);
      }
      
      let matchedLang = "en-US";
      const lowercaseText = openSiteRes.speak.toLowerCase();
      if (/[\u0900-\u097F]/.test(openSiteRes.speak) || lowercaseText.includes("नमस्ते") || lowercaseText.includes("कॉल") || lowercaseText.includes("नया") || lowercaseText.includes("मदद")) {
        matchedLang = "hi-IN";
      } else if (/[\u0A00-\u0A7F]/.test(openSiteRes.speak) || lowercaseText.includes("sat sri") || lowercaseText.includes("karo") || lowercaseText.includes("ji")) {
        matchedLang = "pa-IN";
      }
      
      chrome.tts.speak(openSiteRes.speak, {
        lang: matchedLang || "en-IN",
        rate: 1.0,
        onEvent: (event) => {
          if (event.type === 'end' || event.type === 'error' || event.type === 'interrupted') {
            if (wasListening) {
              handleVoiceToggle(true, true);
            }
          }
        }
      });
      
      // 2. Open or update the tab
      const targetUrl = openSiteRes.value;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id !== undefined) {
          const activeTab = tabs[0];
          if (activeTab.url === "chrome://newtab/" || activeTab.url === "about:blank" || !activeTab.url) {
            chrome.tabs.update(activeTab.id!, { url: targetUrl });
          } else {
            chrome.tabs.create({ url: targetUrl });
          }
        } else {
          chrome.tabs.create({ url: targetUrl });
        }
      });
      
      // 3. Send feedback message to the active tab (if open) and popup
      forwardToActiveTab({ type: "VOICE_COMMAND_RECOGNIZED_FEEDBACK", command: message.command, speak: openSiteRes.speak });
      chrome.runtime.sendMessage({ type: "VOICE_COMMAND_RECOGNIZED_FEEDBACK", command: message.command, speak: openSiteRes.speak }).catch(() => {});
    } else {
      // Forward to the active web page content script for other commands
      forwardToActiveTab({ type: "VOICE_COMMAND_RECOGNIZED", command: message.command });
      chrome.runtime.sendMessage({ type: "VOICE_COMMAND_RECOGNIZED", command: message.command }).catch(() => {});
    }
  } else if (message.type === "OPEN_WEBSITE") {
    console.log("DEBUG [background.ts] onMessage: OPEN_WEBSITE url:", message.url);
    const targetUrl = message.url;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id !== undefined) {
        const activeTab = tabs[0];
        if (activeTab.url === "chrome://newtab/" || activeTab.url === "about:blank" || !activeTab.url) {
          chrome.tabs.update(activeTab.id!, { url: targetUrl });
        } else {
          chrome.tabs.create({ url: targetUrl });
        }
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  } else if (message.type === "VOICE_COMMAND_INTERIM") {
    console.log("DEBUG [background.ts] onMessage: VOICE_COMMAND_INTERIM transcript:", message.transcript);
    // Forward interim speech results to the content script
    forwardToActiveTab({ type: "VOICE_COMMAND_INTERIM", transcript: message.transcript });
    chrome.runtime.sendMessage({ type: "VOICE_COMMAND_INTERIM", transcript: message.transcript }).catch(() => {});
  } else if (message.type === "VOICE_ERROR") {
    console.log("DEBUG [background.ts] onMessage: VOICE_ERROR:", message.error);
    chrome.runtime.sendMessage({ type: "VOICE_ERROR", error: message.error }).catch(() => {});
    if (message.error === "not-allowed") {
      chrome.storage.local.set({ voiceEngineListening: false, voiceMicPermissionGranted: false }, () => {
        isVoiceEnabled = false;
        closeOffscreenDocument().catch(() => {});
        forwardToActiveTab({ type: "VOICE_PERMISSION_DENIED" });
        openPermissionTab();
      });
    }
  } else if (message.type === "SPEAK") {
    console.log("DEBUG [background.ts] speaking via chrome.tts:", message.text, "lang:", message.lang);
    const wasListening = isVoiceEnabled;
    if (wasListening) {
      handleVoiceToggle(false, true);
    }
    chrome.tts.speak(message.text, {
      lang: message.lang || "en-IN",
      rate: 1.0,
      onEvent: (event) => {
        console.log("DEBUG [background.ts] tts event:", event.type);
        if (event.type === 'end' || event.type === 'error' || event.type === 'interrupted') {
          if (wasListening) {
            console.log("DEBUG [background.ts] tts finished, resuming voice engine");
            handleVoiceToggle(true, true);
          }
        }
      }
    });
  } else if (message.type === "VOICE_PERMISSION_GRANTED") {
    console.log("DEBUG [background.ts] onMessage: VOICE_PERMISSION_GRANTED");
    chrome.storage.local.set({ voiceEngineListening: true, voiceMicPermissionGranted: true }, () => {
      isVoiceEnabled = true;
      handleVoiceToggle(true, false);
      forwardToActiveTab({ type: "VOICE_PERMISSION_GRANTED" });
    });
  } else if (message.type === "CLOSE_ACTIVE_TAB") {
    console.log("DEBUG [background.ts] onMessage: CLOSE_ACTIVE_TAB");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.remove(tabs[0].id);
      }
    });
  } else if (message.type === "OPEN_MIC_SETTINGS") {
    console.log("DEBUG [background.ts] onMessage: OPEN_MIC_SETTINGS");
    chrome.tabs.create({ url: "chrome://settings/content/microphone" });
  } else if (message.type === "OPEN_SETTINGS_POPUP" || message.type === "OPEN_POPUP") {
    console.log("DEBUG [background.ts] onMessage: OPEN_SETTINGS_POPUP / OPEN_POPUP");
    // Called by the ⚙ gear button in the chat widget
    if (chrome.action && typeof (chrome.action as any).openPopup === "function") {
      (chrome.action as any).openPopup().catch((e: any) => {
        console.error("DEBUG [background.ts] openPopup error:", e);
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
    chrome.storage.local.get(["voiceEngineListening"], (result) => {
      const isListening = result.voiceEngineListening === true;
      console.log("DEBUG [background.ts] onMessage: OFFSCREEN_READY, voiceEngineListening is:", isListening);
      if (isListening) {
        console.log("DEBUG [background.ts] onMessage: sending START_RECOGNITION because voice is enabled");
        chrome.runtime.sendMessage({
          type: "START_RECOGNITION",
          target: "offscreen"
        });
      }
    });
  }
});

// Helper to parse open website voice commands in English & Hinglish
function parseOpenWebsiteCommand(command: string) {
  let cmd = command.toLowerCase().trim().replace(/[.,?!]+$/, "");
  
  // Normalize spoken dots
  cmd = cmd.replace(/\s+dot\s+/g, ".");
  cmd = cmd.replace(/\s+dot-([a-zA-Z]{2,})/g, ".$1");
  cmd = cmd.replace(/\s+dot\s*([a-zA-Z]{2,})/g, ".$1");
  cmd = cmd.replace(/\.\s+/g, ".");

  if (["open settings", "go to settings", "show settings"].some(k => cmd.includes(k))) {
    return { action: "open_website", value: "chrome://settings", speak: "Opening Settings" };
  }
  if (["open downloads", "go to downloads", "show downloads"].some(k => cmd.includes(k))) {
    return { action: "open_website", value: "chrome://downloads", speak: "Opening Downloads" };
  }

  let target = "";
  
  // English prefixes
  const engPrefixRegex = /^(?:open\s+the\s+|open\s+|go\s+to\s+the\s+|go\s+to\s+|launch\s+|navigate\s+to\s+the\s+|navigate\s+to\s+|show\s+me\s+the\s+|show\s+me\s+)(.+)$/;
  const match = cmd.match(engPrefixRegex);
  if (match) {
    target = match[1].trim();
  } else {
    // Hindi / Hinglish prefixes
    const hindiPrefixes = ["kholo ", "chalao ", "open karo ", "chalu karo "];
    for (const pref of hindiPrefixes) {
      if (cmd.startsWith(pref)) {
        target = cmd.slice(pref.length).trim();
        break;
      }
    }
    // Hindi / Hinglish suffixes
    if (!target) {
      const hindiSuffixes = [" kholo", " khol", " open karo", " open karna", " chalao", " kholna", " chalu karo", " khol do", " kholo na"];
      for (const suff of hindiSuffixes) {
        if (cmd.endsWith(suff)) {
          target = cmd.slice(0, -suff.length).trim();
          break;
        }
      }
    }
  }

  // If no prefix/suffix matched, check if it contains "open" or "kholo" or "go to" inside
  if (!target) {
    for (const verb of ["open ", "kholo ", "go to "]) {
      if (cmd.includes(verb)) {
        const parts = cmd.split(verb);
        if (parts.length > 1 && parts[1].trim()) {
          target = parts[1].trim();
          break;
        }
      }
    }
  }

  // If still not found, check if it's a bare domain or single word
  if (!target) {
    if (!cmd.includes(" ") || /^[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?$/.test(cmd)) {
      target = cmd;
    }
  }

  if (!target) return null;

  // Strip common website/app filler words from the target
  const fillers = ["website", "web site", "app", "application", "portal", "page", "site", "online", "official"];
  for (const filler of fillers) {
    if (target.endsWith(" " + filler) || target.endsWith("-" + filler)) {
      target = target.slice(0, -filler.length - 1).trim();
    }
    if (target.startsWith(filler + " ") || target.startsWith(filler + "-")) {
      target = target.slice(filler.length + 1).trim();
    }
  }

  // Strip introductory fillers
  for (const filler of ["this ", "that ", "the ", "a ", "an "]) {
    if (target.startsWith(filler)) {
      target = target.slice(filler.length).trim();
      break;
    }
  }

  // Strip fillers again in case of "this website myntra"
  for (const filler of fillers) {
    if (target.endsWith(" " + filler) || target.endsWith("-" + filler)) {
      target = target.slice(0, -filler.length - 1).trim();
    }
    if (target.startsWith(filler + " ") || target.startsWith(filler + "-")) {
      target = target.slice(filler.length + 1).trim();
    }
  }

  if (!target) return null;

  const targetClean = target.replace(/\s+/g, "").replace(/-/g, "").replace(/_/g, "").replace(/\./g, "").toLowerCase();
  if (!targetClean) return null;

  // Mapping of clean names to full URLs and display labels
  const WEBSITE_MAP: { [key: string]: [string, string] } = {
    "myntra": ["https://www.myntra.com", "Myntra"],
    "flipkart": ["https://www.flipkart.com", "Flipkart"],
    "amazon": ["https://www.amazon.in", "Amazon"],
    "amazonin": ["https://www.amazon.in", "Amazon India"],
    "amazoncom": ["https://www.amazon.com", "Amazon US"],
    "shopsy": ["https://www.shopsy.in", "Shopsy"],
    "meesho": ["https://www.meesho.com", "Meesho"],
    "ajio": ["https://www.ajio.com", "Ajio"],
    "nykaa": ["https://www.nykaa.com", "Nykaa"],
    "nykaaman": ["https://www.nykaaman.com", "Nykaa Man"],
    "snapdeal": ["https://www.snapdeal.com", "Snapdeal"],
    "croma": ["https://www.croma.com", "Croma"],
    "reliancedigital": ["https://www.reliancedigital.in", "Reliance Digital"],
    "tatacliq": ["https://www.tatacliq.com", "Tata Cliq"],
    "jiomart": ["https://www.jiomart.com", "JioMart"],
    "ebay": ["https://www.ebay.com", "eBay"],
    "blinkit": ["https://www.blinkit.com", "Blinkit"],
    "zepto": ["https://www.zepto.com", "Zepto"],
    "bigbasket": ["https://www.bigbasket.com", "BigBasket"],
    "swiggyinstamart": ["https://www.swiggy.com/instamart", "Swiggy Instamart"],
    "swiggy": ["https://www.swiggy.com", "Swiggy"],
    "zomato": ["https://www.zomato.com", "Zomato"],
    "lenskart": ["https://www.lenskart.com", "Lenskart"],
    "decathlon": ["https://www.decathlon.in", "Decathlon"],
    "firstcry": ["https://www.firstcry.com", "FirstCry"],
    "urbanic": ["https://www.urbanic.com", "Urbanic"],
    "bewakoof": ["https://www.bewakoof.com", "Bewakoof"],
    "zivame": ["https://www.zivame.com", "Zivame"],
    "limeroad": ["https://www.limeroad.com", "LimeRoad"],
    "pepperfry": ["https://www.pepperfry.com", "Pepperfry"],
    "urbanladder": ["https://www.urbanladder.com", "Urban Ladder"],
    "ikea": ["https://www.ikea.com", "IKEA"],
    "coursera": ["https://www.coursera.org", "Coursera"],
    "udemy": ["https://www.udemy.com", "Udemy"],
    "khanacademy": ["https://www.khanacademy.org", "Khan Academy"],
    "edx": ["https://www.edx.org", "edX"],
    "wikipedia": ["https://www.wikipedia.org", "Wikipedia"],
    "w3schools": ["https://www.w3schools.com", "W3Schools"],
    "w3school": ["https://www.w3schools.com", "W3Schools"],
    "geeksforgeeks": ["https://www.geeksforgeeks.org", "GeeksforGeeks"],
    "gfg": ["https://www.geeksforgeeks.org", "GeeksforGeeks"],
    "stackoverflow": ["https://stackoverflow.com", "Stack Overflow"],
    "tutorialspoint": ["https://www.tutorialspoint.com", "Tutorialspoint"],
    "studyiq": ["https://www.studyiq.com", "StudyIQ"],
    "unacademy": ["https://unacademy.com", "Unacademy"],
    "byjus": ["https://byjus.com", "BYJU'S"],
    "physicswallah": ["https://www.pw.live", "Physics Wallah"],
    "pw": ["https://www.pw.live", "Physics Wallah"],
    "doubtnut": ["https://www.doubtnut.com", "Doubtnut"],
    "brainly": ["https://brainly.in", "Brainly"],
    "meritnation": ["https://www.meritnation.com", "Meritnation"],
    "vedantu": ["https://www.vedantu.com", "Vedantu"],
    "toppr": ["https://www.toppr.com", "Toppr"],
    "testbook": ["https://testbook.com", "Testbook"],
    "adda247": ["https://www.adda247.com", "Adda247"],
    "codecademy": ["https://www.codecademy.com", "Codecademy"],
    "freecodecamp": ["https://www.freecodecamp.org", "freeCodeCamp"],
    "github": ["https://www.github.com", "GitHub"],
    "gitlab": ["https://www.gitlab.com", "GitLab"],
    "bitbucket": ["https://bitbucket.org", "BitBucket"],
    "leetcode": ["https://leetcode.com", "LeetCode"],
    "hackerrank": ["https://www.hackerrank.com", "HackerRank"],
    "hackerearth": ["https://www.hackerearth.com", "HackerEarth"],
    "javatpoint": ["https://www.javatpoint.com", "Javatpoint"],
    "mdn": ["https://developer.mozilla.org", "MDN Web Docs"],
    "developermozilla": ["https://developer.mozilla.org", "MDN Web Docs"],
    "scribd": ["https://www.scribd.com", "Scribd"],
    "researchgate": ["https://www.researchgate.net", "ResearchGate"],
    "academia": ["https://www.academia.edu", "Academia"],
    "jstor": ["https://www.jstor.org", "JSTOR"],
    "duolingo": ["https://www.duolingo.com", "Duolingo"],
    "google": ["https://www.google.com", "Google"],
    "bing": ["https://www.bing.com", "Bing"],
    "yahoo": ["https://www.yahoo.com", "Yahoo"],
    "duckduckgo": ["https://duckduckgo.com", "DuckDuckGo"],
    "chatgpt": ["https://chatgpt.com", "ChatGPT"],
    "chatgptcom": ["https://chatgpt.com", "ChatGPT"],
    "claude": ["https://claude.ai", "Claude AI"],
    "gemini": ["https://gemini.google.com", "Gemini"],
    "perplexity": ["https://www.perplexity.ai", "Perplexity AI"],
    "copilot": ["https://copilot.microsoft.com", "Copilot"],
    "midjourney": ["https://www.midjourney.com", "Midjourney"],
    "youtube": ["https://www.youtube.com", "YouTube"],
    "netflix": ["https://www.netflix.com", "Netflix"],
    "primevideo": ["https://www.primevideo.com", "Prime Video"],
    "hotstar": ["https://www.hotstar.com", "Hotstar"],
    "jiocinema": ["https://www.jiocinema.com", "JioCinema"],
    "zee5": ["https://www.zee5.com", "Zee5"],
    "sonyliv": ["https://www.sonyliv.com", "SonyLIV"],
    "spotify": ["https://www.spotify.com", "Spotify"],
    "jiosaavn": ["https://www.jiosaavn.com", "JioSaavn"],
    "gaana": ["https://gaana.com", "Gaana"],
    "wynk": ["https://wynk.in", "Wynk Music"],
    "youtubemusic": ["https://music.youtube.com", "YouTube Music"],
    "twitch": ["https://www.twitch.tv", "Twitch"],
    "bookmyshow": ["https://in.bookmyshow.com", "BookMyShow"],
    "facebook": ["https://www.facebook.com", "Facebook"],
    "instagram": ["https://www.instagram.com", "Instagram"],
    "twitter": ["https://x.com", "Twitter"],
    "x": ["https://x.com", "Twitter/X"],
    "linkedin": ["https://www.linkedin.com", "LinkedIn"],
    "reddit": ["https://www.reddit.com", "Reddit"],
    "whatsapp": ["https://web.whatsapp.com", "WhatsApp"],
    "telegram": ["https://web.telegram.org", "Telegram"],
    "pinterest": ["https://www.pinterest.com", "Pinterest"],
    "snapchat": ["https://web.snapchat.com", "Snapchat"],
    "discord": ["https://discord.com", "Discord"],
    "quora": ["https://www.quora.com", "Quora"],
    "tumblr": ["https://www.tumblr.com", "Tumblr"],
    "gmail": ["https://mail.google.com", "Gmail"],
    "outlook": ["https://outlook.live.com", "Outlook"],
    "yahoomail": ["https://mail.yahoo.com", "Yahoo Mail"],
    "irctc": ["https://www.irctc.co.in", "IRCTC"],
    "paytm": ["https://paytm.com", "Paytm"],
    "phonepe": ["https://www.phonepe.com", "PhonePe"],
    "gpay": ["https://pay.google.com", "Google Pay"],
    "digilocker": ["https://www.digilocker.gov.in", "DigiLocker"],
    "uidai": ["https://uidai.gov.in", "UIDAI"],
    "incometax": ["https://www.incometax.gov.in", "Income Tax Portal"],
    "sbi": ["https://www.onlinesbi.sbi", "State Bank of India"],
    "hdfc": ["https://www.hdfcbank.com", "HDFC Bank"],
    "icici": ["https://www.icicibank.com", "ICICI Bank"],
    "axisbank": ["https://www.axisbank.com", "Axis Bank"],
    "ndtv": ["https://www.ndtv.com", "NDTV"],
    "timesofindia": ["https://timesofindia.indiatimes.com", "Times of India"],
    "toi": ["https://timesofindia.indiatimes.com", "Times of India"],
    "makemytrip": ["https://www.makemytrip.com", "MakeMyTrip"],
    "goibibo": ["https://www.goibibo.com", "Goibibo"],
    "yatra": ["https://www.yatra.com", "Yatra"],
    "redbus": ["https://www.redbus.in", "RedBus"],
    "ola": ["https://www.olacabs.com", "Ola Cabs"],
    "uber": ["https://www.uber.com", "Uber"],
    "maps": ["https://maps.google.com", "Google Maps"],
    "googlemaps": ["https://maps.google.com", "Google Maps"],
    "drive": ["https://drive.google.com", "Google Drive"],
    "googledrive": ["https://drive.google.com", "Google Drive"],
    "docs": ["https://docs.google.com", "Google Docs"],
    "googledocs": ["https://docs.google.com", "Google Docs"],
    "sheets": ["https://docs.google.com/spreadsheets", "Google Sheets"],
    "googlesheets": ["https://docs.google.com/spreadsheets", "Google Sheets"],
    "slides": ["https://docs.google.com/presentation", "Google Slides"],
    "googleslides": ["https://docs.google.com/presentation", "Google Slides"],
    "meet": ["https://meet.google.com", "Google Meet"],
    "googlemeet": ["https://meet.google.com", "Google Meet"],
    "zoom": ["https://zoom.us", "Zoom"],
    "teams": ["https://teams.microsoft.com", "Microsoft Teams"],
    "microsoftteams": ["https://teams.microsoft.com", "Microsoft Teams"],
    "canva": ["https://www.canva.com", "Canva"],
    "figma": ["https://www.figma.com", "Figma"],
    "notion": ["https://www.notion.so", "Notion"],
    "trello": ["https://trello.com", "Trello"],
    "slack": ["https://slack.com", "Slack"]
  };

  // Hindi and Punjabi name mapping equivalents
  const scriptMap: { [key: string]: string } = {
    "फ्लिपकार्ट": "flipkart", "मीशो": "meesho", "अमेज़न": "amazon", "एमेझॉन": "amazon",
    "गूगल": "google", "यूट्यूब": "youtube", "फेसबुक": "facebook", "इंਸਟาਗ੍ਰਾਮ": "instagram",
    "ट्विटर": "twitter", "लिंक्डइन": "linkedin", "नेटफ्लिक्स": "netflix", "जीमेल": "gmail",
    "याहू": "yahoo", "विकिपीडिया": "wikipedia", "मिंत्रा": "myntra",
    "ਫਲਿੱਪਕਾਰਟ": "flipkart", "ਮੀਸ਼ੋ": "meesho", "ਐਮਾਜ਼ਾਨ": "amazon", "ਗੂਗਲ": "google",
    "ਯੂਟਿਊਬ": "youtube", "ਫੇਸਬੁੱਕ": "facebook", "ਇੰਸਟਾਗ੍ਰਾਮ": "instagram", "ਟਵਿੱਟਰ": "twitter",
    "ਲਿੰਕਡਇਨ": "linkedin", "ਨੈੱਟਫਲਿਕਸ": "netflix", "ਜੀਮੇਲ": "gmail", "ਮਿੰਤਰਾ": "myntra"
  };

  let mappedTarget = targetClean;
  if (scriptMap[targetClean]) {
    mappedTarget = scriptMap[targetClean];
  }

  if (WEBSITE_MAP[mappedTarget]) {
    const [url, label] = WEBSITE_MAP[mappedTarget];
    return { action: "open_website", value: url, speak: `Opening ${label}` };
  }

  // Check substring match
  for (const key of Object.keys(WEBSITE_MAP)) {
    if (key.includes(mappedTarget) || mappedTarget.includes(key)) {
      const [url, label] = WEBSITE_MAP[key];
      return { action: "open_website", value: url, speak: `Opening ${label}` };
    }
  }

  // Fallback domain checking
  let targetDomain = target.toLowerCase().trim();
  if (targetDomain.startsWith("https://")) {
    targetDomain = targetDomain.slice(8);
  } else if (targetDomain.startsWith("http://")) {
    targetDomain = targetDomain.slice(7);
  }
  if (targetDomain.startsWith("www.")) {
    targetDomain = targetDomain.slice(4);
  }

  if (/^[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/.test(targetDomain)) {
    return { action: "open_website", value: "https://" + targetDomain, speak: `Opening ${targetDomain}` };
  }

  // Clean for fallback .com
  const urlDomain = target.toLowerCase().replace(/[^a-zA-Z0-9\-]/g, "");
  if (urlDomain) {
    return {
      action: "open_website",
      value: `https://www.${urlDomain}.com`,
      speak: `Opening ${target.charAt(0).toUpperCase() + target.slice(1)}`
    };
  }

  return null;
}