import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { BRAND, BRAND_ASSETS } from '../../design/brand';
import { focusStyle, Palette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { DEFAULT_AD_DURATION_MS } from './adsConfig';
import { Advertisement } from './types';

type Props = {
  ads: Advertisement[];
  onAction: (ad: Advertisement) => void;
  palette: Palette;
  ar: boolean;
  height: number;
};

/**
 * Home hero: Shashtna promotional carousel (not movie/series content).
 *
 * - Auto-rotates using each ad's displayDuration; pauses while any hero
 *   control is focused (TV) or touched, so it never moves under the user.
 * - Previous / next buttons, pagination dots, crossfade transition.
 * - Touch: horizontal swipe also changes ads.
 */
function HeroCarousel({ ads, onAction, palette, ar, height }: Props) {
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const count = ads.length;
  const safeIndex = count ? index % count : 0;
  const ad = ads[safeIndex];

  const goTo = useCallback(
    (next: number) => {
      if (!count) return;
      const target = ((next % count) + count) % count;
      Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start(() => {
        setIndex(target);
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
      });
    },
    [count, fade],
  );

  const next = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);
  const previous = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);

  useEffect(() => {
    if (count < 2 || interacting) return;
    const timer = setTimeout(next, ad?.displayDuration || DEFAULT_AD_DURATION_MS);
    return () => clearTimeout(timer);
  }, [ad, count, interacting, next]);

  // PanResponder is created once; its callbacks read the latest handlers via this ref.
  const swipeRef = useRef({ start: () => {}, end: (_dx: number) => {} });
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => !Platform.isTV && Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => swipeRef.current.start(),
      onPanResponderRelease: (_e, g) => swipeRef.current.end(g.dx),
      onPanResponderTerminate: () => swipeRef.current.end(0),
    }),
  ).current;
  swipeRef.current = {
    start: () => setInteracting(true),
    end: (dx: number) => {
      setInteracting(false);
      if (Math.abs(dx) < 50) return;
      // Swiping toward the reading direction advances.
      const forward = ar ? dx > 0 : dx < 0;
      if (forward) next();
      else previous();
    },
  };

  if (!ad) {
    return <View style={[styles.hero, { height, borderColor: palette.border }]} />;
  }

  const t = (value?: { ar: string; en: string }) => (value ? (ar ? value.ar : value.en) : '');
  const hasAction = ad.action.type !== 'none' && ad.cta;
  const imageSource = typeof ad.image === 'string' ? { uri: ad.image } : ad.image;
  const rowDirection = ar ? 'row-reverse' : 'row';
  const onFocus = () => setInteracting(true);
  const onBlur = () => setInteracting(false);

  return (
    <View style={[styles.hero, { height, borderColor: palette.borderStrong }]} {...swipe.panHandlers}>
      <View style={[StyleSheet.absoluteFill, styles.glass]} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {imageSource ? (
          <Image source={imageSource} style={styles.artwork} resizeMode="cover" />
        ) : (
          <View style={[styles.glow, ar ? styles.glowRtl : styles.glowLtr, { experimental_backgroundImage: ad.accent || palette.accent.gradient }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: ar ? palette.heroFadeRtl : palette.heroFade }]} />

        <View style={[styles.content, { flexDirection: rowDirection }]}>
          <View style={[styles.copy, { alignItems: ar ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.eyebrowRow, { flexDirection: rowDirection }]}>
              <Image source={BRAND_ASSETS.logo} style={styles.eyebrowLogo} />
              <Text style={[styles.eyebrow, { color: palette.accent.light }]}>{BRAND.nameInside}</Text>
            </View>
            <Text numberOfLines={2} style={[styles.title, { textAlign: ar ? 'right' : 'left', writingDirection: ar ? 'rtl' : 'ltr' }]}>
              {t(ad.title)}
            </Text>
            <Text numberOfLines={3} style={[styles.description, { textAlign: ar ? 'right' : 'left', writingDirection: ar ? 'rtl' : 'ltr' }]}>
              {t(ad.description)}
            </Text>

            <View style={[styles.actions, { flexDirection: rowDirection }]}>
              {hasAction ? (
                <Pressable
                  focusable
                  accessibilityRole="button"
                  onPress={() => onAction(ad)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  style={({ focused, pressed }) => [
                    styles.cta,
                    { flexDirection: rowDirection, experimental_backgroundImage: palette.accent.gradient, boxShadow: palette.accent.buttonShadow },
                    focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.ctaText}>{t(ad.cta)}</Text>
                  <View style={ar ? styles.flipX : undefined}>
                    <AppIcon name="arrow" size={16} color="#FFFFFF" />
                  </View>
                </Pressable>
              ) : null}
              {ad.displayUrl ? <Text style={styles.displayUrl}>{ad.displayUrl}</Text> : null}
            </View>
          </View>

          {!imageSource ? (
            <View style={styles.badge}>
              <AppIcon name={ad.icon || 'megaphone'} size={54} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      </Animated.View>

      {count > 1 ? (
        <View style={[styles.nav, ar ? styles.navRtl : styles.navLtr, { flexDirection: rowDirection }]}>
          <NavButton icon="back" label={ar ? 'الإعلان السابق' : 'Previous'} flip={ar} onPress={previous} onFocus={onFocus} onBlur={onBlur} palette={palette} />
          <View style={[styles.dots, { flexDirection: rowDirection }]}>
            {ads.map((item, i) => (
              <Pressable
                key={item.id}
                focusable={false}
                accessibilityLabel={`${i + 1}/${count}`}
                onPress={() => goTo(i)}
                hitSlop={8}
                style={[styles.dot, i === safeIndex && styles.dotActive]}
              />
            ))}
          </View>
          <NavButton icon="arrow" label={ar ? 'الإعلان التالي' : 'Next'} flip={ar} onPress={next} onFocus={onFocus} onBlur={onBlur} palette={palette} />
        </View>
      ) : null}
    </View>
  );
}

function NavButton({
  icon,
  label,
  flip,
  onPress,
  onFocus,
  onBlur,
  palette,
}: {
  icon: 'back' | 'arrow';
  label: string;
  flip: boolean;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
  palette: Palette;
}) {
  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={({ focused, pressed }) => [
        styles.navButton,
        focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
        pressed && styles.pressed,
      ]}
    >
      <View style={flip ? styles.flipX : undefined}>
        <AppIcon name={icon} size={18} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  hero: { borderRadius: 28, borderWidth: 1, overflow: 'hidden', boxShadow: '0px 18px 50px rgba(0,0,0,0.45)' },
  glass: { experimental_backgroundImage: SHASHTNA_THEME.gradients.glassPanel },
  artwork: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  glow: { position: 'absolute', top: -80, width: '70%', height: '160%', borderRadius: 400, opacity: 0.55 },
  glowLtr: { right: -120 },
  glowRtl: { left: -120 },
  content: { flex: 1, paddingHorizontal: 38, paddingVertical: 30, alignItems: 'center', gap: 24 },
  copy: { flex: 1, justifyContent: 'center' },
  eyebrowRow: { alignItems: 'center', gap: 8, marginBottom: 12 },
  eyebrowLogo: { width: 22, height: 22 },
  eyebrow: { color: SHASHTNA_THEME.colors.primaryLight, fontSize: 13, fontWeight: '900', letterSpacing: 0.4 },
  title: { color: '#FFFFFF', fontSize: T.size.hero, lineHeight: T.lineHeight.hero, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, maxWidth: 640 },
  description: { color: 'rgba(235,242,255,0.86)', fontSize: T.size.body, lineHeight: T.lineHeight.body, marginTop: 10, maxWidth: 600 },
  actions: { marginTop: 20, alignItems: 'center', gap: 16 },
  cta: { height: 50, paddingHorizontal: 24, borderRadius: 25, alignItems: 'center', gap: 10, borderWidth: 2, borderColor: 'transparent', experimental_backgroundImage: SHASHTNA_THEME.gradients.brand, boxShadow: SHASHTNA_THEME.shadows.brand },
  ctaText: { color: '#FFFFFF', fontSize: T.size.button, fontWeight: '900' },
  displayUrl: { color: 'rgba(235,242,255,0.8)', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  badge: { width: 132, height: 132, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', boxShadow: SHASHTNA_THEME.shadows.glow },
  nav: { position: 'absolute', bottom: 18, alignItems: 'center', gap: 12 },
  navLtr: { right: 22 },
  navRtl: { left: 22 },
  navButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,5,16,0.55)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)' },
  dots: { alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { width: 24, backgroundColor: '#FFFFFF' },
  flipX: { transform: [{ scaleX: -1 }] },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
});

export default memo(HeroCarousel);
