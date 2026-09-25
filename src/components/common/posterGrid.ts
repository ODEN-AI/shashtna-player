import { DeviceClass } from '../../design/device';
import { SHASHTNA_THEME } from '../../design/theme';

export type PosterGridLayout = { columns: number; cardWidth: number; cardHeight: number; gap: number };

/** Posters are 2:3. */
const POSTER_RATIO = 1.5;

/** The approved TV grid: five (gridColumns) 128dp posters with 16dp gaps. */
export const TV_POSTER_GRID: PosterGridLayout = {
  columns: SHASHTNA_THEME.layout.gridColumns,
  cardWidth: 128,
  cardHeight: 192,
  gap: 16,
};

/**
 * Poster grid for the Movies/Series library.
 *
 * TV keeps the fixed approved grid. Phones and tablets derive the column
 * count and poster width from the width actually available to the grid, so
 * `columns * cardWidth + (columns - 1) * gap` never exceeds it: every poster
 * stays fully on screen, with the same gap between all of them.
 */
export function posterGridLayout(availableWidth: number, device: DeviceClass): PosterGridLayout {
  if (device === 'tv') return TV_POSTER_GRID;

  const gap = device === 'phone' ? 12 : 16;
  // Smallest poster we allow before dropping a column (keeps titles readable).
  const minWidth = device === 'phone' ? 100 : 128;
  const width = Math.max(0, Math.floor(availableWidth));

  const fit = Math.floor((width + gap) / (minWidth + gap));
  // Two columns on any real phone; a single column only if the space cannot hold two.
  const columns = Math.max(width >= 2 * 72 + gap ? 2 : 1, fit);
  const cardWidth = Math.max(0, Math.floor((width - gap * (columns - 1)) / columns));
  return { columns, cardWidth, cardHeight: Math.round(cardWidth * POSTER_RATIO), gap };
}
