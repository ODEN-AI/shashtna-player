import React, { memo, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../common/Typography';

import AppIcon, { AppIconName } from '../common/AppIcon';
import { useDeviceClass } from '../../design/device';
import { focusStyle, Palette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';

/**
 * Category / sort controls for the browse screens.
 *
 * Instead of a long row of small pills, the screen shows one large button per
 * dimension (category, sort) with its current value. Choosing opens a sheet
 * with every option as a large tile. On TV this keeps the toolbar at a few
 * big focus targets, and the sheet is a normal FlatList grid, so the D-pad
 * moves predictably and the focused tile is always scrolled into view.
 */

export type FilterOption = {
  key: string;
  label: string;
  count?: number;
  icon?: AppIconName;
};

type ButtonProps = {
  caption: string;
  value: string;
  icon: AppIconName;
  count?: number;
  /** Highlights the button when it differs from its default value. */
  active?: boolean;
  onPress: () => void;
  palette: Palette;
  ar: boolean;
  grow?: boolean;
};

export const FilterButton = memo(function FilterButton({
  caption,
  value,
  icon,
  count,
  active = false,
  onPress,
  palette,
  ar,
  grow = false,
}: ButtonProps) {
  const dark = palette.mode === 'dark';
  const tint = dark ? palette.accent.light : palette.accent.deep;
  const phone = useDeviceClass() === 'phone';
  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={`${caption}: ${value}`}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.button,
        phone && styles.buttonPhone,
        grow && styles.buttonGrow,
        {
          flexDirection: ar ? 'row-reverse' : 'row',
          backgroundColor: palette.surface,
          borderColor: active ? palette.accent.medium : palette.border,
        },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.buttonIcon,
          phone && styles.buttonIconPhone,
          {
            backgroundColor: active
              ? palette.accent.soft
              : palette.surfaceHover,
          },
        ]}
      >
        <AppIcon
          name={icon}
          size={18}
          color={active ? tint : palette.secondary}
        />
      </View>
      <View style={styles.buttonCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.buttonCaption,
            { color: palette.muted, textAlign: ar ? 'right' : 'left' },
          ]}
        >
          {caption}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.buttonValue,
            { color: palette.text, textAlign: ar ? 'right' : 'left' },
          ]}
        >
          {value}
        </Text>
      </View>
      {/* Phones keep the space for the value; the sheet shows every count. */}
      {count !== undefined && !phone ? (
        <Text style={[styles.buttonCount, { color: palette.muted }]}>
          {count.toLocaleString(ar ? 'ar-IQ' : 'en-US')}
        </Text>
      ) : null}
      <View style={styles.chevronDown}>
        <AppIcon name="chevron" size={15} color={palette.muted} />
      </View>
    </Pressable>
  );
});

/** Shown only while something differs from the defaults. */
export function ClearFiltersButton({
  onPress,
  palette,
  ar,
}: {
  onPress: () => void;
  palette: Palette;
  ar: boolean;
}) {
  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={ar ? 'مسح الفلاتر' : 'Clear filters'}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.clear,
        {
          flexDirection: ar ? 'row-reverse' : 'row',
          borderColor: palette.border,
        },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name="filterReset" size={17} color={palette.secondary} />
      <Text style={[styles.clearText, { color: palette.secondary }]}>
        {ar ? 'مسح' : 'Clear'}
      </Text>
    </Pressable>
  );
}

type SheetProps = {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  palette: Palette;
  ar: boolean;
  /** Short lists (e.g. sort) use a narrow single-column sheet. */
  variant?: 'grid' | 'list';
};

const TILE_H = 64;
const TILE_GAP = 12;
const TILES_PAD = 4;
const PAD = '__pad__';

