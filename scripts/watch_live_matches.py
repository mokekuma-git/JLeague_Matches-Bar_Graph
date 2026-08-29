"""Poll the J-League schedule pages while today's matches are being played.

Replaces the per-match cron entries that used to start one runner per fixture:
the setup cost of a run dwarfed the update itself, and every schedule change
meant hand-editing the workflow.  This driver instead works out from the CSVs
when today's matches run, polls for as long as they last, and exits as soon as
there is nothing left to watch -- including straight away on days with no
matches at all.

Usage:
    uv run python scripts/watch_live_matches.py --budget-minutes 300
    uv run python scripts/watch_live_matches.py --dry-run
"""
import argparse
import logging
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / 'src'))

import pytz  # noqa: E402

from match_utils import mu  # noqa: E402

logger = logging.getLogger(__name__)

# The readers resolve their CSV paths relative to src/, so config has to be
# loaded the same way they load it.
SRC_DIR = _REPO_ROOT / 'src'
config = mu.init_config(_REPO_ROOT / 'config' / 'jleague.yaml')
config.timezone = pytz.timezone(config.timezone)

COMPETITIONS = ['J1', 'J2', 'J3']

# A match is watched from shortly before kick-off until well after the last one
# could have ended: 90 minutes of play, half time, stoppage and the wait for the
# result to be posted.
LEAD_IN = timedelta(minutes=5)
RUN_OUT = timedelta(minutes=150)

# Statuses that mean a match will not change again today.
SETTLED = ('試合終了', '試合中止', '試合不実施')

# Marker the reader puts on a match in progress (see read_jleague_matches).
LIVE_MARKER = '速報中'


def load_todays_matches(today: datetime.date, csv_dir: Path = None) -> pd.DataFrame:
    """Collect every J-League match scheduled for `today`.

    Args:
        today (date): Day to look for, in the league's local timezone.
        csv_dir (Path, optional): Directory holding the CSVs. Defaults to the config path.

    Returns:
        pd.DataFrame: Matches on that day, with a 'competition' column.
    """
    wanted = today.strftime('%Y/%m/%d')
    frames = []
    for competition in COMPETITIONS:
        if csv_dir:
            path = Path(csv_dir) / f'{config.season}_allmatch_result-{competition}.csv'
        else:
            # get_csv_path() is written for a process running inside src/.
            path = (SRC_DIR / mu.get_csv_path(competition)).resolve()
        if not path.exists():
            logger.warning("No CSV for %s at %s", competition, path)
            continue
        frame = mu.read_allmatches_csv(str(path))
        frame = frame[frame['match_date'] == wanted].copy()
        frame['competition'] = competition
        frames.append(frame)

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def match_window(matches: pd.DataFrame, today: datetime.date, now: datetime,
                 tzinfo=None) -> tuple[datetime, datetime] | None:
    """Return the (start, end) of the period worth polling, or None.

    Fixtures whose kick-off time is not settled are ignored: they cannot anchor
    a window, and letting a blank time fall back to midnight would stretch the
    window across the whole day.

    A match already under way has no kick-off time left on the card either, so a
    job starting mid-match would otherwise find no anchor at all and quit while
    matches are still being played.  Any live match therefore anchors the window
    on the current time.

    Args:
        matches (pd.DataFrame): Today's matches.
        today (date): The day being watched.
        now (datetime): Current time, used to anchor matches already in play.
        tzinfo: Timezone to attach to the returned datetimes.

    Returns:
        tuple[datetime, datetime] | None: Window bounds, or None if nothing to watch.
    """
    if matches.empty:
        return None

    anchors = []
    for value in matches['start_time'].fillna(''):
        text = str(value).strip()
        try:
            clock = datetime.strptime(text, '%H:%M').time()
        except ValueError:
            continue  # '未定' or blank -- no usable kick-off time
        anchors.append(datetime.combine(today, clock, tzinfo=tzinfo))

    if is_live(matches):
        anchors.append(now)

    if not anchors:
        return None
    return min(anchors) - LEAD_IN, max(anchors) + RUN_OUT


def is_live(matches: pd.DataFrame) -> bool:
    """Return True when at least one match is being played right now.

    Args:
        matches (pd.DataFrame): Today's matches.

    Returns:
        bool: True if any status carries the live marker.
    """
    if matches.empty:
        return False
    return matches['status'].fillna('').str.contains(LIVE_MARKER).any()


def all_settled(matches: pd.DataFrame) -> bool:
    """Return True when no match of the day can still change.

    Args:
        matches (pd.DataFrame): Today's matches.

    Returns:
        bool: True if every match has a settled status.
    """
    if matches.empty:
        return True
    return matches['status'].fillna('').isin(SETTLED).all()


