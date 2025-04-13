"""設定ファイル管理モジュール

設定ファイルはyamlで多層のセクションを持つ辞書形式で記述
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
from typing import Any, Union

import yaml


class ConfigSection:
    """設定のセクションを表すクラス"""

    def __init__(self, section_data: dict[str, Any]):
        self._data = section_data
        # セクションの各キーをオブジェクトの属性として設定
        for key, value in section_data.items():
            if isinstance(value, dict):
                # ネストした辞書は新しいConfigSectionに変換
                new_section = ConfigSection(value)
                setattr(self, key, new_section)
                self._data[key] = new_section
            else:
                setattr(self, key, value)

    def __getitem__(self, key: str) -> Any:
        """辞書風のアクセスをサポート: section['key']"""
        return self._data.get(key)

    def __setitem__(self, key: str, value: Any) -> None:
        """辞書風のアクセスをサポート: section['key'] = value"""
        self._data[key] = value
        setattr(self, key, value)

    def get(self, key: str, default: Any = None) -> Any:
        """キーに対応する値を取得、なければデフォルト値を返す"""
        return self._data.get(key, default)

    def keys(self) -> list[str]:
        """利用可能なキーのリストを返す"""
        return list(self._data.keys())

    def items(self) -> list[tuple[str, Any]]:
        """キーと値のペアのリストを返す"""
        return list(self._data.items())

    def __contains__(self, key: str) -> bool:
        """in演算子をサポート: key in section"""
        return key in self._data
    
    def __iter__(self):
        """イテレーションをサポート: for key in section"""
        return iter(self._data)

    def __repr__(self) -> str:
        return f'ConfigSection({self._data})'

    def to_dict(self) -> dict[str, Any]:
        """セクションを辞書形式で返す"""
        result = {}
        for key, value in self._data.items():
            if isinstance(value, ConfigSection):
                result[key] = value.to_dict()
            else:
                result[key] = value
        return result

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
            raise FileNotFoundError(f'Config file not found: {config_path} current_dir: {Path().resolve()}')

        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

    def __getitem__(self, key: str) -> Any:
        """辞書風のアクセスをサポート: config['section']"""
        return self._raw_config.get(key)

    def keys(self) -> list[str]:
        """利用可能なキーのリストを返す"""
        return list(self._raw_config.keys())

    def __repr__(self) -> str:
        """設定内容を文字列として返す"""
        return f'Config({self._raw_config})'


    def get_path(self, key: str, *args, **kwargs) -> Path:
        """パス設定のキーを受け取り、必要に応じて引数でフォーマットして絶対ファイルパスに変換

        キーはドット区切りでセクション名と共に指定する

        ex)
        paths:
            csv_format: "csv/{season}/{category}/{section}.csv"

        config.get_path('paths.csv_format', season=2023, category='groupA', section='section1')
        -> Path('csv/2023/groupA/section1.csv')

        Args:
            section: 対象パスのセクション名, トップレベルを扱うときはNoneを指定
            key: 対象パスのキー名
            **kwargs: フォーマット文字列に適用するパラメータ

        Returns:
            Pathオブジェクト
        """
        return Path(self.get_format_str(key, *args, **kwargs)).resolve()

    def get_format_str(self, key: str, *args, **kwargs) -> str:
        """フォーマット文字列のキーを受け取り、引数でフォーマットして文字列を返す

        キーはドット区切りでセクション名と共に指定する

        ex)
        urls:
            source_url_format: "https://example.com/{category}/{section}"

        config.get_format_str('urls.source_url_format', category='groupA', section='section1')
        -> 'https://example.com/groupA/section1'

        Args:
            section: 対象のセクション名, トップレベルを扱うときはNoneを指定
            key: 対象フォーマットのキー名
            *args: フォーマット文字列に適用する位置引数

        Returns:
            フォーマット済み文字列

        Raises:
            KeyError: 指定されたキーが存在しない場合
            TypeError: フォーマット文字列が文字列でない場合
        """
        format_str = self.get_from_keypath(key)
        if not isinstance(format_str, str):
            raise TypeError(f'Format string for key {key} is not a string: {format_str}')

        if args:
            return format_str.format(*args)
        elif kwargs:
            return format_str.format(**kwargs)
        return format_str

    def get_from_keypath(self, key: str) -> Union[str, ConfigSection, Any]:
        """指定されたキーのパスを辿って値、またはConfigSectionを取得する

        キーはドット区切りでセクション名と共に指定する

        ex)
        config.get_from_keypath('urls.source_url_format')
        -> 'https://example.com/{category}/{section}'

        Args:
            key: ドット区切りで表す取得対象のキーパス (例: 'urls.source_url_format')

        Returns:
            対象の値、またはConfigSection

        Raises:
            KeyError: 指定されたキーが存在しない場合
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

            # 次のイテレーションのために親とパスを更新
            path = f'{path}.{part}' if path else part
            parent = result


def load_config(config_path: PathLike) -> Config:
    """
    設定ファイルを読み込み、Configオブジェクトを返す

    Args:
        config_path: 設定ファイルのパス

    Returns:
        Configオブジェクト
    """
    return Config(config_path)
