import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import Focusable from '../../components/common/Focusable';
import AppIcon, {
  AppIconName,
} from '../../components/common/AppIcon';
import type { M3UChannel } from '../../lib/m3u';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';

const Text = (props: React.ComponentProps<typeof RNText>) => (
  <RNText
    {...props}
    allowFontScaling={false}
    style={[{ fontFamily: SHASHTNA_FONT.sans }, props.style]}
  />
);

type Page =
  | 'home'
  | 'live'
  | 'movies'
  | 'series'
  | 'favorites'
  | 'search';

type LibraryKind = 'movie' | 'series';

type LibraryDashboardScreenProps = {
  channels: M3UChannel[];
  kind: LibraryKind;
  onOpenPlayer: (channel: M3UChannel) => void;
  onNavigate: (page: Page) => void;
  onBack?: () => void;
};

type NavItem = {
  page?: Page;
  label: string;
  icon: AppIconName;
};

const NAV_ITEMS: NavItem[] = [
  { page: 'home', label: 'الرئيسية', icon: 'home' },
  { page: 'live', label: 'القنوات المباشرة', icon: 'live' },
  { page: 'movies', label: 'الأفلام', icon: 'movies' },
  { page: 'series', label: 'المسلسلات', icon: 'series' },
  { page: 'search', label: 'البحث', icon: 'search' },
  { page: 'favorites', label: 'المفضلة', icon: 'favorite' },
];

