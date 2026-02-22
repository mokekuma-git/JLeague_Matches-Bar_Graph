"""Tests for scripts/convert_acl_json_to_csv.py."""
import json
import os
import tempfile

import pytest

from scripts.convert_acl_json_to_csv import convert_acl_json, write_csv, CSV_COLUMNS


# Minimal fixture: 1 group, 2 teams, 1 match (home perspective for TeamA).
SAMPLE_JSON = {
    "A": {
        "TeamA": {
            "df": [
                {
                    "goal_get": "2",
                    "goal_lose": "1",
                    "group": "A",
                    "has_result": True,
                    "is_home": True,
                    "match_date": "04/16",
                    "match_status": "試合終了",
                    "opponent": "TeamB",
                    "point": 3,
                    "section_no": "1",
                    "stadium": "TestStadium",
                    "start_time": "19:00:00",
                },
                {
                    "goal_get": "0",
                    "goal_lose": "1",
                    "group": "A",
                    "has_result": True,
                    "is_home": False,
                    "match_date": "04/20",
                    "match_status": "試合終了",
                    "opponent": "TeamB",
                    "point": 0,
                    "section_no": "2",
                    "stadium": "AwayStadium",
                    "start_time": "19:00:00",
                },
            ]
        },
        "TeamB": {
            "df": [
                {
                    "goal_get": "1",
                    "goal_lose": "2",
                    "group": "A",
                    "has_result": True,
                    "is_home": False,
                    "match_date": "04/16",
                    "match_status": "試合終了",
                    "opponent": "TeamA",
                    "point": 0,
                    "section_no": "1",
                    "stadium": "TestStadium",
                    "start_time": "19:00:00",
                },
                {
                    "goal_get": "1",
                    "goal_lose": "0",
                    "group": "A",
                    "has_result": True,
                    "is_home": True,
                    "match_date": "04/20",
                    "match_status": "試合終了",
                    "opponent": "TeamA",
                    "point": 3,
                    "section_no": "2",
                    "stadium": "AwayStadium",
                    "start_time": "19:00:00",
                },
            ]
        },
    }
}


class TestConvertAclJson:
    """Tests for convert_acl_json()."""

    def test_extracts_only_home_matches(self):
        """Each match should appear once (from is_home=True perspective)."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        assert len(rows) == 2  # 2 matches total (one per team's home game)

    def test_date_conversion(self):
        """MM/DD should be converted to YYYY/MM/DD with the given year."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        dates = [r["match_date"] for r in rows]
        assert "2021/04/16" in dates
        assert "2021/04/20" in dates

    def test_csv_columns_present(self):
        """All standard CSV columns should be present in each row."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        for row in rows:
            for col in CSV_COLUMNS:
                assert col in row, f"Missing column: {col}"

    def test_home_away_mapping(self):
        """Home team, away team, and goals should be mapped correctly."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        # First match: TeamA (home) 2-1 TeamB (away)
        first = [r for r in rows if r["match_date"] == "2021/04/16"][0]
        assert first["home_team"] == "TeamA"
        assert first["away_team"] == "TeamB"
        assert first["home_goal"] == "2"
        assert first["away_goal"] == "1"

    def test_status_mapped_from_match_status(self):
        """match_status in JSON should become status in CSV."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        assert all(r["status"] == "試合終了" for r in rows)

    def test_group_column_populated(self):
        """Group name should be set from the top-level key."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        assert all(r["group"] == "A" for r in rows)

    def test_sorted_by_date_group_section(self):
        """Rows should be sorted by (match_date, group, section_no)."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        dates = [r["match_date"] for r in rows]
        assert dates == sorted(dates)

    def test_match_index_in_section_is_empty(self):
        """match_index_in_section is not in JSON, should default to empty."""
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        assert all(r["match_index_in_section"] == "" for r in rows)


class TestMultipleGroups:
    """Test with multiple groups to verify cross-group handling."""

    def test_multiple_groups(self):
        multi = {
            "A": {
                "TeamA": {"df": [
                    {"goal_get": "1", "goal_lose": "0", "group": "A",
                     "has_result": True, "is_home": True, "match_date": "04/16",
                     "match_status": "試合終了", "opponent": "TeamB",
                     "point": 3, "section_no": "1", "stadium": "S1",
                     "start_time": "19:00:00"},
                ]},
                "TeamB": {"df": [
                    {"goal_get": "0", "goal_lose": "1", "group": "A",
                     "has_result": True, "is_home": False, "match_date": "04/16",
                     "match_status": "試合終了", "opponent": "TeamA",
                     "point": 0, "section_no": "1", "stadium": "S1",
                     "start_time": "19:00:00"},
                ]},
            },
            "B": {
                "TeamC": {"df": [
                    {"goal_get": "3", "goal_lose": "2", "group": "B",
                     "has_result": True, "is_home": True, "match_date": "04/16",
                     "match_status": "試合終了", "opponent": "TeamD",
                     "point": 3, "section_no": "1", "stadium": "S2",
                     "start_time": "20:00:00"},
                ]},
                "TeamD": {"df": [
                    {"goal_get": "2", "goal_lose": "3", "group": "B",
                     "has_result": True, "is_home": False, "match_date": "04/16",
                     "match_status": "試合終了", "opponent": "TeamC",
                     "point": 0, "section_no": "1", "stadium": "S2",
                     "start_time": "20:00:00"},
                ]},
            },
        }
        rows = convert_acl_json(multi, 2021)
        assert len(rows) == 2
        groups = [r["group"] for r in rows]
        assert "A" in groups
        assert "B" in groups


class TestWriteCsv:
    """Tests for write_csv()."""

    def test_writes_valid_csv_file(self):
        rows = convert_acl_json(SAMPLE_JSON, 2021)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False, encoding="utf-8"
        ) as f:
            tmp_path = f.name

        try:
            write_csv(rows, tmp_path)
            with open(tmp_path, encoding="utf-8") as f:
                content = f.read()

            lines = content.strip().split("\n")
            # Header + 2 data rows
            assert len(lines) == 3
            header = lines[0].split(",")
            assert header == CSV_COLUMNS
        finally:
            os.unlink(tmp_path)


class TestRealData:
    """Integration test using the actual aclgl_points.json if available."""

    @pytest.fixture
    def real_json_path(self):
        path = "docs/json/aclgl_points.json"
        if not os.path.exists(path):
            pytest.skip("aclgl_points.json not found")
        return path

    def test_real_data_conversion(self, real_json_path):
        with open(real_json_path, encoding="utf-8") as f:
            data = json.load(f)
        rows = convert_acl_json(data, 2021)

        # 10 groups × 4 teams × 3 home matches each = 120 matches
        assert len(rows) == 120

        # All rows should have the standard columns
        for row in rows:
            for col in CSV_COLUMNS:
                assert col in row

        # All dates should start with 2021/
        assert all(r["match_date"].startswith("2021/") for r in rows)

        # All groups A-J should be present
        groups = {r["group"] for r in rows}
        assert groups == {"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}
