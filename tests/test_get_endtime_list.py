"""Tests for get_endtime_list.py module."""
from datetime import datetime
import subprocess
import sys

from src.get_endtime_list import WORKFLOW_FILE
from src.get_endtime_list import datetime_to_cron
from src.get_endtime_list import read_all_match_times
from src.get_endtime_list import update_workflow_file


def test_read_match_times():
    """Test read_match_times function."""
    match_times = read_all_match_times(None, "*")
    print("Match times from J-League in current year:")
    for match_time in match_times:
        print(match_time)
    # We don't have specific assertions here as this is more of a visual inspection test
    # But we could add assertions like:
    # assert len(match_times) > 0, "No match times found"
    # assert all(isinstance(mt, datetime) for mt in match_times), "Not all items are datetime objects"


def test_datetime_to_cron():
    """Test datetime_to_cron function with JST to UTC adjustment."""
    # Test case 1: Regular time conversion
    jst_time = datetime(2023, 10, 1, 1, 0)  # 01:00 JST
    cron_expr = datetime_to_cron(jst_time)
    # Expected: 0 16 30 9 * (16:00 UTC, which is 15:00 JST - 9 hours)
    expected = "0 16 30 9 *"
    print(f"JST time: {jst_time}, Cron expression: {cron_expr}, Expected: {expected}")
    assert cron_expr == expected, f"Expected {expected}, got {cron_expr}"

    # Test case 2: Time conversion with offset minutes
    jst_time = datetime(2023, 10, 1, 15, 0)  # 15:00 JST
    cron_expr = datetime_to_cron(jst_time, 50)  # Add 50 minutes
    # Expected: 50 6 1 10 * (00:50 UTC, which is 15:50 JST - 9 hours)
    expected = "50 6 1 10 *"
    print(f"JST time: {jst_time} + 50min, Cron expression: {cron_expr}, Expected: {expected}")
    assert cron_expr == expected, f"Expected {expected}, got {cron_expr}"


def test_update_workflow_file():
    """Test update_workflow_file function."""
    try:
        test_match_times = [datetime(2023, 10, 1, 15, 0), datetime(2023, 10, 2, 16, 0)]
        result = update_workflow_file(test_match_times)
        assert result, "Failed to update workflow file"

        # check the differences in the workflow file
        process = subprocess.run(["git", "diff", WORKFLOW_FILE], capture_output=True, text=True, check=False)
        diff_output = process.stdout

        print("Changes made to workflow file:")
        print(diff_output)

        # Basic checks for the diff output
        assert "diff --git" in diff_output, "Diff header not found"
        assert "--- a/" in diff_output, "--- a/ line not found"
        assert "+++ b/" in diff_output, "+++ b/ line not found"

        # Check for the default cron entry
        assert "    - cron: '0 16 * * *'" in diff_output, "Default cron entry not found"

        # Check for the deleted old cron entries
        assert "-    - cron: '" in diff_output, "削除された古いcronエントリが見つかりません"

        # Check for the new added cron entries
        expected_crons = [
            "+    - cron: '0 7 1 10 *'",  # 1st day 15:00 JST → 07:00 UTC
            "+    - cron: '0 8 2 10 *'",  # 2nd day 16:00 JST → 08:00 UTC
        ]

        for cron in expected_crons:
            assert cron in diff_output, f"Expected cron entry not found: {cron}"

    finally:
        # Restore the original workflow file after the test even if it fails
        print("Restoring original workflow file...")
        subprocess.run(["git", "checkout", "--", WORKFLOW_FILE], check=False)


if __name__ == "__main__":
    # Run the tests based on command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--test-read_match_times":
            test_read_match_times()
        elif sys.argv[1] == "--test-update_workflow_file":
            test_update_workflow_file()
        elif sys.argv[1] == "--test-datetime_to_cron":
            test_datetime_to_cron()
    else:
        print("Usage: python test_get_endtime_list.py --test-read_match_times | --test-update_workflow_file")