export function OptionSheet({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  palette,
  ar,
  variant = 'grid',
}: SheetProps) {
  const device = useDeviceClass();
  const phone = device === 'phone';
  const columns = variant === 'list' || phone ? 1 : 3;
  const [query, setQuery] = useState('');
  const searchable = variant === 'grid' && options.length > 12;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selectedIndex = Math.max(
    0,
    shown.findIndex(o => o.key === selectedKey),
  );
  const rowStride = TILE_H + TILE_GAP;
  // Fill the last grid row with spacers so its tiles keep the same width as the others.
  const cells = useMemo(() => {
    const missing = (columns - (shown.length % columns)) % columns;
    return missing
      ? [
          ...shown,
          ...Array.from({ length: missing }, (_, i) => ({
            key: `${PAD}${i}`,
            label: '',
          })),
        ]
      : shown;
  }, [shown, columns]);

  const close = () => {
    setQuery('');
    onClose();
  };
  const choose = (key: string) => {
    setQuery('');
    onSelect(key);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, phone && styles.backdropPhone]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          focusable={false}
          accessibilityLabel={ar ? 'إغلاق' : 'Close'}
          onPress={close}
        />
        <View
          style={[
            styles.sheet,
            variant === 'list' ? styles.sheetList : styles.sheetGrid,
            phone && styles.sheetPhone,
            {
              backgroundColor:
                palette.mode === 'dark' ? '#0B1224' : palette.surface,
              borderColor: palette.glassBorder,
            },
          ]}
        >
          <View
            style={[
              styles.sheetHeader,
              { flexDirection: ar ? 'row-reverse' : 'row' },
            ]}
          >
            <View style={styles.sheetTitleWrap}>
              <Text
                style={[
                  styles.sheetTitle,
                  { color: palette.text, textAlign: ar ? 'right' : 'left' },
                ]}
              >
                {title}
              </Text>
              {variant === 'grid' ? (
                <Text
                  style={[
                    styles.sheetSub,
                    { color: palette.muted, textAlign: ar ? 'right' : 'left' },
                  ]}
                >
                  {options.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')}{' '}
                  {ar ? 'خيار' : 'options'}
                </Text>
              ) : null}
            </View>
            <Pressable
              focusable
              accessibilityRole="button"
              accessibilityLabel={ar ? 'إغلاق' : 'Close'}
              onPress={close}
              style={({ focused, pressed }) => [
                styles.close,
                { backgroundColor: palette.surfaceHover },
                focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
                pressed && styles.pressed,
              ]}
            >
              <AppIcon name="close" size={18} color={palette.secondary} />
            </Pressable>
          </View>

          {searchable ? (
            <View
              style={[
                styles.search,
                {
                  flexDirection: ar ? 'row-reverse' : 'row',
                  backgroundColor: palette.surfaceHover,
                  borderColor: palette.border,
                },
              ]}
            >
              <AppIcon name="search" size={17} color={palette.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={ar ? 'ابحث عن تصنيف...' : 'Find a category...'}
                placeholderTextColor={palette.muted}
                autoCorrect={false}
                style={[
                  styles.searchInput,
                  { color: palette.text, textAlign: ar ? 'right' : 'left' },
                ]}
              />
            </View>
          ) : null}

          <FlatList
            key={`cols-${columns}`}
            data={cells}
            keyExtractor={o => o.key}
            numColumns={columns}
            columnWrapperStyle={
              columns > 1
                ? [
                    styles.tileRow,
                    { flexDirection: ar ? 'row-reverse' : 'row' },
                  ]
                : undefined
            }
            contentContainerStyle={styles.tiles}
            showsVerticalScrollIndicator={false}
            // Open at the selected option so it is visible and focused straight away.
            initialScrollIndex={
              query ? undefined : Math.floor(selectedIndex / columns)
            }
            // Rows have a fixed height, so the list can jump straight to any row.
            getItemLayout={(_, index) => ({
              length: rowStride,
              offset: TILES_PAD + rowStride * index,
              index,
            })}
            onScrollToIndexFailed={() => {}}
            initialNumToRender={24}
            windowSize={7}
            renderItem={({ item, index }) =>
              item.key.startsWith(PAD) ? (
                <View style={styles.tileSpacer} />
              ) : (
                <OptionTile
                  option={item}
                  selected={item.key === selectedKey}
                  inGrid={columns > 1}
                  preferred={!query && index === selectedIndex}
                  onPress={() => choose(item.key)}
                  palette={palette}
                  ar={ar}
                />
              )
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: palette.muted }]}>
                {ar ? 'ما في نتائج' : 'No results'}
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const OptionTile = memo(function OptionTile({
  option,
  selected,
  inGrid,
  preferred,
  onPress,
  palette,
  ar,
}: {
  option: FilterOption;
  selected: boolean;
  /** Grid tiles share the row width; list rows take the full width. */
  inGrid: boolean;
  preferred: boolean;
  onPress: () => void;
  palette: Palette;
  ar: boolean;
}) {
  const dark = palette.mode === 'dark';
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.tile,
        inGrid && styles.tileInGrid,
        {
          flexDirection: ar ? 'row-reverse' : 'row',
          backgroundColor: palette.surfaceHover,
          borderColor: 'transparent',
        },
        selected && {
          backgroundColor: palette.accent.soft,
          borderColor: palette.accent.medium,
        },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      {option.icon ? (
        <AppIcon
          name={option.icon}
          size={18}
          color={
            selected
              ? dark
                ? palette.accent.light
                : palette.accent.deep
              : palette.secondary
          }
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.tileLabel,
          {
            color: selected ? palette.text : palette.secondary,
            fontWeight: selected ? '900' : '700',
            textAlign: ar ? 'right' : 'left',
          },
        ]}
      >
        {option.label}
      </Text>
      {option.count !== undefined ? (
        <Text style={[styles.tileCount, { color: palette.muted }]}>
          {option.count.toLocaleString(ar ? 'ar-IQ' : 'en-US')}
        </Text>
      ) : null}
      {selected ? (
        <View
          style={[styles.check, { backgroundColor: palette.accent.bright }]}
        >
          <AppIcon name="check" size={13} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },

  button: {
    height: 60,
    minWidth: 220,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 12,
  },
  buttonPhone: { minWidth: 150, height: 56, gap: 8, paddingHorizontal: 8 },
  buttonIconPhone: { width: 34, height: 34, borderRadius: 10 },
  buttonGrow: { flex: 1, maxWidth: 440 },
  buttonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCopy: { flex: 1, minWidth: 0 },
  buttonCaption: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: SHASHTNA_FONT.sans,
  },
  buttonValue: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: SHASHTNA_FONT.sans,
    marginTop: 1,
  },
  buttonCount: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  chevronDown: {
    width: 22,
    alignItems: 'center',
    transform: [{ rotate: '90deg' }],
  },

  clear: {
    height: 60,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 8,
  },
  clearText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: SHASHTNA_FONT.sans,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,4,10,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  backdropPhone: { justifyContent: 'flex-end', padding: 0 },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    paddingTop: 24,
    paddingHorizontal: 24,
    maxHeight: '86%',
    boxShadow: '0px 30px 80px rgba(0,0,0,0.55)',
  },
  sheetGrid: { width: '86%', maxWidth: 960 },
  sheetList: { width: 440, maxWidth: '100%' },
  sheetPhone: {
    width: '100%',
    maxWidth: undefined,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 18,
    maxHeight: '80%',
  },
  sheetHeader: { alignItems: 'center', gap: 16, marginBottom: 18 },
  sheetTitleWrap: { flex: 1 },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: SHASHTNA_FONT.sans,
  },
  sheetSub: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: SHASHTNA_FONT.sans,
    paddingVertical: 0,
  },

  tiles: {
    paddingBottom: 24,
    paddingHorizontal: 4,
    paddingTop: TILES_PAD,
    gap: TILE_GAP,
  },
  tileRow: { gap: TILE_GAP },
  tileInGrid: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  tile: {
    height: TILE_H,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 12,
  },
  tileSpacer: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  tileLabel: { flex: 1, fontSize: 17, fontFamily: SHASHTNA_FONT.sans },
  tileCount: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 28,
  },
});
