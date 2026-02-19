// Development entry point for pipeline verification.
// Loads season map + CSV and logs the resulting TeamMap to the console.

import Papa from 'papaparse';
import type { RawMatchRow } from './types/match';
import { loadSeasonMap, getCsvFilename } from './config/season-map';
import { parseCsvResults } from './core/csv-parser';
import { parseSeasonEntry } from './types/season';

async function main(): Promise<void> {
  const seasonMap = await loadSeasonMap();

  const category = '1'; // J1
  const season = Object.keys(seasonMap[category]).sort().reverse()[0];
  const info = parseSeasonEntry(seasonMap[category][season]);

  console.log(`Loading: category=${category} season=${season} teams=${info.teams.length}`);

  const filename = getCsvFilename(category, season);
  const cachebuster = Math.floor(Date.now() / 1000 / 300);

  Papa.parse<RawMatchRow>(filename + '?_=' + cachebuster, {
    header: true,
    skipEmptyLines: 'greedy',
    download: true,
    complete: (results) => {
      const teamMap = parseCsvResults(
        results.data,
        results.meta.fields ?? [],
        info.teams,
        'matches',
      );
      const teams = Object.keys(teamMap['matches'] ?? {});
      console.log('Teams:', teams);
      console.log('Match count (first team):', teamMap['matches']?.[teams[0]]?.df.length);
      console.log('TeamMap:', teamMap);
    },
  });
}

main().catch(console.error);
