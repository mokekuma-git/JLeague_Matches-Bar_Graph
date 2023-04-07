"""Searches for import statements in the given code and comments out any that import from known libraries."""
import shutil
import sys
import os
import re
from typing import List, Optional

KNOWN_LIBRARIES = ["papaparse"]  # 既知のライブラリのリスト
PATTERN = re.compile(r"import\s+[\w\d\{\},_\s]+\s+from\s+[\'\"]([\w\d\-_\/\.]+)[\'\"]")
TMP_FILE = '/tmp/lib_commented_script.js'

"""
Searches for import statements in the given code and comments out any that import from known libraries.

Prints the results to standard output.

Args:
    file_path (str): The path of the file to check.
    known_libraries (List[str], optional): A list of known libraries. Defaults to None.
"""
def comment_out_known_libraries(file_path: str, out_file: str,
                                known_libraries: Optional[List[str]] = None) -> None:
    if known_libraries is None:
        known_libraries = KNOWN_LIBRARIES

    changed: bool = False
    checked_lines: List[str] = []
    with open(file_path, "r") as f:
        for line in f:
            match: re.Match = PATTERN.search(line)
            if not match:
                checked_lines.append(line)
                continue
            lib: str = match.group(1)
            changed = True
            if lib in known_libraries:
                checked_lines.append("// " + line)
            else:
                checked_lines.append(line.replace(f"'{lib}'", f"'{lib}.js'"))

    if changed:
        with open(out_file, "w") as out:
            for line in checked_lines:
                out.write(line)

if __name__ == "__main__":
    for filename in sys.argv[1:]:
        comment_out_known_libraries(filename, TMP_FILE)
        if os.path.exists(TMP_FILE):
            shutil.move(TMP_FILE, filename)