def run(command: list[str], cwd: Path = None) -> subprocess.CompletedProcess:
    """Run a command, capturing its output.

    Args:
        command (list[str]): Command and arguments.
        cwd (Path, optional): Working directory.

    Returns:
        subprocess.CompletedProcess: The finished process.
    """
    return subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)


def commit_and_push(retries: int = 3) -> bool:
    """Commit any CSV change and push it, rebasing past concurrent commits.

    A push can lose a race with the daily job or a person working on main.  One
    lost push is not worth ending the watch for -- the next poll carries the
    same data -- so a failure is reported and the loop goes on.

    Args:
        retries (int): How many times to re-try the rebase and push.

    Returns:
        bool: True if something was pushed.
    """
    status = run(['git', 'status', '--porcelain', 'docs/csv/'], cwd=_REPO_ROOT)
    if not status.stdout.strip():
        return False

    stamp = datetime.now().strftime('%m/%d %H:%M')
    run(['git', 'add', 'docs/csv/'], cwd=_REPO_ROOT)
    run(['git', 'commit', '-m', f'Make new csv (live update on {stamp})'], cwd=_REPO_ROOT)

    for attempt in range(1, retries + 1):
        pushed = run(['git', 'push', 'origin', 'HEAD'], cwd=_REPO_ROOT)
        if pushed.returncode == 0:
            logger.info("Pushed CSV update")
            return True
        logger.warning("Push failed (attempt %d/%d): %s",
                       attempt, retries, pushed.stderr.strip()[:200])
        rebased = run(['git', 'pull', '--rebase', 'origin', 'main'], cwd=_REPO_ROOT)
        if rebased.returncode != 0:
            logger.error("Rebase failed: %s", rebased.stderr.strip()[:200])
            run(['git', 'rebase', '--abort'], cwd=_REPO_ROOT)
            return False
    logger.error("Giving up on this push; the next poll will carry the same data")
    return False


def poll_once() -> None:
    """Fetch the J-League CSVs once."""
    result = run([sys.executable, 'read_jleague_matches.py'], cwd=_REPO_ROOT / 'src')
    if result.returncode != 0:
        logger.error("Reader failed: %s", result.stderr.strip()[-500:])
    else:
        logger.info("Reader finished")


def main() -> int:
    """Entry point.

    Returns:
        int: Process exit code.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--interval', type=int, default=5,
                        help='minutes between polls (default: 5)')
    parser.add_argument('--budget-minutes', type=int, default=300,
                        help='how long this job may run (default: 300)')
    parser.add_argument('--dry-run', action='store_true',
                        help='report the window and exit without polling')
    parser.add_argument('--no-push', action='store_true',
                        help='poll and update the CSVs but leave them uncommitted')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s [%(levelname)s] %(message)s',
                        datefmt='%H:%M:%S')

    tzinfo = config.timezone
    now = datetime.now(tzinfo)
    deadline = now + timedelta(minutes=args.budget_minutes)

    matches = load_todays_matches(now.date())
    window = match_window(matches, now.date(), now, tzinfo=now.tzinfo)
    if window is None:
        logger.info("No match with a known kick-off today; nothing to watch")
        return 0

    start, end = window
    logger.info("Today's window: %s - %s (%d matches)",
                start.strftime('%H:%M'), end.strftime('%H:%M'), len(matches))

    if now >= end:
        logger.info("Today's matches are already over; nothing to watch")
        return 0
    if start > deadline:
        logger.info("Window starts after this job's budget (%s); a later run takes it",
                    deadline.strftime('%H:%M'))
        return 0
    if all_settled(matches):
        logger.info("Every match today is already settled; nothing to watch")
        return 0

    if args.dry_run:
        logger.info("Dry run: would poll every %d min until %s",
                    args.interval, min(end, deadline).strftime('%H:%M'))
        return 0

    if now < start:
        wait = (start - now).total_seconds()
        logger.info("Waiting %.0f min until kick-off", wait / 60)
        time.sleep(wait)

    stop_at = min(end, deadline)
    while True:
        poll_once()
        if args.no_push:
            logger.info("--no-push: leaving any change uncommitted")
        else:
            commit_and_push()

        today = load_todays_matches(datetime.now(tzinfo).date())
        if all_settled(today):
            logger.info("All of today's matches have finished; stopping")
            return 0

        now = datetime.now(tzinfo)
        if now + timedelta(minutes=args.interval) >= stop_at:
            logger.info("Reached the end of this job's window")
            return 0
        time.sleep(args.interval * 60)


if __name__ == '__main__':
    sys.exit(main())
