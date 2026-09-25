import { DeviceClass } from '../../design/device';

/** Narrowest live channel card that still shows a readable channel name. */
export const MIN_LIVE_CARD_WIDTH = 250;

/**
 * Columns for the Live TV channel grid from the width the grid really has.
 * A fixed 3 columns left about 40dp for the channel name on a 960x540dp TV.
 */
export function liveGridColumns(availableWidth: number, device: DeviceClass, gap = 14): number {
  if (device === 'phone') return 1;
  if (!(availableWidth > 0)) return 2;
  return Math.max(1, Math.min(4, Math.floor((availableWidth + gap) / (MIN_LIVE_CARD_WIDTH + gap))));
}
