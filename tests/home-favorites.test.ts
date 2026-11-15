import { describe, expect, it } from 'vitest';
import { FAVORITES_CHANGE_EVENT, FAVORITES_KEY, createFavoriteState, parseFavoriteSlugs, toggleFavorite } from '@/lib/favorites';

describe('local service favorites', () => {
  it('uses a scoped storage key, not a user account or a backend', () => {
    expect(FAVORITES_KEY).toBe('pulsove:favorites:v1');
    expect(FAVORITES_CHANGE_EVENT).toBe('pulsove:favorites:change');
  });

  it('defaults to an empty list and tolerates private browsing corruption', () => {
    expect(parseFavoriteSlugs(null)).toEqual([]);
    expect(parseFavoriteSlugs('{bad')).toEqual([]);
    expect(parseFavoriteSlugs('{}')).toEqual([]);
  });

  it('validates and deduplicates slugs to prevent arbitrary stored payloads', () => {
    expect(parseFavoriteSlugs(JSON.stringify([
      'cantv', 'cantv', 'banco-de-venezuela',
      'https://other.example/', '<script>', 3, null, 'A'.repeat(300),
    ]))).toEqual(['cantv', 'banco-de-venezuela']);
  });

  it('adds and removes favorites without duplicate entries', () => {
    const once = toggleFavorite([], 'cantv');
    expect(once).toEqual(['cantv']);
    expect(toggleFavorite(once, 'cantv')).toEqual([]);
    expect(toggleFavorite(once, 'movistar')).toEqual(['cantv', 'movistar']);
    expect(toggleFavorite(once, 'bad\nslug')).toEqual(['cantv']);
  });

  it('caps storage size', () => {
    const slugs = Array.from({ length: 100 }, (_, i) => `service-${i}`);
    expect(parseFavoriteSlugs(JSON.stringify(slugs))).toHaveLength(80);
    expect(toggleFavorite(slugs.slice(0, 80), 'extra-service')).toHaveLength(80);
  });

  it('keeps all cards synchronized when a storage write fails after an initial successful read', () => {
    const saved = new Map<string, string>();
    const store = createFavoriteState();
    const mockStorage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (_key: string, _value: string) => { throw new Error('QuotaExceededError'); },
    };
    expect(store.read(mockStorage)).toEqual({ slugs: [], persisted: true });
    expect(store.toggle(mockStorage, 'cantv')).toEqual({ slugs: ['cantv'], persisted: false });
    expect(store.read(mockStorage)).toEqual({ slugs: ['cantv'], persisted: false });
    expect(store.toggle(mockStorage, 'movistar')).toEqual({ slugs: ['cantv', 'movistar'], persisted: false });
    expect(store.toggle(mockStorage, 'cantv')).toEqual({ slugs: ['movistar'], persisted: false });
    expect(saved.size).toBe(0);
  });

  it('does not pretend persistence when even reading storage fails', () => {
    const store = createFavoriteState();
    const mockStorage = {
      getItem: (_key: string): string | null => { throw new Error('SecurityError'); },
      setItem: (_key: string, _value: string) => { throw new Error('SecurityError'); },
    };
    expect(store.read(mockStorage)).toEqual({ slugs: [], persisted: false });
    expect(store.toggle(mockStorage, 'cantv')).toEqual({ slugs: ['cantv'], persisted: false });
    expect(store.read(mockStorage)).toEqual({ slugs: ['cantv'], persisted: false });
  });

  it('keeps persistent favorites working across fresh state instances', () => {
    const saved = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
    };
    const first = createFavoriteState();
    expect(first.toggle(mockStorage, 'cantv')).toEqual({ slugs: ['cantv'], persisted: true });
    expect(createFavoriteState().read(mockStorage)).toEqual({ slugs: ['cantv'], persisted: true });
  });

});
