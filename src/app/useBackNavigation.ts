import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * BACK on the remote: player -> the page it was opened from; any page ->
 * the start page; start page -> leave the app (Android default).
 * Screens with their own layers (player menus, detail pages, sheets) register
 * later and therefore handle BACK first.
 */
export function useBackNavigation({
  playerOpen,
  closePlayer,
  page,
  startPage,
  goTo,
}: {
  playerOpen: boolean;
  closePlayer: () => void;
  page: string;
  startPage: string;
  goTo: (page: string) => void;
}) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (playerOpen) {
        closePlayer();
        return true;
      }
      if (page !== startPage) {
        goTo(startPage);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [playerOpen, closePlayer, page, startPage, goTo]);
}
