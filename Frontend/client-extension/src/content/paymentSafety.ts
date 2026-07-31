// ─────────────────────────────────────────────────────────────────────────────
// NeuroPaymentSafety — Payment Authorization & Zero-Storage Safety Guardrail
// Prevents automated payment completion and protects PINs, OTPs, CVVs, and Passkeys.
// ─────────────────────────────────────────────────────────────────────────────

export class NeuroPaymentSafety {
  private styleElement: HTMLStyleElement | null = null;
  private modalContainer: HTMLDivElement | null = null;

  constructor() {
    this.injectStyles();
  }

  private injectStyles() {
    if (document.getElementById("na-payment-safety-css")) return;

    this.styleElement = document.createElement("style");
    this.styleElement.id = "na-payment-safety-css";
    this.styleElement.innerHTML = `
      .na-payment-backdrop {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100vw !important; height: 100vh !important;
        background: rgba(15, 23, 42, 0.75) !important;
        backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;
        z-index: 2147483647 !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-family: system-ui, -apple-system, sans-serif !important;
      }
      .na-payment-card {
        background: #ffffff !important;
        width: 480px !important;
        max-width: 90vw !important;
        border-radius: 24px !important;
        box-shadow: 0 25px 60px rgba(220, 38, 38, 0.25) !important;
        overflow: hidden !important;
        border: 2px solid #ef4444 !important;
      }
      .na-payment-header {
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%) !important;
        color: white !important;
        padding: 20px 24px !important;
        display: flex !important; align-items: center !important; gap: 12px !important;
      }
      .na-payment-body {
        padding: 24px !important;
        display: flex !important; flex-direction: column !important; gap: 16px !important;
        color: #1e293b !important;
      }
      .na-payment-notice {
        background: #fef2f2 !important;
        border: 1px solid #fecaca !important;
        border-radius: 12px !important;
        padding: 14px 16px !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
        color: #991b1b !important;
      }
      .na-payment-footer {
        padding: 16px 24px !important;
        background: #f8fafc !important;
        display: flex !important; justify-content: flex-end !important; gap: 12px !important;
        border-top: 1px solid #e2e8f0 !important;
      }
      .na-btn-pay-confirm {
        background: #059669 !important;
        color: white !important; border: none !important;
        padding: 12px 20px !important; border-radius: 12px !important;
        font-weight: 800 !important; font-size: 13px !important; cursor: pointer !important;
      }
      .na-btn-pay-stop {
        background: #ef4444 !important;
        color: white !important; border: none !important;
        padding: 12px 20px !important; border-radius: 12px !important;
        font-weight: 800 !important; font-size: 13px !important; cursor: pointer !important;
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Scans DOM to find real, visible payment authorization input fields (CVV, UPI PIN, OTP, Passkey, Card Number).
   */
  public getPaymentInputFields(): HTMLInputElement[] {
    const rawInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input, textarea"));

    return rawInputs.filter((inp) => {
      // Exclude extension UI elements
      if (
        inp.closest(".na-top-dock") ||
        inp.closest(".na-chat-box") ||
        inp.closest(".na-preview-modal") ||
        inp.closest(".na-payment-modal")
      ) {
        return false;
      }

      // Check visibility
      const isVisible =
        inp.offsetWidth > 0 &&
        inp.offsetHeight > 0 &&
        window.getComputedStyle(inp).display !== "none" &&
        window.getComputedStyle(inp).visibility !== "hidden";

      if (!isVisible) return false;

      const type = (inp.type || "text").toLowerCase();
      if (type === "hidden" || type === "submit" || type === "button" || type === "reset") return false;

      const labelText = this.getAssociatedLabelText(inp).toLowerCase();
      const info = `${inp.id} ${inp.name} ${inp.placeholder} ${inp.getAttribute("aria-label") || ""} ${inp.getAttribute("autocomplete") || ""} ${type}`.toLowerCase();
      const combined = `${info} ${labelText}`;

      const isPaymentKeyword =
        combined.includes("cvv") ||
        combined.includes("cvc") ||
        combined.includes("upi") ||
        combined.includes("upipin") ||
        combined.includes("pin") ||
        combined.includes("otp") ||
        combined.includes("passkey") ||
        combined.includes("card_number") ||
        combined.includes("cardnumber") ||
        combined.includes("creditcard") ||
        combined.includes("security_code") ||
        combined.includes("auth_code") ||
        combined.includes("verification_code");

      const isPasswordInPaymentContext =
        type === "password" &&
        (combined.includes("payment") ||
          combined.includes("card") ||
          combined.includes("bank") ||
          combined.includes("checkout") ||
          document.body.innerText.toLowerCase().includes("payment") ||
          document.body.innerText.toLowerCase().includes("cvv") ||
          document.body.innerText.toLowerCase().includes("otp"));

      return isPaymentKeyword || isPasswordInPaymentContext;
    });
  }

  private getAssociatedLabelText(element: HTMLElement): string {
    if (element.id) {
      try {
        const labelEl = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (labelEl && labelEl.textContent) return labelEl.textContent;
      } catch (_) {}
    }
    const parentLabel = element.closest("label");
    if (parentLabel && parentLabel.textContent) return parentLabel.textContent;

    const prev = element.previousElementSibling;
    if (prev && prev.textContent && prev.textContent.trim().length < 80) {
      return prev.textContent;
    }
    return "";
  }

  /**
   * Scans DOM to check if active page is a real payment authorization screen with sensitive payment input fields.
   */
  public isPaymentPage(): boolean {
    const paymentInputs = this.getPaymentInputFields();
    if (paymentInputs.length > 0) return true;

    // Strict fallback: Requires explicit PIN/OTP instruction text AND at least one visible input control
    const pageText = (document.body.innerText || "").toLowerCase();
    const hasExplicitAuthInstruction =
      pageText.includes("enter upi pin") ||
      pageText.includes("enter cvv") ||
      pageText.includes("enter otp") ||
      pageText.includes("enter verification code");

    if (!hasExplicitAuthInstruction) return false;

    const visibleInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input")).filter((inp) => {
      return (
        inp.offsetWidth > 0 &&
        inp.offsetHeight > 0 &&
        !inp.closest(".na-payment-modal") &&
        inp.type !== "hidden" &&
        inp.type !== "submit"
      );
    });

    return visibleInputs.length > 0;
  }

  /**
   * Checks whether the user has entered code (PIN/CVV/OTP) into any payment input field on the website.
   */
  public hasUserEnteredCode(): boolean {
    const paymentInputs = this.getPaymentInputFields();
    return paymentInputs.some((inp) => inp.value && inp.value.trim().length > 0);
  }

  /**
   * Prompts payment safety guardrail modal stopping autonomous completion.
   * Only reveals "Proceed" after user enters their payment code into the website input fields.
   */
  public triggerPaymentSafetyModal(onUserDecision: (proceed: boolean) => void): void {
    this.close();

    this.modalContainer = document.createElement("div");
    this.modalContainer.className = "na-payment-backdrop na-payment-modal";
    this.modalContainer.innerHTML = `
      <div class="na-payment-card">
        <div class="na-payment-header">
          <span style="font-size:24px;">🛡️</span>
          <div style="font-size:16px; font-weight:800;">Payment Safety Guardrail Triggered</div>
        </div>
        <div class="na-payment-body">
          <div style="font-size:14px; font-weight:700; color:#0f172a;">
            Autonomous navigation has been PAUSED for your security.
          </div>
          <div class="na-payment-notice">
            🔒 <strong>Zero-Storage Security Policy:</strong><br/>
            Neuro-Assist never generates, stores, or accesses your UPI PIN, Card CVV, OTP, Passkey, or Passwords.<br/><br/>
            Please review the order details on screen and enter your payment security codes manually into the website input fields above using your keyboard or voice dictation.
          </div>
          <div id="naPaymentStatusContainer" style="padding:10px 14px; border-radius:10px; background:#f1f5f9; color:#475569; font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px;">
            <span id="naStatusIcon">⏳</span> <span id="naStatusText">Waiting for manual code entry on website...</span>
          </div>
        </div>
        <div class="na-payment-footer">
          <button class="na-btn-pay-stop" id="naAbortPaymentBtn">Abort Workflow</button>
          <button class="na-btn-pay-confirm" id="naConfirmManualPaymentBtn" style="display:none;">I Have Entered My Code — Proceed</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalContainer);

