import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from 'react-native';

import AppIcon, { AppIconName } from '../components/common/AppIcon';
import { BRAND, BRAND_ASSETS } from '../design/brand';
import { useDeviceClass } from '../design/device';
import { focusStyle, Palette, usePalette } from '../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../design/theme';

export type SidebarItem = { id: string; label: string; icon: AppIconName };

type Props = {
  items: SidebarItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onChangeSource: () => void;
  ar: boolean;
};

const L = SHASHTNA_THEME.layout;
const COLLAPSE_DELAY_MS = 90;

/** Width the content area must reserve for the collapsed rail. */
export function useSidebarRailWidth() {
  return useDeviceClass() === 'tv' ? L.railCollapsed : L.railCollapsedTouch;
}

/**
 * Collapsible navigation rail.
 *
 * The rail always occupies its collapsed width; the expanded panel slides
 * over the content instead of pushing it, so pages never reflow.
 *
 * TV: expands while focus is inside the rail and collapses when focus
 *     leaves. TVFocusGuideView(autoFocus) returns focus to the last focused
 *     item when the user re-enters from the content.
 * Touch: a toggle button opens it; tapping outside or choosing an item closes it.
 */
function Sidebar({ items, activeId, onNavigate, onChangeSource, ar }: Props) {
  const palette = usePalette();
  const device = useDeviceClass();
  const isTV = device === 'tv';
  const railWidth = isTV ? L.railCollapsed : L.railCollapsedTouch;

  const [expanded, setExpanded] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, progress]);

  useEffect(
    () => () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    },
    [],
  );

  const handleFocus = useCallback(() => {
    if (!isTV) return;
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setExpanded(true);
  }, [isTV]);

  // Focus hops between rail items fire blur→focus; the short delay keeps the
  // panel open during those hops and only collapses once focus really left.
  const handleBlur = useCallback(() => {
    if (!isTV) return;
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS);
  }, [isTV]);

  const select = useCallback(
    (id: string) => {
      onNavigate(id);
      if (!isTV) setExpanded(false);
    },
    [isTV, onNavigate],
  );

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: [railWidth, L.railExpanded] });
  const labelOpacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const side = ar ? styles.sideRight : styles.sideLeft;
  const rowDirection = ar ? 'row-reverse' : 'row';

  const renderItem = (item: SidebarItem) => (
    <RailButton
      key={item.id}
      item={item}
      selected={item.id === activeId}
      onPress={() => select(item.id)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      labelOpacity={labelOpacity}
      palette={palette}
      rowDirection={rowDirection}
      ar={ar}
    />
  );

  const nav = (
    <View style={styles.navList}>{items.map(renderItem)}</View>
  );

  return (
    <>
      {/* Dims the page while the panel is open; touch users tap it to close. */}
      <Animated.View
        pointerEvents={expanded && !isTV ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          focusable={false}
          accessibilityLabel={ar ? 'إغلاق القائمة' : 'Close menu'}
          onPress={() => setExpanded(false)}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.rail,
          side,
          {
            width,
            experimental_backgroundImage: palette.sidebar,
            borderColor: palette.border,
            borderLeftWidth: ar ? 1 : 0,
            borderRightWidth: ar ? 0 : 1,
          },
          expanded && styles.railExpandedShadow,
        ]}
      >
        <View style={[styles.brand, { flexDirection: rowDirection }]}>
          <Image source={BRAND_ASSETS.logo} style={styles.logo} />
          <Animated.View style={[styles.brandText, { opacity: labelOpacity }]}>
            <Text numberOfLines={1} style={[styles.brandName, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
              {BRAND.nameInside}
            </Text>
          </Animated.View>
        </View>

        {!isTV ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? (ar ? 'طي القائمة' : 'Collapse menu') : ar ? 'فتح القائمة' : 'Expand menu'}
            onPress={() => setExpanded(v => !v)}
            style={({ pressed }) => [
              styles.toggle,
              { borderColor: palette.border, backgroundColor: palette.surfaceHover },
              pressed && styles.pressed,
            ]}
          >
            <View style={(expanded ? !ar : ar) ? styles.flipX : undefined}>
              <AppIcon name="chevron" size={16} color={palette.secondary} />
            </View>
          </Pressable>
        ) : null}

        {isTV ? (
          <TVFocusGuideView autoFocus style={styles.navGuide}>
            {nav}
          </TVFocusGuideView>
        ) : (
          <View style={styles.navGuide}>{nav}</View>
        )}

        <RailButton
          item={{ id: '__source', label: ar ? 'تغيير المصدر' : 'Change source', icon: 'source' }}
          selected={false}
          onPress={onChangeSource}
          onFocus={handleFocus}
          onBlur={handleBlur}
          labelOpacity={labelOpacity}
          palette={palette}
          rowDirection={rowDirection}
          ar={ar}
          subtle
        />
      </Animated.View>
    </>
  );
}

const RailButton = memo(function RailButton({
  item,
  selected,
  onPress,
  onFocus,
  onBlur,
  labelOpacity,
  palette,
  rowDirection,
  ar,
  subtle = false,
}: {
  item: SidebarItem;
  selected: boolean;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
  labelOpacity: Animated.AnimatedInterpolation<number>;
  palette: Palette;
  rowDirection: 'row' | 'row-reverse';
  ar: boolean;
  subtle?: boolean;
}) {
  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={({ focused, pressed }) => [
        styles.item,
        { flexDirection: rowDirection },
        selected && { experimental_backgroundImage: SHASHTNA_THEME.gradients.brandSoft },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconBox,
          selected && { experimental_backgroundImage: SHASHTNA_THEME.gradients.brand, boxShadow: SHASHTNA_THEME.shadows.brand },
        ]}
      >
        <AppIcon
          name={item.icon}
          size={subtle ? 19 : 21}
          color={selected ? '#FFFFFF' : subtle ? palette.muted : palette.secondary}
        />
      </View>
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            opacity: labelOpacity,
            color: selected ? palette.text : palette.secondary,
            fontWeight: selected ? '900' : '700',
            textAlign: ar ? 'right' : 'left',
            writingDirection: ar ? 'rtl' : 'ltr',
          },
        ]}
      >
        {item.label}
      </Animated.Text>
      {selected ? <View style={[styles.indicator, ar ? styles.indicatorRtl : styles.indicatorLtr]} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(2,5,16,0.55)', zIndex: 30 },
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 40,
    paddingHorizontal: 10,
    paddingTop: 22,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  sideLeft: { left: 0 },
  sideRight: { right: 0 },
  railExpandedShadow: { boxShadow: '0px 0px 40px rgba(0,0,0,0.55)' },
  brand: { alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 4 },
  logo: { width: 44, height: 44, borderRadius: 12 },
  brandText: { flex: 1, minWidth: 0 },
  brandName: { fontSize: 17, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  toggle: { marginTop: 12, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flipX: { transform: [{ scaleX: -1 }] },
  navGuide: { flex: 1, justifyContent: 'center' },
  navList: { gap: 8 },
  item: {
    height: 56,
    borderRadius: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'visible',
  },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: SHASHTNA_THEME.typography.size.nav, fontFamily: SHASHTNA_FONT.sans },
  indicator: { position: 'absolute', top: 16, width: 3, height: 20, borderRadius: 2, backgroundColor: SHASHTNA_THEME.colors.primaryBright },
  indicatorLtr: { left: -8 },
  indicatorRtl: { right: -8 },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
});

export default memo(Sidebar);
