import React from 'react';

import type { Edition } from '../../app/edition';
import ConnectionScreen from '../../screens/Connection/ConnectionScreen';
import type { ImportProgress, ImportRequest } from './useAmerPlaylist';
import { lastRestoreFailureKind, nameFromUri } from './useAmerPlaylist';

/**
 * عامر IPTV sign-in: the Shashtna sign-in screen (ConnectionScreen) in its
 * live-only form, with two ways in:
 *   بيانات الحساب: server, username, password (Xtream, live channels only);
 *   ملف M3U: a file on the device, loaded as soon as it is picked.
 * No M3U link (this edition passes no playlistLink) and no movies/series.
 *
 * Bundled in place of src/variants/lite/LiteImportScreen.tsx
 * (metro.amer.config.js) and takes the same props, so LiteApp runs unchanged.
 */
type Props = {
  onImport: (picked: ImportRequest, progress: ImportProgress) => Promise<unknown>;
  restoreError?: unknown;
  previousName?: string;
};

export const AMER_SIGN_IN: Edition = { id: 'amer', liveOnly: true, importFileOnPick: true };

export default function AmerSignInScreen({ onImport, restoreError }: Props) {
  return (
    <ConnectionScreen
      edition={AMER_SIGN_IN}
      restoreError={restoreError}
      initialMethod={restoreError && lastRestoreFailureKind() === 'file' ? 'file' : undefined}
      onConnected={(channels, source, label) =>
        onImport({ uri: source, name: label || nameFromUri(source), size: -1, channels }, {})
      }
    />
  );
}
