// ─────────────────────────────────────────────────────────────────────────────
// NeuroCopilotExecutor — Client-side Autonomous Form Filling & Web Assistant
// Orchestrates FormDetector, UserProfileManager, PreviewModal, PaymentSafety, and Browser Action Executor.
// ─────────────────────────────────────────────────────────────────────────────

import { FormDetector, FormScanResult, ExtractedField } from "./formDetector";
import { UserProfileManager, UserProfileData } from "./userProfileManager";
import { NeuroPreviewModal } from "./previewModal";
import { NeuroPaymentSafety } from "./paymentSafety";
import {
  clickSemanticElement,
  findBestSemanticElement,
  normalizeSemanticText,
  setSemanticValue,
} from "./semanticDom";

export interface ActionStep {
  action: "type" | "click" | "scroll" | "select" | "next_page" | "add_to_cart" | "payment_safety_freeze" | "autofill" | string;
  target?: string;
  value?: string;
  message?: string;
}

export class NeuroCopilotExecutor {
  public formDetector: FormDetector;
  public profileManager: UserProfileManager;
  public previewModal: NeuroPreviewModal;
  public paymentSafety: NeuroPaymentSafety;
  private backendUrl = "http://localhost:8000";

  constructor() {
    this.formDetector = new FormDetector();
    this.profileManager = new UserProfileManager();
    this.previewModal = new NeuroPreviewModal();
    this.paymentSafety = new NeuroPaymentSafety();
  }

  /**
   * Main entrypoint for Form Autofill Workflow with explicit permission preview.
   */
  public async executeAutofillWorkflow(userPrompt: string = ""): Promise<boolean> {
    this.logStage("Form detected", `Scanning active DOM page for form inputs. Prompt: "${userPrompt}"`);

    // 1. Payment Safety Check
    if (this.paymentSafety.isPaymentPage()) {
      this.logStage("Waiting for payment approval", "Payment/PIN authorization page detected. Freezing autonomous agent.");
      this.paymentSafety.triggerPaymentSafetyModal((proceed) => {
        if (proceed) {
          this.logStage("User approval received", "User confirmed manual payment PIN entry.");
        } else {
          this.logStage("Waiting for payment approval", "User aborted payment workflow.");
        }
      });
      return false;
    }

    // 2. Universal Form Field Detection
    const scan: FormScanResult = this.formDetector.scanPageForms();
    if (scan.fields.length === 0) {
      this.logStage("Fields extracted", "No fillable input fields found on current web page.");
      return false;
    }

    this.logStage("Fields extracted", `Extracted ${scan.fields.length} controls on page. Purpose: "${scan.formPurpose}"`);

    // 3. AI Form Understanding & Profile Mapping
    const userProfile = await this.profileManager.loadProfile();
    this.logStage("AI mapping", "Mapping form fields to User Profile Memory using AI...");

    const predictions = await this.fetchAutofillPredictions(scan.fields, userPrompt, scan.formPurpose, userProfile);

    // 4. Interactive Permission Overlay Preview
    this.logStage("Preview generated", 'Displaying approval modal: "Do you want me to fill this form?"');

    return new Promise((resolve) => {
      this.previewModal.showPreview(
        scan.formPurpose,
        scan.fields,
        predictions,
        scan.hasFileUpload,
        async (approved, customValues) => {
          if (!approved) {
            this.logStage("User approval received", "User DECLINED form autofill permission.");
            resolve(false);
            return;
          }

          this.logStage("User approval received", "User APPROVED form autofill permission.");

          const finalValues = { ...predictions, ...customValues };

          // 5. Populate Form Controls with framework events
          const count = this.applyAutofill(scan.fields, finalValues);
          this.logStage("Form filled", `Successfully populated ${count} fields automatically.`);

          // Learn updated preferences
          if (finalValues["address"] || finalValues["shipping"]) {
            await this.profileManager.learnPreference(
              "preferredDeliveryAddress",
              finalValues["address"] || finalValues["shipping"]
            );
          }

          resolve(true);
        }
      );
    });
  }

