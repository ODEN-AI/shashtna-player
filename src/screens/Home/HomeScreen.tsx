import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { M3UChannel } from '../../lib/m3u';
import { getRecentTmdbCatalog, tmdbImageUrl, TmdbMediaMetadata, TmdbRecentItem } from '../../lib/tmdb';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { useAppPreferences } from '../../design/AppPreferencesContext';

type Props = {
  channels: M3UChannel[];
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  onNavigate: (page: 'home'|'live'|'movies'|'series'|'favorites'|'search'|'settings') => void;
  onOpenPlayer: (channel: M3UChannel) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (channel: M3UChannel) => void;
};

type MediaType = 'movie' | 'series';
type MediaItem = {
  channel: M3UChannel;
  type: MediaType;
  title: string;
};
type RankedItem = MediaItem & {
  meta: TmdbMediaMetadata;
};

function cleanTitle(v: string) {
  return String(v || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi, ' ')
    .replace(/\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasArabicLetters(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function hintedYear(value: string) {
  const match = String(value || '').match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function dateValue(value: string) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function rotate<T>(items: T[], offset: number, count: number) {
  if (!items.length) return [] as T[];
  const start = ((offset % items.length) + items.length) % items.length;
  return Array.from({ length: Math.min(count, items.length) }, (_, index) =>
    items[(start + index) % items.length],
  );
}

function normalizeMatch(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '')
    .trim();
}

function matchTokens(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/&/g, 'and')
    .split(/[^a-z0-9\u0600-\u06FF]+/)
    .filter(Boolean);
}

function titleMatchScore(sourceTitle: string, metaTitle: string, sourceYear: number, metaYear: number) {
  if (sourceYear && metaYear && sourceYear !== metaYear) {
    return 0;
  }

  const sourceExact = normalizeMatch(sourceTitle);
  const metaExact = normalizeMatch(metaTitle);
  if (!sourceExact || !metaExact) return 0;

  if (sourceExact === metaExact) {
    return sourceYear && metaYear ? 105 : 100;
  }

  const sourceTokens = matchTokens(sourceTitle);
  const metaTokens = matchTokens(metaTitle);
  if (!sourceTokens.length || !metaTokens.length) return 0;

  const metaSet = new Set(metaTokens);
  const shared = sourceTokens.filter(token => metaSet.has(token)).length;
  const coverage = shared / Math.max(sourceTokens.length, metaTokens.length);
  const sourceFlat = sourceTokens.join('');
  const metaFlat = metaTokens.join('');
  const lengthRatio =
    Math.min(sourceFlat.length, metaFlat.length) /
    Math.max(sourceFlat.length, metaFlat.length);

  if (coverage >= 0.85 && lengthRatio >= 0.72) {
    return sourceYear && metaYear ? 92 : 88;
  }

  if (
    coverage >= 0.72 &&
    lengthRatio >= 0.82 &&
    (sourceFlat.includes(metaFlat) || metaFlat.includes(sourceFlat))
  ) {
    return sourceYear && metaYear ? 86 : 82;
  }

  return 0;
}

function discoveryMatchesSource(
  catalog: TmdbRecentItem[],
  sourceItems: MediaItem[],
): RankedItem[] {
  if (!catalog.length || !sourceItems.length) return [];

  const byTitle = new Map<string, MediaItem[]>();

  for (const item of sourceItems) {
    const key = normalizeMatch(item.title);
    if (!key) continue;
    const bucket = byTitle.get(key);
    if (bucket) bucket.push(item);
    else byTitle.set(key, [item]);
  }

  const matched: RankedItem[] = [];
  const usedSourceIds = new Set<string>();

  for (const meta of catalog) {
    const key = normalizeMatch(meta.title);
    const candidates = byTitle.get(key) || [];
    if (!candidates.length) continue;

    const metaYear = hintedYear(meta.releaseDate);
    let best: MediaItem | undefined;

    if (metaYear) {
      best = candidates.find(item => {
        const sourceYear = hintedYear(item.title);
        return sourceYear === metaYear && !usedSourceIds.has(String(item.channel.id));
      });
    }

    if (!best) {
      const withoutYear = candidates.filter(item =>
        !hintedYear(item.title) && !usedSourceIds.has(String(item.channel.id)),
      );
      if (withoutYear.length === 1) best = withoutYear[0];
    }

    if (!best && candidates.length === 1 && !usedSourceIds.has(String(candidates[0].channel.id))) {
      best = candidates[0];
    }

    if (!best) continue;

    const sourceId = String(best.channel.id);
    usedSourceIds.add(sourceId);
    matched.push({ ...best, meta });
  }

  return matched;
}

function Icon({name, active=false, size=20}:{name:'home'|'live'|'movie'|'series'|'fav'|'settings'|'search'|'play'|'plus'|'chevron'|'favorite'|'arrow';active?:boolean;size?:number}) {
  const map: Record<typeof name, AppIconName> = {
    home:'home', live:'live', movie:'movies', series:'series', fav:'favorites', settings:'settings',
    search:'search', play:'play', plus:'plus', chevron:'chevron', favorite:'favorite', arrow:'arrow',
  };
  return <AppIcon name={map[name]} active={active} size={size}/>;
}

function Poster({
  item,
  metadata,
  favorite,
  onToggleFavorite,
  compact=false,
  palette,
}: {
  item:MediaItem;
  metadata?:TmdbMediaMetadata;
  favorite:boolean;
  onToggleFavorite?:()=>void;
  compact?:boolean;
  palette:Palette;
}) {
  const poster = tmdbImageUrl(metadata?.posterPath,'w500') || item.channel.logo || '';

  const width = compact ? SHASHTNA_THEME.layout.compactW : SHASHTNA_THEME.layout.posterW;
  const height = compact ? SHASHTNA_THEME.layout.compactH : SHASHTNA_THEME.layout.posterH;

  return (
    <View style={[styles.posterWrap,{width}]}> 
      <View style={[styles.poster,{width,height,borderColor:palette.border}]}> 
        {poster ? <Image source={{uri:poster}} style={styles.posterImage}/> : <View style={styles.posterFallback}><Icon name={item.type==='movie'?'movie':'series'} size={28}/></View>}
        {onToggleFavorite ? (
          <Pressable
            focusable
            onPress={onToggleFavorite}
            accessibilityRole="button"
            accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
            style={({focused,pressed})=>[
              styles.favoriteButton,
              favorite && styles.favoriteButtonActive,
              focused && styles.favoriteButtonFocused,
              pressed && styles.favoriteButtonPressed,
            ]}
          >
            <Icon name="favorite" size={14} />
          </Pressable>
        ) : null}
      </View>
      <Text numberOfLines={2} style={[styles.posterTitle,{color:palette.text}]}>{cleanTitle(item.channel.name)}</Text>
    </View>
  );
}

function MediaChip({item,metadata,onPress,favorite,onToggleFavorite,palette}:{item:MediaItem;metadata?:TmdbMediaMetadata;onPress:()=>void;favorite:boolean;onToggleFavorite?:()=>void;palette:Palette}) {
  return (
    <Pressable focusable onPress={onPress} style={({focused,pressed})=>[styles.mediaCard,focused&&styles.focused,pressed&&styles.pressed]}>
      <Poster item={item} metadata={metadata} compact favorite={favorite} onToggleFavorite={onToggleFavorite} palette={palette}/>
    </Pressable>
  );
}

export default function HomeScreen({
  channels,
  channelCount,
  movieCount,
  seriesCount,
  onNavigate,
  onOpenPlayer,
  favoriteIds = [],
  onToggleFavorite,
}:Props) {
  const { language, themeMode } = useAppPreferences();
  const ar = language === 'ar';
  const light = themeMode === 'light';
  const palette = light ? lightColors : darkColors;
  const favoriteSet = useMemo(()=>new Set(favoriteIds),[favoriteIds]);

  const [foreignMovies, setForeignMovies] = useState<MediaItem[]>([]);
  const [foreignSeries, setForeignSeries] = useState<MediaItem[]>([]);

  useEffect(() => {
    let alive = true;

    const collectSourceItems = async () => {
      // Let Home paint first, then scan the large channel array in chunks.
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      const nextMovies: MediaItem[] = [];
      const nextSeries: MediaItem[] = [];

      for (let index = 0; index < channels.length; index += 1) {
        const channel = channels[index];
        if (channel.contentType !== 'movie' && channel.contentType !== 'series') continue;

        const title = cleanTitle(channel.name);
        if (hasArabicLetters(title)) continue;

        const item: MediaItem = {
          channel,
          type: channel.contentType,
          title,
        };

        if (channel.contentType === 'movie') nextMovies.push(item);
        else nextSeries.push(item);

        if (index > 0 && index % 1500 === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }

      if (!alive) return;
      setForeignMovies(nextMovies);
      setForeignSeries(nextSeries);
    };

    collectSourceItems();

    return () => {
      alive = false;
    };
  }, [channels]);

  const [latestMovies, setLatestMovies] = useState<RankedItem[]>([]);
  const [latestSeries, setLatestSeries] = useState<RankedItem[]>([]);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let alive = true;

    const loadRecent = async () => {
      try {
        const [movieCatalog, seriesCatalog] = await Promise.all([
          getRecentTmdbCatalog('movie'),
          getRecentTmdbCatalog('series'),
        ]);

        if (!alive) return;

        setLatestMovies(
          discoveryMatchesSource(movieCatalog, foreignMovies),
        );
        setLatestSeries(
          discoveryMatchesSource(seriesCatalog, foreignSeries),
        );
      } catch (error) {
        console.warn('[Home] Recent catalog load failed:', error);
        if (alive) {
          setLatestMovies([]);
          setLatestSeries([]);
        }
      }
    };

    loadRecent();

    return () => {
      alive = false;
    };
  }, [foreignMovies, foreignSeries]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRotation(value => value + 1);
    }, 90000);

    return () => clearInterval(timer);
  }, []);

  const fallbackMovies = useMemo<RankedItem[]>(
    () =>
      foreignMovies.map(item => ({
        ...item,
        meta: {
          id: 0,
          title: item.title,
          overview: '',
          posterPath: null,
          backdropPath: null,
          voteAverage: 0,
          releaseDate: '',
        },
      })),
    [foreignMovies],
  );

  const fallbackSeries = useMemo<RankedItem[]>(
    () =>
      foreignSeries.map(item => ({
        ...item,
        meta: {
          id: 0,
          title: item.title,
          overview: '',
          posterPath: null,
          backdropPath: null,
          voteAverage: 0,
          releaseDate: '',
        },
      })),
    [foreignSeries],
  );

  const displayMovies = useMemo(
    () =>
      rotate(
        latestMovies.length ? latestMovies : fallbackMovies,
        rotation,
        8,
      ),
    [latestMovies, fallbackMovies, rotation],
  );

  const displaySeries = useMemo(
    () =>
      rotate(
        latestSeries.length ? latestSeries : fallbackSeries,
        rotation + 3,
        8,
      ),
    [latestSeries, fallbackSeries, rotation],
  );

  const recentMixed = useMemo(
    () =>
      rotate(
        [...latestMovies, ...latestSeries].sort(
          (a, b) =>
            dateValue(b.meta.releaseDate) -
            dateValue(a.meta.releaseDate),
        ),
        rotation + 5,
        8,
      ),
    [latestMovies, latestSeries, rotation],
  );

  const heroPool = useMemo(() => {
    const merged = [...latestMovies.slice(0, 8), ...latestSeries.slice(0, 8)];

    if (merged.length) {
      return merged;
    }

    return [...displayMovies, ...displaySeries];
  }, [latestMovies, latestSeries, displayMovies, displaySeries]);

  const hero = heroPool.length
    ? heroPool[rotation % heroPool.length]
    : undefined;

  const heroPoster =
    hero?.meta?.backdropPath
      ? tmdbImageUrl(hero.meta.backdropPath, 'w780') || ''
      : hero?.meta?.posterPath
        ? tmdbImageUrl(hero.meta.posterPath, 'w780') || ''
        : hero?.channel.logo || '';

  const isFav = (item:MediaItem) => favoriteSet.has(`${item.type}:${String(item.channel.id)}`);
  const toggle = (item:MediaItem) => onToggleFavorite?.(item.channel);

  const countText = (n:number, labelAr:string, labelEn:string) => `${n.toLocaleString(ar?'ar-IQ':'en-US')} ${ar?labelAr:labelEn}`;

  const nav = [
    ['home', ar ? 'Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©' : 'Home', 'home'],
    ['live', ar ? 'Ø¨Ø« Ù…Ø¨Ø§Ø´Ø±' : 'Live TV', 'live'],
    ['movies', ar ? 'Ø£ÙÙ„Ø§Ù…' : 'Movies', 'movie'],
    ['series', ar ? 'Ù…Ø³Ù„Ø³Ù„Ø§Øª' : 'Series', 'series'],
    ['favorites', ar ? 'Ø§Ù„Ù…ÙØ¶Ù„Ø©' : 'Favorites', 'fav'],
    ['search', ar ? 'Ø¨Ø­Ø«' : 'Search', 'search'],
    ['settings', ar ? 'Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª' : 'Settings', 'settings'],
  ] as const;
  return (
    <View style={[styles.screen,{backgroundColor:palette.background}]}> 
      <View style={styles.topGlow}/>
      <View style={[styles.header,{flexDirection: ar ? 'row-reverse' : 'row'}]}>
        <View style={styles.brandSpacer}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>Ø´</Text></View>
          <View>
            <Text style={[styles.brandArabic,{color:palette.text}, ar && styles.rtlText]}>{'Ø¹Ø¨Ø¯Ø§Ù„Ø±Ø­Ù…Ù† IPTV'}</Text>
            <Text style={[styles.brandLatin,{color:light?'#1675D1':SHASHTNA_THEME.colors.primaryBright}]}>PLAYER</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable focusable onPress={()=>onNavigate('movies')} style={({focused,pressed})=>[styles.search,focused&&styles.focused,pressed&&styles.pressed,{backgroundColor:palette.surface,borderColor:palette.border}]}> 
            <Icon name="search" size={18}/>
            <Text style={[styles.searchText,{color:palette.muted}, ar && styles.rtlText]}>{ar?'\u0627\u0628\u062d\u062b \u0639\u0646 \u0641\u064a\u0644\u0645 \u0623\u0648 \u0645\u0633\u0644\u0633\u0644...':'Search movies or series...'}</Text>
          </Pressable>
          <View style={styles.headerMeta}>
            <Text style={[styles.headerMetaTitle,{color:palette.text}, ar && styles.rtlText]}>{ar?'\u0623\u062d\u062f\u062b \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0645\u062a\u0627\u062d':'Latest available content'}</Text>
            <Text style={[styles.headerMetaSub,{color:palette.muted}, ar && styles.rtlText]}>{ar?'\u064a\u062a\u062c\u062f\u062f \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b':'Refreshes automatically'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={[styles.sidebar,{backgroundColor:palette.sidebar,borderColor:palette.border, display:'none'}]}> 
          <Text style={[styles.sidebarCaption,{color:palette.muted}, ar && styles.rtlText]}>{ar?'\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629':'MAIN MENU'}</Text>
          {nav.map(([id,label,icon])=>(
            <Pressable key={id} focusable accessibilityRole="button" accessibilityLabel={label} hasTVPreferredFocus={id==='home'} onPress={()=>onNavigate(id as any)} style={({focused,pressed})=>[
              styles.navItem,
              id==='home' && {backgroundColor:palette.active,borderColor:palette.activeBorder},
              focused && styles.focused,
              pressed && styles.pressed,
            ]}>
              <View style={[styles.navIconBox,id==='home'&&{backgroundColor:light?'#D9EEFF':SHASHTNA_THEME.colors.primaryMedium}]}>
                <Icon name={icon as any} active={id==='home'} size={19}/>
              </View>
              <Text style={[styles.navText,{color:id==='home'?palette.text:palette.secondary},id==='home'&&styles.navTextActive, ar && styles.rtlText]}>{label}</Text>
              {id==='home' ? <View style={styles.navActiveLine}/> : null}
            </Pressable>
          ))}
        </View>

        <ScrollView style={[styles.content,{direction: ar ? 'rtl' : 'ltr'}]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false} removeClippedSubviews>
          <View style={[styles.hero,{backgroundColor:palette.surface,borderColor:palette.borderStrong}]}> 
            <View style={[styles.heroScrimSide, ar && styles.heroScrimSideRtl]} />
            <View style={styles.heroScrimBottom} />
            <View style={[styles.heroCopy, ar && styles.heroCopyRtl]}>
              <Text numberOfLines={2} style={[styles.heroTitle,{color:palette.text, writingDirection: ar ? 'rtl' : 'ltr', textAlign: ar ? 'right' : 'left'}]}>{hero?hero.title:(ar?'\u0623\u062d\u062f\u062b \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u064a\u0638\u0647\u0631 \u0647\u0646\u0627':'Latest content appears here')}</Text>
              <View style={[styles.heroMetaRow, ar && styles.rtlRow]}>
                {hero?.meta?.voteAverage ? (
                  <Text style={[styles.heroMetaText,{color:palette.secondary}]}>
                    â˜… {Number(hero.meta.voteAverage).toFixed(1)}
                  </Text>
                ) : null}
                {hero?.meta?.releaseDate ? (
                  <Text style={[styles.heroMetaText,{color:palette.secondary}]}>
                    {hero.meta.releaseDate.slice(0, 4)}
                  </Text>
                ) : null}
                {hero ? (
                  <Text style={[styles.heroMetaText,{color:palette.secondary}]}>
                    {hero.type === 'movie' ? (ar ? '\u0641\u064a\u0644\u0645' : 'Movie') : (ar ? '\u0645\u0633\u0644\u0633\u0644' : 'Series')}
                  </Text>
                ) : null}
              </View>
              <Text numberOfLines={3} style={[styles.heroDesc,{color:palette.secondary, writingDirection: ar ? 'rtl' : 'ltr', textAlign: ar ? 'right' : 'left'}]}>{hero?.meta?.overview || (ar?'\u0646\u0639\u0631\u0636 \u0644\u0643 \u0623\u062d\u062f\u062b \u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0648\u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062a \u0627\u0644\u0623\u062c\u0646\u0628\u064a\u0629 \u0627\u0644\u0645\u062a\u0648\u0641\u0631\u0629 \u0641\u064a \u0627\u0644\u0645\u0635\u062f\u0631 \u0627\u0644\u0645\u062a\u0635\u0644\u060c \u0645\u0639 \u062a\u0628\u062f\u064a\u0644 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b.':'Showing recent foreign movies and series available in the connected source, with rotating recommendations.')}</Text>
              <View style={[styles.actions, ar && styles.rtlRow]}>
                {hero ? <Pressable focusable onPress={()=>onOpenPlayer(hero.channel)} style={({focused,pressed})=>[styles.primaryButton,focused&&styles.focused,pressed&&styles.pressed]}><Icon name="play" active size={18}/><Text style={[styles.primaryButtonText, ar && styles.rtlButtonText]}>{ar?'\u0645\u0634\u0627\u0647\u062f\u0629 \u0627\u0644\u0622\u0646':'Watch now'}</Text></Pressable> : null}
                {hero ? <Pressable focusable onPress={()=>toggle(hero)} style={({focused,pressed})=>[styles.secondaryButton,focused&&styles.focused,pressed&&styles.pressed,{backgroundColor:palette.surfaceElevated,borderColor:palette.border}]}> <Icon name="favorite" size={17}/><Text style={[styles.secondaryButtonText,{color:palette.text}, ar && styles.rtlButtonText]}>{isFav(hero)?(ar?'\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0642\u0627\u0626\u0645\u062a\u064a':'Remove from list'):(ar?'\u0625\u0636\u0627\u0641\u0629 \u0644\u0642\u0627\u0626\u0645\u062a\u064a':'Add to list')}</Text></Pressable> : null}
              </View>
            </View>
          </View>

          <SectionHeader title={ar?'\u0623\u062d\u062f\u062b \u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0627\u0644\u0623\u062c\u0646\u0628\u064a\u0629':'Latest foreign movies'} action={ar?'\u0639\u0631\u0636 \u0627\u0644\u0643\u0644':'View all'} onPress={()=>onNavigate('movies')} palette={palette}/>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row,{flexDirection: ar ? 'row-reverse' : 'row'}]}>
            {displayMovies.map(item=><MediaChip key={`${item.type}:${item.channel.id}`} item={item} metadata={item.meta} favorite={isFav(item)} onToggleFavorite={onToggleFavorite?()=>toggle(item):undefined} onPress={()=>onOpenPlayer(item.channel)} palette={palette}/>) }
          </ScrollView>

          <SectionHeader title={ar?'\u0623\u062d\u062f\u062b \u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062a \u0627\u0644\u0623\u062c\u0646\u0628\u064a\u0629':'Latest foreign series'} action={ar?'\u0639\u0631\u0636 \u0627\u0644\u0643\u0644':'View all'} onPress={()=>onNavigate('series')} palette={palette}/>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row,{flexDirection: ar ? 'row-reverse' : 'row'}]}>
            {displaySeries.map(item=><MediaChip key={`${item.type}:${item.channel.id}`} item={item} metadata={item.meta} favorite={isFav(item)} onToggleFavorite={onToggleFavorite?()=>toggle(item):undefined} onPress={()=>onOpenPlayer(item.channel)} palette={palette}/>) }
          </ScrollView>

          <SectionHeader title={ar?'\u0648\u0635\u0644 \u062d\u062f\u064a\u062b\u064b\u0627':'Recently added'} action={ar?'\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0639\u0631\u0636':'Refresh view'} onPress={()=>setRotation(value => value + 1)} palette={palette}/>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row,{flexDirection: ar ? 'row-reverse' : 'row'}]}>
            {recentMixed.map(item=><MediaChip key={`recent:${item.type}:${item.channel.id}`} item={item} metadata={item.meta} favorite={isFav(item)} onToggleFavorite={onToggleFavorite?()=>toggle(item):undefined} onPress={()=>onOpenPlayer(item.channel)} palette={palette}/>)}
          </ScrollView>

          <View style={styles.categoryRow}>
            <QuickCard icon="live" title={ar?'\u0628\u062b \u0645\u0628\u0627\u0634\u0631':'Live TV'} sub={countText(channelCount,'\u0642\u0646\u0627\u0629','channels')} onPress={()=>onNavigate('live')} palette={palette}/>
            <QuickCard icon="movie" title={ar?'\u0623\u0641\u0644\u0627\u0645':'Movies'} sub={countText(movieCount,'\u0639\u0646\u0648\u0627\u0646','titles')} onPress={()=>onNavigate('movies')} palette={palette}/>
            <QuickCard icon="series" title={ar?'\u0645\u0633\u0644\u0633\u0644\u0627\u062a':'Series'} sub={countText(seriesCount,'\u0645\u0633\u0644\u0633\u0644','series')} onPress={()=>onNavigate('series')} palette={palette}/>
            <QuickCard icon="fav" title={ar?'\u0627\u0644\u0645\u0641\u0636\u0644\u0629':'Favorites'} sub={ar?'\u0645\u062d\u062a\u0648\u0627\u0643 \u0627\u0644\u0645\u062d\u0641\u0648\u0638':'Saved titles'} onPress={()=>onNavigate('favorites')} palette={palette}/>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function SectionHeader({title,action,onPress,palette}:{title:string;action:string;onPress:()=>void;palette:Palette}) {
  return <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle,{color:palette.text}]}>{title}</Text>
    <Pressable focusable onPress={onPress} style={({focused,pressed})=>[styles.viewAll,focused&&styles.focused,pressed&&styles.pressed]}>
      <Text style={[styles.viewAllText,{color:palette.secondary}]}>{action}</Text><Icon name="arrow" size={13}/>
    </Pressable>
  </View>;
}
function QuickCard({icon,title,sub,onPress,palette}:{icon:any;title:string;sub:string;onPress:()=>void;palette:Palette}) {
  return <Pressable focusable onPress={onPress} style={({focused,pressed})=>[styles.quickCard,focused&&styles.focused,pressed&&styles.pressed,{backgroundColor:palette.surface,borderColor:palette.border}]}>
    <View style={styles.quickIcon}><Icon name={icon} size={18}/></View>
    <View style={{flex:1}}><Text style={[styles.quickTitle,{color:palette.text}]}>{title}</Text><Text style={[styles.quickSub,{color:palette.muted}]}>{sub}</Text></View>
  </Pressable>;
}
type Palette={background:string;surface:string;surfaceElevated:string;border:string;borderStrong:string;text:string;secondary:string;muted:string;sidebar:string;active:string;activeBorder:string};
const darkColors:Palette={background:'#050A13',surface:'#0B1627',surfaceElevated:'#102038',border:'#203852',borderStrong:'#2D4A67',text:'#FFFFFF',secondary:'#A8B6C9',muted:'#53657C',sidebar:'#07101F',active:'rgba(23,136,255,0.16)',activeBorder:'#1788FF'};
const lightColors:Palette={background:'#F4F7FB',surface:'#FFFFFF',surfaceElevated:'#F1F6FC',border:'#D8E4F0',borderStrong:'#B7CCE0',text:'#142B43',secondary:'#52697F',muted:'#7B8EA2',sidebar:'#FFFFFF',active:'#EAF3FF',activeBorder:'#8EC4FF'};

