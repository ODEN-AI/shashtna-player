import MediaLibraryScreen from '../../components/common/MediaLibraryScreen';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { Catalog } from '../../features/catalog/catalog';
import { M3UChannel } from '../../lib/m3u';

export default function MoviesScreen({ catalog, onOpenPlayer, onBack }: { catalog: Catalog; onOpenPlayer: (c: M3UChannel) => void; onBack: () => void }) {
  const { language } = useAppPreferences();
  return (
    <MediaLibraryScreen
      type="movie"
      title={language === 'ar' ? 'الأفلام' : 'Movies'}
      items={catalog.movies}
      groups={catalog.movieGroups}
      itemsByGroup={catalog.moviesByGroup}
      onOpenPlayer={onOpenPlayer}
      onBack={onBack}
    />
  );
}
