/**
 * Match data structure
 *
 * Future match has has_result as false, and goals and point are fixed as 0.
 * 
 * @typedef {Object} Match
 * @property {number} section_no - The section number of the match
 * @property {string} opponent - The name of the opponent team
 * @property {DateString} match_date - The date of the match in "YYYY/MM/DD" format
 * @property {TimeString} start_time - The start time of the match in "hh:mm" format
 * @property {string} stadium - The name of the stadium where the match was held
 * @property {boolean} is_home - Whether the match was held at the team's home stadium
 * @property {boolean} has_result - Whether the match result is available
 * @property {string} status - The status of the match (e.g. "LIVE", "FINISHED" etc.)
 * @property {boolean} live - Whether the match is currently live
 * @property {number} goal_get - The number of goals the team got in the match
 * @property {number} goal_lose - The number of goals the team lost in the match
 * @property {number} point - The number of points the team earned from the match
 */
type Match = {
  section_no: number,
  opponent: string,
  match_date: DateString,
  start_time: TimeString,
  stadium: string,
  is_home: boolean,
  has_result: boolean,
  status: string,
  live: boolean
  goal_get: number,
  goal_lose: number,
  point: number,
};

/**
 * Date string type definition
 */
type DateString = `${number}/${number}/${number}`;

/**
 * Time string type definition
 */
type TimeString = `${number}:${number}`;

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
type TeamStatus = {
  win: number,
  lose: number,
  draw: number,
  points: number,
  avlbl_pt: number,
  avrg_pt: number,
  goal_get: number,
  goal_diff: number,
  all_game: number,
  rest_games: { [teamName: string]: { [opponent: string]: number } },
}

/**
 * Represents a team in a competition.
 *
 * @typedef {Object} Team
 * @property {Match[]} matches - The list of match data for the team.
 * @property {TeamStatus} latest - The latest status of the team.
 * @property {TeamStatus} display - The status of the team at the time of display.
 */
type Team = {
  matches: Match[];
  latest: TeamStatus;
  display: TeamStatus;
}

/**
 * Data structure of Group of the league
 */
type Group = { [teamName: string]: Team };

/**
 * Competition data structure
 */
type Competition = { [groupName: string]: Group };
