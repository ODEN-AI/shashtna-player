import React, { forwardRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';

import { APP_FONT_FAMILY } from '../../design/theme';

/**
 * Drop-in replacements for React Native's Text and TextInput that use the app
 * typeface by default. React Native has no global default font, so every
 * screen imports these instead of the react-native ones. A style that sets
 * its own fontFamily still wins.
 */
const base = StyleSheet.create({ font: { fontFamily: APP_FONT_FAMILY } });

export const Text = forwardRef<RNText, TextProps>(function AppText({ style, ...rest }, ref) {
  return <RNText ref={ref} {...rest} style={[base.font, style]} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function AppTextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} {...rest} style={[base.font, style]} />;
});

export const AnimatedText = Animated.createAnimatedComponent(Text);
