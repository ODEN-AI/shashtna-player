import React, {
  ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  BackHandler,
  Image,
  useTVEventHandler,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TVFocusGuideView,
  View,
} from 'react-native';
import { Text } from '../../components/common/Typography';

import Video, {
  VideoRef,
} from 'react-native-video';

import type { M3UChannel } from '../../lib/m3uCore';

import { SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import SeekBar from '../../features/player/SeekBar';
import type { MovieDetailsProps } from '../../features/details/MovieDetailsScreen';
import type { SeriesDetailsProps } from '../../features/details/SeriesDetailsScreen';
import ChannelBanner, { ChannelBannerState } from '../../features/player/ChannelBanner';
import ChannelListPanel from '../../features/player/ChannelListPanel';
import { BRAND } from '../../design/brand';
import { describePlaybackError } from '../../features/player/playbackErrors';
import { createProgressStore, formatClock, ProgressStore } from '../../features/player/progressStore';
import {
  ensureContinueWatchingLoaded,
  getResumePosition,
  recordProgress,
} from '../../features/player/resumeRegistry';

type PlayerScreenProps = {
  channel: M3UChannel;
  /** Receives the item on screen when leaving (after zapping it differs from `channel`). */
  onBack: (lastPlayed?: M3UChannel) => void;
  // Kept for compatibility with App.tsx/settings flow.
  preferredQuality?: string;
  autoplay?: boolean;
  subtitles?: boolean;
  /** Live list the channel was opened from; enables in-player zapping. */
  liveQueue?: readonly M3UChannel[];
  /** Open this series episode directly (Continue Watching). */
  startEpisode?: M3UChannel | null;
  /** Skip the movie details page and start playback (Continue Watching). */
  autoStart?: boolean;
  /** Favorite state of `channel` (movie or series) for the detail pages. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /**
   * Movie / series detail pages. Passed in by the Full app; Shashtna Player
   * Lite has no VOD, so it omits them and their code is not in its bundle.
   */
  detailScreens?: PlayerDetailScreens;
};

export type PlayerDetailScreens = {
  Movie: React.ComponentType<MovieDetailsProps>;
  Series: React.ComponentType<SeriesDetailsProps>;
};

/** Coalesces rapid UP/DOWN presses so only the final channel opens a stream. */
const ZAP_COMMIT_MS = 450;
const ZAP_BANNER_MS = 3000;
/** Continue Watching is written at most this often during playback. */
const RESUME_SAVE_INTERVAL_MS = 10000;

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

const GLYPH_ICONS: Record<string, { name: AppIconName; flip?: boolean }> = {
  '‹': { name: 'back' },
  '›': { name: 'back', flip: true },
  '↻': { name: 'refresh' },
  '▶': { name: 'play' },
  '❚❚': { name: 'pause' },
  '↶': { name: 'rewind' },
  '↷': { name: 'forward' },
  'A': { name: 'audio' },
  'CC': { name: 'subtitle' },
  'HD': { name: 'quality' },
  '⛶': { name: 'fullscreen' },
  '×': { name: 'close' },
  '▲': { name: 'channelUp' },
  '▼': { name: 'channelDown' },
  '☰': { name: 'menu' },
};

/** Live TV controls row: a vertical focus trap on Android TV (see tvZap). */
const ControlsRow = Platform.isTV ? TVFocusGuideView : View;

/**
 * Badge shown while a channel opens. The edition's own player mark (Shashtna:
 * «ش»); عامر IPTV has none, so it shows the channel's real logo when the
 * playlist has one, otherwise just a spinner, never a placeholder logo.
 */
function LoadingMark({ channel }: { channel: M3UChannel }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [channel.logo]);
  if (BRAND.playerMark) {
    return (
      <View style={styles.loadingLogo}>
        <Text style={styles.loadingLogoText}>{BRAND.playerMark}</Text>
      </View>
    );
  }
  if (channel.logo && !failed) {
    return (
      <View style={styles.loadingChannelLogo} testID="player-loading-channel-logo">
        <Image source={{ uri: channel.logo }} style={styles.loadingChannelLogoImage} resizeMode="contain" onError={() => setFailed(true)} />
      </View>
    );
  }
  return <ActivityIndicator size="large" color="#FFFFFF" testID="player-loading-spinner" />;
}

