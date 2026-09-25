const path = require('path');

const base = require('./metro.config');

/**
 * Metro configuration for عامر IPTV (index.amer.js).
 *
 * Same app as Shashtna Player Lite; only the brand and the edition marker
 * modules are replaced, so the Amer bundle carries Amer names and artwork and
 * none of Shashtna's:
 *   src/design/brand.ts                  -> src/variants/amer/brand.ts
 *   src/variants/lite/editionMarker.ts   -> src/variants/amer/editionMarker.ts
 *
 * Release builds use it through android/app/build.gradle (amer flavor);
 * for development run: npx react-native start --config metro.amer.config.js
 */
const SUBSTITUTES = new Map([
  [path.resolve(__dirname, 'src/design/brand.ts'), path.resolve(__dirname, 'src/variants/amer/brand.ts')],
  [path.resolve(__dirname, 'src/variants/lite/editionMarker.ts'), path.resolve(__dirname, 'src/variants/amer/editionMarker.ts')],
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
