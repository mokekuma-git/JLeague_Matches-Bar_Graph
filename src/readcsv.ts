/**
 * Read CSV, Make Competition and Bar Graph Test
 * @module readcsv
 * @author mokekuma.git@gmail.com
 * @license CC BY 4.0
 */
import Papa from 'papaparse';
import { parse_csvresults, Competition, CsvRow, col_names, Group} from './competition';

const formElement = document.querySelector('form');

if (formElement) {
  formElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    const csvUrlInput = (event.target as HTMLFormElement).elements.namedItem('csv-url') as HTMLInputElement;
    const csvUrl = csvUrlInput.value;
    // console.log(csvUrl);
    if (!csvUrl) {
      return;
    }
    try {
      const response = await fetch(csvUrl);
      const csvText = await response.text()
      const {data: rows, meta: metadata} = Papa.parse<CsvRow<typeof col_names>>(csvText, { header: true, skipEmptyLines: 'greedy' });
      // console.log(rows);
      // console.log(metadata.fields);
      //csvTableElement.innerHTML = rows.map((row) => `<tr>${Object.values(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
      let competition = parse_csvresults(rows, metadata.fields, 'matches')
      console.log(competition);
      open_competition(competition, new Date());
} catch (error) {
      console.error(error);
    }
  });
}

function open_competition(competition: Competition, count_date: Date): void {
  for (const grp_name in competition) {
    if (competition.hasOwnProperty(grp_name)) {
      const grp = competition[grp_name];
      open_group(grp, count_date);
    }
  }
}
function open_group(group: Group, count_date: Date) {
  for (const team_name in group) {
    if (group.hasOwnProperty(team_name)) {
      const team = group[team_name];
      team.count_team_point(count_date);
      console.log(team_name, team);
    }
  }
  const csvTableElement = document.getElementById('csv-table');
  if (csvTableElement) {
    csvTableElement.innerHTML = createTeamStatusTable(group, true);
  }
}

/**
 * Create an HTML table from a team status object.
 * @param {Group} group - The Group object to create the table from.
 * @returns {string} The generated HTML table as a string.
 */
export function createTeamStatusTable(group: Group, latest: boolean): string {
  let tableHTML = '<table>';
  tableHTML += '<tr><th>Team</th><th>Win</th><th>Lose</th><th>Draw</th>'
  + '<th>勝ち点</th><th>最大勝点</th><th>平均勝点</th>'
  + '<th>得点</th><th>得失点差</th><th>試合数</th></tr>';
  
  // Loop through the team status object and generate rows for each team
  for (const teamName in group) {
    if (group.hasOwnProperty(teamName)) {
      const teamStatus = latest ? group[teamName].latest : group[teamName].display;
      tableHTML += `<tr><td>${teamName}</td><td>${teamStatus.win}</td><td>${teamStatus.lose}</td><td>${teamStatus.draw}</td>`
      + `<td>${teamStatus.points}</td><td>${teamStatus.avlbl_pt}</td><td>${teamStatus.avrg_pt}</td>`
      + `<td>${teamStatus.goal_get}</td><td>${teamStatus.goal_diff}</td><td>${teamStatus.all_game}</td></tr>`;
    }
  }
  
  tableHTML += '</table>';
  return tableHTML;
}