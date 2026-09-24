import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import { SHASHTNA_THEME } from '../../design/theme';

export type AppIconName =
  | 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'favorite'
  | 'settings' | 'source' | 'search' | 'play' | 'star' | 'bell' | 'back'
  | 'info' | 'filter' | 'grid' | 'arrow' | 'chevron' | 'plus' | 'refresh'
  | 'folder' | 'link' | 'language' | 'check' | 'user' | 'tag' | 'calendar'
  | 'sliders' | 'eye' | 'subtitle' | 'edit' | 'clock' | 'logout' | 'crown'
  | 'close' | 'menu' | 'rewind' | 'forward' | 'pause' | 'fullscreen'
  | 'wifi'
  | 'audio' | 'quality' | 'bookmark' | 'download' | 'filterReset' | 'sun' | 'moon'
  | 'channelUp' | 'channelDown' | 'megaphone' | 'open';

type Props = {
  name: AppIconName;
  active?: boolean;
  size?: number;
  color?: string;
};

/**
 * One icon family for the whole app.
 * Uses a font-backed icon set instead of native SVG/C++ codegen.
 * This keeps geometry consistent and avoids the rnsvg linker failure
 * in the current RN 0.83 + NDK 27.1 environment.
 */
const ICONS: Record<AppIconName, string> = {
  home: 'home-outline',
  live: 'radio-outline',
  movies: 'film-outline',
  series: 'tv-outline',
  favorites: 'heart-outline',
  favorite: 'heart',
  settings: 'settings-outline',
  source: 'server-outline',
  search: 'search-outline',
  play: 'play',
  star: 'star',
  bell: 'notifications-outline',
  back: 'arrow-back',
  info: 'information-circle-outline',
  filter: 'funnel-outline',
  grid: 'grid-outline',
  arrow: 'arrow-forward',
  chevron: 'chevron-forward',
  plus: 'add',
  refresh: 'refresh-outline',
  folder: 'folder-outline',
  link: 'link-outline',
  language: 'globe-outline',
  check: 'checkmark',
  user: 'person-outline',
  tag: 'pricetag-outline',
  calendar: 'calendar-outline',
  sliders: 'options-outline',
  eye: 'eye-outline',
  subtitle: 'chatbox-ellipses-outline',
  edit: 'create-outline',
  clock: 'time-outline',
  logout: 'log-out-outline',
  crown: 'ribbon-outline',
  close: 'close',
  menu: 'menu',
  rewind: 'play-back',
  forward: 'play-forward',
  pause: 'pause',
  fullscreen: 'expand-outline',
  audio: 'volume-high-outline',
  quality: 'options-outline',
  bookmark: 'bookmark-outline',
  download: 'download-outline',
  filterReset: 'refresh-outline',
  sun: 'sunny-outline',
  moon: 'moon-outline',
  wifi: 'wifi-outline',
  channelUp: 'chevron-up',
  channelDown: 'chevron-down',
  megaphone: 'megaphone-outline',
  open: 'open-outline',
};

export default function AppIcon({
  name,
  active = false,
  size = 22,
  color,
}: Props) {
  const tint =
    color ??
    (active
      ? SHASHTNA_THEME.colors.white
      : SHASHTNA_THEME.colors.primaryLight);

  return (
    <View
      pointerEvents="none"
      style={[styles.box, { width: size, height: size }]}
    >
      <Ionicons
        name={ICONS[name] as any}
        size={size}
        color={tint}
        style={styles.icon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'visible',
  },
  icon: {
    includeFontPadding: false,
    textAlign: 'center',
    marginTop: 1,
  },
});
