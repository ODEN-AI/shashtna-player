/**
 * Single source of truth for product naming.
 *
 * - Launcher label (outside the app) lives in
 *   android/app/src/main/res/values/strings.xml → "Shashtna Player".
 * - Inside the app the product is always "شاشتنا Player".
 */
export const BRAND = {
  nameInside: 'شاشتنا Player',
  nameArabic: 'شاشتنا',
  nameLatin: 'Shashtna Player',
  tagline: 'PLAYER',
  developerCredit: 'تم تطويره عن طريق عبدالرحمن عامر',
} as const;

export const BRAND_ASSETS = {
  logo: require('../assets/shashtna-player-logo.png'),
  background: require('../assets/shashtna-app-background.webp'),
};
