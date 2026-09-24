import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { M3UChannel } from '../../lib/m3u';
import AppIcon from '../../components/common/AppIcon';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { focusStyle, Palette, usePalette } from '../../design/palette';

type Props = { channels: M3UChannel[]; onOpenPlayer: (channel: M3UChannel) => void; onBackHome: () => void };

export default function LiveScreen({ channels, onOpenPlayer, onBackHome }: Props) {
  const { language } = useAppPreferences();
  const palette = usePalette();
  const ar = language === 'ar';
  const allLabel = ar ? 'الكل' : 'All';
  const rowDirection = ar ? 'row-reverse' : 'row';

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(allLabel);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    setGroup(allLabel);
  }, [allLabel]);

  const groups = useMemo(
    () => [allLabel, ...Array.from(new Set(channels.map(c => String(c.group || '').trim()).filter(Boolean))).slice(0, 18)],
    [channels, allLabel],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(
      c =>
        (group === allLabel || c.group === group) &&
        (!q || c.name.toLowerCase().includes(q) || String(c.group || '').toLowerCase().includes(q)),
    );
  }, [channels, group, query, allLabel]);

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <View style={styles.headerTitle}>
          <View style={[styles.liveTag, { flexDirection: rowDirection, alignSelf: ar ? 'flex-end' : 'flex-start' }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>
          <Text style={[styles.title, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
            {ar ? 'البث المباشر' : 'Live TV'}
          </Text>
          <Text style={[styles.sub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {filtered.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')} {ar ? 'قناة متاحة' : 'channels available'}
          </Text>
        </View>

        <View style={[styles.headerActions, { flexDirection: rowDirection }]}>
          <View
            style={[
              styles.search,
              { flexDirection: rowDirection, backgroundColor: palette.surface, borderColor: searchFocused ? palette.focus : palette.border },
            ]}
          >
            <AppIcon name="search" size={17} color={palette.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={ar ? 'ابحث عن قناة...' : 'Search channels...'}
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}
            />
          </View>
          <Pressable
            focusable
            accessibilityLabel={ar ? 'الرئيسية' : 'Home'}
            onPress={onBackHome}
            style={({ focused, pressed }) => [
              styles.iconButton,
              { backgroundColor: palette.surface, borderColor: palette.border },
              focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="home" size={19} color={palette.secondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={[styles.chips, { flexDirection: rowDirection }]}
      >
        {groups.map(g => {
          const active = group === g;
          return (
            <Pressable
              key={g}
              focusable
              onPress={() => setGroup(g)}
              style={({ focused, pressed }) => [
                styles.chip,
                { backgroundColor: palette.surface, borderColor: palette.border },
                active && styles.chipActive,
                focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : palette.secondary }]}>{g}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={c => String(c.id)}
        numColumns={SHASHTNA_THEME.layout.liveColumns}
        columnWrapperStyle={[styles.row, { flexDirection: rowDirection }]}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
        renderItem={({ item, index }) => (
          <LiveCard channel={item} number={index + 1} onPress={() => onOpenPlayer(item)} ar={ar} palette={palette} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: palette.primarySoft }]}>
              <AppIcon name="live" size={28} color={palette.primaryText} />
            </View>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>{ar ? 'ماكو قنوات مطابقة' : 'No matching channels'}</Text>
            <Text style={[styles.emptySub, { color: palette.muted }]}>
              {ar ? 'غيّر البحث أو التصنيف.' : 'Try changing your search or filter.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function LiveCard({
  channel,
  number,
  onPress,
  ar,
  palette,
}: {
  channel: M3UChannel;
  number: number;
  onPress: () => void;
  ar: boolean;
  palette: Palette;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={channel.name}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.card,
        { flexDirection: ar ? 'row-reverse' : 'row', backgroundColor: palette.surface, borderColor: palette.border },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.logoBox, { backgroundColor: palette.mode === 'dark' ? '#FFFFFF0D' : palette.surfaceElevated }]}>
        {channel.logo && !failed ? (
          <Image source={{ uri: channel.logo }} style={styles.logo} onError={() => setFailed(true)} />
        ) : (
          <Text style={[styles.logoFallback, { color: palette.secondary }]}>{channel.name.trim().slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.cardMain}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
          {channel.name}
        </Text>
        <View style={[styles.metaRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <View style={styles.liveDotSmall} />
          <Text numberOfLines={1} style={[styles.group, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {channel.group || (ar ? 'بث مباشر' : 'Live TV')}
          </Text>
        </View>
      </View>
      <Text style={[styles.number, { color: palette.muted }]}>{String(number).padStart(2, '0')}</Text>
    </Pressable>
  );
}

const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: SHASHTNA_THEME.layout.contentX, paddingTop: 26 },
  header: { alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 20 },
  headerTitle: { flex: 1 },
  liveTag: { height: 24, paddingHorizontal: 10, borderRadius: 7, alignItems: 'center', gap: 6, experimental_backgroundImage: SHASHTNA_THEME.gradients.live },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  liveTagText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontFamily: SHASHTNA_FONT.display, fontSize: T.size.pageTitle, lineHeight: T.lineHeight.pageTitle, fontWeight: '900', marginTop: 10 },
  sub: { fontSize: T.size.secondary, marginTop: 2, fontWeight: '700' },
  headerActions: { alignItems: 'center', gap: 12 },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  search: { height: 48, width: 340, borderRadius: 24, borderWidth: 2, alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  input: { flex: 1, fontFamily: SHASHTNA_FONT.sans, fontSize: 16, paddingVertical: 0 },
  chipsScroll: { flexGrow: 0, marginBottom: 14 },
  chips: { gap: 8, paddingHorizontal: 4, paddingVertical: 6 },
  chip: { height: SHASHTNA_THEME.chip.height, borderRadius: SHASHTNA_THEME.chip.radius, borderWidth: 2, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipActive: { experimental_backgroundImage: SHASHTNA_THEME.gradients.brand, borderColor: 'transparent' },
  chipText: { fontSize: T.size.secondary, fontFamily: SHASHTNA_FONT.sans, fontWeight: '800' },
  list: { paddingTop: 6, paddingBottom: 40, paddingHorizontal: 4 },
  row: { gap: 16, marginBottom: 16 },
  card: { flex: 1, minWidth: 0, height: SHASHTNA_THEME.layout.liveCardH, borderRadius: 18, borderWidth: 2, alignItems: 'center', paddingHorizontal: 12, gap: 12 },
  logoBox: { width: 72, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 6 },
  logo: { width: '100%', height: '100%', resizeMode: 'contain' },
  logoFallback: { fontSize: 16, fontWeight: '900' },
  cardMain: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 21, fontFamily: SHASHTNA_FONT.sans, fontWeight: '900' },
  metaRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: SHASHTNA_THEME.colors.live },
  group: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  number: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.84 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 110 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptySub: { fontSize: 15, marginTop: 5 },
});
