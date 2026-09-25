import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/** Short fade/slide when the active page changes (native driver, off the JS thread). */
export function usePageTransition(pageKey: string) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(6);
    scale.setValue(0.992);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [pageKey, opacity, translateY, scale]);

  return { opacity, transform: [{ translateY }, { scale }] };
}
