import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPrefs, savePrefs, clearPrefs } from '../../storage/local-storage';

// Minimal in-memory localStorage stub for the node test environment.
function makeLocalStorageStub(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem:    (key)        => store[key] ?? null,
    setItem:    (key, value) => { store[key] = value; },
    removeItem: (key)        => { delete store[key]; },
    clear:      ()           => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key:        (i)          => Object.keys(store)[i] ?? null,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub());
});

describe('loadPrefs', () => {
  it('returns empty object when nothing is stored', () => {
    expect(loadPrefs()).toEqual({});
  });

  it('returns stored prefs after savePrefs', () => {
    savePrefs({ category: '2', season: '2025' });
    expect(loadPrefs()).toMatchObject({ category: '2', season: '2025' });
  });
});

describe('savePrefs', () => {
  it('merges new values with existing prefs', () => {
    savePrefs({ category: '1' });
    savePrefs({ season: '2026' });
    const prefs = loadPrefs();
    expect(prefs.category).toBe('1');
    expect(prefs.season).toBe('2026');
  });

  it('overwrites existing keys', () => {
    savePrefs({ category: '1' });
    savePrefs({ category: '3' });
    expect(loadPrefs().category).toBe('3');
  });
});

describe('clearPrefs', () => {
  it('removes all stored prefs', () => {
    savePrefs({ category: '1', season: '2026' });
    clearPrefs();
    expect(loadPrefs()).toEqual({});
  });
});
