import { Advertisement } from './types';
import { SHASHTNA_TELEGRAM_URL, SHASHTNA_WEBSITE_URL } from './adsConfig';

/**
 * Bundled advertisements. This is the local data source behind
 * AdvertisementRepository; edit here (or serve the same shape remotely via
 * ADS_REMOTE_URL) — HomeScreen and HeroCarousel never change.
 *
 * Copy reflects what Shashtna actually offers (subscriptions, digital
 * services, support). Marketing should review wording before release.
 */
const website = SHASHTNA_WEBSITE_URL
  ? ({ type: 'external', url: SHASHTNA_WEBSITE_URL } as const)
  : ({ type: 'none' } as const);

export const LOCAL_ADVERTISEMENTS: Advertisement[] = [
  {
    id: 'subscriptions',
    order: 1,
    active: true,
    icon: 'crown',
    accent: 'linear-gradient(135deg, #1A4FD8 0%, #2F7BFF 50%, #5BA8FF 100%)',
    title: { ar: 'اشتراكات شاشتنا', en: 'Shashtna subscriptions' },
    description: {
      ar: 'باقات ترفيه واضحة، تفعيل سريع، وكل تفاصيل اشتراكك بمكان واحد.',
      en: 'Clear entertainment plans, fast activation and your whole subscription in one place.',
    },
    cta: SHASHTNA_WEBSITE_URL ? { ar: 'استعرض الباقات', en: 'View plans' } : undefined,
    action: website,
  },
  {
    id: 'live-tv',
    order: 2,
    active: true,
    icon: 'live',
    accent: 'linear-gradient(135deg, #3B1FD8 0%, #2F7BFF 60%, #28C8FF 100%)',
    title: { ar: 'البث المباشر بين يديك', en: 'Live TV, organised' },
    description: {
      ar: 'قنواتك مرتبة حسب التصنيف، وتنقّل بين القنوات بأزرار الأعلى والأسفل بدون ما تطلع من المشغّل.',
      en: 'Channels grouped by category — switch with UP/DOWN without leaving the player.',
    },
    cta: { ar: 'افتح البث المباشر', en: 'Open Live TV' },
    action: { type: 'navigate', page: 'live' },
  },
  {
    id: 'digital-services',
    order: 3,
    active: true,
    icon: 'grid',
    accent: 'linear-gradient(135deg, #0F3FB8 0%, #4C6BFF 55%, #8B7BFF 100%)',
    title: { ar: 'شاشتنا للحلول الرقمية', en: 'Shashtna Digital' },
    description: {
      ar: 'مواقع، متاجر إلكترونية، تطبيقات Android و Android TV، وحلول IPTV مخصّصة لمشروعك.',
      en: 'Websites, online stores, Android & Android TV apps and custom IPTV solutions.',
    },
    cta: SHASHTNA_WEBSITE_URL ? { ar: 'تعرّف على خدماتنا', en: 'Explore services' } : undefined,
    action: website,
  },
  {
    id: 'support',
    order: 4,
    active: true,
    icon: 'subtitle',
    accent: 'linear-gradient(135deg, #0B6BD8 0%, #2F9BFF 55%, #5BD2FF 100%)',
    title: { ar: 'الدعم الفني', en: 'Support' },
    description: {
      ar: 'فريق شاشتنا يساعدك بخطوات واضحة متى ما احتجت.',
      en: 'The Shashtna team helps you with clear steps whenever you need it.',
    },
    cta: { ar: 'تواصل معنا', en: 'Contact us' },
    displayUrl: 't.me/shashtna',
    action: { type: 'external', url: SHASHTNA_TELEGRAM_URL },
  },
];