function formatNow() {
  const date = new Date();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const displayHours = hours % 12 || 12;
  const period = hours >= 12 ? 'م' : 'ص';

  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];

  return {
    clock: `${displayHours}:${minutes} ${period}`,
    date: `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,
  };
}

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <View style={styles.brandMarkInner}>
        <AppIcon name="play" size={20} />
      </View>
      <View>
        <Text style={styles.brandName}>عبدالرحمن IPTV</Text>
        <Text style={styles.brandSub}>PLAYER</Text>
      </View>
    </View>
  );
}

function Sidebar({
  activePage,
  onNavigate,
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
}) {
  return (
    <View style={styles.sidebar}>
      <BrandMark />

      <View style={styles.sidebarNav}>
        {NAV_ITEMS.map(item => {
          const active = item.page === activePage;

          return (
            <Focusable
              key={item.label}
              onPress={() => item.page && onNavigate(item.page)}
              accessibilityLabel={item.label}
              style={[
                styles.navItem,
                active && styles.navItemActive,
              ]}
            >
              <AppIcon
                name={item.icon}
                size={21}
                color={
                  active
                    ? COLORS.white
                    : COLORS.textSecondary
                }
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.navLabel,
                  active && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Focusable>
          );
        })}
      </View>

      <View style={styles.sidebarBottom}>
        <View style={styles.proCard}>
          <View style={styles.proIconWrap}>
            <AppIcon name="star" size={17} color={COLORS.blue} />
          </View>
          <Text style={styles.proTitle}>عبدالرحمن IPTV Pro</Text>
          <Text style={styles.proText}>واجهة أسرع ومحتوى أفضل</Text>
        </View>

        <Focusable
          onPress={() => {}}
          accessibilityLabel="الإعدادات"
          style={styles.bottomItem}
        >
          <AppIcon name="settings" size={20} color={COLORS.textSecondary} />
          <Text style={styles.bottomItemText}>الإعدادات</Text>
        </Focusable>
      </View>
    </View>
  );
}

function TopBar({
  title,
  count,
  query,
  setQuery,
  onNavigate,
  onBack,
}: {
  title: string;
  count: number;
  query: string;
  setQuery: (value: string) => void;
  onNavigate: (page: Page) => void;
  onBack?: () => void;
}) {
  const now = formatNow();

  return (
    <View style={styles.topBar}>
      <View style={styles.breadcrumbBlock}>
        <Focusable
          onPress={() => onNavigate('home')}
          accessibilityLabel="الرئيسية"
          style={styles.breadcrumbHome}
        >
          <AppIcon name="home" size={18} color={COLORS.textMuted} />
        </Focusable>
        <AppIcon name="arrow" size={18} color={COLORS.textMuted} />
        <Text style={styles.breadcrumbMuted}>{title}</Text>
        <View style={styles.breadcrumbSlash} />
        <Text style={styles.breadcrumbCurrent}>{count} عنوان</Text>
      </View>

      <View style={styles.topBarRight}>
        <View style={styles.searchBox}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`ابحث عن ${title}...`}
            placeholderTextColor={COLORS.textMuted}
            selectionColor={COLORS.blue}
            style={styles.searchInput}
          />
          <AppIcon name="search" size={20} color={COLORS.textSecondary} />
        </View>

        <Focusable
          onPress={() => {}}
          accessibilityLabel="الإشعارات"
          style={styles.circleAction}
        >
          <AppIcon name="bell" size={16} color={COLORS.white} />
          <View style={styles.notificationDot} />
        </Focusable>

        <Focusable
          onPress={() => {}}
          accessibilityLabel="الحساب"
          style={styles.avatarAction}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>ش</Text>
          </View>
        </Focusable>

        <View style={styles.timeBlock}>
          <Text style={styles.clock}>{now.clock}</Text>
          <Text style={styles.date}>{now.date}</Text>
        </View>

        {onBack ? (
          <Focusable
            onPress={onBack}
            accessibilityLabel="رجوع"
            style={styles.circleAction}
          >
            <AppIcon name="back" size={28} color={COLORS.white} />
          </Focusable>
        ) : null}
      </View>
    </View>
  );
}

function Hero({
  item,
  kind,
  onOpenPlayer,
}: {
  item?: M3UChannel;
  kind: LibraryKind;
  onOpenPlayer: (channel: M3UChannel) => void;
}) {
  const title = kind === 'movie' ? 'فيلم مميز' : 'مسلسل مميز';

  if (!item) {
    return (
      <View style={styles.heroCard}>
        <View style={styles.heroFallback} />
        <View style={styles.heroOverlay} />
        <View style={styles.heroCopy}>
          <View style={styles.heroBadge}>
            <AppIcon name="star" size={13} color={COLORS.white} />
            <Text style={styles.heroBadgeText}>{title}</Text>
          </View>
          <Text style={styles.heroTitle}>عبدالرحمن IPTV</Text>
          <Text style={styles.heroDescription}>
            أضف مكتبة {kind === 'movie' ? 'الأفلام' : 'المسلسلات'} لعرض المحتوى هنا.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Focusable
      hasTVPreferredFocus
      onPress={() => onOpenPlayer(item)}
      accessibilityLabel={`فتح ${item.name}`}
      style={styles.heroCard}
    >
      {item.logo ? (
        <ImageBackground
          source={{ uri: item.logo }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          imageStyle={styles.heroImage}
        />
      ) : (
        <View style={styles.heroFallback} />
      )}

      <View style={styles.heroOverlay} />
      <View style={styles.heroBottomFade} />

      <View style={styles.heroCopy}>
        <View style={styles.heroBadge}>
          <AppIcon name="star" size={13} color={COLORS.white} />
          <Text style={styles.heroBadgeText}>{title}</Text>
        </View>

        <Text numberOfLines={2} style={styles.heroTitle}>
          {item.name}
        </Text>

        <Text numberOfLines={2} style={styles.heroDescription}>
          {item.group || 'محتوى متوفر الآن ضمن التطبيق'}
        </Text>

        <View style={styles.heroButtons}>
          <Focusable
            onPress={() => onOpenPlayer(item)}
            accessibilityLabel="مشاهدة الآن"
            style={styles.primaryButton}
          >
            <AppIcon name="play" size={17} />
            <Text style={styles.primaryButtonText}>مشاهدة الآن</Text>
          </Focusable>

          <Focusable
            onPress={() => onOpenPlayer(item)}
            accessibilityLabel="التفاصيل"
            style={styles.secondaryButton}
          >
            <AppIcon name="info" size={18} color={COLORS.textSecondary} />
            <Text style={styles.secondaryButtonText}>التفاصيل</Text>
          </Focusable>
        </View>
      </View>

      <View style={styles.heroDots}>
        <View style={[styles.heroDot, styles.heroDotActive]} />
        <View style={styles.heroDot} />
        <View style={styles.heroDot} />
        <View style={styles.heroDot} />
      </View>
    </Focusable>
  );
}

function SidePanel({
  kind,
  count,
  categoryCount,
  onNavigate,
}: {
  kind: LibraryKind;
  count: number;
  categoryCount: number;
  onNavigate: (page: Page) => void;
}) {
  const title = kind === 'movie' ? 'الأفلام' : 'المسلسلات';
  const quickItems =
    kind === 'movie'
      ? ['الأحدث', 'الأعلى تقييماً', 'الأكثر مشاهدة', 'عربي']
      : ['الأحدث', 'الأعلى تقييماً', 'الأكثر مشاهدة', 'مترجمة'];

  return (
    <View style={styles.sideColumn}>
      <View style={styles.noteCard}>
        <View style={styles.sideCardHeader}>
          <Text style={styles.sideCardTitle}>ملاحظتك اليوم</Text>
          <View style={styles.sideCardIcon}>
            <AppIcon name="info" size={15} color={COLORS.white} />
          </View>
        </View>
        <View style={styles.noteAccent} />
        <Text style={styles.noteText}>
          اختار المحتوى، والباقي ضمن التطبيق. استمتع بمشاهدة منظمة وسريعة.
        </Text>
        <Text style={styles.noteMeta}>مكتبتك تحتوي على {count} عنوان</Text>
      </View>

      <View style={styles.quickCard}>
        <View style={styles.sideCardHeader}>
          <Text style={styles.sideCardTitle}>فلاتر سريعة</Text>
          <AppIcon name="filter" size={19} color={COLORS.textSecondary} />
        </View>

        <View style={styles.quickGrid}>
          {quickItems.map((label, index) => (
            <Pressable
              key={label}
              focusable
              onPress={() => {}}
              style={({ focused }) => [
                styles.quickFilter,
                index === 0 && styles.quickFilterActive,
                focused && styles.quickFilterFocused,
              ]}
            >
              <Text
                style={[
                  styles.quickFilterText,
                  index === 0 && styles.quickFilterTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Focusable
          onPress={() => onNavigate(kind === 'movie' ? 'movies' : 'series')}
          accessibilityLabel="فتح القسم"
          style={styles.openLibraryButton}
        >
          <AppIcon name="grid" size={18} color={COLORS.blue} />
          <Text style={styles.openLibraryText}>استكشاف {title}</Text>
        </Focusable>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statsHeaderRow}>
          <Text style={styles.sideCardTitle}>ملخص المكتبة</Text>
          <Text style={styles.statsBlue}>{categoryCount} تصنيف</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>إجمالي المحتوى</Text>
          <Text style={styles.statValue}>{count}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>متاح للمشاهدة</Text>
          <Text style={styles.statValue}>الآن</Text>
        </View>
      </View>
    </View>
  );
}

function FilterBar({
  kind,
  activeCategory,
  setActiveCategory,
}: {
  kind: LibraryKind;
  activeCategory: string;
  setActiveCategory: (value: string) => void;
}) {
  const filters = [
    { key: 'all', label: 'كل التصنيفات', icon: 'category' as AppIconName },
    { key: 'group', label: kind === 'movie' ? 'النوع' : 'الموسم', icon: 'grid' as AppIconName },
    { key: 'recent', label: 'الأحدث', icon: 'calendar' as AppIconName },
    { key: 'rating', label: 'الأعلى تقييماً', icon: 'star' as AppIconName },
    { key: 'sort', label: 'ترتيب', icon: 'sort' as AppIconName },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {filters.map(filter => {
        const active = activeCategory === filter.key;

        return (
          <Pressable
            key={filter.key}
            focusable
            onPress={() => setActiveCategory(filter.key)}
            style={({ focused }) => [
              styles.filterButton,
              active && styles.filterButtonActive,
              focused && styles.filterButtonFocused,
            ]}
          >
            <AppIcon
              name={filter.icon}
              size={16}
              color={active ? COLORS.white : COLORS.textSecondary}
            />
            <Text
              style={[
                styles.filterButtonText,
                active && styles.filterButtonTextActive,
              ]}
            >
              {filter.label}
            </Text>
            <AppIcon name="arrow" size={15} color={COLORS.textMuted} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <View style={styles.sectionArrow}>
          <AppIcon name="arrow" size={20} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionCount}>{count} عنوان</Text>
    </View>
  );
}

function PosterCard({
  item,
  kind,
  onPress,
}: {
  item: M3UChannel;
  kind: LibraryKind;
  onPress: () => void;
}) {
  return (
    <Focusable
      onPress={onPress}
      accessibilityLabel={`فتح ${item.name}`}
      style={styles.posterCard}
    >
      <View style={styles.posterImageWrap}>
        {item.logo ? (
          <Image
            source={{ uri: item.logo }}
            style={styles.posterImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon
              name={kind === 'movie' ? 'movies' : 'series'}
              size={35}
              color={COLORS.blue}
            />
          </View>
        )}
        <View style={styles.posterGradient} />
        <View style={styles.posterTypePill}>
          <Text style={styles.posterTypeText}>
            {kind === 'movie' ? 'فيلم' : 'مسلسل'}
          </Text>
        </View>
      </View>

      <View style={styles.posterInfo}>
        <Text numberOfLines={1} style={styles.posterTitle}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={styles.posterMeta}>
          {item.group || (kind === 'movie' ? 'VOD' : 'Series')}
        </Text>
        <View style={styles.posterFooter}>
          <Text style={styles.posterFooterText}>متاح الآن</Text>
          <View style={styles.posterDot} />
          <AppIcon name="star" size={11} color={COLORS.yellow} />
        </View>
      </View>
    </Focusable>
  );
}

const COLORS = {
  background: '#07101F',
  panel: '#0D172B',
  panel2: '#111D35',
  panel3: '#17243F',
  blue: '#0066FF',
  blueBright: '#1784FF',
  blueSoft: 'rgba(0, 102, 255, 0.18)',
  white: '#FFFFFF',
  textSecondary: '#9CAAC0',
  textMuted: '#60708B',
  textSoft: '#C7D1DE',
  border: 'rgba(65, 106, 168, 0.36)',
  yellow: '#F6C945',
};

export default function LibraryDashboardScreen({
  channels,
  kind,
  onOpenPlayer,
  onNavigate,
  onBack,
}: LibraryDashboardScreenProps) {
  const { width, height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const isPhone = width < 720;
  const title = kind === 'movie' ? 'الأفلام' : 'المسلسلات';

  const content = useMemo(
    () =>
      channels
        .filter(item => item.contentType === kind)
        .filter(item => {
          const value = query.trim().toLowerCase();
          if (!value) return true;
          return `${item.name} ${item.group}`.toLowerCase().includes(value);
        }),
    [channels, kind, query],
  );

  const hero = content[0];
  const latest = content.slice(0, 12);
  const recommendations = content.slice(12, 24);
  const categories = useMemo(
    () => Array.from(new Set(content.map(item => item.group).filter(Boolean))),
    [content],
  );

  const filteredLatest = useMemo(() => {
    if (activeCategory === 'all' || activeCategory === 'recent' || activeCategory === 'rating' || activeCategory === 'sort') {
      return latest;
    }
    if (activeCategory === 'group') {
      return latest;
    }
    return latest;
  }, [activeCategory, latest]);

  const filteredRecommendations = useMemo(() => {
    if (!query) return recommendations;
    return recommendations;
  }, [query, recommendations]);

  if (isPhone) {
    return (
      <ScrollView
        style={styles.phoneRoot}
        contentContainerStyle={styles.phoneContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.phoneHeader}>
          <BrandMark />
          <Focusable
            onPress={() => onNavigate('search')}
            style={styles.circleAction}
            accessibilityLabel="البحث"
          >
            <AppIcon name="search" size={20} />
          </Focusable>
        </View>

        <TopBar
          title={title}
          count={content.length}
          query={query}
          setQuery={setQuery}
          onNavigate={onNavigate}
          onBack={onBack}
        />

        <Hero item={hero} kind={kind} onOpenPlayer={onOpenPlayer} />
        <FilterBar kind={kind} activeCategory={activeCategory} setActiveCategory={setActiveCategory} />

        <SectionHeader title={`أحدث ${title}`} count={filteredLatest.length} />
        <View style={styles.phoneGrid}>
          {filteredLatest.map(item => (
            <PosterCard
              key={item.id}
              item={item}
              kind={kind}
              onPress={() => onOpenPlayer(item)}
            />
          ))}
        </View>

        {filteredRecommendations.length > 0 ? (
          <>
            <SectionHeader title="مقترحات لك" count={filteredRecommendations.length} />
            <View style={styles.phoneGrid}>
              {filteredRecommendations.map(item => (
                <PosterCard
                  key={item.id}
                  item={item}
                  kind={kind}
                  onPress={() => onOpenPlayer(item)}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.mainStandalone}>
      <TopBar
          title={title}
          count={content.length}
          query={query}
          setQuery={setQuery}
          onNavigate={onNavigate}
          onBack={onBack}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainGrid}>
            <View style={styles.primaryColumn}>
              <Hero item={hero} kind={kind} onOpenPlayer={onOpenPlayer} />
              <FilterBar
                kind={kind}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
              />

              <SectionHeader title={`أحدث ${title}`} count={filteredLatest.length} />
              <FlatList
                horizontal
                data={filteredLatest}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <PosterCard
                    item={item}
                    kind={kind}
                    onPress={() => onOpenPlayer(item)}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.posterRow}
              />

              {filteredRecommendations.length > 0 ? (
                <>
                  <SectionHeader title="مقترحات لك" count={filteredRecommendations.length} />
                  <FlatList
                    horizontal
                    data={filteredRecommendations}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                      <PosterCard
                        item={item}
                        kind={kind}
                        onPress={() => onOpenPlayer(item)}
                      />
                    )}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.posterRow}
                  />
                </>
              ) : null}
            </View>

            <SidePanel
              kind={kind}
              count={content.length}
              categoryCount={categories.length}
              onNavigate={onNavigate}
            />
          </View>
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },
  phoneRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  phoneContent: {
    paddingBottom: 36,
  },
  phoneHeader: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidebar: {
    width: 196,
    paddingHorizontal: 15,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: '#091426',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 28,
  },
  brandMarkInner: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    backgroundColor: COLORS.blue,
    shadowColor: COLORS.blue,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  brandName: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '900',
  },
  brandSub: {
    marginTop: 1,
    color: '#6EA2FF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  sidebarNav: {
    gap: 8,
  },
  navItem: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(0, 102, 255, 0.18)',
    borderColor: 'rgba(0, 102, 255, 0.72)',
    shadowColor: COLORS.blue,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  navLabel: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  navLabelActive: {
    color: COLORS.white,
  },
  sidebarBottom: {
    marginTop: 'auto',
    gap: 12,
  },
  proCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(13, 23, 43, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  proIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blueSoft,
    marginBottom: 9,
  },
  proTitle: {
    color: '#7FB5FF',
    fontSize: 10,
    fontWeight: '900',
  },
  proText: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 10,
  },
  bottomItem: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(13, 23, 43, 0.56)',
  },
  bottomItemText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  mainStandalone: {
    flex: 1,
    minWidth: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 36,
  },
  topBar: {
    minHeight: 62,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(7, 16, 31, 0.96)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  breadcrumbBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breadcrumbHome: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbMuted: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  breadcrumbCurrent: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  breadcrumbSlash: {
    width: 1,
    height: 18,
    backgroundColor: COLORS.border,
    marginHorizontal: 2,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBox: {
    width: 270,
    height: 42,
    paddingHorizontal: 13,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 11,
    textAlign: 'right',
    paddingVertical: 0,
  },
  circleAction: {
    width: 46,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: COLORS.blueBright,
  },
  avatarAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25365C',
    borderWidth: 1,
    borderColor: '#3E5B8F',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
  },
  timeBlock: {
    alignItems: 'flex-end',
    marginLeft: 2,
  },
  clock: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '900',
  },
  date: {
    marginTop: 2,
    color: COLORS.textMuted,
    fontSize: 8,
  },
  mainGrid: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  primaryColumn: {
    flex: 1,
    minWidth: 0,
  },
  sideColumn: {
    width: 224,
    gap: 12,
  },
  heroCard: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: 'rgba(61, 118, 210, 0.56)',
  },
  heroImage: {
    opacity: 0.72,
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#14243F',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 9, 18, 0.45)',
  },
  heroBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 170,
    backgroundColor: 'rgba(4, 9, 18, 0.9)',
  },
  heroCopy: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 102, 255, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.blue,
  },
  heroBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
  },
  heroTitle: {
    marginTop: 10,
    color: COLORS.white,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '900',
  },
  heroDescription: {
    marginTop: 7,
    maxWidth: 700,
    color: COLORS.textSoft,
    fontSize: 10,
    lineHeight: 17,
  },
  heroButtons: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.blue,
    borderWidth: 1,
    borderColor: '#4C9BFF',
    shadowColor: COLORS.blue,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 13,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(10, 20, 38, 0.82)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  heroDots: {
    position: 'absolute',
    top: 15,
    left: 18,
    flexDirection: 'row',
    gap: 7,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#365179',
  },
  heroDotActive: {
    width: 23,
    backgroundColor: COLORS.blueBright,
  },
  noteCard: {
    padding: 13,
    minHeight: 118,
    borderRadius: 20,
    backgroundColor: COLORS.panel2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sideCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideCardTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
  },
  sideCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blueSoft,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.45)',
  },
  noteAccent: {
    width: 2,
    height: 48,
    marginTop: 12,
    backgroundColor: COLORS.blueBright,
  },
  noteText: {
    position: 'absolute',
    left: 26,
    right: 15,
    top: 58,
    color: COLORS.textSoft,
    fontSize: 10,
    lineHeight: 17,
  },
  noteMeta: {
    marginTop: 38,
    color: COLORS.textMuted,
    fontSize: 7,
    fontWeight: '700',
  },
  quickCard: {
    padding: 16,
    minHeight: 138,
    borderRadius: 20,
    backgroundColor: COLORS.panel2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickFilter: {
    width: '48.4%',
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.panel3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickFilterActive: {
    backgroundColor: COLORS.blue,
    borderColor: '#5AA5FF',
  },
  quickFilterFocused: {
    transform: [{ scale: 1.03 }],
    borderColor: COLORS.white,
  },
  quickFilterText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  quickFilterTextActive: {
    color: COLORS.white,
  },
  openLibraryButton: {
    marginTop: 12,
    minHeight: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: 'rgba(0,102,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,102,255,0.35)',
  },
  openLibraryText: {
    color: COLORS.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  statsCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: COLORS.panel2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  statsBlue: {
    color: '#72AFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  statRow: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 11,
    marginBottom: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  statValue: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '900',
  },
  filterRow: {
    gap: 10,
    paddingTop: 14,
    paddingBottom: 4,
  },
  filterButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: {
    backgroundColor: COLORS.blueSoft,
    borderColor: COLORS.blue,
  },
  filterButtonFocused: {
    transform: [{ scale: 1.04 }],
    borderColor: COLORS.white,
  },
  filterButtonText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  filterButtonTextActive: {
    color: COLORS.white,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 9,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionArrow: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blue,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionCount: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  posterRow: {
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 5,
  },
  posterCard: {
    width: 104,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.panel2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  posterImageWrap: {
    height: 136,
    backgroundColor: COLORS.panel3,
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: 'rgba(6,13,27,0.7)',
  },
  posterTypePill: {
    position: 'absolute',
    top: 9,
    left: 9,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(7,16,31,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(86,150,255,0.45)',
  },
  posterTypeText: {
    color: COLORS.textSoft,
    fontSize: 8,
    fontWeight: '900',
  },
  posterInfo: {
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  posterTitle: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
  },
  posterMeta: {
    marginTop: 5,
    color: COLORS.textMuted,
    fontSize: 7,
    fontWeight: '700',
  },
  posterFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  posterFooterText: {
    color: COLORS.textSecondary,
    fontSize: 7,
    fontWeight: '700',
  },
  posterDot: {
    width: 3,
    height: 3,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  phoneGrid: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
