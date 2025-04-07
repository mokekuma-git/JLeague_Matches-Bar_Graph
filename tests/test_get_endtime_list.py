"""Tests for get_endtime_list.py module."""
print("Starting test_get_endtime_list.py")
import sys
import subprocess
from datetime import datetime
from pathlib import Path

# Add the src directory to the Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.get_endtime_list import (
    read_all_match_times,
    update_workflow_file,
    WORKFLOW_FILE
)


def test_read_match_times():
    """Test read_match_times function."""
    match_times = read_all_match_times(None, "*")
    print(f"Match times from J-League in current year:")
    for match_time in match_times:
        print(match_time)
    # We don't have specific assertions here as this is more of a visual inspection test
    # But we could add assertions like:
    # assert len(match_times) > 0, "No match times found"
    # assert all(isinstance(mt, datetime) for mt in match_times), "Not all items are datetime objects"


def test_update_workflow_file():
    """Test update_workflow_file function."""
    test_match_times = [datetime(2023, 10, 1, 15, 0), datetime(2023, 10, 2, 16, 0)]
    result = update_workflow_file(test_match_times)
    assert result, "Failed to update workflow file"
    
    # Show the diff to visually inspect the changes
    subprocess.run(["git", "diff", WORKFLOW_FILE])


if __name__ == "__main__":
    # Run the tests based on command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--test-read_match_times":
            test_read_match_times()
        elif sys.argv[1] == "--test-update_workflow_file":
            test_update_workflow_file()
    else:
        print("Usage: python test_get_endtime_list.py --test-read_match_times | --test-update_workflow_file")
