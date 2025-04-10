"""設定ファイル管理モジュール

設定ファイルはyamlで2レベルまでのセクションを持つ辞書形式で記述
ex)
```yaml
debug: true
season: 2023
any_section:
    any_key: any_value
    timezone: Asia/Tokyo
paths:
    csv_format: "csv/{season}/{category}/matchs.csv"
urls:
    source_url_format: "https://example.com/{category}/{section}"
```
コード内での使い方は以下の通り
'''python
import pytz
from set_config import load_config

config = load_config('config.yaml')

# 以下のアクセス方法が全て可能
# 1. ドット記法でプロパティとしてアクセス
DEBUG = config.debug
any_key = config.any_section.any_key

# 2. 辞書風のアクセス
csv_format = config['paths']['csv_format']

# 3. 専用のメソッドを使ったフォーマット済みの値取得
get_source_url = lambda category, section: config.get_format_str('urls', 'source_url_format', category, section)
source_url = get_source_url('groupA', 'section1') # https://example.com/groupA/section1
get_csv_path = lambda category: config.get_path('paths', 'csv_format', season=config.season, category=category)
csv_path = get_csv_path('groupA')  # csv/2023/groupA/matches.csv

型変換は行わないので、必要に応じて適宜変換してください。

config.season = int(config.season)
config.timezone = pytz.timezone(config.timezone)


# 予約語はトップレベルのdebug
♯ debug: bool
"""
from os import PathLike
from pathlib import Path
from typing import Any

import yaml


class ConfigSection:
    """設定のセクションを表すクラス"""

    def __init__(self, section_data: dict[str, Any]):
        self._data = section_data
        # セクションの各キーをオブジェクトの属性として設定
        for key, value in section_data.items():
            if isinstance(value, dict):
                # ネストした辞書は新しいConfigSectionに変換
                setattr(self, key, ConfigSection(value))
            else:
                setattr(self, key, value)

    def __getitem__(self, key: str) -> Any:
        """辞書風のアクセスをサポート: section['key']"""
        return self._data.get(key)

    def get(self, key: str, default: Any = None) -> Any:
        """キーに対応する値を取得、なければデフォルト値を返す"""
        return self._data.get(key, default)

    def keys(self) -> list[str]:
        """利用可能なキーのリストを返す"""
        return list(self._data.keys())

    def __repr__(self) -> str:
        return f'ConfigSection({self._data})'


class Config:
    """設定ファイル管理クラス"""

    def __init__(self, config_path: str):
        """
        指定された設定ファイルを読み込む

        Args:
            config_path: 設定ファイルのパス
        """
        self.config_path = config_path
        self._raw_config = self._load_config(config_path)

        # トップレベルのセクションをクラス属性として設定
        for section_name, section_data in self._raw_config.items():
            if isinstance(section_data, dict):
                setattr(self, section_name, ConfigSection(section_data))
            else:
                setattr(self, section_name, section_data)

        # debugのみ予約語
        self.debug = self.debug if hasattr(self, 'debug') else False

    def _load_config(self, config_path: str) -> dict[str, Any]:
        """設定ファイルを読み込む"""
        if not Path(config_path).exists():
            raise FileNotFoundError(f'Config file not found: {config_path}')

        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

    def __getitem__(self, key: str) -> Any:
        """辞書風のアクセスをサポート: config['section']"""
        return self._raw_config.get(key)

    def get_path(self, section: str, key: str, *args, **kwargs) -> Path:
        """パス設定のセクションとキーを取得し、必要に応じて引数でフォーマットして絶対パスに変換

        ex)
        paths:
            csv_format: "csv/{season}/{category}/{section}.csv"

        config.get_path('paths', 'csv_format', season=2023, category='groupA', section='section1')
        -> Path('csv/2023/groupA/section1.csv')

        Args:
            section: 対象パスのセクション名, トップレベルを扱うときはNoneを指定
            key: 対象パスのキー名
            **kwargs: フォーマット文字列に適用するパラメータ

        Returns:
            Pathオブジェクト
        """
        return Path(self.get_format_str(section, key, *args, **kwargs)).resolve()

    def get_format_str(self, section: str, key: str, *args, **kwargs) -> str:
        """フォーマット文字列のセクションとキーを取得し、引数でフォーマットして文字列を返す

        ex)
        urls:
            source_url_format: "https://example.com/{category}/{section}"

        config.get_format_str('urls', 'source_url_format', category='groupA', section='section1')
        -> 'https://example.com/groupA/section1'

        Args:
            section: 対象のセクション名, トップレベルを扱うときはNoneを指定
            key: 対象フォーマットのキー名
            *args: フォーマット文字列に適用する位置引数

        Returns:
            フォーマット済み文字列
        """
        if section is None:
            # トップレベルのセクションを扱うときはNoneを指定
            if not hasattr(self, key):
                raise ValueError(f'Format not found in top level: {key}')
            format_str = getattr(self, key)
            if isinstance(format_str, dict):
                raise ValueError(f'section name found in top level: {key}')
        else:
            if not hasattr(self, section) or not hasattr(getattr(self, section), key):
                raise ValueError(f'URL not found in {section} section: {key}')
            format_str = getattr(getattr(self, section), key)

        if args:
            return format_str.format(*args)
        elif kwargs:
            return format_str.format(**kwargs)
        return format_str


def load_config(config_path: PathLike) -> Config:
    """
    設定ファイルを読み込み、Configオブジェクトを返す

    Args:
        config_path: 設定ファイルのパス

    Returns:
        Configオブジェクト
    """
    return Config(config_path)
