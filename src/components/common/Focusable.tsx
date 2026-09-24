import React, { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { SHASHTNA_THEME } from '../../design/theme';

export type FocusableProps = PressableProps & {
  children?: ReactNode;
  focusedStyle?: StyleProp<ViewStyle>;
  active?: boolean;
};

export default function Focusable({
  children,
  style,
  focusedStyle,
  active = false,
  ...props
}: FocusableProps) {
  return (
    <Pressable
      {...props}
      focusable
      style={({ focused, pressed }) => [
        {
          borderWidth: SHASHTNA_THEME.focus.borderWidth,
          borderColor: 'transparent',
        },
        typeof style === 'function' ? style({ focused, pressed }) : style,
        active && {
          backgroundColor: SHASHTNA_THEME.colors.primarySoft,
        },
        focused && {
          borderColor: SHASHTNA_THEME.colors.focus,
          backgroundColor: 'rgba(255,255,255,0.06)',
          transform: [{ scale: SHASHTNA_THEME.focus.scale }],
          shadowColor: SHASHTNA_THEME.colors.focusContrast,
          shadowOpacity: SHASHTNA_THEME.focus.shadowOpacity,
          shadowRadius: SHASHTNA_THEME.focus.shadowRadius,
          elevation: SHASHTNA_THEME.focus.elevation,
          zIndex: 50,
        },
        focused && focusedStyle,
        pressed && { opacity: 0.82 },
      ]}
    >
      {children}
    </Pressable>
  );
}
