// ─────────────────────────────────────────────────────────────────────────────
// FormDetector — Universal Web Form & Field Detection Engine
// Supports Google Forms, Amazon, Flipkart, LinkedIn Easy Apply, E-commerce, & generic web forms.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedField {
  id: string;
  name: string;
  type: string; // text, email, tel, password, textarea, select, radio, checkbox, date, file, combobox, contenteditable
  placeholder: string;
  label: string;
  autocomplete: string;
  semanticRole: string;
  context: string;
  confidence: number;
  options?: string[]; // Dropdown / Radio option values
  value: string;
  required: boolean;
  isFileUpload: boolean;
  isPaymentField: boolean;
  element: HTMLElement;
}

export interface FormScanResult {
  formPurpose: string;
  fields: ExtractedField[];
  hasFileUpload: boolean;
  hasPaymentFields: boolean;
}

export class FormDetector {
  /**
   * Scans the active DOM page for fillable form controls and determines form purpose.
   */
  public scanPageForms(): FormScanResult {
    const selector = `
      input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']),
      textarea,
      select,
      [role='combobox'],
      [role='listbox'],
      [role='radio'],
      [role='checkbox'],
      [contenteditable='true']
    `;

    const rawInputs = Array.from(document.querySelectorAll<HTMLElement>(selector));

    const fields: ExtractedField[] = [];
    const processedElements = new Set<HTMLElement>();
    let hasFileUpload = false;
    let hasPaymentFields = false;

    rawInputs.forEach((el) => {
      // Exclude extension UI elements
      if (
        el.closest(".na-top-dock") ||
        el.closest(".na-chat-box") ||
        el.closest(".na-preview-modal") ||
        el.closest(".na-payment-modal")
      ) {
        return;
      }

      if (processedElements.has(el)) return;
      processedElements.add(el);

      const tagName = el.tagName.toLowerCase();
      let type = "text";
      const role = el.getAttribute("role") || "";

      if (tagName === "input") {
        type = (el as HTMLInputElement).type ? (el as HTMLInputElement).type.toLowerCase() : "text";
      } else if (tagName === "textarea") {
        type = "textarea";
      } else if (tagName === "select") {
        type = "select";
      } else if (role === "combobox" || role === "listbox") {
        type = "select";
      } else if (role === "radio") {
        type = "radio";
      } else if (role === "checkbox") {
        type = "checkbox";
      } else if (el.getAttribute("contenteditable") === "true") {
        type = "textarea";
      }

      const id = el.id || "";
      const name = el.getAttribute("name") || "";
      const placeholder = (el as HTMLInputElement).placeholder || el.getAttribute("aria-placeholder") || "";
      const label = this.extractLabelText(el);
      const autocomplete = (el as HTMLInputElement).autocomplete || el.getAttribute("autocomplete") || "";
      const semanticRole = this.deriveSemanticRole(el, label, name, placeholder, autocomplete);
      const context = this.collectFieldContext(el);
      const required =
        (el as HTMLInputElement).required ||
        el.hasAttribute("aria-required") ||
        label.includes("*") ||
        el.getAttribute("aria-required") === "true";
      const currentValue =
        (el as HTMLInputElement).value ||
        el.innerText ||
        el.getAttribute("aria-valuenow") ||
        "";

      // Extract options if select element or radio group
      let options: string[] | undefined;
      if (tagName === "select") {
        const selectEl = el as HTMLSelectElement;
        options = Array.from(selectEl.options)
          .map((opt) => opt.text.trim())
          .filter((t) => t.length > 0 && !t.toLowerCase().includes("select"));
      } else if (role === "combobox" || role === "listbox") {
        const optEls = el.querySelectorAll("[role='option'], option");
        if (optEls.length > 0) {
          options = Array.from(optEls).map((opt) => opt.textContent?.trim() || "").filter(Boolean);
        }
      } else if (type === "radio") {
        // Collect radio group siblings
        const radioGroup = el.closest("[role='radiogroup'], fieldset, form, div[role='listitem']");
        if (radioGroup) {
          const siblingRadios = radioGroup.querySelectorAll("[role='radio'], input[type='radio']");
          options = Array.from(siblingRadios)
            .map((r) => this.extractLabelText(r as HTMLElement) || (r as HTMLInputElement).value)
            .filter(Boolean);
        }
      }

      const isFileUpload = type === "file";
      if (isFileUpload) hasFileUpload = true;

      // Identify payment or sensitive credentials (CVV, UPI PIN, OTP, Passkey)
      const fieldIdentifier = `${id} ${name} ${label} ${placeholder}`.toLowerCase();
      const isPaymentField =
        type === "password" ||
        fieldIdentifier.includes("cvv") ||
        fieldIdentifier.includes("upi") ||
        fieldIdentifier.includes("pin") ||
        fieldIdentifier.includes("otp") ||
        fieldIdentifier.includes("card number") ||
        fieldIdentifier.includes("passkey");

      if (isPaymentField) hasPaymentFields = true;

      const confidence = this.computeConfidence({ label, placeholder, name, autocomplete, semanticRole, required, type });

      fields.push({
        id,
        name,
        type,
        placeholder,
        label,
        autocomplete,
        semanticRole,
        context,
        confidence,
        options,
        value: currentValue.trim(),
        required,
        isFileUpload,
        isPaymentField,
        element: el,
      });
    });

    const formPurpose = this.detectFormPurpose(fields);

    console.log(
      `🤖 FormDetector: Scanned ${fields.length} controls on page. Purpose: "${formPurpose}" (FileUpload: ${hasFileUpload}, Payment: ${hasPaymentFields})`
    );

    return {
      formPurpose,
      fields,
      hasFileUpload,
      hasPaymentFields,
    };
  }

