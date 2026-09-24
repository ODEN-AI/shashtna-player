import React from 'react';
import MediaLibraryScreen from '../../components/common/MediaLibraryScreen';
import { M3UChannel } from '../../lib/m3u';
import { useAppPreferences } from '../../design/AppPreferencesContext';
export default function SeriesScreen(props:{channels:M3UChannel[];onOpenPlayer:(c:M3UChannel)=>void;onNavigate:(page:'home'|'live'|'movies'|'series'|'favorites'|'search'|'settings')=>void;onBack:()=>void;favoriteIds?:string[];onToggleFavorite?:(c:M3UChannel)=>void}){const { language } = useAppPreferences(); return <MediaLibraryScreen {...props} type="series" title={language === 'ar' ? 'المسلسلات' : 'Series'} />}
