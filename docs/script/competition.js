/**
 * Competition, Group, Team, TeamStatus, Match data definitions.
 * @module competition
 * @author mokekuma.git@gmail.com
 * @license CC BY 4.0
 */
const COMPARE_DEBUG = true;
const DATE_REGEX = /^\d+\/\d+\/\d+$/;
/**
 * Checks if a string follows the format of DateString (`${number}/${number}/${number}`).
 * @param {string} str The string to check
 * @returns {boolean} Returns true if the specified string follows the format of DateString, otherwise false
 */
export function isValidDateString(str) {
    return DATE_REGEX.test(str);
}
const TIME_REGEX = /^\d+\:\d+$/;
/**
 * Checks if a string follows the format of TimeString (`${number}:${number}`).
 * @param {string} str The string to check
 * @returns {boolean} Returns true if the specified string follows the format of TimeString, otherwise false
 */
export function isValidTimeString(str) {
    return TIME_REGEX.test(str);
}
/**
 * Represents the status of a team in a competition.
 *
 * @typedef {Object} TeamStatus
 * @property {number} win - The number of matches won.
 * @property {number} lose - The number of matches lost.
 * @property {number} draw - The number of matches drawn.
 * @property {number} points - The total number of points earned.
 * @property {number} avlbl_pt - The number of available points for the team.
 * @property {number} avrg_pt - The average number of points earned per match.
 * @property {number} goal_get - The number of goals scored by the team.
 * @property {number} goal_diff - The goal difference of the team.
 * @property {number} all_game - The total number of matches played by the team.
 * @property {Object.<string, Object.<string, number>>} rest_games - The remaining matches for the team.
 */
export class TeamStatus {
    constructor() {
        this.win = 0;
        this.lose = 0;
        this.draw = 0;
        this.points = 0;
        this.avlbl_pt = 0;
        this.avrg_pt = 0;
        this.goal_get = 0;
        this.goal_diff = 0;
        this.all_game = 0;
        this.rest_games = {};
    }
    /**
     * Updates the team's status for future matches based on the given match.
     *
     * @param {Match} match - The match object to update.
     * @returns {void}
     */
    updateFutureStatus(match) {
        // 未来の試合のStatusの更新
        this.avlbl_pt += 3;
        if (this.rest_games.hasOwnProperty(match.opponent))
            this.rest_games[match.opponent]++;
        else
            this.rest_games[match.opponent] = 1;
    }
    /**
     * Updates the team's status for completed matches based on the given match.
     *
     * @param {Match} match - The match object to update.
     * @returns {void}
     */
    updateStatus(match) {
        // 終わった試合のStatusの更新
        this.points += match.point;
        this.avlbl_pt += match.point;
        this.goal_diff += match.goal_get - match.goal_lose;
        this.goal_get += match.goal_get;
        this.all_game += 1;
        if (match.point > 1)
            this.win += 1;
        else if (match.point == 1)
            this.draw += 1;
        else if (match.point == 0)
            this.lose += 1; // 2013年以前は、また別途考慮 ⇒ 関数化すべき
    }
}
/**
 * Represents a team in a competition.
 * @typedef {Object} Team
 * @property {Match[]} matches - The list of match data for the team.
 * @property {TeamStatus} latest - The latest status of the team.
 * @property {TeamStatus} display - The status of the team at the time of display.
 */
/**
 * Represents a team in a competition.
 */
