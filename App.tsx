import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import PlayerScreen from './src/screens/Player/PlayerScreen';
import LiveScreen from './src/screens/Live/LiveScreen';
import HomeScreen from './src/screens/Home/HomeScreen';
import MoviesScreen from './src/screens/Movies/MoviesScreen';
import SeriesScreen from './src/screens/Series/SeriesScreen';
import ConnectionScreen from './src/screens/Connection/ConnectionScreen';
import SettingsScreen, { PreferredQuality } from './src/screens/Settings/SettingsScreen';
import { SHASHTNA_FONT, SHASHTNA_THEME } from './src/design/theme';
import AppIcon, { AppIconName } from './src/components/common/AppIcon';
import { AppPreferencesProvider, useAppPreferences } from './src/design/AppPreferencesContext';

import {
  M3UChannel,
  M3UContentType,
  buildXtreamM3UUrl,
  downloadAndParseM3U,
  getSeriesFirstEpisode,
} from './src/lib/m3u';

import {
  getTmdbMetadata,
  tmdbImageUrl,
  TmdbMediaMetadata,
} from './src/lib/tmdb';

import {
  clearConnectionSource,
  loadConnectionSource,
  saveConnectionSource,
} from './src/lib/connectionSession';

type ConnectionMode =
  | 'm3u'
  | 'xtream';

type ContentType =
  M3UContentType;

type AppLanguage = 'ar' | 'en';
type ThemeMode = 'dark' | 'light';
type NavItem = { id: string; label: string; icon: AppIconName };

function getNavItems(language: AppLanguage): NavItem[] {
  const ar = language === 'ar';
  return [
    { id: 'home', label: ar ? 'الرئيسية' : 'Home', icon: 'home' },
    { id: 'live', label: ar ? 'البث المباشر' : 'Live TV', icon: 'live' },
    { id: 'movies', label: ar ? 'الأفلام' : 'Movies', icon: 'movies' },
    { id: 'series', label: ar ? 'المسلسلات' : 'Series', icon: 'series' },
    { id: 'favorites', label: ar ? 'المفضلة' : 'Favorites', icon: 'favorites' },
    { id: 'settings', label: ar ? 'الإعدادات' : 'Settings', icon: 'settings' },
  ];
}

/*
 * مهم جداً:
 *
 * App لا يخمّن نوع Xtream من اسم المجموعة.
 *
 * m3u.ts هو المسؤول عن إعطاء:
 * live / movie / series
 *
 * وبالنسبة لمصدر Xtream:
 *
 * get_live_streams -> live
 * get_vod_streams  -> movie
 * get_series       -> series
 */
function getDetectedContentType(
  channel: M3UChannel,
): ContentType {
  return channel.contentType;
}

