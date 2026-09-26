import React from 'react';

import { channelKey } from '../features/catalog/catalog';
import { toggleFavorite, useIsFavorite } from '../features/favorites/favoritesStore';
import type { M3UChannel } from '../lib/m3uCore';
import PlayerScreen, { PlayerDetailScreens } from '../screens/Player/PlayerScreen';

export type PlayerLaunchOptions = {
  /** Live list the channel was picked from (enables in-player zapping). */
  liveQueue?: readonly M3UChannel[];
  /** Category/filter the live queue came from (diagnostics only). */
  liveScope?: string;
  /** Series episode to open directly (Continue Watching). */
  startEpisode?: M3UChannel | null;
  /** Start a movie without its details page (Continue Watching). */
  autoStart?: boolean;
};

/** Player + favorite state for the item on screen (shared by Full and Lite). */
export default function PlayerHost({
  channel,
  options,
  onBack,
  preferredQuality,
  autoplay,
  subtitles,
  detailScreens,
}: {
  channel: M3UChannel;
  options: PlayerLaunchOptions;
  onBack: (lastPlayed?: M3UChannel) => void;
  preferredQuality: string;
  autoplay: boolean;
  subtitles: boolean;
  detailScreens?: PlayerDetailScreens;
}) {
  const key = channelKey(channel);
  const isFavorite = useIsFavorite(key);
  return (
    <PlayerScreen
      channel={channel}
      onBack={onBack}
      preferredQuality={preferredQuality}
      autoplay={autoplay}
      subtitles={subtitles}
      liveQueue={options.liveQueue}
      liveScope={options.liveScope}
      startEpisode={options.startEpisode}
      autoStart={options.autoStart}
      isFavorite={isFavorite}
      onToggleFavorite={() => toggleFavorite(key)}
      detailScreens={detailScreens}
    />
  );
}
