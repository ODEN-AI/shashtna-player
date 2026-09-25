import { posterGridLayout, TV_POSTER_GRID } from '../src/components/common/posterGrid';

const used = (l: ReturnType<typeof posterGridLayout>) => l.columns * l.cardWidth + (l.columns - 1) * l.gap;

describe('posterGridLayout', () => {
  it('keeps the approved TV grid regardless of width', () => {
    expect(posterGridLayout(700, 'tv')).toEqual(TV_POSTER_GRID);
    expect(posterGridLayout(1600, 'tv')).toEqual(TV_POSTER_GRID);
    expect(TV_POSTER_GRID).toMatchObject({ columns: 5, cardWidth: 128, cardHeight: 192, gap: 16 });
  });

  it.each([
    ['narrow phone', 200, 'phone'],
    ['small phone', 280, 'phone'],
    ['normal phone', 330, 'phone'],
    ['large phone', 400, 'phone'],
    ['phone landscape', 720, 'phone'],
    ['tablet portrait', 660, 'tablet'],
    ['tablet landscape', 1100, 'tablet'],
  ] as const)('%s (%ipx) fits exactly inside the available width', (_, width, device) => {
    const l = posterGridLayout(width, device);
    expect(used(l)).toBeLessThanOrEqual(width);
    // Leftover is only rounding: less than one pixel per column.
    expect(width - used(l)).toBeLessThan(l.columns);
    expect(l.columns).toBeGreaterThanOrEqual(2);
    expect(l.cardHeight).toBe(Math.round(l.cardWidth * 1.5));
  });

  it('adds columns as the space grows, never shrinking posters below the minimum', () => {
    expect(posterGridLayout(330, 'phone').columns).toBe(3);
    expect(posterGridLayout(280, 'phone').columns).toBe(2);
    expect(posterGridLayout(330, 'phone').cardWidth).toBeGreaterThanOrEqual(100);
    expect(posterGridLayout(1100, 'tablet').cardWidth).toBeGreaterThanOrEqual(128);
  });

  it('never returns a negative size before the grid has been measured', () => {
    const l = posterGridLayout(0, 'phone');
    expect(l.cardWidth).toBeGreaterThanOrEqual(0);
    expect(l.columns).toBeGreaterThanOrEqual(1);
  });
});
