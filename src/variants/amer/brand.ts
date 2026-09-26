import type * as Base from '../../design/brand';

/**
 * عامر IPTV (Amer IPTV) naming and artwork.
 *
 * metro.amer.config.js bundles this module in place of src/design/brand.ts, so
 * every screen of the edition (import screen, splash, sidebar, Settings, error
 * messages, accent name) shows عامر IPTV and its own logo, and no Shashtna name
 * or logo is part of the Amer bundle. The types below keep it in step with
 * brand.ts: a name added there must be added here too.
 */
type Strings<T> = { readonly [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };

export const BRAND: Strings<typeof Base.BRAND> = {
  nameInside: 'عامر IPTV',
  nameArabic: 'عامر',
  nameLatin: 'Amer IPTV',
  tagline: 'IPTV',
  developerCredit: 'تم تطويره عن طريق عبدالرحمن عامر',
  statement: { ar: 'قنواتك المباشرة، بكل وضوح.', en: 'Your live channels, crystal clear.' },
  // No player badge: the loading screen shows the channel's real logo, or nothing.
  playerMark: '',
  userAgent: 'AmerIPTV/1.0',
};

export const BRAND_ASSETS: typeof Base.BRAND_ASSETS = {
  logo: require('./assets/amer-iptv-logo.png'),
  background: require('./assets/amer-iptv-background.webp'),
};

export const BRAND_LITE: Strings<typeof Base.BRAND_LITE> = {
  nameInside: 'عامر IPTV',
  nameLatin: 'Amer IPTV',
  importDescription: {
    ar: 'اختر ملف M3U من جهازك ليعرض عامر IPTV قنواتك المباشرة.',
    en: 'Choose an M3U file on this device and Amer IPTV will show your live channels.',
  },
  liveOnlyNote: {
    ar: 'عامر IPTV يعرض البث المباشر فقط.',
    en: 'Amer IPTV shows live TV only.',
  },
};

export const BRAND_ACCENT: Strings<typeof Base.BRAND_ACCENT> = { ar: 'أزرق عامر', en: 'Amer Blue' };
