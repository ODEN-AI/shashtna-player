/**
 * Advertisement configuration.
 *
 * ADS_REMOTE_URL: when set, the app fetches the ad list as JSON from this
 * endpoint (same shape as `Advertisement`, image as URL string) and falls
 * back to the bundled list if the request fails. Leave empty to use only
 * the local list — no backend is required.
 *
 * SHASHTNA_WEBSITE_URL: public website used by the subscription/services ads.
 * Left empty on purpose until the production domain is confirmed; ads whose
 * link is empty are shown without a button instead of pointing nowhere.
 */
export const ADS_REMOTE_URL = '';
export const SHASHTNA_WEBSITE_URL = '';
export const SHASHTNA_TELEGRAM_URL = 'https://t.me/shashtna';
export const DEFAULT_AD_DURATION_MS = 8000;
