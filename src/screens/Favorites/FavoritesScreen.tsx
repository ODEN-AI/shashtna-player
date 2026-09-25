import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { Text } from '../../components/common/Typography';
import { posterGridLayout, PosterGridLayout } from '../../components/common/posterGrid';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { useDeviceClass } from '../../design/device';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { Catalog } from '../../features/catalog/catalog';
import { toggleFavorite, useFavoriteKeys } from '../../features/favorites/favoritesStore';
import { M3UChannel, M3UContentType } from '../../lib/m3u';
import { FocusRegion, screenMemory } from '../../navigation/tvFocus';

type Entry = { key: string; channel: M3UChannel; type: M3UContentType; title: string };

type Props = {
  catalog: Catalog;
  /** Live favorites open with the other live favorites as the zapping queue. */
  onOpen: (channel: M3UChannel, liveQueue?: readonly M3UChannel[]) => void;
  /** Shashtna Player Lite: channels only. */
  liveOnly?: boolean;
};

/**
 * My List. Reads the favorite keys (a small list) and resolves each through
 * the catalog's key map, instead of rebuilding every movie and series card
 * to filter them as before.
 */
export default function FavoritesScreen({ catalog, onOpen, liveOnly = false }: Props) {
  const { language } = useAppPreferences();
  const palette = usePalette();
  const device = useDeviceClass();
  const ar = language === 'ar';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const keys = useFavoriteKeys();
  const [gridWidth, setGridWidth] = useState(0);
  const grid = useMemo(() => posterGridLayout(gridWidth - 8, device), [gridWidth, device]);

  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const key of keys) {
      const type = key.slice(0, key.indexOf(':')) as M3UContentType;
      if (liveOnly && type !== 'live') continue;
      if (type === 'live') {
        const channel = catalog.byKey.get(key);
        if (channel) list.push({ key, channel, type, title: channel.name });
      } else {
        const item = catalog.itemsByKey.get(key);
        if (item) list.push({ key, channel: item.channel, type, title: item.title });
      }
    }
    return list;
  }, [keys, catalog, liveOnly]);

  const liveQueue = useMemo(() => entries.filter(e => e.type === 'live').map(e => e.channel), [entries]);
  const remembered = useMemo(() => screenMemory.get<{ focusKey: string }>('favorites').focusKey || '', []);
  const preferredKey = entries.some(e => e.key === remembered) ? remembered : entries[0]?.key;

  const open = useCallback(
    (entry: Entry) => {
      screenMemory.set('favorites', { focusKey: entry.key });
      onOpen(entry.channel, entry.type === 'live' ? liveQueue : undefined);
    },
    [onOpen, liveQueue],
  );

  return (
    <View style={[styles.page, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: palette.primaryText, textAlign: ar ? 'right' : 'left' }]}>MY LIST</Text>
          <Text style={[styles.title, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{ar ? 'المفضلة' : 'Favorites'}</Text>
          <Text style={[styles.sub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {entries.length
              ? `${entries.length} ${ar ? 'عنصر محفوظ في قائمتك' : entries.length === 1 ? 'item saved to your list' : 'items saved to your list'}`
              : liveOnly
                ? ar ? 'احفظ القنوات التي تتابعها للرجوع لها بسرعة.' : 'Save the channels you watch to find them quickly.'
                : ar ? 'احفظ الأفلام والمسلسلات والقنوات التي تريد الرجوع لها بسرعة.' : 'Save movies, series and channels you want to find quickly.'}
          </Text>
        </View>
        <View style={[styles.countPill, { flexDirection: rowDirection }]}>
          <AppIcon name="favorite" size={15} color="#FFFFFF" />
          <Text style={styles.countText}>{entries.length}</Text>
        </View>
      </View>

      {entries.length ? (
        <FocusRegion style={styles.gridArea}>
          <View style={styles.gridArea} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
            {device === 'tv' || gridWidth > 0 ? (
              <FlatList
                key={`fav-${grid.columns}`}
                data={entries}
                keyExtractor={item => item.key}
                numColumns={grid.columns}
                columnWrapperStyle={grid.columns > 1 ? [styles.gridRow, { gap: grid.gap, flexDirection: rowDirection }] : undefined}
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <FavoriteCard entry={item} grid={grid} onOpen={open} palette={palette} ar={ar} preferred={item.key === preferredKey} />
                )}
              />
            ) : null}
          </View>
        </FocusRegion>
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <AppIcon name="favorites" size={30} color="#FFFFFF" />
          </View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>{ar ? 'قائمتك فارغة حالياً' : 'Your list is empty'}</Text>
          <Text style={[styles.emptyText, { color: palette.muted }]}>
            {liveOnly
              ? ar ? 'اضغط مطولاً على أي قناة لإضافتها هنا.' : 'Long-press any channel to add it here.'
              : ar ? 'اضغط رمز القلب على أي فيلم أو مسلسل، أو اضغط مطولاً على قناة، حتى يظهر هنا.' : 'Press the heart on a movie or series, or long-press a channel, to add it here.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const FavoriteCard = memo(function FavoriteCard({
  entry,
  grid,
  onOpen,
  palette,
  ar,
  preferred,
}: {
  entry: Entry;
  grid: PosterGridLayout;
  onOpen: (entry: Entry) => void;
  palette: Palette;
  ar: boolean;
  preferred: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const image = entry.channel.logo || '';
  const typeLabel =
    entry.type === 'live' ? (ar ? 'قناة' : 'Channel') : entry.type === 'movie' ? (ar ? 'فيلم' : 'Movie') : ar ? 'مسلسل' : 'Series';
  const icon = entry.type === 'live' ? 'live' : entry.type === 'movie' ? 'movies' : 'series';

  return (
    <View style={[styles.card, { width: grid.cardWidth }]}>
      <Pressable
        focusable
        hasTVPreferredFocus={preferred}
        accessibilityLabel={entry.title}
        onPress={() => onOpen(entry)}
        onFocus={() => screenMemory.set('favorites', { focusKey: entry.key })}
        style={({ focused, pressed }) => [
          styles.poster,
          { width: grid.cardWidth, height: grid.cardHeight, backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          focused && focusStyle(palette),
          pressed && styles.pressed,
        ]}
      >
        {image && !failed ? (
          <Image
            source={{ uri: image }}
            style={entry.type === 'live' ? styles.logoImage : styles.posterImage}
            resizeMode={entry.type === 'live' ? 'contain' : 'cover'}
            resizeMethod="resize"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon name={icon} size={28} color={palette.muted} />
          </View>
        )}
      </Pressable>
      <Pressable
        focusable
        accessibilityRole="button"
        accessibilityLabel={ar ? 'إزالة من قائمتي' : 'Remove from My List'}
        onPress={() => toggleFavorite(entry.key)}
        style={({ focused, pressed }) => [
          styles.remove,
          ar ? styles.removeRtl : styles.removeLtr,
          focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name="favorite" size={14} color="#FFFFFF" />
      </Pressable>
      <Text numberOfLines={1} style={[styles.cardTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{entry.title}</Text>
      <Text numberOfLines={1} style={[styles.cardMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{typeLabel}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: SHASHTNA_THEME.layout.contentX, paddingTop: 26 },
  header: { alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, gap: 20 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 2.4 },
  title: { fontSize: SHASHTNA_THEME.typography.size.pageTitle, lineHeight: SHASHTNA_THEME.typography.lineHeight.pageTitle, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, marginTop: 4 },
  sub: { fontSize: 15, marginTop: 2, fontWeight: '700' },
  countPill: { height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', gap: 8, experimental_backgroundImage: 'linear-gradient(120deg, #FF4D7A 0%, #FF8A5B 100%)' },
  countText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  gridArea: { flex: 1 },
  grid: { paddingBottom: 40, paddingTop: 6, paddingHorizontal: 4 },
  gridRow: { marginBottom: 22 },
  card: { position: 'relative' },
  poster: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  posterImage: { width: '100%', height: '100%' },
  logoImage: { width: '70%', height: '70%', alignSelf: 'center', marginTop: '15%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF4D7A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  removeLtr: { right: 8 },
  removeRtl: { left: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '800', marginTop: 10, paddingHorizontal: 2 },
  cardMeta: { fontSize: 12, marginTop: 2, fontWeight: '700', paddingHorizontal: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: 'linear-gradient(120deg, #FF4D7A 0%, #FF8A5B 100%)' },
  emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 18 },
  emptyText: { fontSize: 15, marginTop: 6, textAlign: 'center', maxWidth: 460, lineHeight: 24 },
  pressed: { opacity: 0.84 },
});