export class Team {
    constructor() {
        this.matches = [];
        this.latest = new TeamStatus();
        this.display = new TeamStatus();
    }
    /**
     * Calculates the team's match results based on the display date,
     * and updates the team's status accordingly.
     *
     * @param {Date} count_date - The date of display threshold.
     * @returns {void}
     */
    count_team_point(count_date) {
        const match_date_set = [];
        this.matches.forEach((match) => {
            let match_date = null;
            if (isValidDateString(match.match_date)) {
                if (match.match_date < "1970/01/01") {
                    console.log("Unexpected date: ", match);
                }
                else {
                    match_date = new Date(match.match_date);
                    if (!match_date_set.includes(match_date))
                        match_date_set.push(match_date);
                }
            }
            const future = match_date !== null && match_date > count_date;
            if (!match.has_result) {
                // 試合がまだ無いので、勝点、得失点差は不変、最大勝ち点は⁺3
                this.latest.updateFutureStatus(match);
                this.display.updateFutureStatus(match);
            }
            else {
                // 試合があるので、実際の勝ち点、最大勝ち点、得失点は実際の記録通り
                this.latest.updateStatus(match);
                if (future) {
                    // 表示対象ではないので、表示時点のdisplayは勝点、得失点差は不変、最大勝ち点は⁺3
                    this.display.updateFutureStatus(match);
                }
                else {
                    // 表示対象なので、表示時点displayも実際latestと同じ
                    this.display.updateStatus(match);
                }
            }
        });
    }
}
const point_properties = ["points", "avlbl_pt", "avrg_pt"];
export function get_sorted_team_list(group, latest, sort_key) {
    const disp = sort_key.startsWith("disp_");
    const disp_str = disp ? "disp" : "latest"; // Debug表示用
    return Object.keys(group).sort(function (a, b) {
        let a_st = latest ? group[a].latest : group[a].display;
        let b_st = latest ? group[b].latest : group[b].display;
        // team_sort_keyで指定された勝ち点で比較
        let compare = cmp(a, a_st[sort_key], b, b_st[sort_key], "勝点" + sort_key);
        if (compare != 0)
            return compare;
        if (sort_key.endsWith("avlbl_pt")) {
            // 最大勝ち点が同じときは、既に取った勝ち点を次点で比較
            let sub_key = sort_key.replace("avlbl_pt", "points");
            compare = cmp(a, a_st[sub_key], b, b_st[sub_key], "(通常の)勝点" + sub_key);
            if (compare != 0)
                return compare;
        }
        // 得失点差で比較 (表示時点か最新かで振り分け)
        compare = cmp(a, a_st.goal_diff, b, b_st.goal_diff, "得失点" + disp_str);
        if (compare != 0)
            return compare;
        // 総得点で比較 (表示時点か最新かで振り分け)
        compare = cmp(a, a_st.goal_get, b, b_st.goal_get, "総得点" + disp_str);
        // それでも同じなら、そのまま登録順 (return 0)
        return compare;
        function cmp(a, val_a, b, val_b, criteria) {
            // 比較値を出す際に、Flagに応じてデバッグ出力を実施
            if (COMPARE_DEBUG)
                console.log(criteria, a, val_a, b, val_b);
            return val_b - val_a;
        }
    });
}
// readonly column names
export const col_names = [
    "meta",
    "attendance",
    "away_goal",
    "away_pk",
    "away_team",
    "broadcast",
    "dayofweek",
    "extraTime",
    "group",
    "home_goal",
    "home_pk",
    "home_team",
    "match_date",
    "match_index_in_section",
    "match_status",
    "matchNumber",
    "section_no",
    "stadium",
    "start_time",
    "status",
];
export function parse_csvresults(data, fields, default_team_list, default_group) {
    const competition = {};
    if (default_group == null)
        default_group = "DefaultGroup";
    // CSVが 'group' 列を持っている時はGroup名としてこの値を使い、無ければdefault_groupの文字列を使う
    // group列がある時 => force_group == undefined
    let force_group = (fields === null || fields === void 0 ? void 0 : fields.includes("group"))
        ? undefined
        : default_group;
    let group = "";
    data.forEach(function (_match) {
        // ここで毎回同じ結果になる _match.hasOwnProperty('group') を繰り返したくなかったので force_groupを使う
        // group = (_match.hasOwnProperty('group')) ? _match.group : default_group; と同じという認識
        group = force_group || _match.group;
        // console.log(_match[""], group, _match.match_date, _match.home_team, _match.away_team);
        // console.log(_match);
        if (!competition.hasOwnProperty(group)) {
            // リーグデータの初期化
            competition[group] = {};
        }
        if (!competition[group].hasOwnProperty(_match.home_team))
            competition[group][_match.home_team] = new Team();
        if (!competition[group].hasOwnProperty(_match.away_team))
            competition[group][_match.away_team] = new Team();
        let match_date_str = _match.match_date;
        const match_date = new Date(_match.match_date);
        // 日時が適切にDateオブジェクトにできなければ、getTime()はNaNが返ってくる
        // そうでなければ、Dateデータを元にDateStringを作る
        if (!isNaN(match_date.getTime()))
            match_date_str = date_format(match_date);
        const commonProps = {
            has_result: Boolean(_match.home_goal && _match.away_goal),
            match_date: match_date_str,
            section_no: parseInt(_match.section_no),
            stadium: _match.stadium,
            start_time: _match.start_time,
            status: make_status_attr(_match),
            live: make_live_attr(_match),
        };
        competition[group][_match.home_team].matches.push({
            point: get_point_from_result(_match.home_goal, _match.away_goal),
            is_home: true,
            opponent: _match.away_team,
            goal_get: parseInt(_match.home_goal),
            goal_lose: parseInt(_match.away_goal),
            ...commonProps,
        });
        competition[group][_match.away_team].matches.push({
            point: get_point_from_result(_match.away_goal, _match.home_goal),
            is_home: false,
            opponent: _match.home_team,
            goal_get: parseInt(_match.away_goal),
            goal_lose: parseInt(_match.home_goal),
            ...commonProps,
        });
    });
    return competition;
}
/**
 * Calculates the game point for a team based on the goals they have scored and conceded.
 * If either goal_get or goal_lose is NaN or not a valid number, returns 0.
 * @param {string} goal_get - The number of goals scored by the team as a string.
 * @param {string} goal_lose - The number of goals conceded by the team as a string.
 * @param {string} [has_extra='false'] - Whether there is extra time played as a string ('true' or 'false').
 * @param {string} [pk_get='NaN'] - The number of penalty kicks scored by the team as a string.
 * @param {string} [pk_lose='NaN'] - The number of penalty kicks conceded by the team as a string.
 * @returns {number} The point the team gets.
 */
