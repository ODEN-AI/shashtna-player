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

/** The website's apps & downloads page (app/(site)/apps in the website project). */
const websiteApps = SHASHTNA_WEBSITE_URL
  ? ({ type: 'external', url: `${SHASHTNA_WEBSITE_URL.replace(/\/+$/, '')}/apps` } as const)
  : ({ type: 'none' } as const);

export const LOCAL_ADVERTISEMENTS: Advertisement[] = [
  // Finished banners (2048x768, text is part of the artwork) shown as they are.
  // Links come from SHASHTNA_WEBSITE_URL; while it is empty these ads have no button.
  {
    id: 'shashtna-player-launch',
    order: 1,
    active: true,
    presentation: 'artwork',
    image: require('../../assets/ads/ad-shashtna-player-launch.webp'),
    title: { ar: 'تم إطلاق تطبيق شاشتنا بلير', en: 'Shashtna Player is here' },
    description: {
      ar: 'استمتع بكل محتوى شاشتنا على التلفزيون بطريقة أسرع وأسهل، مع تجربة مصممة خصيصاً لأجهزة Android TV و Google TV.',
      en: 'Enjoy all of Shashtna on your TV, faster and easier, with an experience built for Android TV and Google TV.',
    },
    cta: { ar: 'تعرف على شاشتنا بلير', en: 'Discover Shashtna Player' },
    action: websiteApps,
  },
  {
    id: 'shashtna-official-website',
    order: 2,
    active: true,
    presentation: 'artwork',
    image: require('../../assets/ads/ad-shashtna-official-website.webp'),
    title: { ar: 'كل ما تحب، على موقع واحد.', en: 'Everything you love, on one website.' },
    description: {
      ar: 'تصفح خدمات شاشتنا، الباقات، الأجهزة والتطبيقات، وتابع اشتراكك وكل ما تحتاجه من مكان واحد.',
      en: 'Browse Shashtna services, plans, devices and apps, and manage your subscription in one place.',
    },
    cta: { ar: 'تصفح موقع شاشتنا', en: 'Visit the Shashtna website' },
    action: website,
  },
  {
    // Genuine "coming soon": no destination yet, so no button and nothing to open.
    id: 'subscription-app-coming-soon',
    order: 3,
    active: true,
    presentation: 'artwork',
    image: require('../../assets/ads/ad-subscription-app-coming-soon.webp'),
    title: { ar: 'قريباً — تطبيق شاشتنا', en: 'Coming soon — the Shashtna app' },
    description: {
      ar: 'تطبيق جديد يسهّل عليك إدارة اشتراكك من هاتفك، وتجديد الاشتراكات، متابعة حالتها، واستكشاف والاشتراك بباقات جديدة بسهولة.',
      en: 'A new app to manage, renew and track your subscription from your phone, and discover and join new plans.',
    },
    cta: { ar: 'قريباً...', en: 'Coming soon...' },
    action: { type: 'none' },
  },

  // Earlier text-only ads, kept switched off so they can be re-enabled without rewriting them.
  {
    id: 'subscriptions',
    order: 11,
    active: false,
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
    order: 12,
    active: false,
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
    order: 13,
    active: false,
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
    order: 14,
    active: false,
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
