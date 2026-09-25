import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { AnimatedText, Text } from '../components/common/Typography';

import { BRAND, BRAND_ASSETS } from '../design/brand';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../design/theme';
import { ShellBackground } from './AppShell';

/** Total on-screen time; runs in parallel with restoring the saved connection. */
const HOLD_MS = 1100;

type Props = {
  onFinish: () => void;
  /** Product name under the logo (the Lite edition shows its own). */
  name?: string;
};

/**
 * Launch screen: Shashtna logo + name, subtle developer credit at the bottom.
 * Android 12+ shows the system splash first (same dark colour, see
 * res/values-v31/styles.xml), so this stays short to avoid a double splash.
 */
export default function SplashScreen({ onFinish, name = BRAND.nameInside }: Props) {
  const intro = useRef(new Animated.Value(0)).current;
  const outro = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(intro, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(HOLD_MS - 420),
      Animated.timing(outro, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onFinish();
    });
    return () => animation.stop();
  }, [intro, outro, onFinish]);

  const scale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: outro }]}>
      <ShellBackground />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <Animated.View style={[styles.center, { opacity: intro, transform: [{ scale }] }]}>
        <Image source={BRAND_ASSETS.logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.name}>{name}</Text>
      </Animated.View>
      <AnimatedText style={[styles.credit, { opacity: intro }]}>{BRAND.developerCredit}</AnimatedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SHASHTNA_THEME.colors.background, zIndex: 1000, alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(2,5,16,0.45)' },
  center: { alignItems: 'center' },
  logo: { width: 148, height: 148 },
  name: { marginTop: 18, color: '#FFFFFF', fontSize: 30, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans, letterSpacing: 0.3 },
  credit: { position: 'absolute', bottom: 28, color: 'rgba(220,232,255,0.55)', fontSize: 12, fontWeight: '600', fontFamily: SHASHTNA_FONT.sans },
});