function get_point_from_result(goal_get, goal_lose, has_extra = "false", pk_get = "", pk_lose = "") {
    const n_goal_get = parseFloat(goal_get);
    const n_goal_lose = parseFloat(goal_lose);
    const n_pk_get = parseFloat(pk_get);
    const n_pk_lose = parseFloat(pk_lose);
    const n_has_extra = has_extra === "true";
    if (isNaN(n_goal_get) || isNaN(n_goal_lose)) {
        return 0;
    }
    if (isNaN(n_goal_get) || isNaN(n_goal_lose))
        return 0;
    if (n_goal_get > n_goal_lose)
        return 3;
    if (n_goal_get < n_goal_lose)
        return 0;
    if (n_has_extra && !isNaN(n_pk_get) && !isNaN(n_pk_lose)) {
        if (n_pk_get > n_pk_lose)
            return 3; // PK勝ち
        if (n_pk_get < n_pk_lose)
            return 1; // PK負け
    }
    return 1;
}
/**
 * Returns the status attribute for a match for J League data.
 * If the match status is 'ＶＳ' (before the start of the match), returns '開始前'.
 * Otherwise, returns the status with '速報中' removed if it is present.
 * ToDo: Make this customizable for each league.
 * @param {CsvRow<typeof col_names>} match - The match data.
 * @returns {string} The status attribute.
 */
function make_status_attr(match) {
    if (!match.hasOwnProperty("status")) {
        return "";
    }
    if (match.status == "ＶＳ") {
        // Jリーグ公式の試合前は、この表示
        return "開始前";
    }
    return match.status.replace("速報中", "");
}
/**
 * Returns whether the match is live.
 * If the match status contains '速報中' (during the match), returns true.
 * Otherwise, returns false.
 * ToDo: Make this customizable for each league.
 * @param {CsvRow<typeof col_names>} match - The match data.
 * @returns {boolean} Whether the match is live.
 */
function make_live_attr(match) {
    if (!match.hasOwnProperty("status")) {
        return false;
    }
    if (match.status.indexOf("速報中") >= 0) {
        // Jリーグ公式の試合中は、この表示
        return true;
    }
    return false;
}
/**
 * Returns a string of `n` digits representing the integer `m`.
 * If the length of the resulting string is less than `n`,
 * it is left-padded with zeros to the length of `n`.
 * @param {number} m - The integer to convert to a string.
 * @param {number} n - The number of digits in the resulting string.
 * @returns {string} The resulting string.
 */
function dgt(m, n) {
    const longstr = "0000" + m;
    return longstr.substring(longstr.length - n);
}
/**
 * Formats a date object or string in the format 'YYYY/MM/DD'.
 * If a string is passed in and cannot be parsed as a Date, it is returned as-is.
 * @param {Date | string} dt - The date object or string to format.
 * @returns {string} The formatted date string.
 */
export function date_format(dt) {
    if (is_string(dt)) {
        const date = new Date(dt);
        if (isNaN(date.getTime())) {
            console.warn("Invalid date format: " + dt);
            return dt;
        }
        dt = date;
    }
    dt = dt;
    return [dt.getFullYear(), dgt(dt.getMonth() + 1, 2), dgt(dt.getDate(), 2)].join("/");
}
/**
 * Formats a date object or string in the format 'HH:MM'.
 * If a string is passed in and cannot be parsed as a Date, it is returned as-is.
 * @param {Date | string} _date - The date object or string to format.
 * @returns {string} The formatted time string.
 */
export function time_format(_date) {
    if (is_string(_date)) {
        const date = new Date(_date);
        if (isNaN(date.getTime())) {
            console.warn("Invalid date format: " + _date);
            return cut_time_part(_date);
        }
        _date = date;
    }
    _date = _date;
    return [dgt(_date.getHours(), 2), dgt(_date.getMinutes(), 2)].join(":");
    // Second: dgt(_date.getSeconds(), 2)
}
/**
 * Cut off second part of the time string.
 * @param time_str - The time string with/without seconds.
 * @returns The time string without seconds.
 */
function cut_time_part(time_str) {
    return time_str.replace(/(\d\d:\d\d):\d\d/, "$1");
}
/**
 * Returns the date string without the year part.
 * @param {string} _date_str - The date string to format. (expected format: 'YYYY/MM/DD')
 * @returns {string} The formatted date string without the year part.
 */
function date_only(_date_str) {
    return _date_str.replace(/^\d{4}\//, "");
}
/**
 * Returns true if the passed value is a string, false otherwise.
 * @param {*} value - The value to check.
 * @returns {boolean} True if the value is a string, false otherwise.
 */
function is_string(value) {
    return typeof value === "string" || value instanceof String;
}
/**
 * Returns true if the passed value is a number, false otherwise.
 * @param {*} value - The value to check.
 * @returns {boolean} True if the value is a number, false otherwise.
 */
//function is_number(value: any): boolean {
//  return (typeof (value) === 'number');
//}
