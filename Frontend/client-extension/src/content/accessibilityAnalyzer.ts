export interface AccessibilityIssue {
  id: string;
  category: "perceivable" | "operable" | "understandable" | "robust";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
}

export interface PourBreakdown {
  perceivable: number;
  operable: number;
  understandable: number;
  robust: number;
}

export interface AccessibilityAuditResult {
  score: number;
  status: "Excellent" | "Good" | "Fair" | "Poor";
  breakdown: PourBreakdown;
  issues: AccessibilityIssue[];
  timestamp: number;
}

export class AccessibilityAnalyzer {
  public static analyzeDocument(doc: Document): AccessibilityAuditResult {
    const issues: AccessibilityIssue[] = [];

    let perceivableDeduction = 0;
    let operableDeduction = 0;
    let understandableDeduction = 0;
    let robustDeduction = 0;

    // 1. Missing Image Alt Text (Perceivable)
    const images = Array.from(doc.querySelectorAll("img"));
    const imagesMissingAlt = images.filter(img => !img.hasAttribute("alt"));
    if (imagesMissingAlt.length > 0) {
      const count = imagesMissingAlt.length;
      perceivableDeduction += Math.min(30, count * 5);
      issues.push({
        id: "missing-alt",
        category: "perceivable",
        severity: count > 3 ? "critical" : "warning",
        title: "Missing Image Alt Text",
        description: `${count} image${count > 1 ? "s lack" : " lacks"} text alternatives for screen readers.`,
        count
      });
    }

    // 2. Buttons & Links without accessible names (Operable)
    const buttons = Array.from(doc.querySelectorAll("button, a[href], input[type='button'], input[type='submit']"));
    const unlabelledButtons = buttons.filter(b => {
      const text = (b.textContent || "").trim();
      const ariaLabel = b.getAttribute("aria-label") || b.getAttribute("aria-labelledby");
      const title = b.getAttribute("title");
      const alt = b.querySelector("img")?.getAttribute("alt");
      return !text && !ariaLabel && !title && !alt;
    });
    if (unlabelledButtons.length > 0) {
      const count = unlabelledButtons.length;
      operableDeduction += Math.min(30, count * 6);
      issues.push({
        id: "missing-btn-label",
        category: "operable",
        severity: count > 2 ? "critical" : "warning",
        title: "Unlabelled Interactive Elements",
        description: `${count} button${count > 1 ? "s or links lack" : " lacks"} accessible text or ARIA labels.`,
        count
      });
    }

    // 3. Form Inputs missing labels (Understandable)
    const inputs = Array.from(doc.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea"));
    const unlabelledInputs = inputs.filter(inp => {
      const id = inp.getAttribute("id");
      const hasLabel = id ? doc.querySelector(`label[for='${id}']`) !== null : false;
      const parentLabel = inp.closest("label") !== null;
      const ariaLabel = inp.getAttribute("aria-label") || inp.getAttribute("aria-labelledby") || inp.getAttribute("placeholder");
      return !hasLabel && !parentLabel && !ariaLabel;
    });
    if (unlabelledInputs.length > 0) {
      const count = unlabelledInputs.length;
      understandableDeduction += Math.min(30, count * 6);
      issues.push({
        id: "missing-form-label",
        category: "understandable",
        severity: "warning",
        title: "Missing Form Labels",
        description: `${count} form field${count > 1 ? "s lack" : " lacks"} an associated label or placeholder description.`,
        count
      });
    }

    // 4. Heading Hierarchy Check (Understandable)
    const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    const h1Count = doc.querySelectorAll("h1").length;
    let headingIssue = false;
    let headingDesc = "";

    if (h1Count === 0) {
      headingIssue = true;
      headingDesc = "Page is missing an <h1> primary title heading.";
    } else if (h1Count > 1) {
      headingIssue = true;
      headingDesc = `Multiple (${h1Count}) <h1> headings found on page.`;
    }

    // Check for skipped levels (e.g. h1 to h3)
    let skippedLevels = 0;
    for (let i = 0; i < headings.length - 1; i++) {
      const currentLevel = parseInt(headings[i].tagName.substring(1), 10);
      const nextLevel = parseInt(headings[i + 1].tagName.substring(1), 10);
      if (nextLevel > currentLevel + 1) {
        skippedLevels++;
      }
    }
    if (skippedLevels > 0) {
      headingIssue = true;
      headingDesc += (headingDesc ? " Also " : "") + `${skippedLevels} skipped heading level hierarchy jump${skippedLevels > 1 ? "s" : ""}.`;
    }

    if (headingIssue) {
      understandableDeduction += 15;
      issues.push({
        id: "heading-hierarchy",
        category: "understandable",
        severity: "info",
        title: "Heading Hierarchy Issues",
        description: headingDesc || "Heading structure is not sequentially ordered.",
        count: (h1Count === 0 ? 1 : 0) + skippedLevels
      });
    }

    // 5. Small Clickable Targets (Operable)
    let smallTargetCount = 0;
    buttons.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
        smallTargetCount++;
      }
    });
    if (smallTargetCount > 0) {
      operableDeduction += Math.min(20, smallTargetCount * 4);
      issues.push({
        id: "small-touch-target",
        category: "operable",
        severity: "warning",
        title: "Small Clickable Targets",
        description: `${smallTargetCount} touch target${smallTargetCount > 1 ? "s are" : " is"} smaller than 24x24px.`,
        count: smallTargetCount
      });
    }

    // 6. Keyboard & ARIA / Custom Interactive Controls (Robust)
    const customClickables = Array.from(doc.querySelectorAll("[onclick], [role='button'], [role='link']"));
    const unkeyboardable = customClickables.filter(el => {
      const tag = el.tagName.toLowerCase();
      const hasTabindex = el.hasAttribute("tabindex");
      return tag !== "button" && tag !== "a" && !hasTabindex;
    });
    if (unkeyboardable.length > 0) {
      const count = unkeyboardable.length;
      robustDeduction += Math.min(30, count * 5);
      issues.push({
        id: "keyboard-access",
        category: "robust",
        severity: "warning",
        title: "Keyboard Focus Issues",
        description: `${count} custom interactive element${count > 1 ? "s are" : " is"} missing tabindex for keyboard navigation.`,
        count
      });
    }

    // Calculate POUR breakdown scores
    const perceivable = Math.max(40, 100 - perceivableDeduction);
    const operable = Math.max(40, 100 - operableDeduction);
    const understandable = Math.max(40, 100 - understandableDeduction);
    const robust = Math.max(40, 100 - robustDeduction);

    const overallScore = Math.round((perceivable + operable + understandable + robust) / 4);

    let status: "Excellent" | "Good" | "Fair" | "Poor" = "Excellent";
    if (overallScore < 60) status = "Poor";
    else if (overallScore < 75) status = "Fair";
    else if (overallScore < 90) status = "Good";

    return {
      score: overallScore,
      status,
      breakdown: { perceivable, operable, understandable, robust },
      issues,
      timestamp: Date.now()
    };
  }
}
