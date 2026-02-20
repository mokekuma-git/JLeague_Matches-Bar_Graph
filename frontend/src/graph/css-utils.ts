// CSS rule manipulation for j_points.css dynamic styles.
//
// All functions require a browser environment (CSSStyleSheet API).
// No unit tests — DOM-only; vitest runs in node environment.

import { getBright } from './tooltip';

// Per-channel brightness modifiers for text-color auto-selection on .space backgrounds.
const RGB_MOD = { r: 0.9, g: 0.8, b: 0.4 } as const;

/**
 * Finds and returns the CSSStyleRule matching `selector` in j_points.css.
 * Returns undefined if the stylesheet or rule is not found.
 */
export function getCssRule(selector: string): CSSStyleRule | undefined {
  let sheet: CSSStyleSheet | undefined;
  for (const s of Array.from(document.styleSheets)) {
    if (s.href && s.href.endsWith('j_points.css')) {
      sheet = s;
      break;
    }
  }
  if (!sheet) return undefined;
  for (const rule of Array.from(sheet.cssRules)) {
    if ((rule as CSSStyleRule).selectorText === selector) {
      return rule as CSSStyleRule;
    }
  }
  return undefined;
}

/**
 * Returns the height in px of the `.short` CSS class (used as HEIGHT_UNIT).
 * Returns 0 if the rule is not found or has no height set.
 * Call once after CSS has loaded.
 */
export function getHeightUnit(): number {
  const rule = getCssRule('.short');
  if (!rule) return 0;
  return parseInt(rule.style.height) || 0;
}

/**
 * Sets the opacity of the `.future` CSS class.
 * updateSlider=true (default) → also updates #future_opacity slider value and
 * writes current value to #current_opacity display span.
 * No localStorage writes (Phase 3b).
 */
export function setFutureOpacity(value: string, updateSlider = true): void {
  const rule = getCssRule('.future');
  if (!rule) return;
  rule.style.opacity = value;
  const display = document.getElementById('current_opacity');
  if (display) display.textContent = value;
  if (updateSlider) {
    const slider = document.getElementById('future_opacity') as HTMLInputElement | null;
    if (slider) slider.value = value;
  }
}

/**
 * Sets the background color of the `.space` CSS class.
 * Automatically chooses black or white text based on perceived brightness.
 * updateColorPicker=true (default) → also updates #space_color picker value.
 * No localStorage writes (Phase 3b).
 */
export function setSpace(value: string, updateColorPicker = true): void {
  const rule = getCssRule('.space');
  if (!rule) return;
  rule.style.backgroundColor = value;
  rule.style.color = getBright(value, RGB_MOD) > 0.5 ? 'black' : 'white';
  if (updateColorPicker) {
    const picker = document.getElementById('space_color') as HTMLInputElement | null;
    if (picker) picker.value = value;
  }
}

/**
 * Applies CSS transform scale to boxCon and adjusts its height.
 * Height is set to .point_column clientHeight × scale to prevent overflow.
 * updateSlider=true (default) → also updates #scale_slider value and #current_scale display.
 * No localStorage writes (Phase 3b).
 */
export function setScale(boxCon: HTMLElement, value: string, updateSlider = true): void {
  boxCon.style.transform = 'scale(' + value + ')';
  const pointCol = boxCon.querySelector('.point_column');
  if (pointCol) {
    boxCon.style.height = String((pointCol as HTMLElement).clientHeight * parseFloat(value)) + 'px';
  }
  if (updateSlider) {
    const slider = document.getElementById('scale_slider') as HTMLInputElement | null;
    if (slider) slider.value = value;
    const display = document.getElementById('current_scale');
    if (display) display.textContent = value;
  }
}
