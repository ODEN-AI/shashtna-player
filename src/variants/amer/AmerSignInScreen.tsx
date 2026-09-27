import React from 'react';

import type { Edition } from '../../app/edition';
import ConnectionScreen from '../../screens/Connection/ConnectionScreen';
import { AMER_BUILT_IN_LABEL, AMER_BUILT_IN_SOURCE, loadBuiltInPlaylist } from './builtInPlaylist';
import type { ImportProgress, ImportRequest } from './useAmerPlaylist';
import { lastRestoreFailureKind, nameFromUri } from './useAmerPlaylist';

/**
 * عامر IPTV source screen: the Shashtna sign-in screen (ConnectionScreen) in its
 * live-only form, with three ways in:
 *   قنوات عامر المباشرة: the built-in playlist packaged in the APK (no sign-in);
 *   بيانات الحساب: server, username, password (Xtream, live channels only);
 *   ملف M3U: a file on the device, loaded as soon as it is picked.
 * It is shown when there is no usable source (the built-in playlist is the
 * default on a fresh install), after "تغيير المصدر", or when a saved source
 * could not be restored (opened on that source's tab with the reason).
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

export const AMER_SIGN_IN: Edition = {
  id: 'amer',
  liveOnly: true,
  importFileOnPick: true,
  builtIn: {
    source: AMER_BUILT_IN_SOURCE,
    tabLabel: ar => (ar ? AMER_BUILT_IN_LABEL.ar : AMER_BUILT_IN_LABEL.en),
    description: ar => (ar ? 'قنوات مباشرة جاهزة للمشاهدة فوراً، بدون تسجيل دخول.' : 'Live channels ready to watch right away, no sign-in needed.'),
    load: onChannelCount => loadBuiltInPlaylist(onChannelCount),
    errorMessage: ar => (ar ? 'تعذر تحميل قائمة القنوات المدمجة.' : 'The built-in channel list could not be loaded.'),
  },
};

export default function AmerSignInScreen({ onImport, restoreError }: Props) {
  return (
    <ConnectionScreen
      edition={AMER_SIGN_IN}
      restoreError={restoreError}
      // A source that failed to restore reopens on its own tab; otherwise the built-in tab.
      initialMethod={restoreError ? (lastRestoreFailureKind() ?? undefined) : undefined}
      onConnected={(channels, source, label) =>
        onImport({ uri: source, name: label || nameFromUri(source), size: -1, channels }, {})
      }
    />
  );
}
