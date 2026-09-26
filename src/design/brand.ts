/**
 * Single source of truth for product naming.
 *
 * - Launcher label (outside the app) lives in
 *   android/app/src/main/res/values/strings.xml → "Shashtna Player".
 * - Inside the app the product is always "شاشتنا Player".
 *
 * The عامر IPTV edition replaces this whole module at bundle time with
 * src/variants/amer/brand.ts (metro.amer.config.js), which exports the same
 * names. Keep every user-visible product name, logo and brand phrase here.
 */
export const BRAND = {
  nameInside: 'شاشتنا Player',
  nameArabic: 'شاشتنا',
  nameLatin: 'Shashtna Player',
  tagline: 'PLAYER',
  developerCredit: 'تم تطويره عن طريق عبدالرحمن عامر',
  /** Brand statement on the sign-in screen (wording fixed by the brand). */
  statement: { ar: 'كل ما تحب، على شاشة واحدة.', en: 'Everything you love, on one screen.' },
  /** Badge in the player while a channel opens; '' = none (show the channel's own logo). */
  playerMark: 'ش',
  /** Real-device TV diagnostics (src/lib/tvDiagnostics.ts): 'on' | 'off'. */
  tvDiagnostics: 'off',
  /** User-Agent sent to IPTV servers. */
  userAgent: 'ShashtnaPlayer/1.0',
} as const;

export const BRAND_ASSETS = {
  logo: require('../assets/shashtna-player-logo.png'),
  background: require('../assets/shashtna-app-background.webp'),
};

/** Shashtna Player Lite (Live TV only) naming. */
export const BRAND_LITE = {
  nameInside: 'شاشتنا Lite',
  nameLatin: 'Shashtna Player Lite',
  /** Import screen description. */
  importDescription: {
    ar: 'اختر ملف M3U من جهازك لبدء استخدام القنوات المباشرة.',
    en: 'Choose an M3U file on this device to start watching live channels.',
  },
  /** Appended to "no live channels in the file". */
  liveOnlyNote: {
    ar: 'شاشتنا Lite تعرض البث المباشر فقط.',
    en: 'Shashtna Player Lite shows live TV only.',
  },
} as const;

/** Name of the default accent colour (Settings → accent). */
export const BRAND_ACCENT = { ar: 'أزرق شاشتنا', en: 'Shashtna Blue' } as const;
