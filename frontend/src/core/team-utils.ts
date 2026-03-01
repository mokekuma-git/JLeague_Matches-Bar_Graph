/**
 * Sanitize a team name for use as a CSS class name.
 *
 * Some team names (especially youth league teams) contain characters that are
 * invalid in CSS class tokens:
 *   - ASCII dot '.' – acts as a class selector prefix in CSS
 *   - Half-width space ' ' – causes classList.add() to throw
 *
 * This mirrors the legacy remove_dot() logic from prince_points.js:
 *   1. Truncate at the first half-width space (if any)
 *   2. Remove all ASCII dots
 *
 * Examples:
 *   '京都サンガF.C. U-18'     → '京都サンガFC'
 *   'サンフレッチェ広島F.Cユース' → 'サンフレッチェ広島FCユース'
 *   '栃木SC U-18'             → '栃木SC'
 *   '鹿島'                    → '鹿島'
 */
export function teamCssClass(teamName: string): string {
  const spaceIdx = teamName.indexOf(' ');
  const trimmed = spaceIdx > 0 ? teamName.substring(0, spaceIdx) : teamName;
  return trimmed.replace(/\./g, '');
}
