import MediaLibraryScreen from '../../components/common/MediaLibraryScreen';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { Catalog } from '../../features/catalog/catalog';
import { M3UChannel } from '../../lib/m3u';

export default function SeriesScreen({ catalog, onOpenPlayer, onBack }: { catalog: Catalog; onOpenPlayer: (c: M3UChannel) => void; onBack: () => void }) {
  const { language } = useAppPreferences();
  return (
    <MediaLibraryScreen
      type="series"
      title={language === 'ar' ? 'المسلسلات' : 'Series'}
      items={catalog.series}
      groups={catalog.seriesGroups}
      itemsByGroup={catalog.seriesByGroup}
      onOpenPlayer={onOpenPlayer}
      onBack={onBack}
    />
  );
}
