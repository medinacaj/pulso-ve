/** Personal favorites are browser-local only: no account, no backend and no tracking. */
export const FAVORITES_KEY = 'pulsove:favorites:v1';
/** localStorage storage events fire in other tabs, never the writing tab. */
export const FAVORITES_CHANGE_EVENT = 'pulsove:favorites:change';
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFavoriteSlugs(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string =>
      typeof value === 'string' && value.length <= 96 && SAFE_SLUG.test(value)
    ))].slice(0, 80);
  } catch {
    return [];
  }
}

export function toggleFavorite(slugs: readonly string[], slug: string): string[] {
  if (!SAFE_SLUG.test(slug) || slug.length > 96) return [...slugs];
  return slugs.includes(slug)
    ? slugs.filter((item) => item !== slug)
    : [...slugs.filter((item) => item !== slug), slug].slice(-80);
}


/**
 * Storage can fail after initially working (quota, permissions or private mode).
 * Keep a tab-scoped fallback shared by all cards, without claiming the star is
 * durably saved. This object is only called from browser event/effect handlers.
 */
export function createFavoriteState() {
  let sessionSlugs: string[] | null = null;
  const read = (storage: Pick<Storage, 'getItem'>) => {
    if (sessionSlugs !== null) return { slugs: [...sessionSlugs], persisted: false };
    try {
      return { slugs: parseFavoriteSlugs(storage.getItem(FAVORITES_KEY)), persisted: true };
    } catch {
      sessionSlugs = [];
      return { slugs: [], persisted: false };
    }
  };
  const toggle = (storage: Pick<Storage, 'getItem' | 'setItem'>, slug: string) => {
    const previous = read(storage);
    const slugs = toggleFavorite(previous.slugs, slug);
    if (previous.persisted) {
      try {
        storage.setItem(FAVORITES_KEY, JSON.stringify(slugs));
        return { slugs, persisted: true };
      } catch {
        sessionSlugs = slugs;
      }
    } else {
      sessionSlugs = slugs;
    }
    return { slugs: [...slugs], persisted: false };
  };
  return { read, toggle };
}

export const favoriteState = createFavoriteState();

// Accessing window.localStorage itself may throw; defer access into read/toggle.
export const browserFavoriteStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};
