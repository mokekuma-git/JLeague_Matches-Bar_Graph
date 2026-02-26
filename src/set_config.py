"""Configuration file management module

Configuration files are written in YAML as nested dictionaries with sections.
ex)
```yaml
season: 2023
any_section:
    any_key: any_value
    timezone: Asia/Tokyo
paths:
    csv_format: "csv/{season}/{category}/matchs.csv"
urls:
    source_url_format: "https://example.com/{category}/{section}"
```
Usage:
'''python
import pytz
from set_config import load_config

config = load_config('config.yaml')

# All of the following access methods are available:
# 1. Dot notation (attribute access)
any_key = config.any_section.any_key

# 2. Dictionary-style access
csv_format = config['paths']['csv_format']

# 3. Formatted value retrieval via dedicated methods
get_source_url = lambda category, section: config.get_format_str('urls', 'source_url_format', category, section)
source_url = get_source_url('groupA', 'section1') # https://example.com/groupA/section1
get_csv_path = lambda category: config.get_path('paths', 'csv_format', season=config.season, category=category)
csv_path = get_csv_path('groupA')  # csv/2023/groupA/matches.csv

No type conversion is performed; convert as needed.

config.season = int(config.season)
config.timezone = pytz.timezone(config.timezone)
"""
from os import PathLike
from pathlib import Path
from typing import Any

import yaml


class ConfigSection:
    """Represents a section within a configuration file."""

    def __init__(self, section_data: dict[str, Any]):
        self._data = section_data
        # Set each key of the section as an object attribute
        for key, value in section_data.items():
            if isinstance(value, dict):
                # Convert nested dicts into new ConfigSection instances
                new_section = ConfigSection(value)
                setattr(self, key, new_section)
                self._data[key] = new_section
            else:
                setattr(self, key, value)

    def __getitem__(self, key: str) -> Any:
        """Support dictionary-style access: section['key']"""
        return self._data.get(key)

    def __setitem__(self, key: str, value: Any) -> None:
        """Support dictionary-style assignment: section['key'] = value"""
        self._data[key] = value
        setattr(self, key, value)

    def get(self, key: str, default: Any = None) -> Any:
        """Return the value for key, or default if not found."""
        return self._data.get(key, default)

    def keys(self) -> list[str]:
        """Return a list of available keys."""
        return list(self._data.keys())

    def items(self) -> list[tuple[str, Any]]:
        """Return a list of (key, value) pairs."""
        return list(self._data.items())

    def __contains__(self, key: str) -> bool:
        """Support the ``in`` operator: key in section"""
        return key in self._data

    def __iter__(self):
        """Support iteration: for key in section"""
        return iter(self._data)

    def __repr__(self) -> str:
        return f'ConfigSection({self._data})'

    def to_dict(self) -> dict[str, Any]:
        """Return the section as a plain dictionary."""
        result = {}
        for key, value in self._data.items():
            if isinstance(value, ConfigSection):
                result[key] = value.to_dict()
            else:
                result[key] = value
        return result


class Config:
    """Configuration file manager."""

    def __init__(self, config_path: str):
        """Load the specified configuration file.

        Args:
            config_path: Path to the configuration file.
        """
        self.config_path = config_path
        self._raw_config = self._load_config(config_path)

        # Set top-level sections as class attributes
        for section_name, section_data in self._raw_config.items():
            if isinstance(section_data, dict):
                setattr(self, section_name, ConfigSection(section_data))
            else:
                setattr(self, section_name, section_data)


    def _load_config(self, config_path: str) -> dict[str, Any]:
        """Load the configuration file."""
        if not Path(config_path).exists():
            raise FileNotFoundError(f'Config file not found: {config_path} current_dir: {Path().resolve()}')

        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

    def __getitem__(self, key: str) -> Any:
        """Support dictionary-style access: config['section']"""
        return self._raw_config.get(key)

    def keys(self) -> list[str]:
        """Return a list of available keys."""
        return list(self._raw_config.keys())

    def __repr__(self) -> str:
        """Return a string representation of the config."""
        return f'Config({self._raw_config})'

    def get_path(self, key: str, *args, **kwargs) -> Path:
        """Look up a path key, format it with the given arguments, and resolve to an absolute path.

        The key is specified in dot-separated notation including the section name.

        ex)
        paths:
            csv_format: "csv/{season}/{category}/{section}.csv"

        config.get_path('paths.csv_format', season=2023, category='groupA', section='section1')
        -> Path('csv/2023/groupA/section1.csv')

        Args:
            key: Dot-separated key path (e.g. 'paths.csv_format')
            *args: Positional arguments applied to the format string.
            **kwargs: Keyword arguments applied to the format string.

        Returns:
            Path: Resolved absolute path.
        """
        return Path(self.get_format_str(key, *args, **kwargs)).resolve()

    def get_format_str(self, key: str, *args, **kwargs) -> str:
        """Look up a format-string key and return the formatted result.

        The key is specified in dot-separated notation including the section name.

        ex)
        urls:
            source_url_format: "https://example.com/{category}/{section}"

        config.get_format_str('urls.source_url_format', category='groupA', section='section1')
        -> 'https://example.com/groupA/section1'

        Args:
            key: Dot-separated key path (e.g. 'urls.source_url_format')
            *args: Positional arguments applied to the format string.
            **kwargs: Keyword arguments applied to the format string.

        Returns:
            str: Formatted string.

        Raises:
            KeyError: If the specified key does not exist.
            TypeError: If the value at the key is not a string.
        """
        format_str = self.get_from_keypath(key)
        if not isinstance(format_str, str):
            raise TypeError(f'Format string for key {key} is not a string: {format_str}')

        if args:
            return format_str.format(*args)
        if kwargs:
            return format_str.format(**kwargs)
        return format_str

    def get_from_keypath(self, key: str) -> str | ConfigSection | Any:
        """Traverse the dot-separated key path and return the value or ConfigSection.

        ex)
        config.get_from_keypath('urls.source_url_format')
        -> 'https://example.com/{category}/{section}'

        Args:
            key: Dot-separated key path (e.g. 'urls.source_url_format')

        Returns:
            The value at the key, or a ConfigSection.

        Raises:
            KeyError: If the specified key does not exist.
        """
        parts = key.split('.')
        parent = self
        path = ''

        for i, part in enumerate(parts):
            is_last = i == len(parts) - 1

            result = getattr(parent, part, None)

            if result is None:
                _type = 'Key' if is_last else 'Section'
                raise KeyError(f'{_type} {part} not found in config {path}')

            if is_last:
                return result

            # Update parent and path for the next iteration
            path = f'{path}.{part}' if path else part
            parent = result
        return result  # pylint: disable=unreachable


def load_config(config_path: PathLike) -> Config:
    """Load a configuration file and return a Config object.

    Args:
        config_path: Path to the configuration file.

    Returns:
        Config: The loaded configuration object.
    """
    return Config(config_path)
