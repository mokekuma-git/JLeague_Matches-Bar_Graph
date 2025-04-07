"""Generate cron schedules for GitHub Actions based on J-League match start times."""
import sys
from typing import List
import pandas as pd
import re
from datetime import datetime, timedelta
from pathlib import Path

# Constants
ROOT_DIR = Path(__file__).resolve().parent.parent
CSV_DIR = ROOT_DIR / Path("docs/csv")
WORKFLOW_FILE = ROOT_DIR / Path(".github/workflows/upadate-match-csv.yaml")
MATCH_PATTERN = r"(\d{4})_allmatch_result-J(\d+).csv"


def read_match_csv(file_path):
    """Read a match CSV file and return a DataFrame."""
    df = pd.read_csv(file_path, index_col=0)
    # Convert match_date to datetime if it's not already
    if df['match_date'].dtype == 'object':
        df['match_date'] = pd.to_datetime(df['match_date'], errors='coerce')
    return df


def read_all_match_times(year: int = None, category: int = "*") -> List[datetime]:
    """Get all match times from all J-League CSV files.

    Args:
        year (int, optional): Year to filter matches. Defaults to None.
                              None means current year.
        category (int, optional): Category to filter matches. [1, 2...] Defaults to "*".

    Returns:
        List[datetime]: List of match start times.
    """
    all_times = []
    current_year = datetime.now().year
    if year is None:
        year = current_year
    if category is None:
        category = "*"

    # Find all J-League match CSV files
    for file in CSV_DIR.glob("*_allmatch_result-J*.csv"):
        match = re.match(MATCH_PATTERN, file.name)
        if match:
            year = match.group(1)
            category = match.group(2)

            if int(year) >= current_year:  # Only consider future matches
                _times = read_match_times_from_file(file)
                all_times.extend(_times)
    # Remove duplicates and sort
    all_times = sorted(set(all_times))
    all_times = [t for t in all_times if t > datetime.now()]

    return all_times


def read_match_times_from_file(file:Path) -> List[datetime]:
    """Read match times from a specific CSV file.

    Args:
        file (Path): Path to the CSV file.

    Returns:
        List[datetime]: List of match start times.
    """
    print(f"Processing {file.name}...")
    df = read_match_csv(file)
    match_times = set()

    future_matches = df[df['status'] != '試合終了']
    future_matches = future_matches.dropna(subset=['start_time', 'match_date'])

    for _, row in future_matches.iterrows():
        match_date = row['match_date']
        start_time = row['start_time']
        if start_time == "未定":
            continue
        try:
            hour, minute = map(int, start_time.split(':'))
            match_datetime = pd.Timestamp(match_date).to_pydatetime()
            match_datetime = match_datetime.replace(hour=hour, minute=minute)
            match_times.add(match_datetime)
        except (ValueError, AttributeError) as e:
            print(f"Error processing match time {start_time} on {match_date}: {e}")
    return list(match_times)


def datetime_to_cron(dt, offset_minutes=0):
    """Convert a datetime to a cron expression with an offset."""
    # Apply offset
    dt = dt + timedelta(minutes=offset_minutes)

    # Format as cron expression (minute hour day month day-of-week)
    return f"{dt.minute} {dt.hour} {dt.day} {dt.month} *"


def update_workflow_file(match_times):
    """Update the GitHub workflow file with cron schedules."""
    with open(WORKFLOW_FILE, 'r', encoding='utf-8') as f:
        workflow_content = f.read()

    schedule_pattern = r"on:\s+schedule:\s+(.+?)(?=\n\n)"
    schedule_match = re.search(schedule_pattern, workflow_content, re.DOTALL)

    if not schedule_match:
        print("Could not find schedule section in workflow file.")
        return False

    cron_expressions = []
    cron_expressions.append("    - cron: '0 16 * * *'")  # Default cron expression
    # Add expressions for 50/100 minutes after match start
    for dt in match_times:
        cron_expressions.append(f"    - cron: '{datetime_to_cron(dt, 50)}'")
        cron_expressions.append(f"    - cron: '{datetime_to_cron(dt, 100)}'")

    new_schedule = "on:\n  schedule:\n" + "\n".join(cron_expressions)
    # Replace the old schedule section with the new one
    new_workflow_content = re.sub(
        r"on:\s+schedule:.+?(?=\n\n)",
        new_schedule,
        workflow_content,
        flags=re.DOTALL
    )
    # Write the updated workflow file
    try:
        with open(WORKFLOW_FILE, 'w', encoding='utf-8') as f:
            f.write(new_workflow_content)
        return True
    except Exception as e:
        print(f"Error writing to workflow file: {e}")
        return False


def main():
    """Main function."""
    print("Getting match times from CSV files...")
    match_times = read_all_match_times()
    print(f"Found {len(match_times)} future matches.")

    if match_times:
        print("Updating workflow file...")
        if update_workflow_file(match_times):
            print(f"Successfully updated {WORKFLOW_FILE} with {len(match_times)*2} new cron schedules.")
        else:
            print("Failed to update workflow file.")
    else:
        print("No future matches found. Workflow file not updated.")


if __name__ == "__main__":
    main()
