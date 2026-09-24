import { ImageSourcePropType } from 'react-native';
import { AppIconName } from '../../components/common/AppIcon';

/** Pages an advertisement can open inside the app. */
export type AdPage = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'settings';

export type AdAction =
  | { type: 'none' }
  | { type: 'navigate'; page: AdPage }
  | { type: 'liveCategory'; group: string }
  | { type: 'external'; url: string };

export type LocalizedText = { ar: string; en: string };

export type Advertisement = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  /** Call-to-action label; omitted when the ad has no action. */
  cta?: LocalizedText;
  action: AdAction;
  /** Optional artwork: bundled asset (require) or remote URL. */
  image?: ImageSourcePropType | string;
  /** Icon shown when there is no artwork. */
  icon?: AppIconName;
  /** CSS linear-gradient used for the accent glow. */
  accent?: string;
  /** Short text shown on the ad for TVs that cannot open links (e.g. "t.me/shashtna"). */
  displayUrl?: string;
  order: number;
  active: boolean;
  /** Milliseconds this ad stays on screen before auto-rotating. */
  displayDuration?: number;
  /** Optional ISO dates for scheduled campaigns. */
  startsAt?: string;
  endsAt?: string;
};
