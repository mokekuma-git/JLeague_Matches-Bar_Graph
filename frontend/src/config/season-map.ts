// Season map loader and CSV filename utilities.
//
// Replaces read_seasonmap() and get_csv_filename() from j_points.js.
// XHR is replaced with fetch.

import type { SeasonMap } from '../types/season';

/**
 * Returns the CSV filename for a given category and season.
 * @param category - Category of the season (e.g. '1', '2')
 * @param season   - Season year (e.g. '2023')
 * @returns CSV filename string
 */
export function getCsvFilename(category: string, season: string): string {
  return 'csv/' + season + '_allmatch_result-J' + category + '.csv';
}

/**
 * Fetches and parses season_map.json.
 * @param url - URL to season_map.json
 * @returns Promise that resolves to the SeasonMap object
 */
export async function loadSeasonMap(url: string = './json/season_map.json'): Promise<SeasonMap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load season map: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<SeasonMap>;
}
