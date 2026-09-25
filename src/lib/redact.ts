/**
 * Removes credentials from diagnostic text: Xtream/M3U links and stream URLs
 * can carry a username and password, so any URL is reduced to its
 * scheme + host.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(username|password|user|pass|token)=([^&\s"']+)/gi, '$1=***')
    .replace(/(https?:\/\/[^/\s"']+)[^\s"']*/gi, '$1/…');
}
