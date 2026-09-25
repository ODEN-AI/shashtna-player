import React, { memo } from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';

import { BRAND_ASSETS } from '../design/brand';
import { usePalette } from '../design/palette';
import { SHASHTNA_THEME } from '../design/theme';
import { useSidebarRailWidth } from '../navigation/Sidebar';
import { FocusRegion } from '../navigation/tvFocus';

type Props = {
  ar: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Persistent frame around every browsing page.
 *
 * Owns the background (Image 1 + readability scrim in dark mode), the
 * navigation rail and the content slot. It is rendered outside the page
 * transition, so only the page content animates on navigation.
 */
function AppShell({ ar, sidebar, children }: Props) {
  const palette = usePalette();
  const railWidth = useSidebarRailWidth();
  const dark = palette.mode === 'dark';

  return (
    <View style={[styles.root, { backgroundColor: palette.canvas }]}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={palette.canvas}
      />
      {dark ? <ShellBackground /> : null}
      <View style={[styles.content, ar ? { paddingRight: railWidth } : { paddingLeft: railWidth }]}>
        {/* Leaving the rail toward the page returns to the element last focused there. */}
        <FocusRegion style={styles.content}>{children}</FocusRegion>
      </View>
      {sidebar}
    </View>
  );
}

/** Static and memoised: never re-renders on navigation. */
export const ShellBackground = memo(function ShellBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={BRAND_ASSETS.background}
        style={styles.backgroundImage}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  scrim: { experimental_backgroundImage: SHASHTNA_THEME.gradients.backgroundScrim },
});

export default memo(AppShell);
