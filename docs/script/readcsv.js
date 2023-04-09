/**
 * Read CSV, Make Competition and Bar Graph Test
 * @module readcsv
 * @author mokekuma.git@gmail.com
 * @license CC BY 4.0
 */
// import Papa from 'papaparse';
import { parse_csvresults, get_sorted_team_list, date_format } from './competition.js';
const CNTXT = {
    seasonMap: null,
    category: '1',
    season: '2023',
    target_date: date_format(new Date())
};
window.addEventListener('load', read_seasonmap, false);
// Functions
function init() {
    let html_element = null;
    html_element = document.getElementById('category');
    if (html_element !== null)
        html_element.addEventListener('change', set_category_ev, false);
    document.getElementById;
    html_element = document.getElementById('season');
    if (html_element !== null)
        html_element.addEventListener('change', set_season_ev, false);
    refresh_match_data();
}
function read_seasonmap() {
    // URLからSeasonMap JSONファイルを読み込む
    const seasonMapUrl = './json/season_map.json';
    fetch(seasonMapUrl)
        .then((response) => response.json())
        .then((seasonMap) => {
        console.log(seasonMap);
        CNTXT.seasonMap = seasonMap;
        init();
    });
}
async function refresh_match_data() {
    let csv_url = get_csv_filename(CNTXT.category, CNTXT.season);
    try {
        const response = await fetch(csv_url);
        const csvText = await response.text();
        const { data: rows, meta: metadata } = Papa.parse(csvText, { header: true, skipEmptyLines: 'greedy' });
        // console.log(rows);
        // console.log(metadata.fields);
        // print_csv(rows, document.getElementById('csv-table') as HTMLElement);
        let team_names = [];
        if (CNTXT.seasonMap !== null &&
            CNTXT.seasonMap["1"] !== undefined &&
            CNTXT.seasonMap["1"]["2023"] !== undefined) {
            team_names = CNTXT.seasonMap["1"]["2023"][3];
        }
        let competition = parse_csvresults(rows, metadata.fields, team_names, 'matches');
        console.log(competition);
        render_competition(competition, new Date());
    }
    catch (error) {
        console.error(error);
    }
}
/*
function print_csv(rows: CsvRow<typeof col_names>[], csvTableElement: HTMLElement) {
  csvTableElement.innerHTML = rows.map((row) => `<tr>${Object.values(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
}
*/
function render_competition(competition, count_date) {
    let group_htmls = [];
    for (const grp_name in competition) {
        if (competition.hasOwnProperty(grp_name)) {
            const grp = competition[grp_name];
            group_htmls.push(render_group(grp, count_date));
        }
    }
    const csvTableElement = document.getElementById('csv-table');
    if (csvTableElement) {
        csvTableElement.innerHTML = group_htmls.join('');
    }
}
function render_group(group, count_date) {
    for (const team_name in group) {
        if (group.hasOwnProperty(team_name)) {
            const team = group[team_name];
            team.count_team_point(count_date);
            console.log(team_name, team);
        }
    }
    return createTeamStatusTable(group, true);
}
/**
 * Create an HTML table from a team status object.
 * @param {Group} group - The Group object to create the table from.
 * @returns {string} The generated HTML table as a string.
 */
export function createTeamStatusTable(group, latest) {
    let tableHTML = '<table>';
    tableHTML += '<tr><th>Team</th><th>Win</th><th>Lose</th><th>Draw</th>'
        + '<th>勝ち点</th><th>最大勝点</th><th>平均勝点</th>'
        + '<th>得点</th><th>得失点差</th><th>試合数</th></tr>';
    // Loop through the team status object and generate rows for each team
    get_sorted_team_list(group, true, 'points').forEach((teamName) => {
        if (group.hasOwnProperty(teamName)) {
            const teamStatus = latest ? group[teamName].latest : group[teamName].display;
            tableHTML += `<tr><td>${teamName}</td><td>${teamStatus.win}</td><td>${teamStatus.lose}</td><td>${teamStatus.draw}</td>`
                + `<td>${teamStatus.points}</td><td>${teamStatus.avlbl_pt}</td><td>${teamStatus.avrg_pt}</td>`
                + `<td>${teamStatus.goal_get}</td><td>${teamStatus.goal_diff}</td><td>${teamStatus.all_game}</td></tr>`;
        }
    });
    tableHTML += '</table>';
    return tableHTML;
}
/**
 * Create a select option list from the seasonMap following the category.
 * @returns {string} The generated season list as select option string.
 */
function make_season_pulldown() {
    if (CNTXT.seasonMap === null)
        return;
    const season_select = document.getElementById('season');
    if (season_select === null)
        return;
    const category = CNTXT['category'];
    const options = [];
    Object.keys(CNTXT.seasonMap[category]).sort().reverse().forEach(function (x) {
        options.push('<option value="' + x + '">' + x + "</option>\n");
    });
    season_select.innerHTML = options.join('');
}
function set_category_ev(event) {
    if (event.target === null)
        return;
    const selectElement = event.target;
    CNTXT.category = selectElement.value;
    set_pulldown('category', selectElement.value, true, false, false);
    make_season_pulldown();
    refresh_match_data();
}
function set_season_ev(event) {
    const selectElement = event.target;
    CNTXT.season = selectElement.value;
    // reset_target_date();
    refresh_match_data();
}
function set_pulldown(key, value, storage_write = true, pulldown_write = true, call_render = true, refresh_match = false) {
    if (storage_write)
        localStorage.setItem(key, value);
    if (pulldown_write) {
        const select = document.getElementById(key);
        if (select) {
            const target = select.querySelector('option[value="' + value + '"]');
            if (target)
                select.selectedIndex = target.index;
        }
    }
    //if(refresh_match) refresh_match_data();
    //else if(call_render) render_bar_graph(); // 今のところ、false だけだけど、念のため
}
function get_csv_filename(category, season) {
    return 'csv/' + season + '_allmatch_result-J' + category + '.csv';
}
