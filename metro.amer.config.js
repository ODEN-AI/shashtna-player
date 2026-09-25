const path = require('path');

const base = require('./metro.config');

/**
 * Metro configuration for عامر IPTV (index.amer.js).
 *
 * The Shashtna Player Lite app with Amer's brand and sign-in. These modules
 * are replaced; everything else (Live TV, player, M3U file reader, Settings,
 * navigation) is Lite's own code:
 *   src/design/brand.ts                     -> src/variants/amer/brand.ts
 *   src/variants/lite/editionMarker.ts      -> src/variants/amer/editionMarker.ts
 *   src/variants/lite/LiteImportScreen.tsx  -> src/variants/amer/AmerSignInScreen.tsx
 *       (Shashtna sign-in screen: account + M3U file, live only, no M3U link)
 *   src/variants/lite/useLitePlaylist.ts    -> src/variants/amer/useAmerPlaylist.ts
 *       (account or file source, persistence and restore)
 *   src/variants/lite/LiteSourceSection.tsx -> src/variants/amer/AmerSourceSection.tsx
 *
 * Release builds use it through android/app/build.gradle (amer flavor);
 * for development run: npx react-native start --config metro.amer.config.js
 */
const SUBSTITUTES = new Map([
  [path.resolve(__dirname, 'src/design/brand.ts'), path.resolve(__dirname, 'src/variants/amer/brand.ts')],
  [path.resolve(__dirname, 'src/variants/lite/editionMarker.ts'), path.resolve(__dirname, 'src/variants/amer/editionMarker.ts')],
  [path.resolve(__dirname, 'src/variants/lite/LiteImportScreen.tsx'), path.resolve(__dirname, 'src/variants/amer/AmerSignInScreen.tsx')],
  [path.resolve(__dirname, 'src/variants/lite/useLitePlaylist.ts'), path.resolve(__dirname, 'src/variants/amer/useAmerPlaylist.ts')],
  [path.resolve(__dirname, 'src/variants/lite/LiteSourceSection.tsx'), path.resolve(__dirname, 'src/variants/amer/AmerSourceSection.tsx')],
]);

module.exports = {
  ...base,
  resolver: {
    ...base.resolver,
    resolveRequest(context, moduleName, platform) {
      const resolved = base.resolver && base.resolver.resolveRequest
        ? base.resolver.resolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
      if (resolved.type === 'sourceFile' && SUBSTITUTES.has(resolved.filePath)) {
        return { type: 'sourceFile', filePath: SUBSTITUTES.get(resolved.filePath) };
      }
      return resolved;
    },
  },
};