  /**
   * Autonomous Goal Planner & Browser Action Executor.
   */
  public async executeAutonomousGoal(goalInstruction: string): Promise<void> {
    this.logStage("Checkout navigation", `Processing goal: "${goalInstruction}"`);

    if (this.paymentSafety.isPaymentPage()) {
      this.logStage("Waiting for payment approval", "Payment authorization step reached. Freezing automation.");
      this.paymentSafety.triggerPaymentSafetyModal(() => {});
      return;
    }

    try {
      const detectedFields = this.formDetector.scanPageForms();
      const pageContext = {
        title: document.title,
        url: window.location.href,
        headings: Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => h.textContent?.trim()).filter(Boolean).slice(0, 10),
        snippet: (document.body.innerText || "").slice(0, 800),
        interactive_summary: detectedFields.fields.slice(0, 25).map((field) => ({
          label: field.label,
          semanticRole: field.semanticRole,
          type: field.type,
          required: field.required,
        })),
      };

      const userProfile = await this.profileManager.loadProfile();

      const response = await fetch(`${this.backendUrl}/api/copilot/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: goalInstruction,
          page_context: pageContext,
          user_profile: userProfile,
        }),
      });

      if (!response.ok) throw new Error(`Backend navigation error: ${response.status}`);

      const data = await response.json();
      const plan: ActionStep[] = data.plan || [];

      if (plan.length === 0) {
        // Fallback to autofill workflow
        await this.executeAutofillWorkflow(goalInstruction);
        return;
      }

      this.logStage("Checkout navigation", `Generated execution plan with ${plan.length} browser actions.`);

      // Execute action plan sequentially
      for (const step of plan) {
        await this.executeActionStep(step, goalInstruction);
        await new Promise((r) => setTimeout(r, 600)); // snappy pause between steps
      }
    } catch (e) {
      console.error("🤖 Autonomous execution error:", e);
      await this.executeAutofillWorkflow(goalInstruction);
    }
  }

  /**
   * Browser Action Executor for individual action steps (type, click, scroll, select, next_page, add_to_cart).
   */
  public async executeActionStep(step: ActionStep, contextPrompt: string = ""): Promise<boolean> {
    console.log(`🤖 Action Executor: Executing action "${step.action}" -> Target: "${step.target || ""}", Value: "${step.value || ""}"`);

    switch (step.action) {
      case "type":
        return this.executeTypeAction(step.target || "", step.value || "");

      case "click":
        return this.executeClickAction(step.target || "");

      case "scroll":
        return this.executeScrollAction(step.value || "down");

      case "select":
        return this.executeSelectAction(step.target || "", step.value || "");

      case "next_page":
        return this.executeNextPageAction();

      case "add_to_cart":
        return this.executeAddToCartAction();

      case "autofill":
        return this.executeAutofillWorkflow(step.value || contextPrompt);

      case "payment_safety_freeze":
        this.logStage("Checkout navigation", "Checking for payment authorization screen & real payment input fields...");
        const hasPaymentScreen = await this.waitForPaymentPage(5000);
        if (hasPaymentScreen) {
          this.logStage("Waiting for payment approval", "Payment authorization page detected. Freezing autonomous agent.");
          this.paymentSafety.triggerPaymentSafetyModal(() => {});
        } else {
          this.logStage("Checkout navigation", "No payment authorization input fields detected on current page.");
        }
        return false;

      default:
        console.warn(`🤖 Action Executor: Unrecognized action "${step.action}", attempting text/click fallback.`);
        return this.executeClickAction(step.target || step.action);
    }
  }

  /**
   * Waits for the payment authorization screen with real payment input fields to render.
   * If pre-payment action buttons (e.g. "Proceed to Payment", "Pay Now", "Checkout") are present,
   * it will attempt to click them to advance to the payment input page.
   */
  public async waitForPaymentPage(timeoutMs: number = 6000): Promise<boolean> {
    if (this.paymentSafety.isPaymentPage()) return true;

    const startTime = Date.now();
    let clickedProceed = false;

    while (Date.now() - startTime < timeoutMs) {
      if (this.paymentSafety.isPaymentPage()) return true;

      // Attempt to click next/continue/proceed/pay button once if available to trigger payment screen loading
      if (!clickedProceed) {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>("button, a, input[type='button'], input[type='submit'], [role='button']")
        );
        const payNavBtn = candidates.find((el) => {
          const text = (el.innerText || (el as HTMLInputElement).value || "").toLowerCase();
          return (
            text.includes("proceed to pay") ||
            text.includes("pay now") ||
            text.includes("checkout") ||
            text.includes("place order") ||
            text.includes("continue to payment")
          );
        });

        if (payNavBtn && payNavBtn.offsetWidth > 0) {
          payNavBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          this.flashElement(payNavBtn);
          payNavBtn.click();
          clickedProceed = true;
          this.logStage("Checkout navigation", `Navigating to payment gateway screen via element <${payNavBtn.tagName.toLowerCase()}>.`);
        }
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    return this.paymentSafety.isPaymentPage();
  }

  // ── Browser DOM Action Executions ──

  private executeTypeAction(target: string, textValue: string): boolean {
    const el = this.findBestFieldElement(target || textValue);

    if (!el) {
      console.warn(`🤖 Action Executor: Target input for typing not found: "${target}"`);
      return false;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
    setSemanticValue(el, textValue);

    this.flashElement(el);
    this.logStage("Checkout navigation", `Typed "${textValue}" into element <${el.tagName.toLowerCase()} id="${el.id}">.`);
    return true;
  }

  private executeClickAction(target: string): boolean {
    const el = this.findBestActionElement(target || "click action");

    if (!el) {
      console.warn(`🤖 Action Executor: Target element for clicking not found: "${target}"`);
      return false;
    }

    clickSemanticElement(el);
    this.flashElement(el);
    this.logStage("Checkout navigation", `Clicked element <${el.tagName.toLowerCase()} id="${el.id}"> with text "${el.innerText.slice(0, 30)}".`);
    return true;
  }

  private executeScrollAction(direction: string): boolean {
    const amount = direction === "up" ? -500 : 500;
    window.scrollBy({ top: amount, behavior: "smooth" });
    this.logStage("Checkout navigation", `Scrolled page ${direction}.`);
    return true;
  }

  private executeSelectAction(target: string, optionValue: string): boolean {
    const el = this.findBestSelectElement(target || optionValue);

    if (!el) return false;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setSemanticValue(el, optionValue);
    this.flashElement(el);
    this.logStage("Checkout navigation", `Selected option "${optionValue}".`);
    return true;
  }

  private executeNextPageAction(): boolean {
    const nextBtn = this.findBestActionElement("next continue proceed submit apply checkout");

    if (nextBtn) {
      clickSemanticElement(nextBtn);
      this.flashElement(nextBtn);
      this.logStage("Checkout navigation", `Clicked Next/Continue page button.`);
      return true;
    }
    return false;
  }

  private executeAddToCartAction(): boolean {
    const cartBtn = this.findBestActionElement("add to cart buy now add to bag add to basket checkout cart");

    if (cartBtn) {
      clickSemanticElement(cartBtn);
      this.flashElement(cartBtn);
      this.logStage("Checkout navigation", `Clicked Add to Cart button.`);
      return true;
    }

    console.warn("🤖 Action Executor: Could not find Add to Cart button on page.");
    return false;
  }

  private findBestFieldElement(targetQuery: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    const element = findBestSemanticElement(targetQuery, { kind: ["input", "select", "interactive"] });
    if (!element) return null;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return element;
    }

    const nestedField = element.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input:not([type='hidden']), textarea, select"
    );
    return nestedField || null;
  }

  private findBestSelectElement(targetQuery: string): HTMLSelectElement | null {
    const element = findBestSemanticElement(targetQuery, { kind: ["select", "input", "interactive"] });
    if (!element) return null;

    if (element instanceof HTMLSelectElement) {
      return element;
    }

    if (element instanceof HTMLInputElement) {
      const select = element.closest("select");
      if (select instanceof HTMLSelectElement) return select;
    }

    const nestedSelect = element.querySelector<HTMLSelectElement>("select");
    return nestedSelect || null;
  }

  private findBestActionElement(targetQuery: string): HTMLElement | null {
    return findBestSemanticElement(targetQuery, { kind: ["button", "link", "interactive"] });
  }

  /**
   * Calls FastAPI Backend API for field predictions.
   */
  public async fetchAutofillPredictions(
    fields: ExtractedField[],
    prompt: string,
    formPurpose: string,
    userProfile: UserProfileData
  ): Promise<Record<string, string>> {
    const payload = {
      fields: fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        placeholder: f.placeholder,
        label: f.label,
        autocomplete: f.autocomplete,
        semanticRole: f.semanticRole,
        context: f.context,
        confidence: f.confidence,
        options: f.options,
        required: f.required,
        isFileUpload: f.isFileUpload,
        isPaymentField: f.isPaymentField,
      })),
      prompt,
      form_purpose: formPurpose,
      user_profile: userProfile,
    };

    const ports = [8080, 8000];
    for (const port of ports) {
      try {
        const res = await fetch(`http://localhost:${port}/api/copilot/autofill`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          return data.predictions || {};
        }
      } catch (_) {}
    }

    // High quality fallback predictions
    const fallback: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.isPaymentField) return;
      const k = this.resolvePredictionKey(f);
      const resolved = this.resolveValueFromProfile(f, userProfile);
      fallback[k] = resolved;
    });
    return fallback;
  }

  /**
   * Applies values into HTML DOM controls and triggers framework change events
   */
  public applyAutofill(fields: ExtractedField[], predictions: Record<string, string>): number {
    let filledCount = 0;

    fields.forEach((field) => {
      if (field.isPaymentField) return;

      const key = this.resolvePredictionKey(field);
      const val = this.pickPredictionValue(field, predictions);
      if (val !== undefined) {
        const el = field.element;

        if (field.semanticRole === "checkbox" || field.semanticRole === "radio") {
          el.click();
        } else {
          setSemanticValue(el, val);
        }

        this.flashElement(el);
        filledCount++;
      }
    });

    return filledCount;
  }

  private flashElement(el: HTMLElement) {
    try {
      el.classList.remove("na-autofilled-flash");
      void el.offsetWidth;
      el.classList.add("na-autofilled-flash");
    } catch (_) {}
  }

  /**
   * Audit logger output to console, storage, and backend
   */
  private logStage(stage: string, details: string) {
    const formatted = `🤖 [Copilot Log] Stage: "${stage}" | Details: ${details}`;
    console.log(formatted);

    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["neuroCopilotLogs"], (res) => {
          const logs = res.neuroCopilotLogs || [];
          logs.push({ timestamp: new Date().toISOString(), stage, details });
          chrome.storage.local.set({ neuroCopilotLogs: logs.slice(-50) });
        });
      }
    } catch (_) {}

    fetch(`${this.backendUrl}/api/copilot/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, details, url: window.location.href }),
    }).catch(() => {});
  }

  private resolvePredictionKey(field: ExtractedField): string {
    return field.id || field.name || field.label || field.semanticRole || field.placeholder || "field";
  }

  private pickPredictionValue(field: ExtractedField, predictions: Record<string, string>): string | undefined {
    const keys = [
      field.id,
      field.name,
      field.label,
      field.semanticRole,
      field.placeholder,
      normalizeSemanticText(field.label),
      normalizeSemanticText(field.name),
      normalizeSemanticText(field.semanticRole),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim());

    for (const key of keys) {
      const direct = predictions[key];
      if (direct !== undefined) return direct;
    }

    return undefined;
  }

  private resolveValueFromProfile(field: ExtractedField, userProfile: UserProfileData): string {
    const role = normalizeSemanticText(field.semanticRole || `${field.label} ${field.name} ${field.placeholder}`);
    const profileName = userProfile.fullName || userProfile.name || "";
    const nameParts = profileName.split(" ").filter(Boolean);
    const postalCode = userProfile.postalCode || userProfile.pinCode || "";

    if (role.includes("first_name")) return nameParts[0] || profileName;
    if (role.includes("last_name")) return nameParts.slice(-1)[0] || profileName;
    if (role.includes("full_name") || role === "name") return profileName;
    if (role.includes("email")) return userProfile.email;
    if (role.includes("phone")) return userProfile.phone;
    if (role.includes("address")) return userProfile.address;
    if (role.includes("city")) return userProfile.city;
    if (role.includes("state")) return userProfile.state;
    if (role.includes("country")) return userProfile.country;
    if (role.includes("postal_code")) return postalCode;
    if (role.includes("date_of_birth") || role.includes("dob") || field.type === "date") return userProfile.dob;
    if (role.includes("gender")) return userProfile.gender || "";
    if (role.includes("company")) return "";
    if (role.includes("job_title")) return "";
    if (role.includes("resume")) return userProfile.resumeDetails;
    if (role.includes("education")) return userProfile.education;
    if (role.includes("experience")) return userProfile.experience;
    if (role.includes("search")) return field.placeholder || field.label || "";

    if (field.options && field.options.length > 0) return field.options[0];
    if (field.type === "checkbox" || field.type === "radio") return "true";

    return userProfile.name || userProfile.email || field.label || field.placeholder || "";
  }
}