const styles=StyleSheet.create({
  screen:{flex:1,overflow:'hidden'},
  topGlow:{position:'absolute',width:620,height:380,borderRadius:310,right:-220,top:-220,backgroundColor:'#0C5CA8',opacity:.08},
  header:{height:76,paddingHorizontal:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},
  brandSpacer:{width:1,height:1,opacity:0},
  brandMark:{width:42,height:42,borderRadius:14,backgroundColor:'#0D5ED7',borderWidth:1,borderColor:'#43A9FF',alignItems:'center',justifyContent:'center'},
  brandMarkText:{color:'#fff',fontSize:21,fontWeight:'900',fontFamily:SHASHTNA_FONT.sans},
  brandArabic:{fontSize:20,fontWeight:'900',fontFamily:SHASHTNA_FONT.sans},
  brandLatin:{fontSize:9,letterSpacing:1.8,fontWeight:'900',marginTop:2},
  headerRight:{flexDirection:'row',alignItems:'center',gap:16},
  search:{height:48,width:380,borderRadius:24,borderWidth:1,flexDirection:'row',alignItems:'center',paddingHorizontal:18,gap:10},
  searchText:{fontSize:15,fontFamily:SHASHTNA_FONT.sans,flex:1},
  headerMeta:{alignItems:'flex-end',minWidth:190},
  headerMetaTitle:{fontSize:15,fontWeight:'900'},
  headerMetaSub:{fontSize:13,marginTop:3},
  body:{flex:1,flexDirection:'row',paddingHorizontal:48,paddingBottom:27},
  sidebar:{width:184,borderRadius:18,borderWidth:1,padding:11},
  sidebarCaption:{fontSize:11,fontWeight:'900',paddingHorizontal:8,paddingTop:4,paddingBottom:12},
  navItem:{height:56,borderRadius:16,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:12,marginBottom:6,borderWidth:2,borderColor:'transparent',position:'relative'},
  navIconBox:{width:36,height:36,borderRadius:11,backgroundColor:'rgba(23,136,255,0.10)',alignItems:'center',justifyContent:'center'},
  navText:{fontSize:SHASHTNA_THEME.typography.size.nav,fontWeight:'800',fontFamily:SHASHTNA_FONT.sans},
  navTextActive:{fontWeight:'900'},
  navActiveLine:{position:'absolute',left:-1,right:'auto',width:4,height:28,borderRadius:2,backgroundColor:'#58B6FF'},
  content:{flex:1},
  contentContainer:{paddingBottom:40},
  hero:{height:280,borderRadius:24,borderWidth:1,overflow:'hidden',position:'relative',backgroundColor:'#081423'},
  heroImage:{position:'absolute',left:0,top:0,right:0,bottom:0,width:'100%',height:'100%',resizeMode:'cover'},
  heroScrimSide:{position:'absolute',left:0,top:0,bottom:0,width:'74%',backgroundColor:'rgba(4,10,19,0.72)',zIndex:1},
  heroScrimSideRtl:{left:'auto',right:0},
  heroScrimBottom:{position:'absolute',left:0,right:0,bottom:0,height:'42%',backgroundColor:'rgba(3,8,15,0.30)',zIndex:1},
  heroCopy:{width:'68%',height:'100%',paddingHorizontal:40,paddingVertical:30,justifyContent:'center',zIndex:2,alignItems:'flex-start'},
  heroCopyRtl:{alignItems:'stretch'},
  rtlText:{writingDirection:'rtl',textAlign:'right'},
  rtlRow:{flexDirection:'row-reverse'},
  heroMetaRow:{flexDirection:'row',alignItems:'center',gap:14,marginTop:12,flexWrap:'wrap'},
  heroMetaText:{fontSize:SHASHTNA_THEME.typography.size.metadata,fontWeight:'800',color:'#D3DCE8'},
  heroTitle:{fontSize:SHASHTNA_THEME.typography.size.hero,lineHeight:SHASHTNA_THEME.typography.lineHeight.hero,fontWeight:'900',fontFamily:SHASHTNA_FONT.display,maxWidth:'100%'},
  heroDesc:{fontSize:SHASHTNA_THEME.typography.size.bodyLarge,lineHeight:SHASHTNA_THEME.typography.lineHeight.bodyLarge,marginTop:12,maxWidth:720,fontFamily:SHASHTNA_FONT.sans},
  actions:{flexDirection:'row',gap:12,marginTop:20,alignItems:'center',flexWrap:'nowrap'},
  primaryButton:{height:48,minWidth:150,paddingHorizontal:20,borderRadius:24,backgroundColor:'#1788FF',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,borderWidth:2,borderColor:'rgba(255,255,255,0.10)'},
  primaryButtonText:{color:'#fff',fontSize:SHASHTNA_THEME.typography.size.button,fontWeight:'900'},
  rtlButtonText:{writingDirection:'rtl',textAlign:'right'},
  secondaryButton:{height:48,minWidth:168,paddingHorizontal:20,borderRadius:24,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},
  secondaryButtonText:{fontSize:SHASHTNA_THEME.typography.size.button,fontWeight:'800'},
  sectionHeader:{marginTop:40,marginBottom:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  sectionTitle:{fontSize:SHASHTNA_THEME.typography.size.section,lineHeight:28,fontWeight:'900',fontFamily:SHASHTNA_FONT.sans},
  viewAll:{height:40,paddingHorizontal:14,borderRadius:20,flexDirection:'row',alignItems:'center',gap:7,borderWidth:2,borderColor:'transparent'},
  viewAllText:{fontSize:SHASHTNA_THEME.typography.size.secondary,fontWeight:'800'},
  row:{gap:12,paddingHorizontal:6,paddingBottom:8,paddingTop:10},
  mediaCard:{borderRadius:14,borderWidth:2,borderColor:'transparent',paddingBottom:2,overflow:'visible'},
  posterWrap:{width:SHASHTNA_THEME.layout.compactW,overflow:'visible'},
  poster:{borderRadius:16,overflow:'hidden',backgroundColor:'#0B1627',borderWidth:1},
  posterImage:{width:'100%',height:'100%',resizeMode:'cover'},
  posterFallback:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#102038'},
  posterTitle:{fontSize:SHASHTNA_THEME.typography.size.cardTitle,fontWeight:'800',lineHeight:22,marginTop:9,paddingHorizontal:2},
  favoriteButton:{position:'absolute',right:8,top:8,width:34,height:34,borderRadius:12,backgroundColor:'rgba(3,10,18,.78)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.16)'},
  favoriteButtonActive:{backgroundColor:'rgba(23,136,255,.84)',borderColor:'#7CC4FF'},
  favoriteButtonFocused:{borderColor:'#FFFFFF',borderWidth:2,transform:[{scale:1.08}]},
  favoriteButtonPressed:{opacity:.78},
  focused:{transform:[{scale:1.08}],borderColor:'#FFFFFF',borderWidth:2,backgroundColor:'rgba(255,255,255,0.05)',shadowColor:'#030810',shadowOpacity:.28,shadowRadius:8,elevation:6,zIndex:50},
  pressed:{opacity:.84},
  categoryRow:{marginTop:32,flexDirection:'row',gap:16},
  quickCard:{flex:1,minHeight:92,borderRadius:20,borderWidth:1,padding:16,flexDirection:'row',alignItems:'center',gap:14},
  quickIcon:{width:44,height:44,borderRadius:14,backgroundColor:'rgba(23,136,255,.12)',alignItems:'center',justifyContent:'center'},
  quickTitle:{fontSize:SHASHTNA_THEME.typography.size.button,fontWeight:'900'},
  quickSub:{fontSize:SHASHTNA_THEME.typography.size.caption,marginTop:4},
});


