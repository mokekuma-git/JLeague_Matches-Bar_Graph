// CSS rule manipulation and color utilities for j_points.css dynamic styles.

// ---- Pure helpers (no DOM) ------------------------------------------------

/**
 * Calculates perceived brightness of a hex color code with per-channel modifiers.
 * Returns 0.0 (darkest) to 1.0 (brightest). Used for auto-selecting text color
 * (white on dark, black on light backgrounds).
 */
export function getBright(
  colorcode: string,
  rgbMod: { r?: number; g?: number; b?: number },
): number {
  const code = colorcode.startsWith('#') ? colorcode.slice(1) : colorcode;
  const channelLen = Math.floor(code.length / 3);
  if (channelLen < 1) return 0;
  const rgb = [0, 1, 2].map(i => parseInt(code.slice(channelLen * i, channelLen * (i + 1)), 16));
  const rmod = rgbMod.r ?? 1;
  const gmod = rgbMod.g ?? 1;
  const bmod = rgbMod.b ?? 1;
  return Math.max(rgb[0] * rmod, rgb[1] * gmod, rgb[2] * bmod) / 255;
}

// Per-channel brightness modifiers for text-color auto-selection on .space backgrounds.
const RGB_MOD = { r: 0.9, g: 0.8, b: 0.4 } as const;

// Fallback when .short CSS rule is not found (matches j_points.css default).
export const DEFAULT_HEIGHT_UNIT = 20;

// ---- DOM-dependent functions ----------------------------------------------

/**
 * Finds and returns the CSSStyleRule matching `selector` in j_points.css.
 * Returns undefined if the stylesheet or rule is not found.
 */
export function getCssRule(selector: string): CSSStyleRule | undefined {
  let sheet: CSSStyleSheet | undefined;
  for (const s of Array.from(document.styleSheets)) {
    if (s.href && s.href.endsWith('/j_points.css')) {
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
 * Falls back to DEFAULT_HEIGHT_UNIT if the rule is not found or has no height set.
 * Call once after CSS has loaded.
 */
export function getHeightUnit(): number {
  const rule = getCssRule('.short');
  if (!rule) return DEFAULT_HEIGHT_UNIT;
  return parseInt(rule.style.height, 10) || DEFAULT_HEIGHT_UNIT;
}

/**
 * Sets the opacity of the `.future` CSS class.
 * updateSlider=true (default) → also updates #future_opacity slider value and
 * writes current value to #current_opacity display span.
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
 */
export function setScale(boxCon: HTMLElement, value: string, updateSlider = true): void {
  boxCon.style.transform = `scale(${value})`;
  const pointCol = boxCon.querySelector('.point_column');
  if (pointCol) {
    boxCon.style.height = `${(pointCol as HTMLElement).clientHeight * parseFloat(value)}px`;
  }
  if (updateSlider) {
    const slider = document.getElementById('scale_slider') as HTMLInputElement | null;
    if (slider) slider.value = value;
    const display = document.getElementById('current_scale');
    if (display) display.textContent = value;
  }
}
