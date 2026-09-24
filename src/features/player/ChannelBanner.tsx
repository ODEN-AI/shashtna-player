import React, { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet, Text, View } from 'react-native';

import { M3UChannel } from '../../lib/m3u';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { usePalette } from '../../design/palette';

export type ChannelBannerState = {
  channel: M3UChannel;
  /** 1-based position in the current live queue. */
  number: number;
  total: number;
  /** True while the switch is still coalescing input (stream not opened yet). */
  pending: boolean;
  /** Set when the user pushed past the first/last channel. */
  edge?: 'first' | 'last';
};

type Props = { state: ChannelBannerState | null; loading: boolean; ar: boolean };

/**
 * Lightweight "now tuned to" banner shown while zapping. It never takes
 * focus and never opens the full control panel.
 */
function ChannelBanner({ state, loading, ar }: Props) {
  const palette = usePalette();
  const opacity = useRef(new Animated.Value(0)).current;
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    Animated.timing(opacity, { toValue: state ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [opacity, state]);

  useEffect(() => setLogoFailed(false), [state?.channel.id]);

  if (!state) return null;
  const { channel, number, total, pending, edge } = state;
  const rowDirection = ar ? 'row-reverse' : 'row';

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, ar ? styles.wrapRtl : styles.wrapLtr, { opacity }]}>
      <View style={[styles.card, { flexDirection: rowDirection }]}>
        <View style={[styles.number, { experimental_backgroundImage: palette.accent.gradient }]}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <View style={styles.logoBox}>
          {channel.logo && !logoFailed ? (
            <Image source={{ uri: channel.logo }} style={styles.logo} onError={() => setLogoFailed(true)} />
          ) : (
            <Text style={styles.logoFallback}>{channel.name.trim().slice(0, 2).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.text}>
          {/* Channel names come from the playlist: shown as-is, isolated from UI strings. */}
          <Text numberOfLines={1} style={[styles.name, { textAlign: ar ? 'right' : 'left' }]}>
            {channel.name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { textAlign: ar ? 'right' : 'left' }]}>
            {edge === 'first'
              ? ar ? 'هذه أول قناة في القائمة' : 'First channel in this list'
              : edge === 'last'
                ? ar ? 'هذه آخر قناة في القائمة' : 'Last channel in this list'
                : `${channel.group ? `${channel.group} · ` : ''}${number}/${total}`}
          </Text>
        </View>
        {pending || loading ? <ActivityIndicator size="small" color={palette.accent.light} /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 32, zIndex: 80 },
  wrapLtr: { left: 40 },
  wrapRtl: { right: 40 },
  card: {
    minWidth: 360,
    maxWidth: 560,
    height: 84,
    borderRadius: 24,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(6,10,26,0.86)',
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.borderStrong,
    boxShadow: '0px 14px 36px rgba(0,0,0,0.5)',
  },
  number: { minWidth: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, experimental_backgroundImage: SHASHTNA_THEME.gradients.brand },
  numberText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  logoBox: { width: 76, height: 52, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', padding: 6, overflow: 'hidden' },
  logo: { width: '100%', height: '100%', resizeMode: 'contain' },
  logoFallback: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  text: { flex: 1, minWidth: 0 },
  name: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  meta: { color: SHASHTNA_THEME.colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 },
});

export default memo(ChannelBanner);
