// ─────────────────────────────────────────────────────────────────────────────
// NeuroPreviewModal — Interactive Permission Overlay Before Form Filling
// Enforces explicit user permission with visual field preview.
// ─────────────────────────────────────────────────────────────────────────────

import { ExtractedField } from "./formDetector";

export interface PreviewConfirmCallback {
  (approved: boolean, customValues: Record<string, string>): void;
}

export class NeuroPreviewModal {
  private modalContainer: HTMLDivElement | null = null;
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.injectStyles();
  }

  private injectStyles() {
    if (document.getElementById("na-preview-modal-css")) return;

    this.styleElement = document.createElement("style");
    this.styleElement.id = "na-preview-modal-css";
    this.styleElement.innerHTML = `
      .na-preview-backdrop {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100vw !important; height: 100vh !important;
        background: rgba(15, 23, 42, 0.55) !important;
        backdrop-filter: blur(10px) !important; -webkit-backdrop-filter: blur(10px) !important;
        z-index: 2147483647 !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        animation: naFadeIn 0.25s ease forwards !important;
      }
      @keyframes naFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      .na-preview-card {
        background: #ffffff !important;
        width: 540px !important;
        max-width: 92vw !important;
        max-height: 85vh !important;
        border-radius: 24px !important;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3) !important;
        display: flex !important; flex-direction: column !important;
        overflow: hidden !important;
        border: 1px solid rgba(226, 232, 240, 0.8) !important;
      }
      .na-preview-header {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%) !important;
        color: white !important;
        padding: 20px 24px !important;
        display: flex !important; justify-content: space-between !important; align-items: center !important;
      }
      .na-preview-title {
        font-size: 16px !important; font-weight: 800 !important;
        display: flex !important; align-items: center !important; gap: 10px !important;
      }
      .na-preview-subtitle {
        font-size: 12px !important;
        color: #cbd5e1 !important;
        margin-top: 4px !important;
      }
      .na-preview-body {
        padding: 24px !important;
        overflow-y: auto !important;
        flex: 1 !important;
        display: flex !important; flex-direction: column !important; gap: 16px !important;
      }
      .na-field-list {
        display: flex !important; flex-direction: column !important; gap: 10px !important;
        background: #f8fafc !important;
        padding: 16px !important;
        border-radius: 16px !important;
        border: 1px solid #e2e8f0 !important;
      }
      .na-field-item {
        display: flex !important; justify-content: space-between !important; align-items: center !important;
        font-size: 13px !important; gap: 12px !important;
      }
      .na-field-label {
        font-weight: 700 !important; color: #334155 !important; flex: 1 !important;
      }
      .na-field-input {
        flex: 1.2 !important;
        padding: 6px 10px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        font-size: 12px !important;
        background: white !important;
        color: #0f172a !important;
      }
      .na-preview-alert {
        background: #fffbe6 !important;
        border-left: 4px solid #f59e0b !important;
        padding: 12px 16px !important;
        border-radius: 8px !important;
        font-size: 12px !important;
        color: #92400e !important;
        display: flex !important; align-items: center !important; gap: 10px !important;
      }
      .na-preview-question {
        font-size: 15px !important; font-weight: 800 !important; color: #0f172a !important;
        text-align: center !important; margin-top: 4px !important;
      }
      .na-preview-footer {
        padding: 16px 24px !important;
        background: #f1f5f9 !important;
        display: flex !important; gap: 12px !important; justify-content: flex-end !important;
        border-top: 1px solid #e2e8f0 !important;
      }
      .na-btn-confirm {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
        color: white !important; border: none !important;
        padding: 12px 22px !important; border-radius: 12px !important;
        font-weight: 700 !important; font-size: 13px !important; cursor: pointer !important;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;
        transition: transform 0.15s !important;
      }
      .na-btn-confirm:hover { transform: translateY(-1px) !important; }
      .na-btn-cancel {
        background: #e2e8f0 !important; color: #475569 !important; border: none !important;
        padding: 12px 18px !important; border-radius: 12px !important;
        font-weight: 700 !important; font-size: 13px !important; cursor: pointer !important;
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Prompts the user with explicit preview of detected fields & proposed values.
   */
  public showPreview(
    formPurpose: string,
    fields: ExtractedField[],
    proposedValues: Record<string, string>,
    hasFileUpload: boolean,
    onConfirm: PreviewConfirmCallback
  ): void {
    this.close();

    this.modalContainer = document.createElement("div");
    this.modalContainer.className = "na-preview-backdrop na-preview-modal";

    let fieldsHtml = "";
    fields.forEach((field) => {
      const key = field.id || field.name || field.label;
      const val = proposedValues[key] || field.value || "";
      fieldsHtml += `
        <div class="na-field-item">
          <span class="na-field-label">${this.escapeHtml(field.label || key)} ${field.required ? '<span style="color:#ef4444">*</span>' : ""}<div style="font-size:11px; font-weight:500; color:#64748b; margin-top:2px;">${this.escapeHtml(field.semanticRole || field.type)}</div></span>
          <input type="text" class="na-field-input" data-key="${this.escapeHtml(key)}" value="${this.escapeHtml(val)}" />
        </div>
      `;
    });

    const fileAlertHtml = hasFileUpload
      ? `
      <div class="na-preview-alert">
        <span>⚠️ <strong>File Upload Detected:</strong> This form requests file submission. Please review before uploading any documents.</span>
      </div>
    `
      : "";

    this.modalContainer.innerHTML = `
      <div class="na-preview-card">
        <div class="na-preview-header">
          <div>
            <div class="na-preview-title">🤖 AI Copilot — Form Autofill Permission</div>
            <div class="na-preview-subtitle">A form has been detected. Would you like me to fill it automatically?</div>
          </div>
          <span style="cursor:pointer; font-size:16px;" id="naClosePreview">✕</span>
        </div>
        <div class="na-preview-body">
          <div style="font-size:13px; color:#64748b;">Detected Form Purpose: <strong style="color:#0f172a;">${this.escapeHtml(formPurpose)}</strong></div>
          ${fileAlertHtml}
          <div style="font-size:12px; color:#475569; background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:12px 14px; line-height:1.5;">
            The values below are proposed from your saved profile and the detected field semantics. You can edit them before approving.
          </div>
          <div class="na-field-list">
            ${fieldsHtml}
          </div>
          <div class="na-preview-question">Do you want me to fill this form automatically?</div>
        </div>
        <div class="na-preview-footer">
          <button class="na-btn-cancel" id="naCancelAutofillBtn">Cancel</button>
          <button class="na-btn-confirm" id="naApproveAutofillBtn">✓ Approve & Fill Form</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalContainer);

    // Event handlers
    const closeBtn = this.modalContainer.querySelector("#naClosePreview");
    const cancelBtn = this.modalContainer.querySelector("#naCancelAutofillBtn");
    const approveBtn = this.modalContainer.querySelector("#naApproveAutofillBtn");

    const handleAction = (approved: boolean) => {
      const updatedValues: Record<string, string> = {};
      if (approved && this.modalContainer) {
        const inputs = this.modalContainer.querySelectorAll<HTMLInputElement>(".na-field-input");
        inputs.forEach((inp) => {
          const k = inp.getAttribute("data-key");
          if (k) updatedValues[k] = inp.value;
        });
      }
      this.close();
      onConfirm(approved, updatedValues);
    };

    closeBtn?.addEventListener("click", () => handleAction(false));
    cancelBtn?.addEventListener("click", () => handleAction(false));
    approveBtn?.addEventListener("click", () => handleAction(true));
  }

  public close() {
    if (this.modalContainer) {
      this.modalContainer.remove();
      this.modalContainer = null;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
