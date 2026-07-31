export interface SemanticSearchOptions {
  kind?: Array<"input" | "button" | "select" | "link" | "interactive">;
  maxResults?: number;
  root?: ParentNode;
}

const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type='hidden']):not([type='range']):not([type='color']):not([type='image'])",
  "textarea",
  "select",
  "[role='button']",
  "[role='link']",
  "[role='option']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='checkbox']",
  "[role='radio']",
  "[contenteditable='true']",
].join(", ");

export function normalizeSemanticText(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.getClientRects().length > 0
  );
}

export function collectSemanticHints(element: HTMLElement): string[] {
  const hints = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = normalizeSemanticText(value || "");
    if (normalized) {
      hints.add(normalized);
    }
  };

  add(element.textContent);
  add(element.getAttribute("aria-label"));
  add(element.getAttribute("title"));
  add(element.getAttribute("placeholder"));
  add(element.getAttribute("name"));
  add(element.id);
  add(element.getAttribute("data-testid"));
  add(element.getAttribute("data-test"));
  add(element.getAttribute("data-cy"));
  add(element.getAttribute("aria-describedby"));

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    add(element.getAttribute("autocomplete"));
    add((element as HTMLInputElement).value);
  }

  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    add(label?.textContent || "");
  }

  const parentLabel = element.closest("label");
  add(parentLabel?.textContent || "");

  const wrapper = element.closest("[aria-label], [aria-labelledby], [data-testid], fieldset, li, div, section, article");
  if (wrapper) {
    add(wrapper.textContent || "");
  }

  return Array.from(hints);
}

export function getInteractiveCandidates(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)).filter((element) => isElementVisible(element));
}

function elementKindMatches(element: HTMLElement, kind: NonNullable<SemanticSearchOptions["kind"]>[number]): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = normalizeSemanticText(element.getAttribute("role") || "");

  switch (kind) {
    case "input":
      return tagName === "input" || tagName === "textarea" || tagName === "select" || role === "textbox" || role === "combobox";
    case "button":
      return tagName === "button" || role === "button";
    case "select":
      return tagName === "select" || role === "combobox" || role === "listbox";
    case "link":
      return tagName === "a" || role === "link";
    case "interactive":
    default:
      return true;
  }
}

function scoreTextAgainstQuery(text: string, queryTerms: string[]): number {
  const normalized = normalizeSemanticText(text);
  if (!normalized) return 0;

  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    if (normalized === term) score += 100;
    if (normalized.includes(term)) score += 30;
    if (term.includes(normalized) && normalized.length > 2) score += 15;
  }

  const words = normalized.split(" ").filter(Boolean);
  const overlap = words.filter((word) => queryTerms.some((term) => term.includes(word) || word.includes(term))).length;
  score += overlap * 10;

  return score;
}

function collectAllSemanticText(element: HTMLElement): string {
  return collectSemanticHints(element).join(" \n");
}

function rankElement(element: HTMLElement, query: string): number {
  const queryTerms = normalizeSemanticText(query)
    .split(" ")
    .filter((term) => term.length > 1);

  if (queryTerms.length === 0) return 0;

  const hints = collectAllSemanticText(element);
  let score = scoreTextAgainstQuery(hints, queryTerms);

  const label = normalizeSemanticText((element as HTMLInputElement).labels?.[0]?.textContent || "");
  score += scoreTextAgainstQuery(label, queryTerms);

  if (element.matches("button, [role='button']")) {
    score += 4;
  }

  if (element.matches("input, textarea, select, [role='textbox'], [role='combobox'], [contenteditable='true']")) {
    score += 3;
  }

  if (element.getAttribute("aria-required") === "true" || (element as HTMLInputElement).required) {
    score += 1;
  }

  return score;
}

export function findBestSemanticElement(query: string, options: SemanticSearchOptions = {}): HTMLElement | null {
  const root = options.root || document;
  const candidates = getInteractiveCandidates(root).filter((element) => {
    if (!options.kind || options.kind.length === 0) return true;
    return options.kind.some((kind) => elementKindMatches(element, kind));
  });

  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((element) => ({ element, score: rankElement(element, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked.length > 0) {
    return ranked[0].element;
  }

  return candidates[0] || null;
}

export function setSemanticValue(element: HTMLElement, value: string): boolean {
  if (element instanceof HTMLSelectElement) {
    const normalizedValue = normalizeSemanticText(value);
    let selectedIndex = -1;

    for (let index = 0; index < element.options.length; index += 1) {
      const option = element.options[index];
      const optionText = normalizeSemanticText(option.textContent || option.label || "");
      const optionValue = normalizeSemanticText(option.value || "");
      if (optionText === normalizedValue || optionValue === normalizedValue || optionText.includes(normalizedValue) || normalizedValue.includes(optionText)) {
        selectedIndex = index;
        break;
      }
    }

    if (selectedIndex < 0 && element.options.length > 0) {
      selectedIndex = 0;
    }

    if (selectedIndex >= 0) {
      element.selectedIndex = selectedIndex;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    nativeInputValueSetter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  if (element.getAttribute("contenteditable") === "true") {
    element.innerText = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

export function clickSemanticElement(element: HTMLElement): void {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}