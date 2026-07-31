export class NeuroWebsiteSimplifier {
  private isEnabled: boolean = false;
  private buttonElement: HTMLButtonElement | null = null;
  private checkboxElement: HTMLInputElement | null = null;
  private toastElement: HTMLDivElement | null = null;
  private hiddenElements: HTMLElement[] = [];

  constructor() {}

  public isActive(): boolean {
    return this.isEnabled;
  }

  public setTriggerButton(btn: HTMLButtonElement) {
    this.buttonElement = btn;
  }

  public setCheckbox(cb: HTMLInputElement) {
    this.checkboxElement = cb;
  }

  public async toggle(): Promise<boolean> {
    if (this.isEnabled) {
      await this.disable();
    } else {
      await this.enable();
    }
    return this.isEnabled;
  }

  public async enable() {
    this.isEnabled = true;
    console.log("✨ Neuro-Assist: Enabling AI Website Simplifier.");

    if (this.buttonElement) {
      this.buttonElement.setAttribute("data-active", "true");
      this.buttonElement.classList.add("active-state");
      this.buttonElement.innerText = "✨ DEACTIVATE SIMPLIFIER";
    }
    if (this.checkboxElement) {
      this.checkboxElement.checked = true;
    }

    document.body.classList.add("na-simplified-mode");

    // Pause autoplay media safely
    document.querySelectorAll<HTMLMediaElement>("video[autoplay], audio[autoplay]").forEach(media => {
      try { media.pause(); } catch (e) {}
    });

    // Detect verified distractions using conservative multi-signal validation
    const distractions = this.detectAndCollectDistractions();

    if (distractions.length === 0) {
      this.showSimplifierToast("✨ This webpage is already clean. No simplification was required.");
    } else {
      this.hiddenElements = [];
      distractions.forEach(el => {
        if (!el.dataset.originalDisplay) {
          el.dataset.originalDisplay = el.style.display || "";
        }
        el.style.setProperty("display", "none", "important");
        this.hiddenElements.push(el);
      });
      const count = distractions.length;
      this.showSimplifierToast(`✨ Simplification completed. ${count} distracting element${count > 1 ? "s were" : " was"} hidden.`);
    }
  }

  public async disable() {
    this.isEnabled = false;
    console.log("✨ Neuro-Assist: Disabling AI Website Simplifier.");

    if (this.buttonElement) {
      this.buttonElement.setAttribute("data-active", "false");
      this.buttonElement.classList.remove("active-state");
      this.buttonElement.innerText = "✨ AI WEBSITE SIMPLIFIER";
    }
    if (this.checkboxElement) {
      this.checkboxElement.checked = false;
    }

    document.body.classList.remove("na-simplified-mode");

    // Restore hidden distraction elements immediately
    document.querySelectorAll("[data-original-display]").forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = htmlEl.dataset.originalDisplay || "";
      delete htmlEl.dataset.originalDisplay;
    });

    this.hiddenElements.forEach(el => {
      if (el.dataset.originalDisplay !== undefined) {
        el.style.display = el.dataset.originalDisplay || "";
        delete el.dataset.originalDisplay;
      }
    });
    this.hiddenElements = [];

    this.removeSimplifierToast();
  }

  private isProtectedPrimaryContent(el: HTMLElement): boolean {
    // 1. Extension UI protection
    if (el.closest(".na-chat-box, .na-master-fab, .na-top-dock, .na-screen-blur, #na-simplifier-toast")) {
      return true;
    }

    // 2. Primary HTML5 structural elements
    const tag = el.tagName.toLowerCase();
    if (["main", "article", "header", "nav", "footer", "form", "button", "input", "select", "textarea", "table", "pre", "code"].includes(tag)) {
      return true;
    }

    // 3. Primary ARIA roles
    const role = el.getAttribute("role");
    if (role && ["main", "navigation", "search", "banner", "form", "searchbox"].includes(role)) {
      return true;
    }

    // 4. Primary content containers or form controls inside candidate
    if (el.querySelector("main, article, header, nav, footer, form, input, select, textarea, table, pre, code, [role='main'], [role='navigation'], [role='search']")) {
      return true;
    }

    // 5. GitHub, Wikipedia, YouTube, Documentation, File list protections
    const idAndClass = (el.id + " " + el.className).toLowerCase();
    if (idAndClass.includes("repository") ||
        idAndClass.includes("file-navigation") ||
        idAndClass.includes("js-repo") ||
        idAndClass.includes("mw-content") ||
        idAndClass.includes("player") ||
        idAndClass.includes("comment") ||
        idAndClass.includes("search") ||
        idAndClass.includes("auth") ||
        idAndClass.includes("login")) {
      return true;
    }

    return false;
  }

  private detectAndCollectDistractions(): HTMLElement[] {
    const candidates: HTMLElement[] = [];

    // Signal 1: Known ad unit elements
    const adSelectors = [
      'ins.adsbygoogle',
      'iframe[src*="googleads"]',
      'iframe[id*="google_ads"]',
      'iframe[src*="doubleclick"]',
      '[class*="ad-container" i]',
      '[id*="ad-container" i]',
      '[class*="ad-banner" i]',
      '[id*="ad-banner" i]'
    ];
    adSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(node => {
          const el = node as HTMLElement;
          if (!this.isProtectedPrimaryContent(el)) candidates.push(el);
        });
      } catch (e) {}
    });

    // Signal 2: Verified Cookie / GDPR consent banners
    const cookieSelectors = [
      '[id*="cookie-banner" i]',
      '[class*="cookie-banner" i]',
      '[id*="cookie-notice" i]',
      '[class*="cookie-notice" i]',
      '[id*="gdpr" i]',
      '[class*="gdpr" i]'
    ];
    cookieSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(node => {
          const el = node as HTMLElement;
          if (!this.isProtectedPrimaryContent(el)) candidates.push(el);
        });
      } catch (e) {}
    });

    // Signal 3: Verified promotional modals with overlay behavior
    const promoSelectors = [
      '[id*="newsletter-popup" i]',
      '[class*="newsletter-popup" i]',
      '[id*="promo-modal" i]',
      '[class*="promo-modal" i]'
    ];
    promoSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(node => {
          const el = node as HTMLElement;
          if (!this.isProtectedPrimaryContent(el)) {
            const style = window.getComputedStyle(el);
            if (style.position === "fixed" || style.position === "absolute") {
              candidates.push(el);
            }
          }
        });
      } catch (e) {}
    });

    // De-duplicate candidate elements
    const uniqueCandidates = Array.from(new Set(candidates));

    // Filter candidate elements to ensure visible bounding box
    return uniqueCandidates.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  private showSimplifierToast(message: string) {
    this.removeSimplifierToast();

    this.toastElement = document.createElement("div");
    this.toastElement.id = "na-simplifier-toast";
    
    const s = this.toastElement.style;
    s.position = "fixed";
    s.top = "20px";
    s.right = "20px";
    s.background = "#0f172a";
    s.color = "#ffffff";
    s.padding = "12px 18px";
    s.borderRadius = "12px";
    s.fontSize = "12px";
    s.fontWeight = "700";
    s.fontFamily = "'Outfit', system-ui, -apple-system, sans-serif";
    s.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.35)";
    s.border = "1px solid rgba(255, 255, 255, 0.15)";
    s.zIndex = "2147483647";
    s.display = "flex";
    s.alignItems = "center";
    s.gap = "10px";
    s.cursor = "pointer";
    s.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
    s.opacity = "0";
    s.transform = "translateY(-10px)";

    this.toastElement.innerHTML = `
      <span>${message}</span>
      <span style="font-size: 11px; color: #94a3b8; margin-left: 6px;">✕</span>
    `;

    const el = this.toastElement;
    el.addEventListener("click", () => this.removeSimplifierToast());
    document.body.appendChild(el);

    setTimeout(() => {
      if (this.toastElement) {
        this.toastElement.style.opacity = "1";
        this.toastElement.style.transform = "translateY(0)";
      }
    }, 50);

    setTimeout(() => {
      this.removeSimplifierToast();
    }, 5000);
  }

  private removeSimplifierToast() {
    if (this.toastElement) {
      this.toastElement.remove();
      this.toastElement = null;
    }
  }
}
