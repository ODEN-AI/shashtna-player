/**
 * Entry point of عامر IPTV (Amer IPTV, com.ameriptv.player).
 *
 * The Shashtna Player Lite live-TV app with the Amer brand and the Shashtna
 * sign-in (account or M3U file, live only). Bundle it with
 * metro.amer.config.js, which swaps in the modules under src/variants/amer.
 * Built into the `amer` product flavor; see android/app/build.gradle.
 *
 * @format
 */

import { AppRegistry } from 'react-native';
import LiteApp from './src/variants/lite/LiteApp';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => LiteApp);
