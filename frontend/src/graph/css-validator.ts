// CSS class validation for team color definitions.
//
// Scans loaded stylesheets for background-color rules and identifies
// team CSS classes that have no color defined (I3 view invariant).

/**
 * Collects CSS class names that define `background-color` in any loaded stylesheet.
 *
 * Cross-origin stylesheets (CDN) are silently skipped because their
 * `cssRules` access throws SecurityError.
 */
function collectColorClasses(): Set<string> {
  const defined = new Set<string>();
  for (let si = 0; si < document.styleSheets.length; si++) {
    const sheet = document.styleSheets[si];
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet — skip
      continue;
    }
    for (let ri = 0; ri < rules.length; ri++) {
      const rule = rules[ri];
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!rule.style.backgroundColor) continue;
      const matches = rule.selectorText.match(/\.([^\s.,:>+~[\]()]+)/g);
      if (matches) {
        for (const m of matches) defined.add(m.slice(1));
      }
    }
  }
  return defined;
}

/**
 * Returns team CSS classes from `teamCssClasses` that have no `background-color`
 * defined in any loaded stylesheet.
 *
 * @param definedOverride  Injected set for testing; production code omits this.
 */
export function findTeamsWithoutColor(
  teamCssClasses: string[],
  definedOverride?: Set<string>,
): string[] {
  const defined = definedOverride ?? collectColorClasses();
  const unique = [...new Set(teamCssClasses)];
  return unique.filter(cls => !defined.has(cls));
}