function ControlButton({
  icon,
  label,
  onPress,
  disabled = false,
  preferred = false,
  compact = false,
  large = false,
  tvFocusable = true,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  preferred?: boolean;
  /** false: never takes TV focus (still pressable by touch). */
  tvFocusable?: boolean;
  compact?: boolean;
  /** Bigger touch target (mobile channel switching). */
  large?: boolean;
}) {
  const glyph = GLYPH_ICONS[icon];
  const [
    focused,
    setFocused,
  ] =
    useState(false);

  return (
    <Pressable
      focusable={
        !disabled && tvFocusable
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
        large &&
          styles.controlButtonLarge,
        compact &&
          styles.controlButtonCompact,
        disabled &&
          styles.controlButtonDisabled,
        focused &&
          styles.controlButtonFocused,
      ]}
    >
      {glyph ? (
        <View style={[styles.controlIconBox, !compact && styles.controlIconGap, glyph.flip && styles.flipX]}>
          <AppIcon name={glyph.name} size={large ? 26 : 21} color={disabled ? '#94A3B8' : '#FFFFFF'} />
        </View>
      ) : (
        <Text
          style={[
            styles.controlIcon,
            disabled &&
              styles.controlIconDisabled,
          ]}
        >
          {icon}
        </Text>
      )}

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

export default function PlayerScreen({
  channel,
  onBack,
  liveQueue,
  startEpisode = null,
  autoStart = false,
  isFavorite = false,
  onToggleFavorite,
  detailScreens,
}: PlayerScreenProps) {
  const MovieDetailsScreen = detailScreens?.Movie;
  const SeriesDetailsScreen = detailScreens?.Series;
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const [
    activeEpisode,
    setActiveEpisode,
  ] =
    useState<M3UChannel | null>(
      startEpisode,
    );

  const [
    movieStarted,
    setMovieStarted,
  ] = useState(autoStart);

  // Channel chosen by in-player zapping; null means "the channel we were opened with".
  const [
    zappedChannel,
    setZappedChannel,
  ] = useState<M3UChannel | null>(null);

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
    zappedChannel ||
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

  // Position/buffer live in an external store so 500 ms progress events
  // re-render only the SeekBar, not the whole player.
  const progressStoreRef =
    useRef<ProgressStore | null>(null);

  if (!progressStoreRef.current) {
    progressStoreRef.current =
      createProgressStore();
  }

  const progress =
    progressStoreRef.current;

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

  const [
    errorInfo,
    setErrorInfo,
  ] = useState<{ title: string; message: string; technical: string } | null>(null);

  const [
    showDiagnostics,
    setShowDiagnostics,
  ] = useState(false);

  const [
    banner,
    setBanner,
  ] = useState<ChannelBannerState | null>(null);

  const [
    resumeNotice,
    setResumeNotice,
  ] = useState<string | null>(null);

  const [
    scrubbing,
    setScrubbing,
  ] = useState(false);

  const canZap =
    channel.contentType === 'live' &&
    (liveQueue?.length ?? 0) > 1;

  /**
   * Android TV / TV box, live channel with a queue: D-pad UP/DOWN always
   * zap (no OK, no control bar needed), so the controls have a single
   * focusable row and vertical focus moves are trapped (see the render).
   */
  const tvZap = Platform.isTV && canZap;

  // In-player channel list («قائمة القنوات»); playback keeps running behind it.
  const [channelList, setChannelList] = useState(false);
  const channelListRef = useRef(false);
  channelListRef.current = channelList;
  // After closing the list, TV focus goes back to its button.
  const [focusListButton, setFocusListButton] = useState(false);

  // Refs read by long-lived callbacks (TV key handler, timers, progress).
  const durationRef = useRef(0);
  durationRef.current = duration;
  const playbackChannelRef = useRef(playbackChannel);
  playbackChannelRef.current = playbackChannel;
  const resumeParentRef = useRef<M3UChannel | undefined>(undefined);
  resumeParentRef.current = activeEpisode ? channel : undefined;
  const lastSaveAtRef = useRef(0);
  const suppressWakeRef = useRef(false);
  // "From start" on the movie page: ignore the saved position once.
  const skipResumeRef = useRef(false);
  const zapTargetRef = useRef<number | null>(null);
  const zapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          channelListRef.current ||
          scrubbing ||
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
        scrubbing,
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

  const openChannelList = useCallback(() => {
    clearHideTimer();
    setFocusListButton(false);
    setMenu(null);
    setChannelList(true);
  }, [clearHideTimer]);

  /** BACK or ×: back to the player, focus on «قائمة القنوات», playback untouched. */
  const closeChannelList = useCallback(() => {
    channelListRef.current = false;
    setChannelList(false);
    setFocusListButton(true);
    wakeControls();
  }, [wakeControls]);

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

        onBack(zappedChannel || channel);
      },
      [
        activeEpisode,
        channel,
        clearHideTimer,
        movieStarted,
        onBack,
        zappedChannel,
      ],
    );

  useEffect(() => {
    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (channelListRef.current) {
            closeChannelList();
            return true;
          }

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
    closeChannelList,
    goBack,
    menu,
    wakeControls,
  ]);

  useEffect(() => {
    setActiveEpisode(
      startEpisode,
    );

    setMovieStarted(autoStart);

    setZappedChannel(null);

    setBanner(null);

    setPaused(
      false,
    );

    setDuration(
      0,
    );

    progress.reset();

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
    // Reset only when a different item is opened; launch options belong to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      progress.reset();

      setErrorInfo(
        null,
      );

      setShowDiagnostics(
        false,
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
    progress,
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
              progress.get().currentTime +
                seconds,
            ),
          );

        videoRef.current.seek(
          target,
        );

        progress.set({
          currentTime: target,
        });

        setEnded(
          false,
        );

        wakeControls();
      },
      [
        duration,
        progress,
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

        progress.set({
          currentTime: 0,
        });

        setEnded(
          false,
        );

        setPaused(
          false,
        );

        wakeControls();
      },
      [
        progress,
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
        const position =
          data.currentTime || 0;

        progress.set({
          currentTime: position,
          playableDuration:
            data.playableDuration || 0,
        });

        const now = Date.now();

        if (
          durationRef.current > 0 &&
          now - lastSaveAtRef.current >
            RESUME_SAVE_INTERVAL_MS
        ) {
          lastSaveAtRef.current = now;
          recordProgress(
            playbackChannelRef.current,
            position,
            durationRef.current,
            resumeParentRef.current,
          );
        }
      },
      [progress],
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

        const skipResume = skipResumeRef.current;
        skipResumeRef.current = false;

        const resumeAt =
          nextDuration > 0 && !skipResume
            ? getResumePosition(
                playbackChannelRef.current,
              )
            : 0;

        if (
          resumeAt > 0 &&
          videoRef.current
        ) {
          videoRef.current.seek(
            resumeAt,
          );

          progress.set({
            currentTime: resumeAt,
          });

          setResumeNotice(
            formatClock(resumeAt),
          );
        }

        if (
          suppressWakeRef.current
        ) {
          // Channel switch: keep the picture clean, just let the banner settle.
          suppressWakeRef.current =
            false;

          if (bannerTimerRef.current) {
            clearTimeout(bannerTimerRef.current);
          }

          bannerTimerRef.current =
            setTimeout(
              () => setBanner(null),
              ZAP_BANNER_MS,
            );

          return;
        }

        wakeControls();
      },
      [
        progress,
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
        const info =
          describePlaybackError(
            data as any,
            ar,
          );

        setErrorInfo(
          info,
        );

        setShowDiagnostics(
          false,
        );

        setError(
          info.message,
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
        ar,
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
        recordProgress(
          playbackChannelRef.current,
          durationRef.current,
          durationRef.current,
          resumeParentRef.current,
        );

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

  useEffect(() => {
    void ensureContinueWatchingLoaded();
  }, []);

  // Save the final position when leaving an item (back, episode change, zap).
  useEffect(() => {
    const item = playbackChannel;
    const parent = resumeParentRef.current;

    return () => {
      const position = progress.get().currentTime;

      if (durationRef.current > 0 && position > 0) {
        recordProgress(item, position, durationRef.current, parent);
      }
    };
  }, [playbackChannel, progress]);

  useEffect(() => {
    if (!resumeNotice) return;
    const timer = setTimeout(() => setResumeNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [resumeNotice]);

  useEffect(
    () => () => {
      if (zapTimerRef.current) clearTimeout(zapTimerRef.current);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    },
    [],
  );

  /** Switches playback to queue[index] (shared by zapping and the channel list). */
  const tuneTo = useCallback(
    (index: number) => {
      const queue = liveQueue || [];
      const next = queue[index];
      if (!next) return;
      suppressWakeRef.current = true;
      clearHideTimer();
      setShowControls(false);
      setMenu(null);
      setFocusListButton(false);
      setZappedChannel(next.id === channel.id ? null : next);
      setBanner({ channel: next, number: index + 1, total: queue.length, pending: false });
      bannerTimerRef.current = setTimeout(() => setBanner(null), ZAP_BANNER_MS * 3);
    },
    [channel, clearHideTimer, liveQueue],
  );

  const zap =
    useCallback(
      (delta: 1 | -1) => {
        const queue = liveQueue || [];

        if (!canZap) {
          return;
        }

        const current = zappedChannel || channel;
        const currentIndex = queue.findIndex(item => item.id === current.id);
        const from = zapTargetRef.current ?? currentIndex;

        // Opened channel missing from the queue: enter at the matching end.
        const target =
          from < 0
            ? (delta > 0 ? 0 : queue.length - 1)
            : from + delta;

        if (bannerTimerRef.current) {
          clearTimeout(bannerTimerRef.current);
        }

        if (target < 0 || target >= queue.length) {
          // No wrap-around: stay on the current channel and say why.
          const edgeIndex = Math.max(0, Math.min(queue.length - 1, from));
          setBanner({
            channel: queue[edgeIndex] || current,
            number: edgeIndex + 1,
            total: queue.length,
            pending: false,
            edge: target < 0 ? 'first' : 'last',
          });
          bannerTimerRef.current = setTimeout(() => setBanner(null), ZAP_BANNER_MS);
          return;
        }

        zapTargetRef.current = target;

        setBanner({
          channel: queue[target],
          number: target + 1,
          total: queue.length,
          pending: true,
        });

        if (zapTimerRef.current) {
          clearTimeout(zapTimerRef.current);
        }

        zapTimerRef.current = setTimeout(() => {
          zapTimerRef.current = null;
          const index = zapTargetRef.current;
          zapTargetRef.current = null;

          if (index === null) {
            return;
          }

          tuneTo(index);
        }, ZAP_COMMIT_MS);
      },
      [canZap, channel, liveQueue, tuneTo, zappedChannel],
    );

  /** «قائمة القنوات»: tune straight to the chosen channel (no coalescing delay). */
  const selectFromList = useCallback(
    (index: number) => {
      if (zapTimerRef.current) {
        clearTimeout(zapTimerRef.current);
        zapTimerRef.current = null;
      }
      zapTargetRef.current = null;
      channelListRef.current = false;
      setChannelList(false);
      setFocusListButton(false);
      const queue = liveQueue || [];
      const current = zappedChannel || channel;
      if (queue[index] && String(queue[index].id) === String(current.id)) {
        wakeControls(); // already playing: just close the list
        return;
      }
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      tuneTo(index);
    },
    [channel, liveQueue, tuneTo, wakeControls, zappedChannel],
  );

  const showControlsRef = useRef(showControls);
  showControlsRef.current = showControls;
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const tvZapRef = useRef(tvZap);
  tvZapRef.current = tvZap;

  useTVEventHandler(
    useCallback(
      evt => {
        if (!evt || evt.eventKeyAction === 1 || !canZap || menuRef.current || channelListRef.current) {
          return;
        }

        // Dedicated channel keys always zap (CH+ = next, CH- = previous).
        if (evt.eventType === 'channelUp' || evt.eventType === 'channelDown') {
          zap(evt.eventType === 'channelUp' ? 1 : -1);
          return;
        }

        if (evt.eventType !== 'up' && evt.eventType !== 'down') {
          return;
        }

        // TV / TV box: UP = next channel, DOWN = previous, straight away, whether
        // or not the control bar is showing (its focus cannot move vertically).
        if (tvZapRef.current) {
          zap(evt.eventType === 'up' ? 1 : -1);
          return;
        }

        // Other devices with a D-pad: only while the control panel is hidden, so
        // arrows still move focus between visible controls.
        if (!showControlsRef.current) {
          zap(evt.eventType === 'up' ? 1 : -1);
        }
      },
      [canZap, zap],
    ),
  );

  if (
    isMovieDetails &&
    MovieDetailsScreen
  ) {
    return (
      <MovieDetailsScreen
        channel={channel}
        onBack={onBack}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onWatch={({ fromStart }) => {
          skipResumeRef.current = fromStart;
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
    isSeriesDetails &&
    SeriesDetailsScreen
  ) {
    return (
      <SeriesDetailsScreen
        channel={channel}
        onBack={onBack}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
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
        !ended &&
        !channelList && (
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
                  // TV live: BACK key and «خروج» cover it; out of the focus
                  // order so UP/DOWN cannot move focus to it (they zap).
                  preferred={!tvZap}
                  tvFocusable={!tvZap}
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
                    <SeekBar
                      store={progress}
                      duration={duration}
                      accessibilityLabel={ar ? 'شريط التقدم' : 'Playback position'}
                      onActivity={wakeControls}
                      onScrubbingChange={setScrubbing}
                      onSeek={target => {
                        videoRef.current?.seek(target);
                        progress.set({ currentTime: target });
                        setEnded(false);
                        wakeControls();
                      }}
                    />
                  </View>
                )}

                <ControlsRow
                  // TV live: this row is the only focusable one and vertical
                  // focus moves are trapped, so UP/DOWN only zap.
                  {...(tvZap ? { trapFocusUp: true, trapFocusDown: true } : {})}
                  style={[
                    styles.controlsRow,
                    { flexDirection: ar ? 'row-reverse' : 'row' },
                  ]}
                >
                  {canZap ? (
                    <ControlButton
                      icon="▲"
                      label={ar ? 'القناة السابقة' : 'Previous channel'}
                      onPress={() => zap(-1)}
                      large
                    />
                  ) : null}

                  <ControlButton
                    preferred={tvZap && !focusListButton}
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

                  {canZap ? (
                    <ControlButton
                      icon="▼"
                      label={ar ? 'القناة التالية' : 'Next channel'}
                      onPress={() => zap(1)}
                      large
                    />
                  ) : null}

                  {canZap ? (
                    <ControlButton
                      icon="☰"
                      label={ar ? 'قائمة القنوات' : 'Channels'}
                      onPress={openChannelList}
                      preferred={focusListButton}
                    />
                  ) : null}

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
                    onPress={() => {
                      clearHideTimer();
                      setShowControls(false);
                    }}
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
                </ControlsRow>
              </View>
            </View>
          </>
        )}

      <ChannelBanner
        state={banner}
        loading={loading}
        ar={ar}
      />

      {resumeNotice && !error ? (
        <View
          pointerEvents="none"
          style={[styles.resumeNotice, ar ? styles.resumeNoticeRtl : styles.resumeNoticeLtr]}
        >
          <Text style={styles.resumeNoticeText}>
            {ar ? `استئناف من ${resumeNotice}` : `Resuming from ${resumeNotice}`}
          </Text>
        </View>
      ) : null}

      {loading &&
        !error &&
        !ended &&
        !banner && (
          <View
            style={
              styles.loadingOverlay
            }
          >
            <LoadingMark channel={playbackChannel} />

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

            {errorInfo?.technical ? (
              <Pressable
                focusable
                accessibilityRole="button"
                onPress={() => setShowDiagnostics(value => !value)}
                style={({ focused }) => [styles.diagnosticsToggle, focused && styles.diagnosticsToggleFocused]}
              >
                <Text style={styles.diagnosticsToggleText}>
                  {showDiagnostics
                    ? (ar ? 'إخفاء تفاصيل التشخيص' : 'Hide diagnostics')
                    : (ar ? 'عرض تفاصيل التشخيص' : 'Show diagnostics')}
                </Text>
              </Pressable>
            ) : null}

            {showDiagnostics && errorInfo ? (
              <Text selectable numberOfLines={6} style={styles.diagnosticsText}>
                {playbackChannel.contentType.toUpperCase()} · {errorInfo.technical}
              </Text>
            ) : null}

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

      {channelList && canZap ? (
        <ChannelListPanel
          channels={liveQueue || []}
          currentId={String(playbackChannel.id)}
          ar={ar}
          onSelect={selectFromList}
          onClose={closeChannelList}
        />
      ) : null}

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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(10,18,40,0.82)',
      borderWidth: 2,
      borderColor: 'rgba(140,180,255,0.16)',
    },

    controlButtonLarge: {
      minWidth: 132,
      minHeight: 72,
      borderRadius: 28,
    },

    controlIconBox: {
      alignItems: 'center',
      justifyContent: 'center',
    },

    controlIconGap: {
      marginRight: 8,
    },

    flipX: {
      transform: [{ scaleX: -1 }],
    },

    resumeNotice: {
      position: 'absolute',
      top: 36,
      zIndex: 70,
      height: 44,
      paddingHorizontal: 18,
      borderRadius: 22,
      justifyContent: 'center',
      backgroundColor: 'rgba(6,10,26,0.86)',
      borderWidth: 1,
      borderColor: SHASHTNA_THEME.colors.borderStrong,
    },

    resumeNoticeLtr: { left: 40 },

    resumeNoticeRtl: { right: 40 },

    resumeNoticeText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
    },

    diagnosticsToggle: {
      alignSelf: 'center',
      marginTop: 12,
      paddingHorizontal: 16,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },

    diagnosticsToggleFocused: {
      borderColor: '#FFFFFF',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },

    diagnosticsToggleText: {
      color: SHASHTNA_THEME.colors.primaryLight,
      fontSize: 14,
      fontWeight: '800',
    },

    diagnosticsText: {
      marginTop: 8,
      color: '#94A3B8',
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'left',
      writingDirection: 'ltr',
    },

    controlButtonCompact: {
      minWidth: 58,
      width: 58,
      paddingHorizontal: 0,
    },

    controlButtonFocused: {
      borderColor: '#FFFFFF',
      borderWidth: 2,
      backgroundColor: SHASHTNA_THEME.colors.primary,
      transform: [
        {
          scale: 1.05,
        },
      ],
      boxShadow: SHASHTNA_THEME.shadows.focusGlow,
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

    loadingChannelLogo: {
      width: 120,
      height: 84,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },

    loadingChannelLogoImage: {
      width: 100,
      height: 68,
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

    /*
     * Series Details
     */

    seriesDetailsRoot: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.background,
    },
  });
