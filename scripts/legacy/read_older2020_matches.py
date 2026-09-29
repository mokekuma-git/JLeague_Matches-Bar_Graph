"""Read J-League match data and store it in CSV files"""
import argparse
from io import StringIO
import logging
import os
from pathlib import Path
import re
import sys

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_REPO_ROOT / 'src'))

import bs4
from bs4 import BeautifulSoup
import pandas as pd
import requests

from set_config import Config

logger = logging.getLogger(__name__)

config = Config(Path(__file__).parent / 'old_matches.yaml')

MATCH_CARD_ID = re.compile(config.match_data.card_id_pattern)


def read_href(td_tag: bs4.element.Tag) -> str | None:
    """Get href of a tag in given td tag

    Args:
        td_tag: td tag containing the href

    Returns:
        match_card_id: match card ID extracted from the href
    """
    a_tag = td_tag.find('a')
    if a_tag:
        return MATCH_CARD_ID.search(a_tag['href'])[1]
    return None


def store_year_data(year: int, frame: int | None = None) -> None:
    """Get J-League match data for the given year and store it in a CSV file.

    The result row is linked by a tag, and if the match ID is read, it is added to the column.

    Args:
        year: Year to get match data for
        frame: Optional competition_frame_ids filter (e.g. 11 = Levain Cup). Narrowing
            by frame keeps a season's query under the site's 1,500-row search limit and
            writes to a separate intermediate file so the full-year file is never clobbered.
    """
    logger.info("Read year: %d%s", year, f" (frame={frame})" if frame is not None else "")

    if frame is not None:
        _url = config.get_format_str('match_data.url_format_with_frame', year=year, frame=frame)
    else:
        _url = config.get_format_str('match_data.url_format', year=year)
    html_text = requests.request('GET', _url, timeout=config.http_timeout).text
    if config.match_data.too_many_results_text in html_text:
        # Raise rather than log and return: the daily cron runs this reader, and
        # a clean exit would hide a query the site refuses.
        raise RuntimeError(
            f"Search returned more than 1,500 rows for year {year}"
            f"{f' (frame={frame})' if frame is not None else ''}; narrow the query "
            f"(e.g. pass --frame) and retry. URL: {_url}"
        )

    html_io = StringIO(html_text)
    df = pd.read_html(html_io)[0]
    soup = BeautifulSoup(html_text, 'lxml')
    id_list = []
    match_td_list = soup.find_all('td', class_='al-c')
    for _td in match_td_list:
        id_list.append(read_href(_td))
    df['match_card_id'] = id_list

    if frame is not None:
        csv_file = config.get_path('match_data.csv_path_format_with_frame', year=year, frame=frame)
    else:
        csv_file = config.get_path('match_data.csv_path_format', year=year)
    df.to_csv(csv_file, lineterminator='\n', encoding=config.match_data.encoding)
    logger.info("Stored: %s", csv_file)


def process_years(years: list[int], frame: int | None = None) -> None:
    """Specified years of J-League match data are processed and stored.

    Args:
        years: List of years to process
        frame: Optional competition_frame_ids filter, applied to every year (see store_year_data)
    """
    for year in years:
        store_year_data(year, frame=frame)


def parse_arguments() -> argparse.Namespace:
    """Parse command-line arguments for the script."""
    parser = argparse.ArgumentParser(description='Script to fetch J-League match data for specified years.')

    # Make target year optional
    group = parser.add_mutually_exclusive_group()
    group.add_argument('-y', '--year', type=int, help='Specify a single year (e.g., 2000)')
    group.add_argument('-r', '--range', nargs=2, type=int, metavar=('START', 'END'),
                       help='Specify a range of years (e.g., 1993 2020)')
    group.add_argument('-l', '--list', nargs='+', type=int, metavar='YEAR',
                       help='Specify a list of years (e.g., 1993 1994 1995)')
    parser.add_argument('--frame', type=int, default=None,
                        help='Optional competition_frame_ids filter (e.g. 11 = Levain Cup). '
                             'Narrows the search to stay under the site\'s 1,500-row limit; '
                             'writes to csv/{year}_frame{frame}.csv instead of csv/{year}.csv.')

    args = parser.parse_args()
    return args


def _years_from_args(args: argparse.Namespace) -> list[int]:
    """Derive the list of years to process from parsed command-line arguments.

    If no year-selecting argument is provided, default to all years from 1993 to the current year.

    Args:
        args: Parsed command-line arguments (see parse_arguments).

    Returns:
        List[int]: List of years to process.
    """
    if not any([args.year, args.range, args.list]):
        current_year = pd.Timestamp.now().year
        years = list(range(1993, current_year + 1))
        logger.info("Apply all years from 1993 to %d as default", current_year)
    elif args.year:
        years = [args.year]
        logger.info("Target year: %d", args.year)
    elif args.range:
        start, end = args.range
        if start > end:
            logger.error("Start year %d is greater than end year %d", start, end)
            sys.exit(1)
        years = list(range(start, end + 1))
        logger.info("Target year range: %d to %d", start, end)
    elif args.list:
        years = sorted(args.list)
        logger.info("Target years: %s", years)
    return years


def parse_years() -> list[int]:
    """Parse years from command-line arguments.

    If no arguments are provided, default to all years from 1993 to the current year.

    Returns:
        List[int]: List of years to process.
    """
    return _years_from_args(parse_arguments())


def main():
    """Main function to read and process J-League match data."""
    args = parse_arguments()
    years = _years_from_args(args)

    process_years(years, frame=args.frame)


if __name__ == '__main__':
    os.chdir(_REPO_ROOT / 'src')
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    main()
