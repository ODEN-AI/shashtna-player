import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  M3UChannel,
  buildXtreamM3UUrl,
  downloadAndParseM3U,
} from '../../lib/m3u';
import { getTmdbMetadata, tmdbImageUrl } from '../../lib/tmdb';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import AppIcon from '../../components/common/AppIcon';

type Props = {
  onConnected: (channels: M3UChannel[], source: string) => void;
};

const BRAND_MARK = 'AB';

async function checkNetworkConnection(): Promise<boolean> {
  const endpoints = [
    'https://connectivitycheck.gstatic.com/generate_204',
    'https://www.google.com/generate_204',
  ];

  for (const url of endpoints) {
    try {
      const result = await Promise.race([
        fetch(url, { method: 'GET' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 4500),
        ),
      ]);

      if (result && 'ok' in result && (result as Response).ok) {
        return true;
      }
    } catch {
      // Try the next connectivity endpoint.
    }
  }

  return false;
}

function Feature({
  icon,
  title,
  sub,
}: {
  icon: 'live' | 'movies' | 'series';
  title: string;
  sub: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <AppIcon name={icon} size={23} color={SHASHTNA_THEME.colors.primaryBright} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSub}>{sub}</Text>
    </View>
  );
}

export default function ConnectionScreen({ onConnected }: Props) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';

  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  const [networkConnected, setNetworkConnected] = useState(false);
  const [backdrops, setBackdrops] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;

    const refreshNetworkStatus = async () => {
      const connected = await checkNetworkConnection();
      if (alive) {
        setNetworkConnected(connected);
      }
    };

    refreshNetworkStatus();
    const interval = setInterval(refreshNetworkStatus, 10000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    // خلفية سينمائية متنوعة: أفلام + مسلسلات + أنمي + رياضة.
    // كل العناصر تُجلب من TMDB، لذلك تتغير جودة/توفر البوسترات حسب نتائج TMDB.
    const samples: Array<{ name: string; type: 'movie' | 'series' }> = [
      // Movies
      { name: 'Dune: Part Two', type: 'movie' },
      { name: 'The Batman', type: 'movie' },
      { name: 'John Wick: Chapter 4', type: 'movie' },
      { name: 'Oppenheimer', type: 'movie' },
      { name: 'Top Gun: Maverick', type: 'movie' },
      // Series
      { name: 'The Last of Us', type: 'series' },
      { name: 'House of the Dragon', type: 'series' },
      { name: 'Wednesday', type: 'series' },
      { name: 'Stranger Things', type: 'series' },
      // Anime
      { name: 'Demon Slayer: Kimetsu no Yaiba', type: 'series' },
      { name: 'Jujutsu Kaisen', type: 'series' },
      { name: 'One Piece', type: 'series' },
      // Sports
      { name: 'The Last Dance', type: 'series' },
      { name: 'Formula 1: Drive to Survive', type: 'series' },
      { name: 'All or Nothing: Arsenal', type: 'series' },
      { name: 'Creed III', type: 'movie' },
    ];

    Promise.all(
      samples.map(async sample => {
        const channel = {
          id: `sample-${sample.name}`,
          name: sample.name,
          url: '',
          logo: '',
          group: '',
          contentType: sample.type,
        } as M3UChannel;

        const metadata = await getTmdbMetadata(channel, sample.type);
        return tmdbImageUrl(metadata?.posterPath, 'w500') || '';
      }),
    )
      .then(images => {
        if (alive) {
          setBackdrops(images.filter(Boolean));
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const connect = async () => {
    try {
      setLoading(true);
      setError('');
      setProgress(0);
      setCount(0);

      const cleanServer = server.trim();
      const cleanUsername = username.trim();
      const cleanPassword = password;

      if (!cleanServer || !cleanUsername || !cleanPassword) {
        throw new Error(
          ar
            ? 'أكمل بيانات اشتراكك: السيرفر، اسم المستخدم، وكلمة المرور.'
            : 'Enter your subscription server, username, and password.',
        );
      }

      const source = buildXtreamM3UUrl(
        cleanServer,
        cleanUsername,
        cleanPassword,
      );

      const channels = await downloadAndParseM3U(
        source,
        progressValue => setProgress(progressValue),
        parsedCount => setCount(parsedCount),
      );

      if (!channels.length) {
        throw new Error(
          ar
            ? 'ما تم العثور على محتوى بالمصدر. تأكد من بيانات اشتراكك.'
            : 'No content was found. Check your subscription details.',
        );
      }

      onConnected(channels, source);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : ar
            ? 'حدث خطأ أثناء تسجيل الدخول.'
            : 'An error occurred while signing in.',
      );
    } finally {
      setLoading(false);
    }
  };

  const statusColor = networkConnected
    ? SHASHTNA_THEME.colors.success
    : '#F05B68';

  return (
    <View style={styles.screen}>
      <View style={styles.mediaWall}>
        <View style={styles.mediaWallTrack}>
          {backdrops.map((uri, index) => {
            const column = index % 4;
            const row = Math.floor(index / 4);
            const rowTilt = row === 0 ? -5 : row === 1 ? 0 : 5;
            const columnShift = column === 0 ? -2 : column === 3 ? 2 : 0;

            return (
              <ImageBackground
                key={`${uri}-${index}`}
                source={{ uri }}
                style={[
                  styles.wallPoster,
                  {
                    left: `${column * 24 + columnShift}%`,
                    top: `${row * 34 + 1}%`,
                    transform: [{ rotate: `${rowTilt + (column % 2 ? 1 : -1)}deg` }],
                  },
                ]}
                imageStyle={styles.wallPosterImage}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.backgroundTint} />
      <View style={styles.leftVignette} />
      <View style={styles.backgroundGlow} />

      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandLogoFrame}>
            <Text style={styles.brandMark}>{BRAND_MARK}</Text>
          </View>

          <View style={styles.brandCopy}>
            <Text style={styles.brandArabic}>عبدالرحمن</Text>
            <Text style={styles.brandLatin}>IPTV</Text>
            <Text style={styles.brandDescriptor}>
              {ar ? 'منصة ترفيهك على شاشة واحدة' : 'Your entertainment, one screen'}
            </Text>
          </View>
        </View>

        <View style={styles.topActions}>
          <View style={styles.languagePill}>
            <AppIcon name="language" size={19} color={SHASHTNA_THEME.colors.primaryBright} />
            <Text style={styles.pillText}>{ar ? 'العربية' : 'English'}</Text>
          </View>

          <View
            style={[
              styles.statusPill,
              {
                borderColor: statusColor,
                backgroundColor: networkConnected
                  ? 'rgba(24, 197, 132, 0.10)'
                  : 'rgba(240, 91, 104, 0.10)',
              },
            ]}
          >
            <AppIcon name="wifi" size={19} color={statusColor} />
            <Text style={styles.statusText}>
              {networkConnected ? (ar ? 'متصل' : 'Connected') : (ar ? 'غير متصل' : 'Offline')}
            </Text>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.left}>
          <Text style={styles.kicker}>MORE THAN ENTERTAINMENT</Text>

          <Text style={styles.heroTitle}>
            كل محتواك{'\n'}
            <Text style={styles.heroBlue}>بمكان واحد</Text>
          </Text>

          <Text style={styles.heroBody}>
            {ar
              ? 'شاهد القنوات المباشرة والأفلام والمسلسلات بجودة عالية وتجربة سهلة على شاشتك.'
              : 'Watch live channels, movies and series with a clean, simple viewing experience.'}
          </Text>

          <View style={styles.featureRow}>
            <Feature
              icon="live"
              title={ar ? 'قنوات مباشرة' : 'Live TV'}
              sub={ar ? 'مباريات · أخبار · ترفيه' : 'Sports · News · Entertainment'}
            />
            <Feature
              icon="movies"
              title={ar ? 'أفلام متنوعة' : 'Movies'}
              sub={ar ? 'أحدث وأفضل الأفلام' : 'Latest and popular'}
            />
            <Feature
              icon="series"
              title={ar ? 'مسلسلات مميزة' : 'Series'}
              sub={ar ? 'محلية وعالمية' : 'Local and global'}
            />
          </View>

          <View style={styles.designerCredit}>
            <View style={styles.creditLine} />
            <Text style={styles.creditText}>
              {ar ? 'تصميم عبدالرحمن عامر' : 'DESIGN BY ABDULRAHMAN AMER'}
            </Text>
            <View style={styles.creditLine} />
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.linkBadge}>
              <AppIcon name="source" size={24} color={SHASHTNA_THEME.colors.primaryBright} />
            </View>

            <View style={styles.panelHeaderCopy}>
              <Text style={styles.eyebrow}>ABDULRAHMAN IPTV</Text>
              <Text style={styles.panelTitle}>
                {ar ? 'أدخل البيانات الخاصة باشتراكك' : 'Enter your subscription details'}
              </Text>
              <Text style={styles.panelSub}>
                {ar
                  ? 'سجل الدخول وابدأ المشاهدة فوراً'
                  : 'Sign in and start watching instantly'}
              </Text>
            </View>
          </View>

          <View style={styles.serviceCard}>
            <View style={styles.serviceIcon}>
              <AppIcon name="source" size={25} color={SHASHTNA_THEME.colors.primaryBright} />
            </View>

            <View style={styles.serviceCopy}>
              <Text style={styles.serviceTitle}>IPTV</Text>
              <Text style={styles.serviceSub}>
                {ar ? 'بيانات السيرفر الخاصة باشتراكك' : 'Your IPTV subscription credentials'}
              </Text>
            </View>

            <View style={styles.serviceCheck}>
              <AppIcon name="check" size={18} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.inputBlock}>
              <Text style={styles.label}>{ar ? 'رابط السيرفر' : 'Server URL'}</Text>
              <View style={styles.inputWrap}>
                <AppIcon name="source" size={20} color={SHASHTNA_THEME.colors.primaryBright} />
                <TextInput
                  value={server}
                  onChangeText={setServer}
                  placeholder="http://server:port"
                  placeholderTextColor={SHASHTNA_THEME.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>{ar ? 'اسم المستخدم' : 'Username'}</Text>
              <View style={styles.inputWrap}>
                <AppIcon name="user" size={20} color={SHASHTNA_THEME.colors.primaryBright} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder={ar ? 'اسم المستخدم' : 'Username'}
                  placeholderTextColor={SHASHTNA_THEME.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputBlock}>
              <Text style={styles.label}>{ar ? 'كلمة المرور' : 'Password'}</Text>
              <View style={styles.inputWrap}>
                <AppIcon name="settings" size={20} color={SHASHTNA_THEME.colors.primaryBright} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={ar ? 'كلمة المرور' : 'Password'}
                  placeholderTextColor={SHASHTNA_THEME.colors.textMuted}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showPassword}
                />
                <Pressable
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={ar ? 'إظهار كلمة المرور' : 'Show password'}
                  onPress={() => setShowPassword(value => !value)}
                  style={styles.passwordToggle}
                >
                  <AppIcon
                    name="eye"
                    size={19}
                    color={SHASHTNA_THEME.colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable
            focusable
            hasTVPreferredFocus
            disabled={loading}
            onPress={connect}
            style={({ focused, pressed }) => [
              styles.connect,
              focused && styles.connectFocus,
              pressed && styles.connectPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <AppIcon name="play" size={18} color="#FFFFFF" />
            )}

            <Text style={styles.connectText}>
              {loading
                ? `${ar ? 'جاري تسجيل الدخول...' : 'Signing in...'} ${progress}%`
                : ar
                  ? 'تسجيل الدخول وتشغيل'
                  : 'Sign In & Play'}
            </Text>
          </Pressable>

          {loading ? (
            <View style={styles.progressBox}>
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
              <Text style={styles.progressText}>{count} عنصر</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.error}>
              <View style={styles.errorIcon}>
                <AppIcon name="info" size={17} color="#F05B68" />
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorTitle}>
                  {ar ? 'تعذر تسجيل الدخول' : 'Sign-in failed'}
                </Text>
                <Text style={styles.errorBody}>{error}</Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.note}>
            {ar
              ? 'تأكد من إدخال بيانات اشتراكك بشكل صحيح. تحتاج إلى اشتراك فعال من مزود الخدمة.'
              : 'Enter valid subscription details. An active subscription is required.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SHASHTNA_THEME.colors.background,
    overflow: 'hidden',
  },
  mediaWall: {
    position: 'absolute',
    left: 0,
    top: 72,
    width: '65%',
    bottom: 0,
    overflow: 'hidden',
    opacity: 0.92,
  },
  mediaWallTrack: {
    position: 'absolute',
    left: '-5%',
    top: '2%',
    width: '112%',
    height: '96%',
  },
  wallPoster: {
    position: 'absolute',
    width: '23%',
    height: '31%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(126, 201, 255, 0.22)',
    backgroundColor: '#071525',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  wallPosterImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#04101D',
    opacity: 0.58,
  },
  leftVignette: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '57%',
    backgroundColor: 'rgba(2, 10, 20, 0.42)',
  },
  backgroundGlow: {
    position: 'absolute',
    width: 720,
    height: 720,
    borderRadius: 360,
    right: -250,
    top: -260,
    backgroundColor: SHASHTNA_THEME.colors.primary,
    opacity: 0.10,
  },
  topbar: {
    height: 88,
    paddingHorizontal: 34,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogoFrame: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(91, 190, 255, 0.70)',
    backgroundColor: '#0B2D58',
    shadowColor: SHASHTNA_THEME.colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  brandMark: {
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 54,
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandCopy: {
    marginLeft: 13,
    marginTop: -4,
  },
  brandArabic: {
    color: '#FFFFFF',
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '900',
    fontFamily: SHASHTNA_FONT.display,
  },
  brandLatin: {
    color: SHASHTNA_THEME.colors.primaryBright,
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '900',
    marginTop: -1,
  },
  brandDescriptor: {
    color: SHASHTNA_THEME.colors.textMuted,
    fontSize: 8,
    marginTop: 4,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 2,
  },
  languagePill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.borderStrong,
    backgroundColor: SHASHTNA_THEME.colors.glassSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  pillText: {
    color: SHASHTNA_THEME.colors.textPrimary,
    fontSize: 13,
    fontFamily: SHASHTNA_FONT.sans,
  },
  statusPill: {
    height: 44,
    minWidth: 122,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: SHASHTNA_FONT.sans,
    fontWeight: '800',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    paddingHorizontal: 34,
    paddingBottom: 26,
  },
  left: {
    flex: 1,
    maxWidth: 600,
    paddingRight: 18,
    marginTop: -12,
    zIndex: 2,
  },
  kicker: {
    color: SHASHTNA_THEME.colors.primaryBright,
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: '800',
  },
  heroTitle: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 46,
    lineHeight: 56,
    fontWeight: '900',
    fontFamily: SHASHTNA_FONT.display,
  },
  heroBlue: {
    color: SHASHTNA_THEME.colors.primaryBright,
  },
  heroBody: {
    marginTop: 15,
    maxWidth: 500,
    color: '#D4E1ED',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: SHASHTNA_FONT.sans,
  },
  featureRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  featureCard: {
    width: 136,
    height: 96,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.border,
    backgroundColor: SHASHTNA_THEME.colors.glassSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.primary,
    backgroundColor: SHASHTNA_THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  featureTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: SHASHTNA_FONT.sans,
  },
  featureSub: {
    color: SHASHTNA_THEME.colors.textMuted,
    fontSize: 9,
    marginTop: 4,
    textAlign: 'center',
  },
  designerCredit: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: 390,
  },
  creditLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(91, 190, 255, 0.18)',
  },
  creditText: {
    color: 'rgba(177, 204, 229, 0.70)',
    fontSize: 8,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  panel: {
    width: 550,
    maxWidth: '47%',
    padding: 23,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.borderStrong,
    backgroundColor: SHASHTNA_THEME.colors.glassStrong,
    shadowColor: '#000000',
    shadowOpacity: 0.40,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
  },
  linkBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: SHASHTNA_THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.borderStrong,
    marginRight: 13,
  },
  panelHeaderCopy: {
    flex: 1,
  },
  eyebrow: {
    color: SHASHTNA_THEME.colors.primaryBright,
    fontSize: 9,
    letterSpacing: 1.8,
    fontWeight: '800',
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '900',
    fontFamily: SHASHTNA_FONT.display,
    marginTop: 4,
  },
  panelSub: {
    color: SHASHTNA_THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    fontFamily: SHASHTNA_FONT.sans,
  },
  serviceCard: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.primary,
    backgroundColor: SHASHTNA_THEME.colors.primarySoft,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(23, 146, 244, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCopy: {
    flex: 1,
    marginLeft: 11,
  },
  serviceTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  serviceSub: {
    color: SHASHTNA_THEME.colors.textMuted,
    fontSize: 9,
    marginTop: 3,
  },
  serviceCheck: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#1266B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    marginTop: 15,
  },
  inputBlock: {
    marginBottom: 10,
  },
  label: {
    color: SHASHTNA_THEME.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 7,
  },
  inputWrap: {
    minHeight: 45,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.border,
    backgroundColor: SHASHTNA_THEME.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: SHASHTNA_FONT.sans,
    textAlign: 'right',
    paddingHorizontal: 10,
  },
  passwordToggle: {
    width: 30,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connect: {
    height: 48,
    borderRadius: 12,
    backgroundColor: SHASHTNA_THEME.colors.primary,
    borderWidth: 1,
    borderColor: SHASHTNA_THEME.colors.primaryBright,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  connectFocus: {
    transform: [{ scale: 1.012 }],
    shadowColor: SHASHTNA_THEME.colors.primary,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 10,
  },
  connectPressed: {
    opacity: 0.86,
  },
  connectText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    fontFamily: SHASHTNA_FONT.sans,
  },
  progressBox: {
    marginTop: 12,
    height: 8,
    borderRadius: 4,
    backgroundColor: SHASHTNA_THEME.colors.surface,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: SHASHTNA_THEME.colors.primaryBright,
  },
  progressText: {
    color: SHASHTNA_THEME.colors.textTertiary,
    fontSize: 9,
    marginTop: 5,
    textAlign: 'center',
  },
  error: {
    marginTop: 12,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240, 91, 104, 0.35)',
    backgroundColor: 'rgba(240, 91, 104, 0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  errorIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(240, 91, 104, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCopy: {
    flex: 1,
    marginLeft: 9,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  errorBody: {
    color: SHASHTNA_THEME.colors.textSecondary,
    fontSize: 10,
    marginTop: 3,
    lineHeight: 15,
  },
  note: {
    color: SHASHTNA_THEME.colors.textMuted,
    fontSize: 8,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
});