function cleanDisplayTitle(
  value: string,
  type: 'movie' | 'series',
): string {
  let result =
    String(value || '');

  result = result
    .replace(
      /\[[^\]]*\]/g,
      ' ',
    )
    .replace(
      /\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi,
      ' ',
    );

  if (
    type === 'series'
  ) {
    result = result
      .replace(
        /\bS\d{1,2}\s*E\d{1,3}\b/gi,
        ' ',
      )
      .replace(
        /\bS\d{1,2}\b/gi,
        ' ',
      )
      .replace(
        /\bE\d{1,3}\b/gi,
        ' ',
      )
      .replace(
        /\b(?:episode|ep|الحلقة|حلقة)\s*\d+\b/gi,
        ' ',
      )
      .replace(
        /\b(?:season|موسم)\s*\d+\b/gi,
        ' ',
      )
      .replace(
        /(^|[\s._-])\d{1,2}x\d{1,3}(\b|[\s._-])/gi,
        ' ',
      );
  }

  return result
    .replace(
      /\s*[-|•]\s*/g,
      ' ',
    )
    .replace(
      /[_]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

type MediaDisplayItem = {
  channel: M3UChannel;
  title: string;
  group: string;
  episodeCount: number;
};

function buildMediaDisplayItems(
  channels: M3UChannel[],
  type: 'movie' | 'series',
): MediaDisplayItem[] {
  const map =
    new Map<
      string,
      MediaDisplayItem
    >();

  for (
    const channel of channels
  ) {
    /*
     * هذا هو الفلتر الأساسي.
     *
     * Live لا يدخل هنا إطلاقاً.
     * Movie فقط للأفلام.
     * Series فقط للمسلسلات.
     */
    if (
      getDetectedContentType(
        channel,
      ) !== type
    ) {
      continue;
    }

    const title =
      cleanDisplayTitle(
        channel.name,
        type,
      );

    /*
     * المسلسلات:
     * نجمع الحلقات تحت مسلسل واحد
     *
     * الأفلام:
     * Xtream يعطي الفيلم كعنصر مستقل،
     * لذلك كل فيلم يبقى بطاقة مستقلة.
     */
    const key =
      type === 'series'
        ? (
            title ||
            channel.name
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              ' ',
            )
            .trim()
        : channel.id;

    const mapKey =
      key ||
      channel.id;

    const existing =
      map.get(
        mapKey,
      );

    if (existing) {
      existing.episodeCount +=
        1;

      if (
        !existing.channel.logo &&
        channel.logo
      ) {
        existing.channel =
          channel;
      }

      continue;
    }

    map.set(
      mapKey,
      {
        channel,
        title:
          title ||
          channel.name,
        group:
          channel.group ||
          '',
        episodeCount: 1,
      },
    );
  }

  return Array.from(
    map.values(),
  );
}

function BrandMark() {
  return (
    <View style={styles.brandWrap}>
      <View style={styles.brandIcon}>
        <Text
          style={
            styles.brandIconText
          }
        >
          ش
        </Text>
      </View>

      <View>
        <Text
          style={
            styles.brandArabic
          }
        >
          عبدالرحمن IPTV
        </Text>

        <Text
          style={
            styles.brandEnglish
          }
        >
          ABDULRAHMAN IPTV
        </Text>
      </View>
    </View>
  );
}

function Sidebar({
  activeNav,
  onNavigate,
  onChangeSource,
  language = 'ar',
  themeMode = 'dark',
}: {
  activeNav: string;
  onNavigate: (id: string) => void;
  onChangeSource: () => void;
  language?: AppLanguage;
  themeMode?: ThemeMode;
}) {
  const navItems = getNavItems(language);
  const light = themeMode === 'light';
  const sidebarBg = light ? '#FFFFFF' : '#071321';
  const border = light ? '#DCE7F2' : '#1C3A5A';
  const text = light ? '#23364A' : '#D9E5F2';
  return (
    <View
      style={[styles.sidebar, { backgroundColor: sidebarBg, borderColor: border, borderRightWidth: language === 'ar' ? 0 : 1, borderLeftWidth: language === 'ar' ? 1 : 0 }]}
    >
      <BrandMark />

      <View
        style={
          styles.sidebarDivider
        }
      />

      <Text
        style={
          styles.sidebarCaption
        }
      >
        {language === 'ar' ? 'القائمة الرئيسية' : 'Main menu'}
      </Text>

      <View
        style={
          styles.navigation
        }
      >
        {navItems.map(
          item => {
            const active =
              activeNav ===
              item.id;

            return (
              <Pressable
                key={
                  item.id
                }
                focusable
                accessibilityRole="button"
                accessibilityLabel={
                  item.label
                }
                onPress={() =>
                  onNavigate(
                    item.id,
                  )
                }
                style={({
                  focused,
                  pressed,
                }) => [
                  styles.navItem,
                  { flexDirection: language === 'ar' ? 'row-reverse' : 'row', borderColor: light ? '#DDE8F3' : 'transparent' },
                  active && { backgroundColor: light ? '#EAF3FF' : SHASHTNA_THEME.colors.primarySoft, borderColor: light ? '#8EC4FF' : SHASHTNA_THEME.colors.primary },
                  focused &&
                    styles.navItemFocused,
                  pressed &&
                    styles.navItemPressed,
                ]}
              >
                <View
                  style={[
                    styles.navIconBox,
                    active &&
                      styles.navIconBoxActive,
                  ]}
                >
                  <AppIcon
                    name={item.icon}
                    active={active}
                    size={20}
                  />
                </View>

                <Text
                  style={[
                    styles.navLabel,
                    { writingDirection: language === 'ar' ? 'rtl' : 'ltr', textAlign: language === 'ar' ? 'right' : 'left', color: active ? (light ? '#0867CE' : '#FFFFFF') : text },
                    active && styles.navLabelActive,
                  ]}
                >
                  {
                    item.label
                  }
                </Text>

                {active ? (
                  <View
                    style={[styles.navActiveLine, language === 'ar' ? styles.navActiveLineRtl : styles.navActiveLineLtr]}
                  />
                ) : null}
              </Pressable>
            );
          },
        )}
      </View>

      <View
        style={
          styles.sidebarBottom
        }
      >
        <View
          style={
            styles.sidebarDividerSmall
          }
        />

        <Pressable
          focusable
          accessibilityRole="button"
          onPress={
            onChangeSource
          }
          style={({
            focused,
            pressed,
          }) => [
            styles.sourceButton,
            focused &&
              styles.sourceButtonFocused,
            pressed &&
              styles.sourceButtonPressed,
          ]}
        >
          <View style={styles.sourceIconBox}>
            <AppIcon name="source" size={18} />
          </View>

          <View>
            <Text
              style={
                styles.sourceTitle
              }
            >
              تغيير المصدر
            </Text>

            <Text
              style={
                styles.sourceSubtitle
              }
            >
              M3U / Xtream
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function Home({
  channels,
  channelCount,
  movieCount,
  seriesCount,
  onNavigate,
  onOpenPlayer,
  favoriteIds,
  onToggleFavorite,
}: {
  channels: M3UChannel[];
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  onNavigate: (
    page:
      | 'home'
      | 'live'
      | 'movies'
      | 'series'
      | 'favorites'
      | 'search'
      | 'settings',
  ) => void;
  onOpenPlayer: (
    channel: M3UChannel,
  ) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (channel: M3UChannel) => void;
}) {
  return (
    <HomeScreen
      channels={
        channels
      }
      channelCount={
        channelCount
      }
      movieCount={
        movieCount
      }
      seriesCount={
        seriesCount
      }
      onNavigate={
        onNavigate
      }
      onOpenPlayer={
        onOpenPlayer
      }
      favoriteIds={favoriteIds}
      onToggleFavorite={onToggleFavorite}
    />
  );
}

function PageHeader({
  kicker,
  title,
  description,
  count,
}: {
  kicker: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <View
      style={
        styles.pageHeader
      }
    >
      <View
        style={
          styles.pageHeaderText
        }
      >
        <Text
          style={
            styles.pageEyebrow
          }
        >
          {kicker}
        </Text>

        <Text
          style={
            styles.pageTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.pageDescription
          }
        >
          {description}
        </Text>
      </View>

      <View
        style={
          styles.pageCount
        }
      >
        <Text
          style={
            styles.pageCountNumber
          }
        >
          {count.toString()}
        </Text>

        <Text
          style={
            styles.pageCountLabel
          }
        >
          عنصر
        </Text>
      </View>
    </View>
  );
}

function SearchBox({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (
    value: string,
  ) => void;
  placeholder: string;
}) {
  return (
    <View
      style={
        styles.searchBox
      }
    >
      <View
        style={
          styles.searchIconBox
        }
      >
        <AppIcon name="search" size={17} />
      </View>

      <TextInput
        value={
          value
        }
        onChangeText={
          onChangeText
        }
        placeholder={
          placeholder
        }
        placeholderTextColor="#5D7698"
        style={
          styles.searchInput
        }
        autoCapitalize="none"
        autoCorrect={false}
      />

      {value ? (
        <Text
          style={
            styles.searchHint
          }
        >
          نتائج مباشرة
        </Text>
      ) : null}
    </View>
  );
}

function CategoryBar({
  groups,
  selectedGroup,
  onSelect,
}: {
  groups: string[];
  selectedGroup: string;
  onSelect: (
    value: string,
  ) => void;
}) {
  return (
    <View
      style={
        styles.categoryWrap
      }
    >
      <Text
        style={
          styles.categoryLabel
        }
      >
        التصنيفات
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.categoryContent
        }
      >
        {groups.map(
          group => {
            const active =
              selectedGroup ===
              group;

            return (
              <Pressable
                key={
                  group
                }
                focusable
                onPress={() =>
                  onSelect(
                    group,
                  )
                }
                style={({
                  focused,
                  pressed,
                }) => [
                  styles.categoryButton,
                  active &&
                    styles.categoryButtonActive,
                  focused &&
                    styles.categoryButtonFocused,
                  pressed &&
                    styles.categoryButtonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    active &&
                      styles.categoryTextActive,
                  ]}
                >
                  {
                    group
                  }
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>
    </View>
  );
}

function MediaCard({
  item,
  type,
  onPress,
}: {
  item: MediaDisplayItem;
  type:
    | 'movie'
    | 'series';
  onPress: (
    channel: M3UChannel,
  ) => void;
}) {
  const [
    metadata,
    setMetadata,
  ] =
    useState<TmdbMediaMetadata | null>(
      null,
    );

  const [
    imageFailed,
    setImageFailed,
  ] = useState(false);

  const searchChannel =
    useMemo(
      () => ({
        ...item.channel,
        name:
          item.title ||
          item.channel.name,
      }),
      [
        item.channel,
        item.title,
      ],
    );

  useEffect(() => {
    let mounted =
      true;

    setMetadata(
      null,
    );

    setImageFailed(
      false,
    );

    getTmdbMetadata(
      searchChannel,
      type,
    ).then(
      result => {
        if (
          mounted
        ) {
          setMetadata(
            result,
          );
        }
      },
    );

    return () => {
      mounted =
        false;
    };
  }, [
    searchChannel,
    type,
  ]);

  const tmdbPoster =
    tmdbImageUrl(
      metadata?.posterPath,
      'w500',
    );

  const imageUrl =
    !imageFailed
      ? tmdbPoster ||
        searchChannel.logo
      : searchChannel.logo;

  const displayTitle =
    metadata?.title ||
    item.title;

  const releaseYear =
    metadata?.releaseDate &&
    /^\d{4}/.test(
      metadata.releaseDate,
    )
      ? metadata.releaseDate.slice(
          0,
          4,
        )
      : '';

  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={
        `${type === 'movie' ? 'فيلم' : 'مسلسل'} ${displayTitle}`
      }
      onPress={() =>
        onPress(
          item.channel,
        )
      }
      style={({
        focused,
        pressed,
      }) => [
        styles.mediaCard,
        focused &&
          styles.mediaCardFocused,
        pressed &&
          styles.mediaCardPressed,
      ]}
    >
      <View
        style={
          styles.mediaArtwork
        }
      >
        {imageUrl ? (
          <Image
            source={{
              uri: imageUrl,
            }}
            style={
              styles.mediaImage
            }
            resizeMode="cover"
            onError={() =>
              setImageFailed(
                true,
              )
            }
          />
        ) : (
          <View
            style={
              styles.mediaFallback
            }
          >
            <View
              style={
                styles.mediaFallbackIcon
              }
            >
              <AppIcon name={type === 'movie' ? 'movies' : 'series'} size={30} />
            </View>
          </View>
        )}

        <View
          style={
            styles.mediaBottomFade
          }
        />

        <View
          style={
            styles.mediaTypeBadge
          }
        >
          <View
            style={
              styles.mediaTypeDot
            }
          />

          <Text
            style={
              styles.mediaTypeText
            }
          >
            {type ===
            'movie'
              ? 'فيلم'
              : 'مسلسل'}
          </Text>
        </View>

        {metadata?.voteAverage &&
        metadata.voteAverage >
          0 ? (
          <View
            style={
              styles.mediaRating
            }
          >
            <AppIcon name="star" size={11} color={SHASHTNA_THEME.colors.rating} />

            <Text
              style={
                styles.mediaRatingText
              }
            >
              {metadata.voteAverage.toFixed(
                1,
              )}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={
          styles.mediaInfo
        }
      >
        <Text
          numberOfLines={
            2
          }
          style={
            styles.mediaName
          }
        >
          {
            displayTitle
          }
        </Text>

        <Text
          numberOfLines={
            1
          }
          style={
            styles.mediaMeta
          }
        >
          {type ===
          'series'
            ? `${item.episodeCount} حلقة${
                releaseYear
                  ? ` • ${releaseYear}`
                  : ''
              }`
            : releaseYear ||
              item.group ||
              'فيلم'}
        </Text>
      </View>
    </Pressable>
  );
}

function LiveTV({
  channels,
  onOpenPlayer,
  onBackHome,
}: {
  channels: M3UChannel[];
  onOpenPlayer: (
    channel: M3UChannel,
  ) => void;
  onBackHome: () => void;
}) {
  /*
   * Live page يستقبل فقط:
   * contentType === live
   */
  const liveChannels =
    useMemo(
      () =>
        channels.filter(
          channel =>
            channel.contentType ===
            'live',
        ),
      [channels],
    );

  return (
    <LiveScreen
      channels={
        liveChannels
      }
      onOpenPlayer={
        onOpenPlayer
      }
      onBackHome={
        onBackHome
      }
    />
  );
}

function MediaLibrary({
  title,
  type,
  channels,
  onOpenPlayer,
}: {
  title: string;
  type:
    | 'movie'
    | 'series';
  channels: M3UChannel[];
  onOpenPlayer: (
    channel: M3UChannel,
  ) => void;
}) {
  const items =
    useMemo(
      () =>
        buildMediaDisplayItems(
          channels,
          type,
        ),
      [
        channels,
        type,
      ],
    );

  const groups =
    useMemo(
      () => [
        'الكل',
        ...Array.from(
          new Set(
            items
              .map(
                item =>
                  item.group,
              )
              .filter(
                Boolean,
              ),
          ),
        ),
      ],
      [items],
    );

  const [
    selectedGroup,
    setSelectedGroup,
  ] = useState(
    'الكل',
  );

  const [
    search,
    setSearch,
  ] = useState('');

  useEffect(() => {
    setSelectedGroup(
      'الكل',
    );

    setSearch(
      '',
    );
  }, [type]);

  const filtered =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return items.filter(
          item => {
            const groupMatch =
              selectedGroup ===
                'الكل' ||
              item.group ===
                selectedGroup;

            const titleMatch =
              !query ||
              item.title
                .toLowerCase()
                .includes(
                  query,
                );

            const groupSearchMatch =
              !query ||
              item.group
                .toLowerCase()
                .includes(
                  query,
                );

            return (
              groupMatch &&
              (
                titleMatch ||
                groupSearchMatch
              )
            );
          },
        );
      },
      [
        items,
        selectedGroup,
        search,
      ],
    );

  return (
    <View
      style={
        styles.main
      }
    >
      <FlatList
        data={
          filtered
        }
        keyExtractor={
          item =>
            `${type}:${item.channel.id}`
        }
        numColumns={6}
        columnWrapperStyle={
          styles.mediaRow
        }
        contentContainerStyle={
          styles.libraryContent
        }
        showsVerticalScrollIndicator={
          false
        }
        ListHeaderComponent={
          <View>
            <PageHeader
              kicker={
                type ===
                'movie'
                  ? 'MOVIES'
                  : 'SERIES'
              }
              title={
                title
              }
              description={
                type ===
                'movie'
                  ? `${filtered.length.toString()} فيلم متاح`
                  : `${filtered.length.toString()} مسلسل متاح`
              }
              count={
                filtered.length
              }
            />

            <SearchBox
              value={
                search
              }
              onChangeText={
                setSearch
              }
              placeholder={
                type ===
                'movie'
                  ? 'ابحث عن فيلم...'
                  : 'ابحث عن مسلسل...'
              }
            />

            <CategoryBar
              groups={
                groups
              }
              selectedGroup={
                selectedGroup
              }
              onSelect={
                setSelectedGroup
              }
            />
          </View>
        }
        renderItem={({
          item,
        }) => (
          <MediaCard
            item={
              item
            }
            type={
              type
            }
            onPress={
              onOpenPlayer
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={type === 'movie' ? 'movies' : 'series'}
            title={
              type ===
              'movie'
                ? 'ماكو أفلام'
                : 'ماكو مسلسلات'
            }
            text={
              type ===
              'movie'
                ? 'ما تم العثور على أفلام VOD بالمصدر الحالي.'
                : 'ما تم العثور على مسلسلات بالمصدر الحالي.'
            }
          />
        }
      />
    </View>
  );
}

function EmptyState({ icon, title, text }: { icon: AppIconName; title: string; text: string }) {
  return (
    <View
      style={
        styles.emptyState
      }
    >
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={28} />
      </View>

      <Text
        style={
          styles.emptyTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.emptyText
        }
      >
        {text}
      </Text>
    </View>
  );
}

function Player({
  channel,
  onBack,
  preferredQuality,
  autoplay,
  subtitles,
}: {
  channel: M3UChannel;
  onBack: () => void;
  preferredQuality: PreferredQuality;
  autoplay: boolean;
  subtitles: boolean;
}) {
  return (
    <PlayerScreen
      channel={channel}
      onBack={onBack}
      preferredQuality={preferredQuality}
      autoplay={autoplay}
      subtitles={subtitles}
    />
  );
}


function FavoritesPage({
  channels,
  favoriteIds,
  onOpenPlayer,
  onToggleFavorite,
}: {
  channels: M3UChannel[];
  favoriteIds: Set<string>;
  onOpenPlayer: (channel: M3UChannel) => void;
  onToggleFavorite: (channel: M3UChannel) => void;
}) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const movieItems = useMemo(() => buildMediaDisplayItems(channels, 'movie'), [channels]);
  const seriesItems = useMemo(() => buildMediaDisplayItems(channels, 'series'), [channels]);

  const items = useMemo(
    () => [
      ...movieItems.map(item => ({ ...item, type: 'movie' as const })),
      ...seriesItems.map(item => ({ ...item, type: 'series' as const })),
    ].filter(item => favoriteIds.has(`${item.type}:${String(item.channel.id)}`)),
    [movieItems, seriesItems, favoriteIds],
  );

  return (
    <View style={styles.favoritePage}>
      <View style={styles.favoriteHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageEyebrow}>ABDULRAHMAN IPTV</Text>
          <Text style={styles.pageTitle}>{ar ? 'المفضلة' : 'Favorites'}</Text>
          <Text style={styles.pageDescription}>
            {items.length
              ? `${items.length} ${ar ? 'عنصر محفوظ في قائمتك.' : items.length === 1 ? 'item saved to your list.' : 'items saved to your list.'}`
              : (ar ? 'احفظ الأفلام والمسلسلات التي تريد الرجوع لها بسرعة.' : 'Save movies and series you want to find quickly.')}
          </Text>
        </View>
        <View style={styles.favoriteCountPill}>
          <AppIcon name="favorites" size={15} color={SHASHTNA_THEME.colors.rating} />
          <Text style={styles.favoriteCountText}>{items.length}</Text>
        </View>
      </View>

      {items.length ? (
        <FlatList
          data={items}
          keyExtractor={item => `favorite:${item.type}:${item.channel.id}`}
          numColumns={5}
          columnWrapperStyle={styles.favoriteGridRow}
          contentContainerStyle={styles.favoriteGrid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const poster = item.channel.logo || '';
            return (
              <Pressable
                focusable
                onPress={() => onOpenPlayer(item.channel)}
                style={({ focused, pressed }) => [
                  styles.favoriteMediaCard,
                  focused && styles.favoriteMediaCardFocused,
                  pressed && styles.favoriteMediaCardPressed,
                ]}
              >
                <View style={styles.favoritePoster}>
                  {poster ? (
                    <Image
                      source={{ uri: poster }}
                      style={styles.favoritePosterImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.favoritePosterFallback}>
                      <AppIcon
                        name={item.type === 'movie' ? 'movies' : 'series'}
                        size={28}
                      />
                    </View>
                  )}

                  <Pressable
                    focusable
                    accessibilityRole="button"
                    accessibilityLabel={ar ? 'إزالة من قائمتي' : 'Remove from My List'}
                    onPress={(event: any) => {
                      event?.stopPropagation?.();
                      onToggleFavorite(item.channel);
                    }}
                    style={({ focused, pressed }) => [
                      styles.favoriteRemove,
                      focused && styles.focusRing,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppIcon
                      name="favorite"
                      size={13}
                      color={SHASHTNA_THEME.colors.rating}
                    />
                  </Pressable>

                  <View style={styles.favoriteTypeBadge}>
                    <Text style={styles.favoriteTypeText}>
                      {item.type === 'movie' ? (ar ? 'فيلم' : 'Movie') : (ar ? 'مسلسل' : 'Series')}
                    </Text>
                  </View>
                </View>
                <Text numberOfLines={2} style={styles.favoriteMediaTitle}>
                  {item.title}
                </Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <View style={styles.favoriteEmpty}>
          <View style={styles.favoriteEmptyIcon}>
            <AppIcon name="favorites" size={30} active />
          </View>
          <Text style={styles.favoriteTitle}>{ar ? 'قائمتك فارغة حالياً' : 'Your list is empty'}</Text>
          <Text style={styles.favoriteText}>
            {ar ? 'من بطاقات الأفلام والمسلسلات اضغط رمز القلب لإضافة المحتوى إلى هنا.' : 'Press the heart on any movie or series card to add it here.'}
          </Text>
        </View>
      )}
    </View>
  );
}

function App() {
  const [
    channels,
    setChannels,
  ] = useState<
    M3UChannel[]
  >([]);

  const [
    source,
    setSource,
  ] = useState('');

  const [
    activeNav,
    setActiveNav,
  ] = useState(
    'home',
  );

  const [
    selectedChannel,
    setSelectedChannel,
  ] =
    useState<M3UChannel | null>(
      null,
    );

  const [
    preferredQuality,
    setPreferredQuality,
  ] = useState<PreferredQuality>(
    'auto',
  );

  const [
    autoplay,
    setAutoplay,
  ] = useState(true);

  const [
    subtitles,
    setSubtitles,
  ] = useState(false);

  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [restoringConnection, setRestoringConnection] = useState(true);

  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageTranslate = useRef(new Animated.Value(0)).current;
  const pageScale = useRef(new Animated.Value(1)).current;
  const firstPageRender = useRef(true);

  useEffect(() => {
    if (firstPageRender.current) {
      firstPageRender.current = false;
      return;
    }

    pageOpacity.stopAnimation();
    pageTranslate.stopAnimation();
    pageOpacity.setValue(0);
    pageTranslate.setValue(6);
    pageScale.setValue(0.992);

    Animated.parallel([
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pageTranslate, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pageScale, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeNav, pageOpacity, pageScale, pageTranslate]);

  /*
   * Live:
   * فقط channel.contentType === live
   */
  const liveCount =
    useMemo(
      () =>
        channels.filter(
          channel =>
            channel.contentType ===
            'live',
        ).length,
      [channels],
    );

  /*
   * Movies:
   * فقط get_vod_streams في Xtream
   */
  const movieCount =
    useMemo(
      () =>
        buildMediaDisplayItems(
          channels,
          'movie',
        ).length,
      [channels],
    );

  /*
   * Series:
   * فقط get_series في Xtream
   */
  const seriesCount =
    useMemo(
      () =>
        buildMediaDisplayItems(
          channels,
          'series',
        ).length,
      [channels],
    );

  useEffect(() => {
    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (
            selectedChannel
          ) {
            setSelectedChannel(
              null,
            );

            return true;
          }

          if (
            activeNav !==
            'home'
          ) {
            setActiveNav(
              'home',
            );

            return true;
          }

          return false;
        },
      );

    return () =>
      subscription.remove();
  }, [
    activeNav,
    selectedChannel,
  ]);

  useEffect(() => {
    let alive = true;

    const restoreSavedConnection = async () => {
      try {
        const savedSource = await loadConnectionSource();

        if (!savedSource) {
          return;
        }

        console.log('[Shashtna] Restoring saved connection...');

        const restoredChannels = await downloadAndParseM3U(savedSource);

        if (!alive || restoredChannels.length === 0) {
          return;
        }

        console.log(
          '[Shashtna] Restored channels:',
          restoredChannels.length,
        );

        setChannels(restoredChannels);
        setSource(savedSource);
        setActiveNav('home');
        setSelectedChannel(null);
      } catch (error) {
        console.warn('[Shashtna] Saved connection restore failed:', error);
      } finally {
        if (alive) {
          setRestoringConnection(false);
        }
      }
    };

    restoreSavedConnection();

    return () => {
      alive = false;
    };
  }, []);

  const handleConnected =
    (
      parsedChannels: M3UChannel[],
      playlistSource: string,
    ) => {
      void saveConnectionSource(playlistSource);

      setRestoringConnection(false);

      console.log(
        '[Shashtna] Loaded channels:',
        parsedChannels.length,
      );

      /*
       * هذا هو المكان الذي تدخل فيه
       * بيانات Xtream/ M3U إلى التطبيق.
       */
      setChannels(
        parsedChannels,
      );

      setSource(
        playlistSource,
      );

      setActiveNav(
        'home',
      );

      setSelectedChannel(
        null,
      );
    };

  const handleChangeSource =
    () => {
      void clearConnectionSource();

      setRestoringConnection(false);

      setSelectedChannel(
        null,
      );

      setChannels(
        [],
      );

      setSource(
        '',
      );

      setActiveNav(
        'home',
      );
    };

  const handleBackHome =
    () => {
      setSelectedChannel(
        null,
      );

      setActiveNav(
        'home',
      );
    };

  const favoriteKey = (channel: M3UChannel) =>
    `${channel.contentType}:${String(channel.id)}`;

  const toggleFavorite = (channel: M3UChannel) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      const key = favoriteKey(channel);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /*
   * فتح عنصر:
   *
   * Movie -> Player مباشرة
   * Live  -> Player مباشرة
   * Series -> نجيب أول حلقة حالياً
   */
  const handleOpenPlayer =
    async (
      channel: M3UChannel,
    ) => {
      if (
        channel.contentType ===
          'series' &&
        channel.contentKey?.startsWith(
          'xtream-series:',
        )
      ) {
        try {
          const episode =
            await getSeriesFirstEpisode(
              channel,
            );

          if (
            episode &&
            episode.url
          ) {
            setSelectedChannel(
              episode,
            );

            return;
          }

          console.warn(
            '[Shashtna] No episode found for series:',
            channel.name,
          );
        } catch (
          error
        ) {
          console.warn(
            '[Shashtna] Failed to load series:',
            error,
          );
        }

        return;
      }

      if (
        channel.url
      ) {
        setSelectedChannel(
          channel,
        );
      }
    };

  if (restoringConnection) {
    return (
      <AppPreferencesProvider
        value={{
          language,
          setLanguage,
          themeMode,
          setThemeMode,
        }}
      >
        <View style={[styles.container, styles.restoringConnectionScreen]}>
          <ActivityIndicator
            size="large"
            color={SHASHTNA_THEME.colors.primaryBright}
          />
          <Text style={styles.restoringConnectionTitle}>
            استعادة الاشتراك...
          </Text>
          <Text style={styles.restoringConnectionSubtitle}>
            جاري تجهيز مكتبتك تلقائياً
          </Text>
        </View>
      </AppPreferencesProvider>
    );
  }

  if (
    !source ||
    channels.length ===
      0
  ) {
    return (
      <AppPreferencesProvider
        value={{
          language,
          setLanguage,
          themeMode,
          setThemeMode,
        }}
      >
        <View
          style={
            styles.container
          }
        >
          <StatusBar
            barStyle="light-content"
            backgroundColor="#050C18"
          />

          <ConnectionScreen
            onConnected={
              handleConnected
            }
          />
        </View>
      </AppPreferencesProvider>
    );
  }

  if (
    selectedChannel
  ) {
    return (
      <AppPreferencesProvider
        value={{
          language,
          setLanguage,
          themeMode,
          setThemeMode,
        }}
      >
        <View
          style={
            styles.container
          }
        >
          <StatusBar hidden />

          <Player
            channel={
              selectedChannel
            }
            preferredQuality={
              preferredQuality
            }
            autoplay={
              autoplay
            }
            subtitles={
              subtitles
            }
            onBack={() =>
              setSelectedChannel(
                null,
              )
            }
          />
        </View>
      </AppPreferencesProvider>
    );
  }

  let page:
    | React.ReactNode;

  if (
    activeNav ===
    'live'
  ) {
    page = (
      <LiveTV
        channels={
          channels
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        onBackHome={
          handleBackHome
        }
      />
    );
  } else if (
    activeNav ===
    'movies'
  ) {
    page = (
      <MoviesScreen
        channels={
          channels
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        onNavigate={
          setActiveNav
        }
        onBack={() =>
          setActiveNav('home')
        }
        favoriteIds={Array.from(favoriteIds)}
        onToggleFavorite={toggleFavorite}
      />
    );
  } else if (
    activeNav ===
    'series'
  ) {
    page = (
      <SeriesScreen
        channels={
          channels
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        onNavigate={
          setActiveNav
        }
        onBack={() =>
          setActiveNav('home')
        }
        favoriteIds={Array.from(favoriteIds)}
        onToggleFavorite={toggleFavorite}
      />
    );
  } else if (
    activeNav ===
    'settings'
  ) {
    page = (
      <SettingsScreen
        preferredQuality={
          preferredQuality
        }
        setPreferredQuality={
          setPreferredQuality
        }
        autoplay={
          autoplay
        }
        setAutoplay={
          setAutoplay
        }
        subtitles={
          subtitles
        }
        language={language}
        setLanguage={setLanguage}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        setSubtitles={
          setSubtitles
        }
        onChangeSource={
          handleChangeSource
        }
        onBack={() =>
          setActiveNav(
            'home',
          )
        }
      />
    );
  } else if (
    activeNav ===
    'favorites'
  ) {
    page = (
      <FavoritesPage
        channels={channels}
        favoriteIds={favoriteIds}
        onOpenPlayer={handleOpenPlayer}
        onToggleFavorite={toggleFavorite}
      />
    );
  } else {
    page = (
      <Home
        channels={
          channels
        }
        channelCount={
          liveCount
        }
        movieCount={
          movieCount
        }
        seriesCount={
          seriesCount
        }
        onNavigate={
          setActiveNav
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        favoriteIds={Array.from(favoriteIds)}
        onToggleFavorite={toggleFavorite}
      />
    );
  }

  return (
    <AppPreferencesProvider
      value={{
        language,
        setLanguage,
        themeMode,
        setThemeMode,
      }}
    >
      <View style={styles.container}>
        <StatusBar
          barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={themeMode === 'light' ? '#F4F7FB' : '#050C18'}
        />
        <Animated.View
          style={[
            styles.pageTransition,
            {
              opacity: pageOpacity,
              transform: [
                { translateY: pageTranslate },
                { scale: pageScale },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.layout,
              { flexDirection: language === 'ar' ? 'row-reverse' : 'row' },
            ]}
          >
            <Sidebar
              activeNav={activeNav}
              onNavigate={setActiveNav}
              onChangeSource={handleChangeSource}
              language={language}
              themeMode={themeMode}
            />
            <View
              style={[
                styles.mainSurface,
                {
                  backgroundColor:
                    themeMode === 'light'
                      ? '#F4F7FB'
                      : SHASHTNA_THEME.colors.background,
                },
              ]}
            >
              {page}
            </View>
          </View>
        </Animated.View>
      </View>
    </AppPreferencesProvider>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.backgroundDeep,
    },

    restoringConnectionScreen: {
      alignItems: 'center',
      justifyContent: 'center',
    },

    restoringConnectionTitle: {
      color: SHASHTNA_THEME.colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      marginTop: 8,
    },

    restoringConnectionSubtitle: {
      color: SHASHTNA_THEME.colors.textSecondary,
      fontSize: 13,
    },

    pageTransition: {
      flex: 1,
    },

    layout: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: SHASHTNA_THEME.colors.backgroundDeep,
    },

    sidebar: {
      width: 184,
      backgroundColor:
        SHASHTNA_THEME.colors.backgroundSoft,
      borderRightWidth: 1,
      borderRightColor:
        '#12243D',
      paddingHorizontal: 16,
      paddingTop: 27,
      paddingBottom: 27,
    },

    brandWrap: {
      minHeight: 58,
      flexDirection:
        'row',
      alignItems:
        'center',
      paddingHorizontal: 7,
    },

    brandIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor:
        '#0F4F91',
      borderWidth: 1,
      borderColor:
        '#4EB5FF',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 11,
    },

    brandIconText: {
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight:
        '900',
    },

    brandArabic: {
      color: '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '900',
    },

    brandEnglish: {
      marginTop: 2,
      color: '#66BCFF',
      fontSize: 8,
      fontWeight:
        '900',
      letterSpacing: 2,
    },

    sidebarDivider: {
      height: 1,
      backgroundColor:
        '#132941',
      marginTop: 24,
      marginBottom: 19,
    },

    sidebarCaption: {
      color: '#4D6A8B',
      fontSize: 9,
      fontWeight:
        '900',
      letterSpacing: 1.4,
      paddingHorizontal: 8,
      marginBottom: 10,
    },

    navigation: {
      gap: 6,
    },

    navItem: {
      minHeight: 56,
      borderRadius: 16,
      paddingHorizontal: 12,
      flexDirection:
        'row',
      alignItems:
        'center',
      borderWidth: 1,
      borderColor:
        'transparent',
      position:
        'relative',
    },

    navItemActive: {
      backgroundColor:
        '#0C2C51',
      borderColor:
        '#153F69',
    },

    navItemFocused: {
      backgroundColor:
        '#11487D',
      borderColor:
        '#75C9FF',
      transform: [
        {
          scale: 1.02,
        },
      ],
    },

    navItemPressed: {
      opacity: 0.82,
    },

    navIconBox: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        '#0A2039',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    navIconBoxActive: {
      backgroundColor:
        '#1266B3',
    },

    navIcon: {
      color: '#6683A5',
      fontSize: 17,
      fontWeight:
        '900',
    },

    navIconActive: {
      color: '#FFFFFF',
    },

    navLabel: {
      fontFamily: SHASHTNA_FONT.sans,
      marginLeft: 10,
      color: '#8DA4C0',
      fontSize: 17,
      fontWeight:
        '800',
    },

    navLabelActive: {
      color: '#FFFFFF',
    },

    navActiveLine: {
      position: 'absolute',
      width: 3,
      height: 24,
      borderRadius: 2,
      backgroundColor: '#62C2FF',
    },

    navActiveLineLtr: { right: 0 },
    navActiveLineRtl: { left: 0 },

    sidebarBottom: {
      marginTop:
        'auto',
    },

    sidebarDividerSmall: {
      height: 1,
      backgroundColor:
        '#132941',
      marginBottom: 12,
    },

    sourceButton: {
      minHeight: 56,
      borderRadius: 16,
      paddingHorizontal: 10,
      flexDirection:
        'row',
      alignItems:
        'center',
      borderWidth: 1,
      borderColor:
        'transparent',
    },

    sourceButtonFocused: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderColor: '#FFFFFF',
    },

    sourceButtonPressed: {
      opacity: 0.85,
    },

    sourceIconBox: {
      width: 33,
      height: 33,
      borderRadius: 10,
      backgroundColor:
        SHASHTNA_THEME.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },

    sourceTitle: {
      color: '#A3B7CF',
      fontSize: 12,
      fontWeight:
        '900',
    },

    sourceSubtitle: {
      marginTop: 2,
      color: '#536D8C',
      fontSize: 9,
    },

    mainSurface: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor:
        SHASHTNA_THEME.colors.background,
    },

    main: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.background,
    },

    connectionScreen: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.backgroundDeep,
      overflow:
        'hidden',
    },

    connectionGlowLarge: {
      position:
        'absolute',
      width: 760,
      height: 760,
      borderRadius: 380,
      right: -240,
      top: -290,
      backgroundColor:
        '#0B5BA3',
      opacity: 0.11,
    },

    connectionGlowSmall: {
      position:
        'absolute',
      width: 430,
      height: 430,
      borderRadius: 215,
      left: -170,
      bottom: -180,
      backgroundColor:
        '#155CA0',
      opacity: 0.09,
    },

    connectionLayout: {
      flex: 1,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 65,
      gap: 70,
    },

    connectionIntro: {
      flex: 1,
      maxWidth: 650,
    },

    connectionIntroSpacer: {
      height: 65,
    },

    connectionKicker: {
      color: '#58B9FF',
      fontSize: 11,
      fontWeight:
        '900',
      letterSpacing: 2,
    },

    connectionBigTitle: {
      marginTop: 12,
      color: '#FFFFFF',
      fontSize: 49,
      lineHeight: 54,
      fontWeight:
        '900',
    },

    connectionLead: {
      marginTop: 19,
      maxWidth: 560,
      color: '#8FA7C1',
      fontSize: 16,
      lineHeight: 26,
    },

    connectionFeatures: {
      marginTop: 30,
      flexDirection:
        'row',
      gap: 11,
    },

    connectionFeature: {
      minWidth: 155,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor:
        '#091A2D',
      borderWidth: 1,
      borderColor:
        '#142C47',
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    connectionFeatureIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor:
        '#0E467D',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    connectionFeatureIconText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '900',
    },

    connectionFeatureTitle: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight:
        '900',
    },

    connectionFeatureText: {
      marginTop: 2,
      color: '#64809F',
      fontSize: 9,
    },

    connectionPanel: {
      width: 560,
      padding: 28,
      borderRadius: 24,
      backgroundColor:
        '#091828',
      borderWidth: 1,
      borderColor:
        '#17324E',
      shadowColor:
        '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 25,
      shadowOffset: {
        width: 0,
        height: 12,
      },
      elevation: 12,
    },

    panelTop: {
      flexDirection:
        'row',
      alignItems:
        'flex-start',
      justifyContent:
        'space-between',
    },

    panelEyebrow: {
      color: SHASHTNA_THEME.colors.primaryBright,
      fontSize: 9,
      fontWeight:
        '900',
      letterSpacing: 1.7,
    },

    panelTitle: {
      marginTop: 7,
      color: '#FFFFFF',
      fontSize: 28,
      fontWeight:
        '900',
    },

    panelDescription: {
      marginTop: 5,
      color: '#6C88A5',
      fontSize: 12,
    },

    panelStatus: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor:
        '#0A233D',
      borderWidth: 1,
      borderColor:
        '#173B5A',
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    panelStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        '#49DD89',
      marginRight: 6,
    },

    panelStatusText: {
      color: '#8FB39A',
      fontSize: 9,
      fontWeight:
        '900',
    },

    modeSwitch: {
      marginTop: 25,
      flexDirection:
        'row',
      gap: 9,
    },

    modeSwitchButton: {
      flex: 1,
      minHeight: 58,
      borderRadius: 16,
      backgroundColor:
        '#0A1C31',
      borderWidth: 1,
      borderColor:
        '#17324D',
      paddingHorizontal: 14,
      justifyContent:
        'center',
    },

    modeSwitchButtonActive: {
      backgroundColor:
        '#0D3A68',
      borderColor:
        '#338DCF',
    },

    modeSwitchButtonFocused: {
      borderColor:
        SHASHTNA_THEME.colors.focus,
      transform: [
        {
          scale: 1.025,
        },
      ],
    },

    modeSwitchButtonPressed: {
      opacity: 0.84,
    },

    modeSwitchTitle: {
      color: '#7892AF',
      fontSize: 17,
      fontWeight:
        '900',
    },

    modeSwitchTitleActive: {
      color: '#FFFFFF',
    },

    modeSwitchSub: {
      marginTop: 3,
      color: '#465F7B',
      fontSize: 9,
    },

    modeSwitchSubActive: {
      color: '#8ECFFF',
    },

    connectionForm: {
      marginTop: 18,
    },

    inputGroup: {
      marginTop: 11,
    },

    inputLabel: {
      marginBottom: 7,
      color: '#8CA6C2',
      fontSize: 10,
      fontWeight:
        '900',
    },

    input: {
      height: 51,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        '#193652',
      backgroundColor:
        '#061321',
      color: '#FFFFFF',
      paddingHorizontal: 14,
      fontSize: 13,
    },

    loadingPanel: {
      marginTop: 17,
      padding: 14,
      borderRadius: 14,
      backgroundColor:
        '#0A223C',
      borderWidth: 1,
      borderColor:
        '#1A466A',
    },

    loadingPanelHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    loadingStatusIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        '#0E4B80',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    loadingStatusIconText: {
      color: '#7FD1FF',
      fontSize: 18,
    },

    loadingPanelInfo: {
      flex: 1,
      marginLeft: 10,
    },

    loadingPanelTitle: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight:
        '900',
    },

    loadingPanelSub: {
      marginTop: 3,
      color: '#63819D',
      fontSize: 9,
    },

    loadingPercent: {
      color: '#63C4FF',
      fontSize: 17,
      fontWeight:
        '900',
    },

    loadingTrack: {
      height: 7,
      borderRadius: 4,
      overflow:
        'hidden',
      marginTop: 13,
      backgroundColor:
        '#061321',
    },

    loadingFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor:
        '#45B6FF',
    },

    loadingBottom: {
      marginTop: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      gap: 10,
    },

    loadingHint: {
      flex: 1,
      color: '#58738F',
      fontSize: 8,
      lineHeight: 13,
    },

    loadingCount: {
      color: '#78B8E5',
      fontSize: 9,
      fontWeight:
        '900',
    },

    connectionError: {
      marginTop: 14,
      padding: 12,
      borderRadius: 16,
      backgroundColor:
        '#2B1820',
      borderWidth: 1,
      borderColor:
        '#6A3042',
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    connectionErrorIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor:
        '#6D263A',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    connectionErrorIconText: {
      color: '#FFB4C1',
      fontSize: 15,
      fontWeight:
        '900',
    },

    connectionErrorBody: {
      flex: 1,
    },

    connectionErrorTitle: {
      color: '#FFD0D9',
      fontSize: 11,
      fontWeight:
        '900',
    },

    connectionErrorText: {
      marginTop: 3,
      color: '#C898A3',
      fontSize: 9,
      lineHeight: 14,
    },

    connectButton: {
      minHeight: 53,
      marginTop: 17,
      borderRadius: 16,
      backgroundColor:
        '#F4FAFF',
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      gap: 9,
    },

    connectButtonFocused: {
      backgroundColor:
        '#66C8FF',
      transform: [
        {
          scale: 1.02,
        },
      ],
    },

    connectButtonPressed: {
      opacity: 0.82,
    },

    connectButtonDisabled: {
      opacity: 0.55,
    },

    connectButtonIcon: {
      width: 27,
      height: 27,
      borderRadius: 9,
      backgroundColor:
        '#DDF1FF',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    connectButtonIconText: {
      color: '#0B4A82',
      fontSize: 10,
      fontWeight:
        '900',
    },

    connectButtonText: {
      color: '#0A3E70',
      fontSize: 17,
      fontWeight:
        '900',
    },

    connectionSecurity: {
      marginTop: 10,
      color: '#4E6682',
      fontSize: 8,
      textAlign:
        'center',
    },

    pageHeader: {
      minHeight: 101,
      paddingHorizontal: 30,
      paddingTop: 28,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    pageHeaderText: {
      flex: 1,
    },

    pageEyebrow: {
      color: '#58B9FF',
      fontSize: 9,
      fontWeight:
        '900',
      letterSpacing: 1.7,
    },

    pageTitle: {
      marginTop: 5,
      color: '#FFFFFF',
      fontSize: 31,
      fontWeight:
        '900',
    },

    pageDescription: {
      marginTop: 4,
      color: '#69839F',
      fontSize: 11,
    },

    pageCount: {
      minWidth: 86,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor:
        '#0A1F35',
      borderWidth: 1,
      borderColor:
        '#17334E',
      alignItems:
        'center',
      marginLeft: 20,
    },

    pageCountNumber: {
      color: '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '900',
    },

    pageCountLabel: {
      marginTop: 1,
      color: '#5C7794',
      fontSize: 8,
      fontWeight:
        '900',
    },

    searchBox: {
      height: 51,
      marginHorizontal: 30,
      marginTop: 2,
      borderRadius: 16,
      backgroundColor:
        '#091A2D',
      borderWidth: 1,
      borderColor:
        '#15304B',
      paddingHorizontal: 10,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    searchIconBox: {
      width: 35,
      height: 35,
      borderRadius: 10,
      backgroundColor:
        '#0A2946',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginRight: 8,
    },

    searchIcon: {
      color: '#6CC6FF',
      fontSize: 19,
      fontWeight:
        '900',
    },

    searchInput: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 13,
      padding: 0,
      textAlign:
        'right',
    },

    searchHint: {
      marginLeft: 8,
      color: '#587A99',
      fontSize: 8,
      fontWeight:
        '900',
    },

    categoryWrap: {
      marginTop: 13,
      marginBottom: 5,
    },

    categoryLabel: {
      marginHorizontal: 30,
      marginBottom: 8,
      color: '#48637F',
      fontSize: 8,
      fontWeight:
        '900',
      letterSpacing: 1.1,
    },

    categoryContent: {
      paddingHorizontal: 30,
      gap: 7,
    },

    categoryButton: {
      minHeight: 38,
      paddingHorizontal: 14,
      borderRadius: 11,
      backgroundColor:
        '#0A1D31',
      borderWidth: 1,
      borderColor:
        '#15324E',
      justifyContent:
        'center',
    },

    categoryButtonActive: {
      backgroundColor:
        '#104A80',
      borderColor:
        '#3A99D9',
    },

    categoryButtonFocused: {
      backgroundColor:
        '#165B96',
      borderColor:
        '#78CBFF',
      transform: [
        {
          scale: 1.035,
        },
      ],
    },

    categoryButtonPressed: {
      opacity: 0.82,
    },

    categoryText: {
      color: '#7089A3',
      fontSize: 10,
      fontWeight:
        '900',
    },

    categoryTextActive: {
      color: '#FFFFFF',
    },

    libraryContent: {
      paddingBottom: 32,
    },

    mediaRow: {
      paddingHorizontal: 30,
      gap: 14,
    },

    mediaCard: {
      flex: 1,
      minWidth: 0,
      maxWidth: 250,
      marginBottom: 18,
      borderRadius: 16,
      backgroundColor:
        SHASHTNA_THEME.colors.surface,
      borderWidth: 1,
      borderColor:
        '#142F49',
      overflow:
        'hidden',
    },

    mediaCardFocused: {
      backgroundColor:
        SHASHTNA_THEME.colors.surfaceStrong,
      borderColor:
        '#6CC7FF',
      transform: [
        {
          scale: 1.04,
        },
      ],
      shadowColor:
        SHASHTNA_THEME.colors.primary,
      shadowOpacity: 0.65,
      shadowRadius: 16,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      elevation: 12,
    },

    mediaCardPressed: {
      opacity: 0.84,
    },

    mediaArtwork: {
      height: 340,
      backgroundColor:
        '#071827',
      position:
        'relative',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    mediaImage: {
      position:
        'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },

    mediaFallback: {
      width: '100%',
      height: '100%',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#0A2846',
    },

    mediaFallbackIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor:
        '#0F5595',
      borderWidth: 1,
      borderColor:
        SHASHTNA_THEME.colors.primaryLight,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    mediaFallbackIconText: {
      color: '#FFFFFF',
      fontSize: 23,
      fontWeight:
        '900',
    },

    mediaBottomFade: {
      position:
        'absolute',
      right: 0,
      left: 0,
      bottom: 0,
      height: 110,
      backgroundColor:
        'rgba(0,0,0,0.45)',
    },

    mediaTypeBadge: {
      position:
        'absolute',
      top: 10,
      left: 10,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor:
        'rgba(3,14,27,0.82)',
      borderWidth: 1,
      borderColor:
        'rgba(130,202,247,0.16)',
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    mediaTypeDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        '#55C8FF',
      marginRight: 5,
    },

    mediaTypeText: {
      color: '#E4F2FF',
      fontSize: 8,
      fontWeight:
        '900',
    },

    mediaRating: {
      position:
        'absolute',
      top: 10,
      right: 10,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor:
        'rgba(3,14,27,0.82)',
      borderWidth: 1,
      borderColor:
        'rgba(255,203,92,0.20)',
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    mediaRatingStar: {
      color: '#FFD166',
      fontSize: 9,
      fontWeight:
        '900',
      marginRight: 4,
    },

    mediaRatingText: {
      color: '#F2F7FF',
      fontSize: 8,
      fontWeight:
        '900',
    },

    mediaInfo: {
      minHeight: 76,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },

    mediaName: {
      color: '#FFFFFF',
      fontSize: 13,
      lineHeight: 18,
      fontWeight:
        '900',
    },

    mediaMeta: {
      marginTop: 6,
      color: '#6685A4',
      fontSize: 9,
      fontWeight:
        '700',
    },

    emptyState: {
      minHeight: 320,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 40,
    },

    emptyIcon: {
      width: 66,
      height: 66,
      borderRadius: 21,
      backgroundColor:
        '#0A2947',
      borderWidth: 1,
      borderColor:
        '#173F62',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 16,
    },

    emptyIconText: {
      color: '#68C5FF',
      fontSize: 24,
      fontWeight:
        '900',
    },

    emptyTitle: {
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight:
        '900',
    },

    emptyText: {
      marginTop: 7,
      color: '#637D98',
      fontSize: 11,
      textAlign:
        'center',
      lineHeight: 18,
      maxWidth: 500,
    },

    focusRing: { borderColor: '#FFFFFF', borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.05)', shadowColor: '#030810', shadowOpacity: .28, shadowRadius: 8, elevation: 6, zIndex: 50 },
    pressed: { opacity: .82 },
    favoriteEmptyIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#0D3760', borderWidth: 1, borderColor: '#24557F', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    favoriteHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    favoriteCountPill: { height: 36, minWidth: 70, borderRadius: 10, borderWidth: 1, borderColor: '#274A70', backgroundColor: '#0A1930', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
    favoriteCountText: { color: '#fff', fontSize: 13, fontWeight: '900' },
    favoriteGrid: { paddingBottom: 40, paddingHorizontal: 24 },
    favoriteGridRow: { gap: 12, marginBottom: 28 },
    favoriteMediaCard: { width: 136, borderRadius: 16, overflow: 'hidden', backgroundColor: '#081729', borderWidth: 1, borderColor: '#1C3959' },
    favoriteMediaCardFocused: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.05)', transform: [{ scale: 1.08 }], shadowColor: '#030810', shadowOpacity: .28, shadowRadius: 8, elevation: 6, zIndex: 50 },
    favoriteMediaCardPressed: { opacity: .84 },
    favoritePoster: { width: '100%', height: 204, backgroundColor: '#0A1B30', position: 'relative' },
    favoritePosterImage: { width: '100%', height: '100%' },
    favoritePosterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10233B' },
    favoriteRemove: { position: 'absolute', right: 8, top: 8, width: 28, height: 28, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,200,87,.35)', backgroundColor: 'rgba(31,24,8,.9)', alignItems: 'center', justifyContent: 'center' },
    favoriteTypeBadge: { position: 'absolute', left: 8, bottom: 8, height: 23, borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: '#2A527C', backgroundColor: 'rgba(4,12,22,.86)', alignItems: 'center', justifyContent: 'center' },
    favoriteTypeText: { color: '#E7F2FF', fontSize: 8, fontWeight: '900' },
    favoriteMediaTitle: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 10, minHeight: 50 },
    favoriteEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 90, paddingHorizontal: 60 },
        favoritePage: {
      flex: 1,
      paddingHorizontal: 30,
      paddingTop: 32,
    },

    favoriteCard: {
      marginTop: 30,
      minHeight: 300,
      borderRadius: 22,
      backgroundColor:
        '#0A1D31',
      borderWidth: 1,
      borderColor:
        '#17334E',
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 40,
    },

    favoriteIcon: {
      width: 67,
      height: 67,
      borderRadius: 21,
      backgroundColor:
        '#0D3760',
      alignItems:
        'center',
      justifyContent:
        'center',
      borderWidth: 1,
      borderColor:
        '#295C87',
    },

    favoriteIconText: {
      color: '#72C9FF',
      fontSize: 29,
      fontWeight:
        '900',
    },

    favoriteTitle: {
      marginTop: 16,
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight:
        '900',
      textAlign:
        'center',
    },

    favoriteText: {
      marginTop: 8,
      color: '#647F9A',
      fontSize: 11,
      lineHeight: 18,
      textAlign:
        'center',
      maxWidth: 560,
    },
  });

export default App;