/**
 * Entry point of عامر IPTV (Amer IPTV, com.ameriptv.player).
 *
 * The same live-TV app as Shashtna Player Lite (local M3U file only), with
 * the Amer brand: bundle it with metro.amer.config.js, which swaps in
 * src/variants/amer/brand.ts and src/variants/amer/editionMarker.ts.
 * Built into the `amer` product flavor; see android/app/build.gradle.
 *
 * @format
 */

import { AppRegistry } from 'react-native';
import LiteApp from './src/variants/lite/LiteApp';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => LiteApp);
