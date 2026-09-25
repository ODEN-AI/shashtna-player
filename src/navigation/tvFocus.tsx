import React from 'react';
import { Platform, StyleProp, TVFocusGuideView, View, ViewStyle } from 'react-native';

/**
 * TV focus toolkit — the rules every screen follows.
 *
 * 1. Regions remember focus. Each logical area (sidebar, page content, a
 *    Home row, the Live category pane, the channel grid, a poster grid) is a
 *    FocusRegion. When the remote re-enters a region, focus returns to the
 *    element that last had it instead of whatever Android's geometric search
 *    finds nearest. That removes "focus jumps to an unrelated card" when
 *    moving between the sidebar and content or between rows.
 *
 * 2. Pages declare their first focus. After navigating to a page its
 *    primary element takes focus (hasTVPreferredFocus): the remembered item
 *    when coming back, otherwise the page's main action.
 *
 * 3. Screens remember where the user was. screenMemory keeps a page's
 *    category, sort, search and focused item across the player / detail
 *    screens, which unmount the page. Coming back restores the list, scrolls
 *    to the item and focuses it.
 *
 * 4. Dialogs trap focus. Sheets use Modal (a separate window), and the
 *    selected option takes focus first.
 *
 * 5. Focus never drives data work. onFocus handlers only write to
 *    screenMemory (no React state), so moving across a large grid never
 *    re-renders the list.
 *
 * Left/right follow the screen: the app mirrors rows itself in Arabic, so
 * D-pad LEFT/RIGHT always move to the visually adjacent element.
 */

type RegionProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Restore the last focused child when focus re-enters (default true). */
  remember?: boolean;
  /** Keep focus from leaving through these edges (e.g. a modal-like panel). */
  trapFocusLeft?: boolean;
  trapFocusRight?: boolean;
  trapFocusUp?: boolean;
  trapFocusDown?: boolean;
};

export function FocusRegion({ children, style, remember = true, ...traps }: RegionProps) {
  if (!Platform.isTV) return <View style={style}>{children}</View>;
  return (
    <TVFocusGuideView autoFocus={remember} style={style} {...traps}>
      {children}
    </TVFocusGuideView>
  );
}

const memory = new Map<string, Record<string, unknown>>();

/**
 * Per-screen UI memory that survives unmounting (plain module state, not
 * React state, so writing to it never causes a render).
 */
export const screenMemory = {
  get<T extends Record<string, unknown>>(screen: string): Partial<T> {
    return (memory.get(screen) as Partial<T>) || {};
  },
  set<T extends Record<string, unknown>>(screen: string, patch: Partial<T>): void {
    memory.set(screen, { ...memory.get(screen), ...patch });
  },
  clear(screen?: string): void {
    if (screen) memory.delete(screen);
    else memory.clear();
  },
};

/** Row index to open a grid at so `itemIndex` is visible (and focusable). */
export function initialRowFor(itemIndex: number, columns: number): number | undefined {
  if (itemIndex <= 0 || columns <= 0) return undefined;
  return Math.floor(itemIndex / columns);
}
