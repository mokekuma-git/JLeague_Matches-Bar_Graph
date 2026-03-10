#!/usr/bin/env python3
"""Create a blank bracket definition scaffold."""

from __future__ import annotations

import argparse
import json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a blank bracket definition scaffold.")
    parser.add_argument("--title", required=True, help="Title for the bracket definition")
    parser.add_argument(
        "--round",
        dest="rounds",
        action="append",
        required=True,
        help="Round label in earliest-to-latest order. Repeat for each round.",
    )
    parser.add_argument(
        "--slot",
        dest="slots",
        action="append",
        required=True,
        help="Earliest visible slot id or label. Repeat for each slot.",
    )
    parser.add_argument(
        "--label-slot",
        action="store_true",
        help="Use each slot value as both id and label. By default, auto-generate ids.",
    )
    return parser.parse_args()


def build_slots(raw_slots: list[str], label_slot: bool) -> list[dict[str, str]]:
    slots: list[dict[str, str]] = []
    for index, value in enumerate(raw_slots, start=1):
        slot_id = value if label_slot else f"slot-{index}"
        slots.append({"id": slot_id, "label": value})
    return slots


def main() -> None:
    args = parse_args()
    slots = build_slots(args.slots, args.label_slot)
    payload = {
        "format": "graph",
        "title": args.title,
        "source_urls": [],
        "sections": [
            {
                "id": "main",
                "label": args.title,
                "rounds": args.rounds,
                "slots": slots,
                "matches": [],
            }
        ],
        "assumptions": [],
        "unresolved": [],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
