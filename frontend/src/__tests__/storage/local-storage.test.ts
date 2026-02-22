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
    savePrefs({ competition: 'J2', season: '2025' });
    expect(loadPrefs()).toMatchObject({ competition: 'J2', season: '2025' });
  });

  it('migrates legacy category to competition', () => {
    // Simulate old prefs with numeric category key
    localStorage.setItem(
      'jleague_viewer_prefs',
      JSON.stringify({ category: '1', season: '2025' }),
    );
    const prefs = loadPrefs();
    expect(prefs.competition).toBe('J1');
    expect(prefs).not.toHaveProperty('category');
    // Verify migration is persisted
    const raw = JSON.parse(localStorage.getItem('jleague_viewer_prefs')!);
    expect(raw.competition).toBe('J1');
    expect(raw).not.toHaveProperty('category');
  });

  it('does not overwrite existing competition with legacy category', () => {
    localStorage.setItem(
      'jleague_viewer_prefs',
      JSON.stringify({ category: '2', competition: 'J1' }),
    );
    const prefs = loadPrefs();
    expect(prefs.competition).toBe('J1');
  });
});

describe('savePrefs', () => {
  it('merges new values with existing prefs', () => {
    savePrefs({ competition: 'J1' });
    savePrefs({ season: '2026' });
    const prefs = loadPrefs();
    expect(prefs.competition).toBe('J1');
    expect(prefs.season).toBe('2026');
  });

  it('overwrites existing keys', () => {
    savePrefs({ competition: 'J1' });
    savePrefs({ competition: 'J3' });
    expect(loadPrefs().competition).toBe('J3');
  });
});

describe('clearPrefs', () => {
  it('removes all stored prefs', () => {
    savePrefs({ competition: 'J1', season: '2026' });
    clearPrefs();
    expect(loadPrefs()).toEqual({});
  });
});
