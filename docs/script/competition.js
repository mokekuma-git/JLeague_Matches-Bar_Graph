/**
 * Competition, Group, Team, TeamStatus, Match data definitions.
 * @module competition
 * @author mokekuma.git@gmail.com
 * @license CC BY 4.0
 */
export function new_team_status() {
    return {
        win: 0,
        lose: 0,
        draw: 0,
        points: 0,
        avlbl_pt: 0,
        avrg_pt: 0,
        goal_get: 0,
        goal_diff: 0,
        all_game: 0,
        rest_games: {}
    };
}
export function new_team() {
    return {
        matches: [],
        latest: new_team_status(),
        display: new_team_status()
    };
}
// readonly column names
export const col_names = [
    "meta",
    "attendance", "away_goal", "away_pk", "away_team", "broadcast", "dayofweek",
    "extraTime", "group", "home_goal", "home_pk", "home_team", "match_date", "match_index_in_section",
    "match_status", "matchNumber", "section_no", "stadium", "start_time", "status"
];
export function parse_csvresults(data, fields, default_group) {
    const competition = {};
    if (default_group == null)
        default_group = 'DefaultGroup';
    // CSVが 'group' 列を持っている時はGroup名としてこの値を使い、無ければdefault_groupの文字列を使う
    // group列がある時 => force_group == undefined
    let force_group = (fields === null || fields === void 0 ? void 0 : fields.includes('group')) ? undefined : default_group;
    let group = '';
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
            competition[group][_match.home_team] = new_team();
        if (!competition[group].hasOwnProperty(_match.away_team))
            competition[group][_match.away_team] = new_team();
        let match_date_str = _match.match_date;
        const match_date = new Date(_match.match_date);
        // 日時が適切にDateオブジェクトにできなければ、NaNが返ってくる
        if (!isNaN(match_date.getTime()))
            match_date_str = date_format(match_date);
        const commonProps = {
            'point': get_point_from_result(_match.home_goal, _match.away_goal),
            'has_result': Boolean(_match.home_goal && _match.away_goal),
            'match_date': match_date_str,
            'section_no': parseInt(_match.section_no),
            'stadium': _match.stadium,
            'start_time': _match.start_time,
            'status': make_status_attr(_match),
            'live': make_live_attr(_match)
        };
        competition[group][_match.home_team].matches.push({
            'is_home': true,
            'opponent': _match.away_team,
            'goal_get': parseInt(_match.home_goal),
            'goal_lose': parseInt(_match.away_goal),
            ...commonProps
        });
        competition[group][_match.away_team].matches.push({
            'is_home': false,
            'opponent': _match.home_team,
            'goal_get': parseInt(_match.away_goal),
            'goal_lose': parseInt(_match.home_goal),
            ...commonProps
        });
        // console.log(competition[group][_match.away_teame].df.slice(-1)[0]);
    });
    // console.log(competition);
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
function get_point_from_result(goal_get, goal_lose, has_extra = 'false', pk_get = '', pk_lose = '') {
    const n_goal_get = parseFloat(goal_get);
    const n_goal_lose = parseFloat(goal_lose);
    const n_pk_get = parseFloat(pk_get);
    const n_pk_lose = parseFloat(pk_lose);
    const n_has_extra = has_extra === 'true';
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
 * @param {CsvRow<typeof col_names>} match - The match data.
 * @returns {string} The status attribute.
 */
function make_status_attr(match) {
    if (!match.hasOwnProperty('status')) {
        return '';
    }
    if (match.status == 'ＶＳ') { // Jリーグ公式の試合前は、この表示
        return '開始前';
    }
    return match.status.replace('速報中', '');
}
/**
 * Returns whether the match is live.
 * If the match status contains '速報中' (during the match), returns true.
 * Otherwise, returns false.
 * @param {CsvRow<typeof col_names>} match - The match data.
 * @returns {boolean} Whether the match is live.
 */
function make_live_attr(match) {
    if (!match.hasOwnProperty('status')) {
        return false;
    }
    if (match.status.indexOf('速報中') >= 0) { // Jリーグ公式の試合中は、この表示
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
    const longstr = ('0000' + m);
    return longstr.substring(longstr.length - n);
}
/**
 * Formats a date object or string in the format 'YYYY/MM/DD'.
 * If a string is passed in and cannot be parsed as a Date, it is returned as-is.
 * @param {Date | string} _date - The date object or string to format.
 * @returns {string} The formatted date string.
 */
function date_format(_date) {
    if (is_string(_date)) {
        const date = new Date(_date);
        if (isNaN(date.getTime())) {
            console.warn('Invalid date format: ' + _date);
            return _date;
        }
        _date = date;
    }
    _date = _date;
    return [_date.getFullYear() + 1900, dgt((_date.getMonth() + 1), 2), dgt(_date.getDate(), 2)].join('/');
}
/**
 * Formats a date object or string in the format 'HH:MM'.
 * If a string is passed in and cannot be parsed as a Date, it is returned as-is.
 * @param {Date | string} _date - The date object or string to format.
 * @returns {string} The formatted time string.
 */
function time_format(_date) {
    if (is_string(_date)) {
        const date = new Date(_date);
        if (isNaN(date.getTime())) {
            console.warn('Invalid date format: ' + _date);
            return cut_time_part(_date);
        }
        _date = date;
    }
    _date = _date;
    return [dgt((_date.getHours()), 2), dgt(_date.getMinutes(), 2)].join(':'); // Second: dgt(_date.getSeconds(), 2)
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
 * @param {string} _date_str - The date string to format.
 * @returns {string} The formatted date string without the year part.
 */
function date_only(_date_str) {
    return _date_str.replace(/^\d{4}\//, '');
}
/**
 * Returns true if the passed value is a string, false otherwise.
 * @param {*} value - The value to check.
 * @returns {boolean} True if the value is a string, false otherwise.
 */
const is_string = (value) => (typeof (value) === 'string' || value instanceof String);
// const is_number = (value: any) => (typeof(value) === 'number');
