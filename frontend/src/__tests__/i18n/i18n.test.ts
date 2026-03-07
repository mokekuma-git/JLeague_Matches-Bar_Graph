// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale, applyI18nAttributes } from '../../i18n';
import { ja } from '../../i18n/messages/ja';
import { en } from '../../i18n/messages/en';

beforeEach(() => {
  setLocale('ja');
});

describe('t() basic lookup', () => {
  it('returns Japanese text by default', () => {
    expect(t('label.competition')).toBe('大会');
  });

  it('returns English text when locale is en', () => {
    setLocale('en');
    expect(t('label.competition')).toBe('Competition');
  });

  it('returns the key itself for unknown keys', () => {
    // Cast to bypass type safety for this edge-case test
    expect(t('nonexistent.key' as never)).toBe('nonexistent.key');
  });
});

describe('t() placeholder interpolation', () => {
  it('replaces single placeholder', () => {
    setLocale('en');
    expect(t('status.loading')).toBe('Loading CSV...');
  });

  it('replaces multiple placeholders', () => {
    setLocale('en');
    expect(t('status.loaded', { league: 'J1', season: '2026', rows: 380 }))
      .toBe('J1 2026 — 380 rows');
  });

  it('replaces multiple placeholders in Japanese', () => {
    expect(t('tip.record', { win: 10, draw: 5, loss: 3 }))
      .toBe('10勝 / 5分 / 3敗');
  });

  it('replaces repeated placeholders', () => {
    // score.et has {get} and {lose}
    setLocale('en');
    expect(t('score.et', { get: 2, lose: 1 })).toBe('ET2-1');
  });
});

describe('setLocale / getLocale', () => {
  it('defaults to ja', () => {
    expect(getLocale()).toBe('ja');
  });

  it('switches to en and back', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    setLocale('ja');
    expect(getLocale()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });
});

describe('English dictionary completeness', () => {
  const jaKeys = Object.keys(ja) as (keyof typeof ja)[];

  it('en has every key defined in ja', () => {
    const enKeys = new Set(Object.keys(en));
    const missing = jaKeys.filter(k => !enKeys.has(k));
    expect(missing, `Missing English keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('en has no extra keys beyond ja', () => {
    const jaKeySet = new Set(jaKeys as string[]);
    const extra = Object.keys(en).filter(k => !jaKeySet.has(k));
    expect(extra, `Extra English keys: ${extra.join(', ')}`).toEqual([]);
  });

  it('no en values are empty strings', () => {
    const empty = jaKeys.filter(k => en[k] === '');
    expect(empty, `Empty English values: ${empty.join(', ')}`).toEqual([]);
  });
});

describe('applyI18nAttributes', () => {
  it('replaces textContent of elements with data-i18n', () => {
    document.body.innerHTML = '<span data-i18n="label.competition"></span>';
    applyI18nAttributes();
    expect(document.querySelector('span')!.textContent).toBe('大会');
  });

  it('applies English text when locale is en', () => {
    setLocale('en');
    document.body.innerHTML = '<span data-i18n="label.season"></span>';
    applyI18nAttributes();
    expect(document.querySelector('span')!.textContent).toBe('Season');
  });

  it('handles multiple elements', () => {
    document.body.innerHTML = `
      <span data-i18n="btn.resetDate"></span>
      <span data-i18n="btn.resetPrefs"></span>
    `;
    applyI18nAttributes();
    const spans = document.querySelectorAll('span');
    expect(spans[0].textContent).toBe('最新にリセット');
    expect(spans[1].textContent).toBe('設定をリセット');
  });
});
