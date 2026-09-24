import { Platform, useWindowDimensions } from 'react-native';

export type DeviceClass = 'tv' | 'tablet' | 'phone';

/**
 * TV is detected from the platform (Android TV / Google TV builds report
 * Platform.isTV). Touch devices are split by their shortest side so a phone
 * in landscape is still treated as a phone.
 */
export function useDeviceClass(): DeviceClass {
  const { width, height } = useWindowDimensions();
  if (Platform.isTV) return 'tv';
  return Math.min(width, height) >= 600 ? 'tablet' : 'phone';
}

export const IS_TV = Platform.isTV;
