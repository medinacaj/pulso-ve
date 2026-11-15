/**
 * Mail action links use URL fragments, not query strings.
 * Browsers never include the hash fragment in HTTP requests or access logs.
 */
export function readAccountActionFragment(fragment: string): string {
  if (!fragment.startsWith('#')) return '';
  const params = new URLSearchParams(fragment.slice(1));
  if (Array.from(params.keys()).some((key) => key !== 'token')) return '';
  const all = params.getAll('token');
  if (all.length !== 1) return '';
  const token = all[0];
  if (!/^[a-zA-Z0-9_.-]{30,4096}$/.test(token)) return '';
  return token;
}