    const abortBtn = this.modalContainer.querySelector("#naAbortPaymentBtn") as HTMLButtonElement | null;
    const confirmBtn = this.modalContainer.querySelector("#naConfirmManualPaymentBtn") as HTMLButtonElement | null;
    const statusIcon = this.modalContainer.querySelector("#naStatusIcon");
    const statusText = this.modalContainer.querySelector("#naStatusText");

    let checkInterval: any = null;
    const paymentInputs = this.getPaymentInputFields();

    const updateButtonVisibility = () => {
      const entered = this.hasUserEnteredCode();
      if (confirmBtn) {
        confirmBtn.style.display = entered ? "inline-block" : "none";
      }
      if (statusIcon && statusText) {
        if (entered) {
          statusIcon.textContent = "✅";
          statusText.textContent = "Payment code detected on website. You may now proceed.";
          if (statusText.parentElement) {
            statusText.parentElement.style.background = "#ecfdf5";
            statusText.parentElement.style.color = "#047857";
          }
        } else {
          statusIcon.textContent = "⏳";
          statusText.textContent = "Waiting for manual code entry on website...";
          if (statusText.parentElement) {
            statusText.parentElement.style.background = "#f1f5f9";
            statusText.parentElement.style.color = "#475569";
          }
        }
      }
    };

    // Attach listeners to website payment inputs
    paymentInputs.forEach((inp) => {
      inp.addEventListener("input", updateButtonVisibility);
      inp.addEventListener("keyup", updateButtonVisibility);
      inp.addEventListener("change", updateButtonVisibility);
    });

    // Poll interval as backup for virtual inputs / autofill
    checkInterval = setInterval(updateButtonVisibility, 400);

    const cleanup = () => {
      if (checkInterval) clearInterval(checkInterval);
      paymentInputs.forEach((inp) => {
        inp.removeEventListener("input", updateButtonVisibility);
        inp.removeEventListener("keyup", updateButtonVisibility);
        inp.removeEventListener("change", updateButtonVisibility);
      });
    };

    abortBtn?.addEventListener("click", () => {
      cleanup();
      this.close();
      onUserDecision(false);
    });

    confirmBtn?.addEventListener("click", () => {
      cleanup();
      this.close();
      onUserDecision(true);
    });
  }

  public close() {
    if (this.modalContainer) {
      this.modalContainer.remove();
      this.modalContainer = null;
    }
  }
}
