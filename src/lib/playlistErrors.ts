/**
 * Structured playlist import errors. Each has a stable `code` the UI and the
 * AMER_TV_PICKER diagnostics use; messages are for logs only (the screens show
 * their own Arabic / English text for each code).
 */
export type PlaylistImportCode =
  | 'PICKER_UNAVAILABLE'
  | 'PICKER_LAUNCH_FAILED'
  | 'PICKER_CANCELLED'
  | 'PICKER_BUSY'
  | 'FILE_READ_FAILED'
  | 'INVALID_M3U'
  | 'EMPTY_M3U'
  | 'NO_LIVE_CHANNELS';

/** The file is not an M3U playlist (no #EXTM3U / #EXTINF lines). */
export class PlaylistFormatError extends Error {
  readonly code: PlaylistImportCode = 'INVALID_M3U';
  constructor() {
    super('The file is not an M3U playlist (no #EXTM3U / #EXTINF lines found).');
    this.name = 'PlaylistFormatError';
  }
}

/** The playlist has no content at all. */
export class PlaylistEmptyError extends Error {
  readonly code: PlaylistImportCode = 'EMPTY_M3U';
  constructor() {
    super('The playlist file is empty.');
    this.name = 'PlaylistEmptyError';
  }
}

/** A valid playlist, but nothing in it is a live channel (Lite / عامر IPTV). */
export class NoLiveChannelsError extends Error {
  readonly code: PlaylistImportCode = 'NO_LIVE_CHANNELS';
  constructor() {
    super('The playlist contains no live TV channels.');
    this.name = 'NoLiveChannelsError';
  }
}
