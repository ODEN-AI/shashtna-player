import type { PlaylistLinkMethod } from '../../app/edition';
import { describeServerUrlProblem, normalizeServerUrl, validateServerUrl } from '../../lib/serverUrl';
import { ValidationError } from './connectionErrors';

/**
 * "M3U link" sign-in method: a playlist URL typed or pasted by the user (a
 * pasted Xtream get.php link is recognised and loaded through the API).
 *
 * Full only. Shashtna Player (App.tsx) passes it to the connection screen via
 * its Edition; Shashtna Player Lite does not, so Lite has no link tab or field
 * and this module is not part of the Lite bundle.
 */
export const PLAYLIST_LINK: PlaylistLinkMethod = {
  tabLabel: ar => (ar ? 'رابط M3U' : 'M3U link'),
  subtitle: ar => (ar ? 'الصق رابط قائمة التشغيل من مزود الخدمة.' : 'Paste the playlist link from your provider.'),
  fieldLabel: ar => (ar ? 'رابط قائمة التشغيل (M3U)' : 'Playlist link (M3U)'),
  placeholder: 'http://provider.tv/playlist.m3u',
  resolve(value, ar) {
    const clean = normalizeServerUrl(value);
    if (!clean) throw new ValidationError(ar ? 'أدخل رابط قائمة التشغيل.' : 'Enter the playlist link.');
    const problem = validateServerUrl(clean);
    if (problem) throw new ValidationError(describeServerUrlProblem(problem, ar));
    return clean;
  },
};