  /**
   * Universal Label Resolver using structural hints and ARIA metadata.
   */
  private extractLabelText(element: HTMLElement): string {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labels = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "")
        .filter(Boolean);
      if (labels.length > 0) {
        return labels.join(" ").replace(/\s+/g, " ");
      }
    }

    // Explicit aria-label or title
    const ariaLabel = element.getAttribute("aria-label") || element.getAttribute("title");
    if (ariaLabel) return ariaLabel.trim();

    // Linked <label for="...">
    if (element.id) {
      try {
        const labelEl = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (labelEl && labelEl.textContent) {
          return labelEl.textContent.trim().replace(/\s+/g, " ");
        }
      } catch (_) {}
    }

    // Enclosing <label>
    const parentLabel = element.closest("label");
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim().replace(/\s+/g, " ");
    }

    // Nearby structural text
    let prev = element.previousElementSibling;
    if (prev && (prev.tagName.toLowerCase() === "label" || prev.tagName.toLowerCase() === "span" || prev.tagName.toLowerCase() === "div")) {
      if (prev.textContent && prev.textContent.trim().length < 80) {
        return prev.textContent.trim().replace(/\s+/g, " ");
      }
    }

    const wrapper = element.closest("fieldset, [role='group'], [role='radiogroup'], .form-group, .field, .input-group, .control-group, .row, .col, li, section, article");
    if (wrapper) {
      const text = (wrapper.textContent || "").trim();
      if (text.length > 0 && text.length < 120) {
        return text.replace(/\s+/g, " ");
      }
    }

    // Placeholder fallback
    const placeholder = (element as HTMLInputElement).placeholder || element.getAttribute("placeholder");
    if (placeholder) return placeholder.trim();

    // Name attribute fallback
    const name = element.getAttribute("name");
    if (name) return name.trim();

    const ariaDescribedBy = element.getAttribute("aria-describedby");
    if (ariaDescribedBy) {
      const description = ariaDescribedBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "")
        .filter(Boolean)
        .join(" ");
      if (description) return description.replace(/\s+/g, " ");
    }

    return element.id || "Form Field";
  }

  private collectFieldContext(element: HTMLElement): string {
    const contextParts = new Set<string>();

    const add = (value?: string | null) => {
      if (!value) return;
      const normalized = value.trim().replace(/\s+/g, " ");
      if (normalized) {
        contextParts.add(normalized);
      }
    };

    add(element.getAttribute("aria-describedby"));
    add(element.getAttribute("autocomplete"));
    add(element.getAttribute("inputmode"));

    const wrapper = element.closest("fieldset, form, [role='group'], [role='radiogroup'], .form-group, .field, .input-group, .control-group, section, article, li");
    if (wrapper) {
      add(wrapper.textContent);
    }

    return Array.from(contextParts).join(" | ");
  }

  private deriveSemanticRole(element: HTMLElement, label: string, name: string, placeholder: string, autocomplete: string): string {
    const source = `${label} ${name} ${placeholder} ${autocomplete} ${element.getAttribute("type") || ""} ${element.getAttribute("role") || ""}`.toLowerCase();

    const roleMap: Array<[string, string[]]> = [
      ["full_name", ["full name", "applicant name", "customer name", "your name", "name on card", "name"]],
      ["first_name", ["first name", "given name", "forename"]],
      ["last_name", ["last name", "surname", "family name"]],
      ["email", ["email", "e-mail", "mail"]],
      ["phone", ["phone", "mobile", "telephone", "contact"]],
      ["address", ["address", "street", "line 1", "line 2", "residence"]],
      ["city", ["city", "town", "municipality"]],
      ["state", ["state", "province", "region", "county"]],
      ["country", ["country", "nation"]],
      ["postal_code", ["zip", "postal", "postcode", "pin code", "pincode"]],
      ["date_of_birth", ["date of birth", "dob", "birth date", "birth"]],
      ["gender", ["gender", "sex"]],
      ["company", ["company", "organization", "employer", "business"]],
      ["job_title", ["job title", "designation", "role", "position"]],
      ["search", ["search", "find", "look for", "query"]],
      ["password", ["password", "passcode", "secret"]],
      ["payment", ["card", "cvv", "cvc", "upi", "otp", "pin", "payment"]],
      ["quantity", ["quantity", "qty", "amount", "number of"]],
      ["size", ["size", "fit"]],
      ["color", ["color", "colour", "shade", "hue"]],
      ["destination", ["destination", "location", "travel", "from", "to"]],
      ["message", ["message", "comments", "notes", "description", "subject"]],
      ["resume", ["resume", "cv", "curriculum vitae"]],
      ["education", ["education", "degree", "college", "university", "school"]],
      ["experience", ["experience", "work history", "employment"]],
    ];

    for (const [role, terms] of roleMap) {
      if (terms.some((term) => source.includes(term))) {
        return role;
      }
    }

    if (element.tagName.toLowerCase() === "select") return "select";
    if (element.tagName.toLowerCase() === "textarea") return "text_area";
    if ((element as HTMLInputElement).type === "date") return "date";
    if ((element as HTMLInputElement).type === "checkbox") return "checkbox";
    if ((element as HTMLInputElement).type === "radio") return "radio";
    if ((element as HTMLInputElement).type === "email") return "email";
    if ((element as HTMLInputElement).type === "tel") return "phone";
    if ((element as HTMLInputElement).type === "password") return "password";

    return "text";
  }

  private computeConfidence(input: { label: string; placeholder: string; name: string; autocomplete: string; semanticRole: string; required: boolean; type: string; }): number {
    let score = 0.35;
    if (input.label) score += 0.25;
    if (input.placeholder) score += 0.1;
    if (input.name) score += 0.1;
    if (input.autocomplete) score += 0.1;
    if (input.semanticRole !== "text") score += 0.1;
    if (input.required) score += 0.05;
    if (input.type !== "text") score += 0.05;
    return Math.min(0.99, score);
  }

  /**
   * Analyzes purpose of the form based on visible headings, text, and field names.
   */
  private detectFormPurpose(fields: ExtractedField[]): string {
    const pageText = (document.body.innerText || "").slice(0, 2000).toLowerCase();
    const fieldNames = fields.map((f) => `${f.id} ${f.name} ${f.label} ${f.placeholder}`).join(" ").toLowerCase();

    if (pageText.includes("checkout") || fieldNames.includes("shipping") || fieldNames.includes("cart") || fieldNames.includes("delivery")) {
      return "Checkout / Shipping Form";
    } else if (pageText.includes("application") || pageText.includes("apply now") || fieldNames.includes("resume") || fieldNames.includes("experience")) {
      return "Job Application Form";
    } else if (pageText.includes("register") || pageText.includes("sign up") || fieldNames.includes("confirm password")) {
      return "User Registration Form";
    } else if (pageText.includes("login") || pageText.includes("sign in") || fieldNames.includes("password")) {
      return "Account Login Form";
    } else if (fieldNames.includes("message") || fieldNames.includes("subject") || pageText.includes("contact")) {
      return "Contact Form";
    }
    return "Web Input Form";
  }
}
