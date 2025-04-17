"""Check for swapped home and away columns in J-League CSV files

- Reads the CSV files in the specified directory,
- Displays the stadium, home_team, and away_team columns,
- Prompts the user to confirm if the stadium is home.
- If the user inputs a response starting with 'N', the file is flagged.
- Finally, it prints the list of flagged files.
"""
import glob
import os

import pandas as pd


def check_csv_files(directory: str):
    """Checks CSV files in the specified directory for swapped columns."""
    csv_files = [os.path.basename(f) for f in glob.glob(os.path.join(directory, 'J[1-3].csv'))]
    flagged_files = []

    for csv_file in csv_files:
        file_path = os.path.join(directory, csv_file)
        print(f"\nChecking file: {csv_file}")

        try:
            df = pd.read_csv(file_path)

            if {'stadium', 'home_team', 'away_team'}.issubset(df.columns):
                # print top 5 rows of stadium, home_team, away_team columns
                print(df[['stadium', 'home_team', 'away_team']].head(5))
            else:
                print(f"Warning: {csv_file} does not contain the required columns.")
                continue
        except (FileNotFoundError, UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as e:
            print(f"Error reading {csv_file}: {e}")
            continue

        # Judge if the file has swapped columns
        user_input = input("Does this file have swapped columns? (Type 'N' to flag this file, or press Enter to skip):")
        if user_input.strip().upper().startswith('N'):
            flagged_files.append(csv_file)

    print("\nFiles flagged as having swapped columns:")
    for flagged_file in flagged_files:
        print(flagged_file)


if __name__ == "__main__":
    check_csv_files("docs/csv")
