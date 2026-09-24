import React, {
  ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Video, {
  VideoRef,
} from 'react-native-video';

import {
  getSeriesDetails,
  getXtreamMovieInfo,
  M3UChannel,
  XtreamMovieInfo,
  XtreamSeriesDetails,
} from '../../lib/m3u';

import {
  getTmdbMetadata,
  tmdbImageUrl,
  TmdbMediaMetadata,
} from '../../lib/tmdb';

import { SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';

type PlayerScreenProps = {
  channel: M3UChannel;
  onBack: () => void;
  // Kept for compatibility with App.tsx/settings flow.
  preferredQuality?: string;
  autoplay?: boolean;
  subtitles?: boolean;
};

type Track = {
  index: number;
  title?: string;
  language?: string;
  selected?: boolean;
};

type VideoTrack = {
  index: number;
  trackId?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  selected?: boolean;
  codecs?: string;
};

type VideoProps =
  ComponentProps<typeof Video>;

type SelectedAudioTrackProp =
  VideoProps['selectedAudioTrack'];

type SelectedTextTrackProp =
  VideoProps['selectedTextTrack'];

type SelectedVideoTrackProp =
  VideoProps['selectedVideoTrack'];

type SelectedTrackTypeValue =
  NonNullable<
    NonNullable<
      SelectedAudioTrackProp
    >['type']
  >;

type SelectedVideoTrackTypeValue =
  NonNullable<
    NonNullable<
      SelectedVideoTrackProp
    >['type']
  >;

type TrackSelection = {
  type: SelectedTrackTypeValue;
  value?: string | number;
};

const TRACK_TYPE = {
  SYSTEM:
    'system' as SelectedTrackTypeValue,

  DISABLED:
    'disabled' as SelectedTrackTypeValue,

  TITLE:
    'title' as SelectedTrackTypeValue,

  LANGUAGE:
    'language' as SelectedTrackTypeValue,

  INDEX:
    'index' as SelectedTrackTypeValue,
};

const VIDEO_TRACK_TYPE = {
  AUTO:
    'auto' as SelectedVideoTrackTypeValue,

  DISABLED:
    'disabled' as SelectedVideoTrackTypeValue,

  RESOLUTION:
    'resolution' as SelectedVideoTrackTypeValue,

  INDEX:
    'index' as SelectedVideoTrackTypeValue,
};

type MenuType =
  | 'audio'
  | 'subtitle'
  | 'quality'
  | null;

type VideoLoadEvent =
  Parameters<
    NonNullable<
      VideoProps['onLoad']
    >
  >[0];

type VideoProgressEvent =
  Parameters<
    NonNullable<
      VideoProps['onProgress']
    >
  >[0];

type VideoBufferEvent =
  Parameters<
    NonNullable<
      VideoProps['onBuffer']
    >
  >[0];

type VideoErrorEvent =
  Parameters<
    NonNullable<
      VideoProps['onError']
    >
  >[0];

type VideoTextTracksEvent =
  Parameters<
    NonNullable<
      VideoProps['onTextTracks']
    >
  >[0];

type VideoAudioTracksEvent =
  Parameters<
    NonNullable<
      VideoProps['onAudioTracks']
    >
  >[0];

type VideoTracksEvent =
  Parameters<
    NonNullable<
      VideoProps['onVideoTracks']
    >
  >[0];

const {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
} =
  Dimensions.get('window');

function formatTime(
  seconds: number,
) {
  if (
    !Number.isFinite(
      seconds,
    ) ||
    seconds < 0
  ) {
    return '00:00';
  }

  const total =
    Math.floor(
      seconds,
    );

  const hours =
    Math.floor(
      total / 3600,
    );

  const minutes =
    Math.floor(
      (total % 3600) /
        60,
    );

  const secs =
    total % 60;

  if (
    hours > 0
  ) {
    return `${hours
      .toString()
      .padStart(
        2,
        '0',
      )}:${minutes
      .toString()
      .padStart(
        2,
        '0',
      )}:${secs
      .toString()
      .padStart(
        2,
        '0',
      )}`;
  }

  return `${minutes
    .toString()
    .padStart(
      2,
      '0',
    )}:${secs
    .toString()
    .padStart(
      2,
      '0',
    )}`;
}

function getContentLabel(
  channel: M3UChannel,
) {
  if (
    channel.contentType ===
    'movie'
  ) {
    return 'MOVIE';
  }

  if (
    channel.contentType ===
    'series'
  ) {
    return 'SERIES';
  }

  return 'LIVE';
}

function normalizeTrack(
  track: {
    index: number;
    title?: string;
    language?: string;
    selected?: boolean;
  },
): Track {
  return {
    index:
      track.index,

    title:
      track.title,

    language:
      track.language,

    selected:
      track.selected,
  };
}

function normalizeVideoTrack(
  track: {
    index: number;
    trackId?: string;
    width?: number;
    height?: number;
    bitrate?: number;
    selected?: boolean;
    codecs?: string;
  },
): VideoTrack {
  return {
    index:
      track.index,

    trackId:
      track.trackId,

    width:
      track.width,

    height:
      track.height,

    bitrate:
      track.bitrate,

    selected:
      track.selected,

    codecs:
      track.codecs,
  };
}

function formatBitrate(
  bitrate?: number,
) {
  if (
    !bitrate ||
    bitrate <= 0
  ) {
    return '';
  }

  const mbps =
    bitrate /
    1_000_000;

  if (
    mbps >= 1
  ) {
    return `${mbps.toFixed(
      1,
    )} Mbps`;
  }

  return `${Math.round(
    bitrate / 1000,
  )} Kbps`;
}

function qualityLabel(
  track: VideoTrack,
) {
  if (
    track.height &&
    track.height > 0
  ) {
    return `${track.height}p`;
  }

  if (
    track.width &&
    track.width > 0
  ) {
    return `${track.width}px`;
  }

  return `Track ${
    track.index + 1
  }`;
}

function uniqueVideoTracks(
  tracks: VideoTrack[],
) {
  const map =
    new Map<
      string,
      VideoTrack
    >();

  for (
    const track of tracks
  ) {
    const key =
      track.height &&
      track.height > 0
        ? `h:${track.height}`
        : `i:${track.index}`;

    const existing =
      map.get(key);

    if (
      !existing
    ) {
      map.set(
        key,
        track,
      );
      continue;
    }

    if (
      (track.bitrate ||
        0) >
      (existing.bitrate ||
        0)
    ) {
      map.set(
        key,
        track,
      );
    }
  }

  return Array.from(
    map.values(),
  ).sort(
    (
      a,
      b,
    ) =>
      (b.height ||
        0) -
      (a.height ||
        0),
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  disabled = false,
  preferred = false,
  compact = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  preferred?: boolean;
  compact?: boolean;
}) {
  const [
    focused,
    setFocused,
  ] =
    useState(false);

  return (
    <Pressable
      focusable={
        !disabled
      }
      hasTVPreferredFocus={
        preferred
      }
      disabled={
        disabled
      }
      onPress={
        onPress
      }
      onFocus={() =>
        setFocused(
          true,
        )
      }
      onBlur={() =>
        setFocused(
          false,
        )
      }
      accessibilityRole="button"
      accessibilityLabel={
        label
      }
      style={[
        styles.controlButton,
        compact &&
          styles.controlButtonCompact,
        disabled &&
          styles.controlButtonDisabled,
        focused &&
          styles.controlButtonFocused,
      ]}
    >
      <Text
        style={[
          styles.controlIcon,
          disabled &&
            styles.controlIconDisabled,
        ]}
      >
        {icon}
      </Text>

      {!compact && (
        <Text
          numberOfLines={
            1
          }
          style={[
            styles.controlLabel,
            disabled &&
              styles.controlLabelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function TrackMenu({
  type,
  tracks,
  selected,
  onSelect,
  onClose,
}: {
  type: Exclude<
    MenuType,
    null
  >;
  tracks: Track[];
  selected?: TrackSelection;
  onSelect: (
    selection: TrackSelection,
  ) => void;
  onClose: () => void;
}) {
  const isAudio =
    type === 'audio';

  const isSubtitle =
    type ===
    'subtitle';

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={
        onClose
      }
    >
      <View
        style={
          styles.modalBackdrop
        }
      >
        <View
          style={
            styles.trackPanel
          }
        >
          <View
            style={
              styles.trackPanelHeader
            }
          >
            <Text
              style={
                styles.trackPanelTitle
              }
            >
              {isAudio
                ? 'اختيار الصوت'
                : isSubtitle
                  ? 'اختيار الترجمة'
                  : 'اختيار الجودة'}
            </Text>

            <Pressable
              hasTVPreferredFocus
              onPress={
                onClose
              }
              style={({
                focused,
              }) => [
                styles.closeButton,
                focused &&
                  styles.closeButtonFocused,
              ]}
            >
              <Text
                style={
                  styles.closeButtonText
                }
              >
                ×
              </Text>
            </Pressable>
          </View>

          {tracks.length ===
          0 ? (
            <View
              style={
                styles.emptyTracks
              }
            >
              <Text
                style={
                  styles.emptyTracksIcon
                }
              >
                {isAudio
                  ? 'A'
                  : 'CC'}
              </Text>

              <Text
                style={
                  styles.emptyTracksTitle
                }
              >
                {isAudio
                  ? 'لا توجد مسارات صوت إضافية'
                  : 'لا توجد ترجمة متاحة'}
              </Text>

              <Text
                style={
                  styles.emptyTracksDescription
                }
              >
                هذا يعتمد على المصدر نفسه وهل البث يوفر أكثر من مسار.
              </Text>
            </View>
          ) : (
            <View
              style={
                styles.trackList
              }
            >
              {!isAudio &&
                isSubtitle && (
                  <Pressable
                    onPress={() => {
                      onSelect({
                        type:
                          TRACK_TYPE.DISABLED,
                      });

                      onClose();
                    }}
                    style={({
                      focused,
                    }) => [
                      styles.trackItem,
                      selected?.type ===
                        TRACK_TYPE.DISABLED &&
                        styles.trackItemSelected,
                      focused &&
                        styles.trackItemFocused,
                    ]}
                  >
                    <View
                      style={
                        styles.trackItemText
                      }
                    >
                      <Text
                        style={
                          styles.trackItemTitle
                        }
                      >
                        إيقاف الترجمة
                      </Text>

                      <Text
                        style={
                          styles.trackItemSubtitle
                        }
                      >
                        بدون ترجمة
                      </Text>
                    </View>

                    {selected?.type ===
                      TRACK_TYPE.DISABLED && (
                      <Text
                        style={
                          styles.checkMark
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>
                )}

              {tracks.map(
                track => {
                  const title =
                    track.title?.trim() ||
                    track.language?.toUpperCase() ||
                    `${
                      isAudio
                        ? 'Audio'
                        : 'Subtitle'
                    } ${
                      track.index +
                      1
                    }`;

                  const isSelected =
                    selected?.type ===
                      TRACK_TYPE.INDEX &&
                    selected.value ===
                      track.index;

                  return (
                    <Pressable
                      key={`${type}-${track.index}`}
                      onPress={() => {
                        onSelect({
                          type:
                            TRACK_TYPE.INDEX,
                          value:
                            track.index,
                        });

                        onClose();
                      }}
                      style={({
                        focused,
                      }) => [
                        styles.trackItem,
                        isSelected &&
                          styles.trackItemSelected,
                        focused &&
                          styles.trackItemFocused,
                      ]}
                    >
                      <View
                        style={
                          styles.trackItemText
                        }
                      >
                        <Text
                          style={
                            styles.trackItemTitle
                          }
                        >
                          {title}
                        </Text>

                        <Text
                          style={
                            styles.trackItemSubtitle
                          }
                        >
                          {track.language
                            ? track.language.toUpperCase()
                            : isAudio
                              ? 'Audio'
                              : 'Subtitle'}
                        </Text>
                      </View>

                      {isSelected && (
                        <Text
                          style={
                            styles.checkMark
                          }
                        >
                          ✓
                        </Text>
                      )}
                    </Pressable>
                  );
                },
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function QualityMenu({
  tracks,
  selected,
  onSelect,
  onClose,
}: {
  tracks: VideoTrack[];
  selected?: SelectedVideoTrackProp;
  onSelect: (
    selection: SelectedVideoTrackProp,
  ) => void;
  onClose: () => void;
}) {
  const uniqueTracks =
    uniqueVideoTracks(
      tracks,
    );

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={
        onClose
      }
    >
      <View
        style={
          styles.modalBackdrop
        }
      >
        <View
          style={
            styles.trackPanel
          }
        >
          <View
            style={
              styles.trackPanelHeader
            }
          >
            <Text
              style={
                styles.trackPanelTitle
              }
            >
              اختيار الجودة
            </Text>

            <Pressable
              hasTVPreferredFocus
              onPress={
                onClose
              }
              style={({
                focused,
              }) => [
                styles.closeButton,
                focused &&
                  styles.closeButtonFocused,
              ]}
            >
              <Text
                style={
                  styles.closeButtonText
                }
              >
                ×
              </Text>
            </Pressable>
          </View>

          <View
            style={
              styles.trackList
            }
          >
            <Pressable
              onPress={() => {
                onSelect({
                  type:
                    VIDEO_TRACK_TYPE.AUTO,
                });

                onClose();
              }}
              style={({
                focused,
              }) => [
                styles.trackItem,
                selected?.type ===
                  VIDEO_TRACK_TYPE.AUTO &&
                  styles.trackItemSelected,
                focused &&
                  styles.trackItemFocused,
              ]}
            >
              <View
                style={
                  styles.trackItemText
                }
              >
                <Text
                  style={
                    styles.trackItemTitle
                  }
                >
                  تلقائي
                </Text>

                <Text
                  style={
                    styles.trackItemSubtitle
                  }
                >
                  يختار المشغل أفضل جودة حسب الاتصال
                </Text>
              </View>

              {selected?.type ===
                VIDEO_TRACK_TYPE.AUTO && (
                <Text
                  style={
                    styles.checkMark
                  }
                >
                  ✓
                </Text>
              )}
            </Pressable>

            {uniqueTracks.map(
              track => {
                const resolution =
                  track.height &&
                  track.height >
                    0
                    ? track.height
                    : undefined;

                const isSelected =
                  selected?.type ===
                    VIDEO_TRACK_TYPE.RESOLUTION &&
                  selected.value ===
                    resolution;

                return (
                  <Pressable
                    key={`quality-${track.index}-${track.height}`}
                    onPress={() => {
                      if (
                        resolution
                      ) {
                        onSelect({
                          type:
                            VIDEO_TRACK_TYPE.RESOLUTION,
                          value:
                            resolution,
                        });
                      } else {
                        onSelect({
                          type:
                            VIDEO_TRACK_TYPE.INDEX,
                          value:
                            track.index,
                        });
                      }

                      onClose();
                    }}
                    style={({
                      focused,
                    }) => [
                      styles.trackItem,
                      isSelected &&
                        styles.trackItemSelected,
                      focused &&
                        styles.trackItemFocused,
                    ]}
                  >
                    <View
                      style={
                        styles.trackItemText
                      }
                    >
                      <Text
                        style={
                          styles.trackItemTitle
                        }
                      >
                        {qualityLabel(
                          track,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.trackItemSubtitle
                        }
                      >
                        {[
                          track.width &&
                          track.height
                            ? `${track.width}×${track.height}`
                            : '',
                          formatBitrate(
                            track.bitrate,
                          ),
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(
                            ' • ',
                          ) ||
                          'Video Track'}
                      </Text>
                    </View>

                    {isSelected && (
                      <Text
                        style={
                          styles.checkMark
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              },
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

type SeriesDetailsViewProps = {
  channel: M3UChannel;
  onBack: () => void;
  onPlayEpisode: (
    episode: M3UChannel,
  ) => void;
};

function SeriesDetailsView({
  channel,
  onBack,
  onPlayEpisode,
}: SeriesDetailsViewProps) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const [
    details,
    setDetails,
  ] =
    useState<XtreamSeriesDetails | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    selectedSeason,
    setSelectedSeason,
  ] =
    useState(1);

  const loadDetails =
    useCallback(
      async () => {
        try {
          setLoading(
            true,
          );

          setError(
            null,
          );

          const result =
            await getSeriesDetails(
              channel,
            );

          setDetails(
            result,
          );

          const firstSeason =
            result.seasons[0]
              ?.season_number;

          setSelectedSeason(
            Number(
              firstSeason ||
                1,
            ),
          );
        } catch (
          err
        ) {
          setError(
            err instanceof
              Error
              ? err.message
              : 'تعذر تحميل تفاصيل المسلسل.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [channel],
    );

  useEffect(() => {
    loadDetails();
  }, [
    loadDetails,
  ]);

  useEffect(() => {
    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          onBack();
          return true;
        },
      );

    return () =>
      subscription.remove();
  }, [
    onBack,
  ]);

  const seasons =
    useMemo(
      () =>
        details?.seasons ||
        [],
      [details],
    );

  const episodes =
    useMemo(
      () =>
        (details?.episodes ||
          [])
          .filter(
            episode =>
              Number(
                episode.seasonNumber ||
                  1,
              ) ===
              selectedSeason,
          )
          .sort(
            (
              a,
              b,
            ) =>
              Number(
                a.episodeNumber ||
                  0,
              ) -
              Number(
                b.episodeNumber ||
                  0,
              ),
          ),
      [
        details,
        selectedSeason,
      ],
    );

  const info =
    details?.info;

  const rating =
    Number(
      info?.rating || 0,
    );

  const backdrop =
    info?.backdrop_path?.[0] ||
    info?.cover ||
    channel.logo;

  return (
    <View
      style={
        styles.seriesDetailsRoot
      }
    >
      <View
        style={
          styles.seriesTopBar
        }
      >
        <ControlButton
          icon={ar ? '›' : '‹'}
          label="رجوع"
          onPress={
            onBack
          }
          preferred
          compact
        />

        <View
          style={
            styles.seriesTopTitle
          }
        >
          <Text
            numberOfLines={
              1
            }
            style={
              styles.seriesTopTitleText
            }
          >
            تفاصيل المسلسل
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.seriesScrollContent
        }
      >
        <View
          style={
            styles.seriesHero
          }
        >
          {backdrop ? (
            <Image
              source={{
                uri:
                  backdrop,
              }}
              style={
                styles.seriesHeroImage
              }
              resizeMode="cover"
            />
          ) : (
            <View
              style={
                styles.seriesHeroFallback
              }
            />
          )}

          <View
            style={
              styles.seriesHeroOverlay
            }
          />

          <View
            style={
              styles.seriesHeroContent
            }
          >
            <View
              style={
                styles.seriesPosterWrap
              }
            >
              {channel.logo ? (
                <Image
                  source={{
                    uri:
                      channel.logo,
                  }}
                  style={
                    styles.seriesPoster
                  }
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={
                    styles.seriesPosterFallback
                  }
                >
                  <Text
                    style={
                      styles.seriesPosterFallbackText
                    }
                  >
                    ش
                  </Text>
                </View>
              )}
            </View>

            <View
              style={
                styles.seriesHeroInfo
              }
            >
              <Text
                style={
                  styles.seriesTitle
                }
              >
                {info?.name ||
                  channel.name}
              </Text>

              <View
                style={
                  styles.seriesMetaRow
                }
              >
                <View
                  style={
                    styles.seriesBadge
                  }
                >
                  <Text
                    style={
                      styles.seriesBadgeText
                    }
                  >
                    SERIES
                  </Text>
                </View>

                {info?.releaseDate ? (
                  <Text
                    style={
                      styles.seriesMetaText
                    }
                  >
                    {String(
                      info.releaseDate,
                    ).slice(
                      0,
                      4,
                    )}
                  </Text>
                ) : null}

                {rating > 0 ? (
                  <Text
                    style={
                      styles.seriesMetaText
                    }
                  >
                    ★ {rating.toFixed(
                      1,
                    )}
                  </Text>
                ) : null}

                {seasons.length > 0 ? (
                  <Text
                    style={
                      styles.seriesMetaText
                    }
                  >
                    {seasons.length} مواسم
                  </Text>
                ) : null}
              </View>

              {info?.genre ? (
                <Text
                  style={
                    styles.seriesGenre
                  }
                  numberOfLines={
                    2
                  }
                >
                  {info.genre}
                </Text>
              ) : null}

              {info?.plot ? (
                <Text
                  style={
                    styles.seriesPlotHero
                  }
                  numberOfLines={
                    5
                  }
                >
                  {info.plot}
                </Text>
              ) : (
                <Text
                  style={
                    styles.seriesPlotHero
                  }
                >
                  لا توجد قصة متوفرة من مصدر الاشتراك.
                </Text>
              )}
            </View>
          </View>
        </View>

        {loading ? (
          <View
            style={
              styles.seriesLoading
            }
          >
            <ActivityIndicator
              size="large"
              color={
                SHASHTNA_THEME.colors.primary
              }
            />

            <Text
              style={
                styles.seriesLoadingText
              }
            >
              جاري تحميل المواسم والحلقات...
            </Text>
          </View>
        ) : error ? (
          <View
            style={
              styles.seriesErrorCard
            }
          >
            <Text
              style={
                styles.seriesErrorTitle
              }
            >
              تعذر تحميل تفاصيل المسلسل
            </Text>

            <Text
              style={
                styles.seriesErrorText
              }
            >
              {error}
            </Text>

            <ControlButton
              icon="↻"
              label="إعادة المحاولة"
              onPress={
                loadDetails
              }
            />
          </View>
        ) : (
          <>
            {seasons.length > 0 ? (
              <View>
                <Text
                  style={
                    styles.seriesSectionTitle
                  }
                >
                  المواسم
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                  contentContainerStyle={
                    styles.seasonList
                  }
                >
                  {seasons.map(
                    (
                      season,
                      index,
                    ) => {
                      const seasonNumber =
                        Number(
                          season.season_number ||
                            index +
                              1,
                        );

                      const active =
                        seasonNumber ===
                        selectedSeason;

                      return (
                        <Pressable
                          key={`season-${seasonNumber}`}
                          focusable
                          hasTVPreferredFocus={
                            index ===
                              0 &&
                            selectedSeason ===
                              seasonNumber
                          }
                          onPress={() =>
                            setSelectedSeason(
                              seasonNumber,
                            )
                          }
                          style={({
                            focused,
                          }) => [
                            styles.seasonButton,
                            active &&
                              styles.seasonButtonActive,
                            focused &&
                              styles.seasonButtonFocused,
                          ]}
                        >
                          <Text
                            style={[
                              styles.seasonButtonText,
                              active &&
                                styles.seasonButtonTextActive,
                            ]}
                          >
                            {season.name ||
                              `الموسم ${seasonNumber}`}
                          </Text>

                          <Text
                            style={[
                              styles.seasonButtonSub,
                              active &&
                                styles.seasonButtonSubActive,
                            ]}
                          >
                            {Number(
                              season.episode_count ||
                                0,
                            ) || 0}{' '}
                            حلقة
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </ScrollView>
              </View>
            ) : null}

            <View
              style={
                styles.episodesHeader
              }
            >
              <Text
                style={
                  styles.seriesSectionTitle
                }
              >
                حلقات الموسم{' '}
                {selectedSeason}
              </Text>

              <Text
                style={
                  styles.episodesCount
                }
              >
                {episodes.length} حلقة
              </Text>
            </View>

            {episodes.length ===
            0 ? (
              <View
                style={
                  styles.noEpisodes
                }
              >
                <Text
                  style={
                    styles.noEpisodesTitle
                  }
                >
                  ماكو حلقات متاحة
                </Text>

                <Text
                  style={
                    styles.noEpisodesText
                  }
                >
                  هذا الموسم ما رجع حلقات من سيرفر Xtream.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.episodeGrid
                }
              >
                {episodes.map(
                  episode => (
                    <Pressable
                      key={
                        episode.id
                      }
                      focusable
                      onPress={() =>
                        onPlayEpisode(
                          episode,
                        )
                      }
                      style={({
                        focused,
                      }) => [
                        styles.episodeCard,
                        focused &&
                          styles.episodeCardFocused,
                      ]}
                    >
                      <View
                        style={
                          styles.episodeImageWrap
                        }
                      >
                        {episode.logo ? (
                          <Image
                            source={{
                              uri:
                                episode.logo,
                            }}
                            style={
                              styles.episodeImage
                            }
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={
                              styles.episodeImageFallback
                            }
                          >
                            <Text
                              style={
                                styles.episodeImageFallbackText
                              }
                            >
                              ▶
                            </Text>
                          </View>
                        )}

                        <View
                          style={
                            styles.episodeNumberBadge
                          }
                        >
                          <Text
                            style={
                              styles.episodeNumberText
                            }
                          >
                            {String(
                              episode.episodeNumber ||
                                1,
                            )}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={
                          styles.episodeInfo
                        }
                      >
                        <Text
                          numberOfLines={
                            2
                          }
                          style={
                            styles.episodeTitle
                          }
                        >
                          {episode.name}
                        </Text>

                        <Text
                          style={
                            styles.episodeMeta
                          }
                        >
                          الموسم{' '}
                          {episode.seasonNumber ||
                            selectedSeason}{' '}
                          • الحلقة{' '}
                          {episode.episodeNumber ||
                            1}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.episodePlay
                        }
                      >
                        <Text
                          style={
                            styles.episodePlayText
                          }
                        >
                          ▶
                        </Text>
                      </View>
                    </Pressable>
                  ),
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}


type MovieDetailsViewProps = {
  channel: M3UChannel;
  onBack: () => void;
  onWatch: () => void;
};

function MovieDetailsView({
  channel,
  onBack,
  onWatch,
}: MovieDetailsViewProps) {
  const [
    info,
    setInfo,
  ] = useState<XtreamMovieInfo | null>(null);

  const [
    metadata,
    setMetadata,
  ] = useState<TmdbMediaMetadata | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [xtreamInfo, tmdbInfo] = await Promise.all([
      getXtreamMovieInfo(channel).catch(() => null),
      getTmdbMetadata(channel, 'movie').catch(() => null),
    ]);

    setInfo(xtreamInfo);
    setMetadata(tmdbInfo);
    setLoading(false);

    if (!xtreamInfo && !tmdbInfo) {
      setError('تعذر تحميل تفاصيل الفيلم من المصدر الحالي.');
    }
  }, [channel]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBack();
        return true;
      },
    );

    return () => subscription.remove();
  }, [onBack]);

  const title = metadata?.title || channel.name;

  const poster =
    info?.movie_image ||
    info?.cover_big ||
    info?.cover ||
    tmdbImageUrl(metadata?.posterPath, 'w500') ||
    channel.logo;

  const backdrop =
    (Array.isArray(info?.backdrop_path)
      ? info?.backdrop_path[0]
      : info?.backdrop_path) ||
    info?.cover_big ||
    info?.cover ||
    tmdbImageUrl(metadata?.backdropPath, 'w780') ||
    poster;

  const plot =
    info?.plot?.trim() ||
    info?.description?.trim() ||
    metadata?.overview?.trim() ||
    '';

  const rating = Number(info?.rating || metadata?.voteAverage || 0);

  const releaseDate =
    info?.releasedate ||
    info?.releaseDate ||
    metadata?.releaseDate ||
    '';

  const year = releaseDate ? String(releaseDate).slice(0, 4) : '';

  return (
    <View style={styles.movieDetailsRoot}>
      <View style={styles.seriesTopBar}>
        <ControlButton
          icon="‹"
          label="رجوع"
          onPress={onBack}
          preferred
          compact
        />

        <View style={styles.seriesTopTitle}>
          <Text numberOfLines={1} style={styles.seriesTopTitleText}>
            تفاصيل الفيلم
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.seriesScrollContent}
      >
        <View style={styles.seriesHero}>
          {backdrop ? (
            <Image
              source={{ uri: backdrop }}
              style={styles.seriesHeroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.seriesHeroFallback} />
          )}

          <View style={styles.seriesHeroOverlay} />

          <View style={styles.seriesHeroContent}>
            <View style={styles.seriesPosterWrap}>
              {poster ? (
                <Image
                  source={{ uri: poster }}
                  style={styles.seriesPoster}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.seriesPosterFallback}>
                  <Text style={styles.seriesPosterFallbackText}>ش</Text>
                </View>
              )}
            </View>

            <View style={styles.seriesHeroInfo}>
              <Text style={styles.seriesTitle}>{title}</Text>

              <View style={styles.seriesMetaRow}>
                <View style={styles.seriesBadge}>
                  <Text style={styles.seriesBadgeText}>MOVIE</Text>
                </View>

                {year ? (
                  <Text style={styles.seriesMetaText}>{year}</Text>
                ) : null}

                {rating > 0 ? (
                  <Text style={styles.seriesMetaText}>★ {rating.toFixed(1)}</Text>
                ) : null}
              </View>

              {info?.genre ? (
                <Text style={styles.seriesGenre} numberOfLines={2}>
                  {info.genre}
                </Text>
              ) : null}

              {plot ? (
                <Text style={styles.seriesPlotHero}>{plot}</Text>
              ) : (
                <Text style={styles.seriesPlotHero}>
                  لا توجد قصة متوفرة من مصدر الاشتراك أو TMDB.
                </Text>
              )}

              {info?.director ? (
                <Text style={styles.movieDetailsSecondaryText}>
                  المخرج: {info.director}
                </Text>
              ) : null}

              {info?.cast ? (
                <Text style={styles.movieDetailsSecondaryText} numberOfLines={2}>
                  بطولة: {info.cast}
                </Text>
              ) : null}

              <View style={styles.movieDetailsActions}>
                <ControlButton
                  icon="▶"
                  label="مشاهدة الآن"
                  onPress={onWatch}
                  preferred
                />
              </View>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.seriesLoading}>
            <ActivityIndicator size="large" color={SHASHTNA_THEME.colors.primary} />
            <Text style={styles.seriesLoadingText}>
              جاري تحميل تفاصيل الفيلم...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.seriesErrorCard}>
            <Text style={styles.seriesErrorTitle}>تعذر تحميل التفاصيل</Text>
            <Text style={styles.seriesErrorText}>{error}</Text>
            <ControlButton icon="↻" label="إعادة المحاولة" onPress={loadDetails} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function PlayerScreen({
  channel,
  onBack,
}: PlayerScreenProps) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const [
    activeEpisode,
    setActiveEpisode,
  ] =
    useState<M3UChannel | null>(
      null,
    );

  const [
    movieStarted,
    setMovieStarted,
  ] = useState(false);

  const videoRef =
    useRef<VideoRef>(
      null,
    );

  const hideTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const playbackChannel =
    activeEpisode ||
    channel;

  const isSeriesDetails =
    !activeEpisode &&
    channel.contentType ===
      'series' &&
    Boolean(
      channel.contentKey?.startsWith(
        'xtream-series:',
      ),
    );

  const isMovieDetails =
    channel.contentType === 'movie' &&
    !movieStarted;

  const [
    paused,
    setPaused,
  ] =
    useState(false);

  const [
    duration,
    setDuration,
  ] =
    useState(0);

  const [
    currentTime,
    setCurrentTime,
  ] =
    useState(0);

  const [
    playableDuration,
    setPlayableDuration,
  ] =
    useState(0);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    buffering,
    setBuffering,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    ended,
    setEnded,
  ] =
    useState(false);

  const [
    showControls,
    setShowControls,
  ] =
    useState(true);

  const [
    menu,
    setMenu,
  ] =
    useState<MenuType>(
      null,
    );

  const [
    retryKey,
    setRetryKey,
  ] =
    useState(0);

  const [
    audioTracks,
    setAudioTracks,
  ] =
    useState<Track[]>(
      [],
    );

  const [
    textTracks,
    setTextTracks,
  ] =
    useState<Track[]>(
      [],
    );

  const [
    videoTracks,
    setVideoTracks,
  ] =
    useState<VideoTrack[]>(
      [],
    );

  const [
    selectedAudioTrack,
    setSelectedAudioTrack,
  ] =
    useState<SelectedAudioTrackProp>(
      undefined,
    );

  const [
    selectedTextTrack,
    setSelectedTextTrack,
  ] =
    useState<SelectedTextTrackProp>(
      {
        type:
          TRACK_TYPE.DISABLED,
      },
    );

  const [
    selectedVideoTrack,
    setSelectedVideoTrack,
  ] =
    useState<SelectedVideoTrackProp>(
      {
        type:
          VIDEO_TRACK_TYPE.AUTO,
      },
    );

  const isLive =
    duration <= 0;

  const progressRatio =
    duration > 0
      ? Math.min(
          1,
          Math.max(
            0,
            currentTime /
              duration,
          ),
        )
      : 0;

  const bufferedRatio =
    duration > 0
      ? Math.min(
          1,
          Math.max(
            0,
            playableDuration /
              duration,
          ),
        )
      : 0;

  const clearHideTimer =
    useCallback(
      () => {
        if (
          hideTimerRef.current
        ) {
          clearTimeout(
            hideTimerRef.current,
          );

          hideTimerRef.current =
            null;
        }
      },
      [],
    );

  const scheduleHideControls =
    useCallback(
      () => {
        clearHideTimer();

        if (
          paused ||
          menu ||
          isSeriesDetails ||
          isMovieDetails
        ) {
          return;
        }

        hideTimerRef.current =
          setTimeout(() => {
            setShowControls(
              false,
            );
          }, 4000);
      },
      [
        clearHideTimer,
        menu,
        paused,
        isMovieDetails,
        isSeriesDetails,
      ],
    );

  const wakeControls =
    useCallback(
      () => {
        setShowControls(
          true,
        );

        scheduleHideControls();
      },
      [
        scheduleHideControls,
      ],
    );

  const goBack =
    useCallback(
      () => {
        clearHideTimer();

        if (
          activeEpisode
        ) {
          setActiveEpisode(
            null,
          );

          setLoading(
            false,
          );

          setError(
            null,
          );

          setMenu(
            null,
          );

          return;
        }

        if (
          channel.contentType === 'movie' &&
          movieStarted
        ) {
          setMovieStarted(false);
          setPaused(false);
          setLoading(false);
          setBuffering(false);
          setError(null);
          setEnded(false);
          setMenu(null);
          return;
        }

        onBack();
      },
      [
        activeEpisode,
        channel.contentType,
        clearHideTimer,
        movieStarted,
        onBack,
      ],
    );

  useEffect(() => {
    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (
            menu
          ) {
            setMenu(
              null,
            );

            wakeControls();

            return true;
          }

          goBack();

          return true;
        },
      );

    return () =>
      subscription.remove();
  }, [
    goBack,
    menu,
    wakeControls,
  ]);

  useEffect(() => {
    setActiveEpisode(
      null,
    );

    setMovieStarted(false);

    setPaused(
      false,
    );

    setDuration(
      0,
    );

    setCurrentTime(
      0,
    );

    setPlayableDuration(
      0,
    );

    setLoading(
      true,
    );

    setBuffering(
      false,
    );

    setError(
      null,
    );

    setEnded(
      false,
    );

    setShowControls(
      true,
    );

    setMenu(
      null,
    );

    setAudioTracks(
      [],
    );

    setTextTracks(
      [],
    );

    setVideoTracks(
      [],
    );

    setSelectedAudioTrack(
      undefined,
    );

    setSelectedTextTrack(
      {
        type:
          TRACK_TYPE.DISABLED,
      },
    );

    setSelectedVideoTrack(
      {
        type:
          VIDEO_TRACK_TYPE.AUTO,
      },
    );
  }, [
    channel.id,
  ]);

  useEffect(() => {
    if (
      !isSeriesDetails
    ) {
      setLoading(
        true,
      );

      setError(
        null,
      );

      setEnded(
        false,
      );

      setPaused(
        false,
      );

      setDuration(
        0,
      );

      setCurrentTime(
        0,
      );

      setPlayableDuration(
        0,
      );

      setAudioTracks(
        [],
      );

      setTextTracks(
        [],
      );

      setVideoTracks(
        [],
      );

      setSelectedAudioTrack(
        undefined,
      );

      setSelectedTextTrack(
        {
          type:
            TRACK_TYPE.DISABLED,
        },
      );

      setSelectedVideoTrack(
        {
          type:
            VIDEO_TRACK_TYPE.AUTO,
        },
      );
    }
  }, [
    playbackChannel.id,
    isSeriesDetails,
  ]);

  useEffect(() => {
    if (
      showControls
    ) {
      scheduleHideControls();
    }

    return clearHideTimer;
  }, [
    clearHideTimer,
    scheduleHideControls,
    showControls,
  ]);

  const togglePlay =
    useCallback(
      () => {
        setPaused(
          value =>
            !value,
        );

        setEnded(
          false,
        );

        wakeControls();
      },
      [
        wakeControls,
      ],
    );

  const seekBy =
    useCallback(
      (
        seconds: number,
      ) => {
        if (
          duration <= 0 ||
          !videoRef.current
        ) {
          return;
        }

        const target =
          Math.min(
            duration,
            Math.max(
              0,
              currentTime +
                seconds,
            ),
          );

        videoRef.current.seek(
          target,
        );

        setCurrentTime(
          target,
        );

        setEnded(
          false,
        );

        wakeControls();
      },
      [
        currentTime,
        duration,
        wakeControls,
      ],
    );

  const replay =
    useCallback(
      () => {
        if (
          !videoRef.current
        ) {
          return;
        }

        videoRef.current.seek(
          0,
        );

        setCurrentTime(
          0,
        );

        setEnded(
          false,
        );

        setPaused(
          false,
        );

        wakeControls();
      },
      [
        wakeControls,
      ],
    );

  const retry =
    useCallback(
      () => {
        setError(
          null,
        );

        setLoading(
          true,
        );

        setBuffering(
          false,
        );

        setEnded(
          false,
        );

        setPaused(
          false,
        );

        setRetryKey(
          value =>
            value + 1,
        );

        wakeControls();
      },
      [
        wakeControls,
      ],
    );

  const handleProgress =
    useCallback(
      (
        data: VideoProgressEvent,
      ) => {
        setCurrentTime(
          data.currentTime ||
            0,
        );

        setPlayableDuration(
          data.playableDuration ||
            0,
        );
      },
      [],
    );

  const handleLoad =
    useCallback(
      (
        data: VideoLoadEvent,
      ) => {
        const nextDuration =
          Number.isFinite(
            data.duration,
          )
            ? data.duration
            : 0;

        setDuration(
          nextDuration,
        );

        setLoading(
          false,
        );

        setBuffering(
          false,
        );

        setError(
          null,
        );

        const nextAudioTracks =
          (
            data.audioTracks ||
            []
          ).map(
            normalizeTrack,
          );

        const nextTextTracks =
          (
            data.textTracks ||
            []
          ).map(
            normalizeTrack,
          );

        const nextVideoTracks =
          (
            data.videoTracks ||
            []
          ).map(
            normalizeVideoTrack,
          );

        setAudioTracks(
          nextAudioTracks,
        );

        setTextTracks(
          nextTextTracks,
        );

        setVideoTracks(
          nextVideoTracks,
        );

        const selectedAudio =
          nextAudioTracks.find(
            track =>
              track.selected,
          );

        const selectedText =
          nextTextTracks.find(
            track =>
              track.selected,
          );

        const selectedVideo =
          nextVideoTracks.find(
            track =>
              track.selected,
          );

        if (
          selectedAudio
        ) {
          setSelectedAudioTrack(
            {
              type:
                TRACK_TYPE.INDEX,
              value:
                selectedAudio.index,
            },
          );
        } else {
          setSelectedAudioTrack(
            undefined,
          );
        }

        if (
          selectedText
        ) {
          setSelectedTextTrack(
            {
              type:
                TRACK_TYPE.INDEX,
              value:
                selectedText.index,
            },
          );
        } else {
          setSelectedTextTrack(
            {
              type:
                TRACK_TYPE.DISABLED,
            },
          );
        }

        setSelectedVideoTrack(
          {
            type:
              VIDEO_TRACK_TYPE.AUTO,
          },
        );

        wakeControls();
      },
      [
        wakeControls,
      ],
    );

  const handleAudioTracks =
    useCallback(
      (
        data: VideoAudioTracksEvent,
      ) => {
        setAudioTracks(
          (
            data.audioTracks ||
            []
          ).map(
            normalizeTrack,
          ),
        );
      },
      [],
    );

  const handleTextTracks =
    useCallback(
      (
        data: VideoTextTracksEvent,
      ) => {
        setTextTracks(
          (
            data.textTracks ||
            []
          ).map(
            normalizeTrack,
          ),
        );
      },
      [],
    );

  const handleVideoTracks =
    useCallback(
      (
        data: VideoTracksEvent,
      ) => {
        setVideoTracks(
          (
            data.videoTracks ||
            []
          ).map(
            normalizeVideoTrack,
          ),
        );
      },
      [],
    );

  const handleError =
    useCallback(
      (
        data: VideoErrorEvent,
      ) => {
        let message =
          'تعذر تشغيل هذا المحتوى.';

        if (
          data?.error
        ) {
          try {
            const raw =
              JSON.stringify(
                data.error,
              );

            if (
              raw &&
              raw.length >
                0
            ) {
              message =
                `تعذر تشغيل المحتوى.\n${raw}`;
            }
          } catch {
            // Keep default message.
          }
        }

        setError(
          message,
        );

        setLoading(
          false,
        );

        setBuffering(
          false,
        );

        setPaused(
          true,
        );

        wakeControls();
      },
      [
        wakeControls,
      ],
    );

  const handleBuffer =
    useCallback(
      (
        data: VideoBufferEvent,
      ) => {
        setBuffering(
          data.isBuffering,
        );
      },
      [],
    );

  const handleEnd =
    useCallback(
      () => {
        setEnded(
          true,
        );

        setPaused(
          true,
        );

        setShowControls(
          true,
        );

        clearHideTimer();
      },
      [
        clearHideTimer,
      ],
    );

  if (
    isMovieDetails
  ) {
    return (
      <MovieDetailsView
        channel={channel}
        onBack={onBack}
        onWatch={() => {
          setMovieStarted(true);
          setLoading(true);
          setError(null);
          setEnded(false);
          setPaused(false);
          setBuffering(false);
          setMenu(null);
          setVideoTracks([]);
          setAudioTracks([]);
          setTextTracks([]);
          setSelectedVideoTrack({ type: VIDEO_TRACK_TYPE.AUTO });
          setSelectedAudioTrack(undefined);
          setSelectedTextTrack({ type: TRACK_TYPE.DISABLED });
        }}
      />
    );
  }

  if (
    isSeriesDetails
  ) {
    return (
      <SeriesDetailsView
        channel={
          channel
        }
        onBack={
          onBack
        }
        onPlayEpisode={episode => {
          setActiveEpisode(
            episode,
          );

          setLoading(
            true,
          );

          setError(
            null,
          );

          setEnded(
            false,
          );

          setPaused(
            false,
          );
        }}
      />
    );
  }

  return (
    <View
      style={
        styles.container
      }
    >
      <Video
        key={`${playbackChannel.id}-${retryKey}`}
        ref={
          videoRef
        }
        source={{
          uri:
            playbackChannel.url,
        }}
        style={
          styles.video
        }
        resizeMode="contain"
        controls={
          false
        }
        paused={
          paused
        }
        playInBackground={
          false
        }
        playWhenInactive={
          false
        }
        repeat={
          false
        }
        progressUpdateInterval={
          500
        }
        selectedAudioTrack={
          selectedAudioTrack
        }
        selectedTextTrack={
          selectedTextTrack
        }
        selectedVideoTrack={
          selectedVideoTrack
        }
        onLoad={
          handleLoad
        }
        onProgress={
          handleProgress
        }
        onAudioTracks={
          handleAudioTracks
        }
        onTextTracks={
          handleTextTracks
        }
        onVideoTracks={
          handleVideoTracks
        }
        onBuffer={
          handleBuffer
        }
        onError={
          handleError
        }
        onEnd={
          handleEnd
        }
      />

      {buffering &&
        !error &&
        !ended && (
          <View
            style={
              styles.bufferingOverlay
            }
            pointerEvents="none"
          >
            <View
              style={
                styles.spinner
              }
            >
              <Text
                style={
                  styles.spinnerText
                }
              >
                ◌
              </Text>
            </View>

            <Text
              style={
                styles.bufferingText
              }
            >
              جاري تحميل البث...
            </Text>
          </View>
        )}

      {!showControls &&
        !error &&
        !ended && (
          <Pressable
            focusable
            hasTVPreferredFocus
            onPress={
              wakeControls
            }
            style={
              styles.hiddenControlsTapZone
            }
            accessibilityLabel="إظهار عناصر التحكم"
          />
        )}

      {showControls &&
        !error &&
        !ended && (
          <>
            <View
              style={
                styles.topGradient
              }
              pointerEvents="box-none"
            >
              <View
                style={[styles.topBar,{flexDirection: ar ? 'row-reverse' : 'row'}]}
              >
                <ControlButton
                  icon={ar ? '›' : '‹'}
                  label="رجوع"
                  onPress={
                    goBack
                  }
                  preferred
                  compact
                />

                <View
                  style={
                    styles.titleBlock
                  }
                >
                  <Text
                    numberOfLines={
                      1
                    }
                    style={[styles.title,{writingDirection: ar ? 'rtl' : 'ltr',textAlign: ar ? 'right' : 'left'}]}
                  >
                    {
                      playbackChannel.name
                    }
                  </Text>

                  <View
                    style={
                      styles.metaRow
                    }
                  >
                    <View
                      style={[
                        styles.liveBadge,
                        !isLive &&
                          styles.vodBadge,
                      ]}
                    >
                      <Text
                        style={
                          styles.liveBadgeText
                        }
                      >
                        {isLive
                          ? 'LIVE'
                          : getContentLabel(
                              playbackChannel,
                            )}
                      </Text>
                    </View>

                    {playbackChannel.group ? (
                      <Text
                        numberOfLines={
                          1
                        }
                        style={[styles.groupText,{writingDirection: ar ? 'rtl' : 'ltr',textAlign: ar ? 'right' : 'left'}]}
                      >
                        {
                          playbackChannel.group
                        }
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            <View
              style={styles.bottomGradient}
              pointerEvents="box-none"
            >
              <View style={styles.bottomScrim} pointerEvents="none" />
              <View
                style={
                  styles.bottomPanel
                }
              >
                {duration >
                  0 && (
                  <View
                    style={
                      styles.progressSection
                    }
                  >
                    <View
                      style={
                        styles.timeRow
                      }
                    >
                      <Text
                        style={
                          styles.timeText
                        }
                      >
                        {formatTime(
                          currentTime,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.timeText
                        }
                      >
                        {formatTime(
                          duration,
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.progressTrack
                      }
                    >
                      <View
                        style={[
                          styles.bufferedTrack,
                          {
                            width: `${bufferedRatio * 100}%`,
                          },
                        ]}
                      />

                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${progressRatio * 100}%`,
                          },
                        ]}
                      />

                      <View
                        style={[
                          styles.progressThumb,
                          {
                            left: `${progressRatio * 100}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}

                <View
                  style={
                    styles.controlsRow
                  }
                >
                  <ControlButton
                    icon={
                      paused
                        ? '▶'
                        : '❚❚'
                    }
                    label={
                      paused
                        ? 'تشغيل'
                        : 'إيقاف'
                    }
                    onPress={
                      togglePlay
                    }
                  />

                  <ControlButton
                    icon="↶"
                    label="-10"
                    onPress={() =>
                      seekBy(
                        -10,
                      )
                    }
                    disabled={
                      isLive
                    }
                  />

                  <ControlButton
                    icon="↷"
                    label="+10"
                    onPress={() =>
                      seekBy(
                        10,
                      )
                    }
                    disabled={
                      isLive
                    }
                  />

                  <ControlButton
                    icon="A"
                    label="الصوت"
                    onPress={() => {
                      setMenu(
                        'audio',
                      );

                      clearHideTimer();
                    }}
                    disabled={
                      audioTracks.length ===
                      0
                    }
                  />

                  <ControlButton
                    icon="CC"
                    label="الترجمة"
                    onPress={() => {
                      setMenu(
                        'subtitle',
                      );

                      clearHideTimer();
                    }}
                    disabled={
                      textTracks.length ===
                      0
                    }
                  />

                  <ControlButton
                    icon="HD"
                    label="الجودة"
                    onPress={() => {
                      setMenu(
                        'quality',
                      );

                      clearHideTimer();
                    }}
                    disabled={
                      uniqueVideoTracks(
                        videoTracks,
                      ).length <=
                      1
                    }
                  />

                  <ControlButton
                    icon="⛶"
                    label="ملء الشاشة"
                    onPress={
                      wakeControls
                    }
                    compact
                  />

                  <ControlButton
                    icon="×"
                    label="خروج"
                    onPress={
                      goBack
                    }
                    compact
                  />
                </View>
              </View>
            </View>
          </>
        )}

      {loading &&
        !error &&
        !ended && (
          <View
            style={
              styles.loadingOverlay
            }
          >
            <View
              style={
                styles.loadingLogo
              }
            >
              <Text
                style={
                  styles.loadingLogoText
                }
              >
                ش
              </Text>
            </View>

            <Text
              style={
                styles.loadingTitle
              }
            >
              جاري فتح المحتوى
            </Text>

            <Text
              style={
                styles.loadingSubtitle
              }
            >
              يرجى الانتظار...
            </Text>
          </View>
        )}

      {error && (
        <View
          style={
            styles.messageOverlay
          }
        >
          <View
            style={
              styles.messageCard
            }
          >
            <View
              style={
                styles.messageIcon
              }
            >
              <Text
                style={
                  styles.messageIconText
                }
              >
                !
              </Text>
            </View>

            <Text
              style={
                styles.messageTitle
              }
            >
              حدثت مشكلة في التشغيل
            </Text>

            <Text
              style={
                styles.messageDescription
              }
            >
              {error}
            </Text>

            <View
              style={
                styles.messageActions
              }
            >
              <ControlButton
                icon="↻"
                label="إعادة المحاولة"
                onPress={
                  retry
                }
                preferred
              />

              <ControlButton
                icon="‹"
                label="رجوع"
                onPress={
                  goBack
                }
              />
            </View>
          </View>
        </View>
      )}

      {ended &&
        !error && (
          <View
            style={
              styles.messageOverlay
            }
          >
            <View
              style={
                styles.messageCard
              }
            >
              <View
                style={
                  styles.messageIcon
                }
              >
                <Text
                  style={
                    styles.messageIconText
                  }
                >
                  ✓
                </Text>
              </View>

              <Text
                style={
                  styles.messageTitle
                }
              >
                انتهى المحتوى
              </Text>

              <Text
                style={
                  styles.messageDescription
                }
              >
                يمكنك إعادة تشغيله من البداية أو الرجوع للمكتبة.
              </Text>

              <View
                style={
                  styles.messageActions
                }
              >
                <ControlButton
                  icon="↻"
                  label="إعادة التشغيل"
                  onPress={
                    replay
                  }
                  preferred
                />

                <ControlButton
                  icon="‹"
                  label="رجوع"
                  onPress={
                    goBack
                  }
                />
              </View>
            </View>
          </View>
        )}

      {menu ===
        'audio' && (
        <TrackMenu
          type="audio"
          tracks={
            audioTracks
          }
          selected={
            selectedAudioTrack
          }
          onSelect={selection => {
            setSelectedAudioTrack(
              selection,
            );

            wakeControls();
          }}
          onClose={() => {
            setMenu(
              null,
            );

            wakeControls();
          }}
        />
      )}

      {menu ===
        'subtitle' && (
        <TrackMenu
          type="subtitle"
          tracks={
            textTracks
          }
          selected={
            selectedTextTrack
          }
          onSelect={selection => {
            setSelectedTextTrack(
              selection,
            );

            wakeControls();
          }}
          onClose={() => {
            setMenu(
              null,
            );

            wakeControls();
          }}
        />
      )}

      {menu ===
        'quality' && (
        <QualityMenu
          tracks={
            videoTracks
          }
          selected={
            selectedVideoTrack
          }
          onSelect={selection => {
            setSelectedVideoTrack(
              selection,
            );

            wakeControls();
          }}
          onClose={() => {
            setMenu(
              null,
            );

            wakeControls();
          }}
        />
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#000000',
      width:
        SCREEN_WIDTH,
      height:
        SCREEN_HEIGHT,
      overflow:
        'hidden',
    },

    video: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        '#000000',
    },

    hiddenControlsTapZone: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
    },

    topScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 240, backgroundColor: 'rgba(4,7,14,0.70)', zIndex: 0 },

    topGradient: {
      position:
        'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: 27,
      paddingHorizontal: 48,
      paddingBottom: 27,
      backgroundColor: 'transparent',
      zIndex: 10,
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
    },

    titleBlock: {
      flex: 1,
      marginLeft: 16,
      marginRight: 16,
    },

    title: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
    },

    metaRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      marginTop: 7,
    },

    liveBadge: {
      backgroundColor:
        SHASHTNA_THEME.colors.primary,
      borderRadius:
        SHASHTNA_THEME.radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },

    vodBadge: {
      backgroundColor:
        '#1A2238',
      borderWidth: 1,
      borderColor:
        '#31405D',
    },

    liveBadgeText: {
      color:
        '#FFFFFF',
      fontSize: 13,
      fontWeight:
        '800',
      letterSpacing:
        0.8,
    },

    groupText: {
      marginLeft: 10,
      color:
        '#94A3B8',
      fontSize: 15,
      maxWidth: 420,
    },

    bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 440, backgroundColor: 'rgba(4,7,14,0.78)', zIndex: 0 },

    bottomGradient: {
      position:
        'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 48,
      paddingTop: 100,
      paddingBottom: 27,
      backgroundColor: 'transparent',
      zIndex: 10,
    },

    bottomPanel: {
      width: '100%',
      zIndex: 1,
    },

    progressSection: {
      marginBottom: 14,
    },

    timeRow: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      marginBottom: 8,
    },

    timeText: {
      color:
        '#CBD5E1',
      fontSize: 15,
      fontVariant: [
        'tabular-nums',
      ],
    },

    progressTrack: {
      height: 6,
      width: '100%',
      borderRadius: 999,
      backgroundColor:
        '#24304A',
      position:
        'relative',
      overflow:
        'visible',
    },

    bufferedTrack: {
      position:
        'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor:
        '#42506B',
      borderRadius: 999,
    },

    progressFill: {
      position:
        'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor:
        SHASHTNA_THEME.colors.primary,
      borderRadius: 999,
    },

    progressThumb: {
      position:
        'absolute',
      top: -7,
      marginLeft: -6,
      width: 20,
      height: 20,
      borderRadius: 999,
      backgroundColor:
        '#FFFFFF',
      shadowColor:
        '#0066FF',
      shadowOpacity:
        0.65,
      shadowRadius:
        8,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      elevation: 10,
    },

    controlsRow: {
      flexDirection:
        'row',
      justifyContent: 'center',
      alignItems:
        'center',
      flexWrap: 'nowrap',
      gap: 10,
    },

    controlButton: {
      minWidth: 96,
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 24,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(18, 24, 41, 0.94)',
      borderWidth: 1,
      borderColor:
        'rgba(148, 163, 184, 0.10)',
    },

    controlButtonCompact: {
      minWidth: 58,
      width: 58,
      paddingHorizontal: 0,
    },

    controlButtonFocused: {
      borderColor: '#FFFFFF',
      backgroundColor: 'rgba(255,255,255,0.92)',
      transform: [
        {
          scale: 1.05,
        },
      ],
      shadowColor: '#030810',
      shadowOpacity:
        0.7,
      shadowRadius:
        18,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      elevation: 14,
    },

    controlButtonDisabled: {
      opacity: 0.38,
    },

    controlIcon: {
      color:
        '#FFFFFF',
      fontSize: 21,
      fontWeight:
        '800',
      marginRight: 8,
    },

    controlIconDisabled: {
      color:
        '#94A3B8',
    },

    controlLabel: {
      color:
        '#FFFFFF',
      fontSize: 15,
      fontWeight:
        '700',
    },

    controlLabelDisabled: {
      color:
        '#94A3B8',
    },

    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(0, 0, 0, 0.54)',
      zIndex: 15,
    },

    loadingLogo: {
      width: 74,
      height: 74,
      borderRadius: 22,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        SHASHTNA_THEME.colors.primary,
      shadowColor: '#030810',
      shadowOpacity:
        0.55,
      shadowRadius:
        24,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      elevation: 14,
    },

    loadingLogoText: {
      color:
        '#FFFFFF',
      fontSize: 34,
      fontWeight:
        '900',
    },

    loadingTitle: {
      marginTop: 20,
      color:
        '#FFFFFF',
      fontSize: 21,
      fontWeight:
        '700',
    },

    loadingSubtitle: {
      marginTop: 7,
      color:
        '#94A3B8',
      fontSize: 15,
    },

    bufferingOverlay: {
      position:
        'absolute',
      left: 0,
      right: 0,
      top: '44%',
      alignItems:
        'center',
      justifyContent:
        'center',
      zIndex: 12,
    },

    spinner: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(10, 14, 26, 0.88)',
      borderWidth: 2,
      borderColor:
        'rgba(0, 102, 255, 0.7)',
    },

    spinnerText: {
      color:
        '#FFFFFF',
      fontSize: 33,
      lineHeight: 33,
    },

    bufferingText: {
      marginTop: 12,
      color:
        '#FFFFFF',
      fontSize: 15,
      fontWeight:
        '600',
    },

    messageOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(4, 7, 14, 0.82)',
      zIndex: 30,
      paddingHorizontal: 24,
    },

    messageCard: {
      width: '100%',
      maxWidth: 650,
      paddingHorizontal: 32,
      paddingVertical: 34,
      borderRadius: 26,
      backgroundColor:
        '#121829',
      borderWidth: 1,
      borderColor:
        '#26324C',
      alignItems:
        'center',
    },

    messageIcon: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(0, 102, 255, 0.15)',
      borderWidth: 1,
      borderColor:
        'rgba(0, 102, 255, 0.5)',
    },

    messageIconText: {
      color:
        '#FFFFFF',
      fontSize: 28,
      fontWeight:
        '900',
    },

    messageTitle: {
      marginTop: 18,
      color:
        '#FFFFFF',
      fontSize: 20,
      fontWeight:
        '800',
      textAlign:
        'center',
    },

    messageDescription: {
      marginTop: 10,
      color:
        '#94A3B8',
      fontSize: 15,
      lineHeight: 22,
      textAlign:
        'center',
      maxWidth: 520,
    },

    messageActions: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'center',
      flexWrap: 'nowrap',
      gap: 12,
      marginTop: 26,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor:
        'rgba(0, 0, 0, 0.68)',
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 28,
    },

    trackPanel: {
      width: '100%',
      maxWidth: 620,
      maxHeight: '78%',
      backgroundColor:
        '#121829',
      borderRadius: 24,
      borderWidth: 1,
      borderColor:
        '#2A3754',
      overflow:
        'hidden',
    },

    trackPanelHeader: {
      minHeight: 78,
      paddingHorizontal: 22,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      borderBottomWidth: 1,
      borderBottomColor:
        'rgba(148, 163, 184, 0.10)',
    },

    trackPanelTitle: {
      color:
        '#FFFFFF',
      fontSize: 21,
      fontWeight:
        '800',
    },

    closeButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#1A2238',
      borderWidth: 1,
      borderColor:
        '#2D3A57',
    },

    closeButtonFocused: {
      borderColor: '#FFFFFF',
      backgroundColor:
        'rgba(0, 102, 255, 0.20)',
      transform: [
        {
          scale: 1.05,
        },
      ],
    },

    closeButtonText: {
      color:
        '#FFFFFF',
      fontSize: 28,
      lineHeight: 30,
      fontWeight:
        '400',
    },

    trackList: {
      padding: 16,
    },

    trackItem: {
      minHeight: 70,
      paddingHorizontal: 18,
      borderRadius: 16,
      marginBottom: 9,
      backgroundColor:
        '#1A2238',
      borderWidth: 1,
      borderColor:
        'transparent',
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    trackItemSelected: {
      borderColor: '#FFFFFF',
      backgroundColor:
        'rgba(0, 102, 255, 0.15)',
    },

    trackItemFocused: {
      borderColor: '#FFFFFF',
      backgroundColor:
        'rgba(0, 102, 255, 0.20)',
      transform: [
        {
          scale: 1.02,
        },
      ],
    },

    trackItemText: {
      flex: 1,
      paddingRight: 18,
    },

    trackItemTitle: {
      color:
        '#FFFFFF',
      fontSize: 16,
      fontWeight:
        '700',
    },

    trackItemSubtitle: {
      marginTop: 5,
      color:
        '#94A3B8',
      fontSize: 15,
      fontWeight:
        '600',
    },

    checkMark: {
      color:
        '#FFFFFF',
      fontSize: 22,
      fontWeight:
        '900',
    },

    emptyTracks: {
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 32,
      paddingVertical: 50,
    },

    emptyTracksIcon: {
      color:
        SHASHTNA_THEME.colors.primary,
      fontSize: 40,
      fontWeight:
        '900',
    },

    emptyTracksTitle: {
      marginTop: 16,
      color:
        '#FFFFFF',
      fontSize: 18,
      fontWeight:
        '700',
      textAlign:
        'center',
    },

    emptyTracksDescription: {
      marginTop: 8,
      color:
        '#94A3B8',
      fontSize: 15,
      lineHeight: 21,
      textAlign:
        'center',
    },

    /*
     * Movie Details
     */

    movieDetailsRoot: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.background,
    },

    movieDetailsActions: {
      marginTop: 20,
      flexDirection: 'row',
      alignItems: 'center',
    },

    movieDetailsSecondaryText: {
      marginTop: 9,
      color: '#9FB3C8',
      fontSize: 15,
      lineHeight: 19,
      maxWidth: 820,
    },

    /*
     * Series Details
     */

    seriesDetailsRoot: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.background,
    },

    seriesTopBar: {
      minHeight: 76,
      paddingHorizontal: 48,
      flexDirection:
        'row',
      alignItems:
        'center',
      borderBottomWidth: 1,
      borderBottomColor:
        SHASHTNA_THEME.colors.borderSoft,
      backgroundColor:
        '#080D18',
    },

    seriesTopTitle: {
      flex: 1,
      marginLeft: 16,
    },

    seriesTopTitleText: {
      color:
        '#FFFFFF',
      fontSize: 21,
      fontWeight:
        '800',
    },

    seriesScrollContent: {
      paddingBottom: 48,
    },

    seriesHero: {
      minHeight: 390,
      position:
        'relative',
      overflow:
        'hidden',
      backgroundColor:
        SHASHTNA_THEME.colors.surface,
    },

    seriesHeroImage: {
      position:
        'absolute',
      width: '100%',
      height: '100%',
    },

    seriesHeroFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        SHASHTNA_THEME.colors.surfaceElevated,
    },

    seriesHeroOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        'rgba(5, 10, 20, 0.68)',
    },

    seriesHeroContent: {
      flex: 1,
      flexDirection:
        'row',
      alignItems:
        'flex-end',
      paddingHorizontal: 42,
      paddingVertical: 38,
      gap: 28,
    },

    seriesPosterWrap: {
      width: 220,
      height: 330,
      borderRadius: 18,
      overflow:
        'hidden',
      backgroundColor:
        SHASHTNA_THEME.colors.surfaceElevated,
      borderWidth: 1,
      borderColor:
        'rgba(255,255,255,0.12)',
      shadowColor:
        '#000000',
      shadowOpacity:
        0.45,
      shadowRadius:
        22,
      shadowOffset: {
        width: 0,
        height: 10,
      },
      elevation: 13,
    },

    seriesPoster: {
      width: '100%',
      height: '100%',
    },

    seriesPosterFallback: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    seriesPosterFallbackText: {
      color:
        SHASHTNA_THEME.colors.primary,
      fontSize: 62,
      fontWeight:
        '900',
    },

    seriesHeroInfo: {
      flex: 1,
      maxWidth: 850,
    },

    seriesTitle: {
      color:
        '#FFFFFF',
      fontSize: 40,
      lineHeight: 48,
      fontWeight:
        '900',
    },

    seriesMetaRow: {
      marginTop: 13,
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 12,
      flexWrap: 'nowrap',
    },

    seriesBadge: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius:
        999,
      backgroundColor:
        SHASHTNA_THEME.colors.primary,
    },

    seriesBadgeText: {
      color:
        '#FFFFFF',
      fontSize: 10,
      fontWeight:
        '900',
      letterSpacing:
        1,
    },

    seriesMetaText: {
      color:
        '#CBD5E1',
      fontSize: 15,
      fontWeight:
        '700',
    },

    seriesGenre: {
      marginTop: 14,
      color:
        '#8FB4D9',
      fontSize: 15,
      fontWeight:
        '700',
    },

    seriesPlotHero: {
      marginTop: 13,
      color:
        '#CBD5E1',
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 820,
    },

    seriesLoading: {
      minHeight: 240,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingHorizontal: 30,
    },

    seriesLoadingText: {
      marginTop: 14,
      color:
        '#94A3B8',
      fontSize: 15,
      fontWeight:
        '600',
    },

    seriesErrorCard: {
      margin: 28,
      padding: 24,
      borderRadius: 20,
      alignItems:
        'center',
      backgroundColor:
        SHASHTNA_THEME.colors.surface,
      borderWidth: 1,
      borderColor:
        SHASHTNA_THEME.colors.borderSoft,
    },

    seriesErrorTitle: {
      color:
        '#FFFFFF',
      fontSize: 18,
      fontWeight:
        '800',
      textAlign:
        'center',
    },

    seriesErrorText: {
      marginTop: 8,
      marginBottom: 20,
      color:
        '#94A3B8',
      fontSize: 15,
      lineHeight: 19,
      textAlign:
        'center',
    },

    seriesSectionTitle: {
      paddingHorizontal: 32,
      marginTop: 28,
      marginBottom: 14,
      color:
        '#FFFFFF',
      fontSize: 20,
      fontWeight:
        '900',
    },

    seasonList: {
      paddingHorizontal: 32,
      gap: 10,
    },

    seasonButton: {
      minWidth: 160,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 16,
      backgroundColor:
        SHASHTNA_THEME.colors.surface,
      borderWidth: 1,
      borderColor:
        SHASHTNA_THEME.colors.borderSoft,
    },

    seasonButtonActive: {
      backgroundColor:
        SHASHTNA_THEME.colors.primarySoft,
      borderColor: '#FFFFFF',
    },

    seasonButtonFocused: {
      transform: [
        {
          scale: 1.08,
        },
      ],
      borderColor:
        '#66C8FF',
      backgroundColor:
        'rgba(0,102,255,0.24)',
    },

    seasonButtonText: {
      color:
        '#94A3B8',
      fontSize: 15,
      fontWeight:
        '800',
    },

    seasonButtonTextActive: {
      color:
        '#FFFFFF',
    },

    seasonButtonSub: {
      marginTop: 4,
      color:
        '#5F7996',
      fontSize: 10,
      fontWeight:
        '700',
    },

    seasonButtonSubActive: {
      color:
        '#8FCFFF',
    },

    episodesHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    episodesCount: {
      marginRight: 32,
      color:
        '#6F88A4',
      fontSize: 11,
      fontWeight:
        '700',
    },

    episodeGrid: {
      paddingHorizontal: 32,
      flexDirection:
        'row',
      flexWrap: 'nowrap',
      gap: 14,
    },

    episodeCard: {
      width: '31.5%',
      minHeight: 160,
      borderRadius: 17,
      backgroundColor:
        SHASHTNA_THEME.colors.surface,
      borderWidth: 1,
      borderColor:
        SHASHTNA_THEME.colors.borderSoft,
      overflow:
        'hidden',
      position:
        'relative',
    },

    episodeCardFocused: {
      transform: [
        {
          scale: 1.08,
        },
      ],
      borderColor: '#FFFFFF',
      backgroundColor:
        '#10223D',
      shadowColor: '#030810',
      shadowOpacity:
        0.5,
      shadowRadius:
        18,
      shadowOffset: {
        width: 0,
        height: 0,
      },
      elevation: 13,
    },

    episodeImageWrap: {
      height: 96,
      backgroundColor:
        SHASHTNA_THEME.colors.surfaceElevated,
      position:
        'relative',
    },

    episodeImage: {
      width: '100%',
      height: '100%',
    },

    episodeImageFallback: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        '#0B223D',
    },

    episodeImageFallbackText: {
      color:
        SHASHTNA_THEME.colors.primaryBright,
      fontSize: 26,
      fontWeight:
        '900',
    },

    episodeNumberBadge: {
      position:
        'absolute',
      left: 9,
      top: 8,
      minWidth: 30,
      height: 28,
      paddingHorizontal: 7,
      borderRadius: 9,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(5, 12, 24, 0.86)',
      borderWidth: 1,
      borderColor:
        'rgba(0,102,255,0.42)',
    },

    episodeNumberText: {
      color:
        '#FFFFFF',
      fontSize: 11,
      fontWeight:
        '900',
    },

    episodeInfo: {
      paddingHorizontal: 12,
      paddingVertical: 11,
      paddingRight: 50,
    },

    episodeTitle: {
      color:
        '#FFFFFF',
      fontSize: 15,
      lineHeight: 18,
      fontWeight:
        '800',
    },

    episodeMeta: {
      marginTop: 5,
      color:
        '#69839F',
      fontSize: 9,
      fontWeight:
        '700',
    },

    episodePlay: {
      position:
        'absolute',
      right: 11,
      bottom: 12,
      width: 31,
      height: 31,
      borderRadius: 16,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        SHASHTNA_THEME.colors.primary,
    },

    episodePlayText: {
      color:
        '#FFFFFF',
      fontSize: 10,
      marginLeft: 1,
    },

    noEpisodes: {
      marginHorizontal: 32,
      marginBottom: 30,
      minHeight: 170,
      borderRadius: 19,
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        SHASHTNA_THEME.colors.surface,
      borderWidth: 1,
      borderColor:
        SHASHTNA_THEME.colors.borderSoft,
    },

    noEpisodesTitle: {
      color:
        '#FFFFFF',
      fontSize: 17,
      fontWeight:
        '800',
    },

    noEpisodesText: {
      marginTop: 7,
      color:
        '#6D86A1',
      fontSize: 11,
      textAlign:
        'center',
    },
  });
