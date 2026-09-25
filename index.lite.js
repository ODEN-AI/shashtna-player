/**
 * Entry point of Shashtna Player Lite (Live TV only).
 * Built into the `lite` product flavor; see android/app/build.gradle.
 *
 * @format
 */

import { AppRegistry } from 'react-native';
import LiteApp from './src/variants/lite/LiteApp';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => LiteApp);
