import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { ShellBackground } from '../../app/AppShell';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { BRAND, BRAND_ASSETS } from '../../design/brand';
import { useDeviceClass } from '../../design/device';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { buildXtreamM3UUrl, downloadAndParseM3U, M3UChannel } from '../../lib/m3u';
import { getTmdbMetadata, tmdbImageUrl } from '../../lib/tmdb';
import { describeConnectionError, ValidationError } from './connectionErrors';

type Props = {
  onConnected: (channels: M3UChannel[], source: string) => void;
};

type Mode = 'xtream' | 'm3u';

async function checkNetworkConnection(): Promise<boolean> {
  const endpoints = [
    'https://connectivitycheck.gstatic.com/generate_204',
    'https://www.google.com/generate_204',
  ];

  for (const url of endpoints) {
    try {
      const result = await Promise.race([
        fetch(url, { method: 'GET' }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4500)),
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

/** Artwork for the brand side (only shown when TMDB is configured). */
const POSTER_SAMPLES: Array<{ name: string; type: 'movie' | 'series' }> = [
  { name: 'Dune: Part Two', type: 'movie' },
  { name: 'House of the Dragon', type: 'series' },
  { name: 'The Last of Us', type: 'series' },
];

/**
 * Sign-in / connection screen.
 *
 * Presentation rebuilt; the connection flow is unchanged: Xtream credentials
 * are turned into the player's M3U URL by buildXtreamM3UUrl and loaded with
 * downloadAndParseM3U. "M3U link" mode passes a playlist URL to the same
 * loader (the same path used when restoring a saved source).
 */
export default function ConnectionScreen({ onConnected }: Props) {
  const { language, setLanguage } = useAppPreferences();
  const ar = language === 'ar';
  const palette = usePalette();
  const device = useDeviceClass();
  const compact = device === 'phone';
  const rowDirection = ar ? 'row-reverse' : 'row';

  const [mode, setMode] = useState<Mode>('xtream');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<{ message: string; technical: string } | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const [networkConnected, setNetworkConnected] = useState<boolean | null>(null);
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const connected = await checkNetworkConnection();
      if (alive) setNetworkConnected(connected);
    };
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all(
      POSTER_SAMPLES.map(async sample => {
        const channel = { id: `sample-${sample.name}`, name: sample.name, url: '', logo: '', group: '', contentType: sample.type } as M3UChannel;
        const metadata = await getTmdbMetadata(channel, sample.type);
        return tmdbImageUrl(metadata?.posterPath, 'w342') || '';
      }),
    )
      .then(images => {
        if (alive) setPosters(images.filter(Boolean));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const connect = async () => {
    try {
      setLoading(true);
      setError(null);
      setShowTechnical(false);
      setProgress(0);
      setCount(0);

      let source: string;
      if (mode === 'xtream') {
        const cleanServer = server.trim();
        const cleanUsername = username.trim();
        if (!cleanServer || !cleanUsername || !password) {
          throw new ValidationError(
            ar ? 'أكمل بيانات اشتراكك: السيرفر، اسم المستخدم، وكلمة المرور.' : 'Enter your server, username and password.',
          );
        }
        source = buildXtreamM3UUrl(cleanServer, cleanUsername, password);
      } else {
        const url = playlistUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
          throw new ValidationError(
            ar ? 'أدخل رابط قائمة M3U كامل يبدأ بـ http:// أو https://' : 'Enter a full M3U playlist link starting with http:// or https://',
          );
        }
        source = url;
      }

      const channels = await downloadAndParseM3U(
        source,
        value => setProgress(value),
        parsed => setCount(parsed),
      );

      if (!channels.length) {
        throw new ValidationError(
          ar ? 'ما تم العثور على محتوى بالمصدر. تأكد من بيانات اشتراكك.' : 'No content was found. Check your subscription details.',
        );
      }

      onConnected(channels, source);
    } catch (e) {
      setError(describeConnectionError(e, ar));
    } finally {
      setLoading(false);
    }
  };

  const statusColor =
    networkConnected === null ? palette.muted : networkConnected ? SHASHTNA_THEME.colors.success : SHASHTNA_THEME.colors.danger;
  const statusText =
    networkConnected === null
      ? ar ? 'جاري فحص الاتصال' : 'Checking connection'
      : networkConnected
        ? ar ? 'متصل بالإنترنت' : 'Online'
        : ar ? 'لا يوجد اتصال' : 'Offline';

  const presentation = (
    <View style={[styles.presentation, compact && styles.presentationCompact, { alignItems: ar ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.brandRow, { flexDirection: rowDirection }]}>
        <Image source={BRAND_ASSETS.logo} style={[styles.logo, compact && styles.logoCompact]} />
        <View style={{ alignItems: ar ? 'flex-end' : 'flex-start' }}>
          <Text style={[styles.brandName, { color: palette.text }]}>{BRAND.nameInside}</Text>
          <Text style={[styles.brandTag, { color: palette.accent.light }]}>{ar ? 'منصة ترفيهك على شاشة واحدة' : 'Your entertainment, one screen'}</Text>
        </View>
      </View>

      {!compact ? (
        <>
          <Text style={[styles.headline, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
            {ar ? 'كل محتواك\nبمكان واحد' : 'Everything you watch,\nin one place'}
          </Text>
          <Text style={[styles.body, { color: palette.secondary, textAlign: ar ? 'right' : 'left' }]}>
            {ar
              ? 'قنوات مباشرة وأفلام ومسلسلات بتجربة واضحة وسريعة على التلفزيون والموبايل.'
              : 'Live channels, movies and series in a clear, fast experience on TV and mobile.'}
          </Text>
          <View style={[styles.features, { flexDirection: rowDirection }]}>
            <Feature icon="live" label={ar ? 'بث مباشر' : 'Live TV'} palette={palette} />
            <Feature icon="movies" label={ar ? 'أفلام' : 'Movies'} palette={palette} />
            <Feature icon="series" label={ar ? 'مسلسلات' : 'Series'} palette={palette} />
          </View>
          {posters.length >= 3 ? (
            <View style={[styles.posterFan, { flexDirection: rowDirection }]} pointerEvents="none">
              {posters.slice(0, 3).map((uri, i) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={[styles.fanPoster, { transform: [{ rotate: `${(i - 1) * (ar ? -5 : 5)}deg` }], zIndex: i === 1 ? 2 : 1 }]}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const form = (
    <View style={[styles.card, compact && styles.cardCompact, { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass }]}>
      <View style={[styles.cardTop, { flexDirection: rowDirection }]}>
        <View style={[styles.status, { flexDirection: rowDirection, borderColor: palette.glassBorder }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: palette.secondary }]}>{statusText}</Text>
        </View>
        <Pressable
          focusable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'Switch to English' : 'التبديل إلى العربية'}
          onPress={() => setLanguage(ar ? 'en' : 'ar')}
          style={({ focused, pressed }) => [
            styles.langToggle,
            { flexDirection: rowDirection, borderColor: palette.glassBorder },
            focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name="language" size={16} color={palette.accent.light} />
          <Text style={[styles.langText, { color: palette.text }]}>{ar ? 'English' : 'العربية'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.cardTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
        {ar ? 'تسجيل الدخول' : 'Sign in'}
      </Text>
      <Text style={[styles.cardSub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
        {ar ? 'أدخل بيانات اشتراكك وابدأ المشاهدة فوراً.' : 'Enter your subscription details to start watching.'}
      </Text>

      <View style={[styles.segment, { flexDirection: rowDirection, borderColor: palette.glassBorder }]}>
        <SegmentButton label="Xtream" active={mode === 'xtream'} onPress={() => setMode('xtream')} palette={palette} />
        <SegmentButton label={ar ? 'رابط M3U' : 'M3U link'} active={mode === 'm3u'} onPress={() => setMode('m3u')} palette={palette} />
      </View>

      {mode === 'xtream' ? (
        <>
          <Field
            label={ar ? 'رابط السيرفر' : 'Server URL'}
            icon="link"
            value={server}
            onChangeText={setServer}
            placeholder="http://server:port"
            palette={palette}
            ar={ar}
            ltrValue
            keyboardType="url"
            preferred
          />
          <Field label={ar ? 'اسم المستخدم' : 'Username'} icon="user" value={username} onChangeText={setUsername} placeholder={ar ? 'اسم المستخدم' : 'Username'} palette={palette} ar={ar} ltrValue />
          <Field
            label={ar ? 'كلمة المرور' : 'Password'}
            icon="settings"
            value={password}
            onChangeText={setPassword}
            placeholder={ar ? 'كلمة المرور' : 'Password'}
            palette={palette}
            ar={ar}
            ltrValue
            secure={!showPassword}
            accessory={
              <Pressable
                focusable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? (ar ? 'إخفاء كلمة المرور' : 'Hide password') : ar ? 'إظهار كلمة المرور' : 'Show password'}
                onPress={() => setShowPassword(v => !v)}
                style={({ focused }) => [styles.eye, focused && { backgroundColor: palette.accent.soft, borderColor: palette.focus }]}
              >
                <AppIcon name="eye" size={18} color={showPassword ? palette.accent.light : palette.muted} />
              </Pressable>
            }
          />
        </>
      ) : (
        <Field
          label={ar ? 'رابط قائمة M3U' : 'M3U playlist URL'}
          icon="link"
          value={playlistUrl}
          onChangeText={setPlaylistUrl}
          placeholder="https://example.com/playlist.m3u"
          palette={palette}
          ar={ar}
          ltrValue
          keyboardType="url"
          preferred
        />
      )}

      <Pressable
        focusable
        disabled={loading}
        accessibilityRole="button"
        onPress={connect}
        style={({ focused, pressed }) => [
          styles.connect,
          { flexDirection: rowDirection, experimental_backgroundImage: palette.accent.gradient, boxShadow: palette.accent.buttonShadow },
          loading && styles.connectLoading,
          focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
          pressed && styles.pressed,
        ]}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <AppIcon name="play" size={18} color="#FFFFFF" />}
        <Text style={styles.connectText}>
          {loading ? (ar ? 'جاري تحميل المحتوى...' : 'Loading content...') : ar ? 'دخول' : 'Sign in'}
        </Text>
      </Pressable>

      {loading ? (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: palette.surfaceHover }]}>
            <View style={[styles.progressFill, { width: `${Math.max(4, Math.min(100, progress))}%`, backgroundColor: palette.accent.bright }]} />
          </View>
          <Text style={[styles.progressText, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {ar ? `تم تجهيز ${count.toLocaleString('ar-IQ')} عنصر` : `${count.toLocaleString('en-US')} items ready`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.error, { flexDirection: rowDirection }]}>
          <AppIcon name="info" size={18} color={SHASHTNA_THEME.colors.danger} />
          <View style={styles.errorCopy}>
            <Text style={[styles.errorTitle, { textAlign: ar ? 'right' : 'left' }]}>{ar ? 'تعذر تسجيل الدخول' : 'Sign-in failed'}</Text>
            <Text style={[styles.errorBody, { color: palette.secondary, textAlign: ar ? 'right' : 'left' }]}>{error.message}</Text>
            {error.technical ? (
              <Pressable focusable onPress={() => setShowTechnical(v => !v)} style={({ focused }) => [styles.techToggle, focused && { borderColor: palette.focus }]}>
                <Text style={[styles.techToggleText, { color: palette.accent.light, textAlign: ar ? 'right' : 'left' }]}>
                  {showTechnical ? (ar ? 'إخفاء التفاصيل' : 'Hide details') : ar ? 'تفاصيل التشخيص' : 'Diagnostics'}
                </Text>
              </Pressable>
            ) : null}
            {showTechnical ? <Text style={[styles.techText, { color: palette.muted }]}>{error.technical}</Text> : null}
          </View>
        </View>
      ) : null}

      <Text style={[styles.note, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
        {ar ? 'تحتاج اشتراكاً فعّالاً من مزود الخدمة. بياناتك تبقى على جهازك.' : 'An active subscription is required. Your details stay on this device.'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.canvas }]}>
      {palette.mode === 'dark' ? (
        <>
          <ShellBackground />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </>
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.layout, { flexDirection: compact ? 'column' : rowDirection }]}>
          {presentation}
          {form}
        </View>
        <Text style={[styles.credit, { color: palette.muted }]}>{ar ? 'تصميم عبدالرحمن عامر' : 'Design by Abdulrahman Amer'}</Text>
      </ScrollView>
    </View>
  );
}

function Feature({ icon, label, palette }: { icon: AppIconName; label: string; palette: Palette }) {
  return (
    <View style={[styles.feature, { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass }]}>
      <AppIcon name={icon} size={18} color={palette.accent.light} />
      <Text style={[styles.featureText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

function SegmentButton({ label, active, onPress, palette }: { label: string; active: boolean; onPress: () => void; palette: Palette }) {
  return (
    <Pressable
      focusable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.segmentButton,
        active && { experimental_backgroundImage: palette.accent.gradient },
        focused && { borderColor: palette.focus, boxShadow: palette.accent.focusShadow },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : palette.secondary }]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  palette,
  ar,
  ltrValue = false,
  secure = false,
  keyboardType,
  accessory,
  preferred = false,
}: {
  label: string;
  icon: AppIconName;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  palette: Palette;
  ar: boolean;
  /** URLs, usernames and passwords are typed left-to-right in both languages. */
  ltrValue?: boolean;
  secure?: boolean;
  keyboardType?: 'default' | 'url';
  accessory?: React.ReactNode;
  preferred?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.secondary, textAlign: ar ? 'right' : 'left' }]}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          { flexDirection: ar ? 'row-reverse' : 'row', borderColor: focused ? palette.focus : palette.glassBorder, backgroundColor: palette.surfaceHover },
          focused && { boxShadow: palette.accent.focusShadow },
        ]}
      >
        <AppIcon name={icon} size={18} color={focused ? palette.accent.light : palette.muted} />
        <TextInput
          hasTVPreferredFocus={preferred}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType === 'url' ? 'url' : 'default'}
          style={[
            styles.input,
            { color: palette.text },
            ltrValue ? styles.ltrInput : { textAlign: ar ? 'right' : 'left' },
          ]}
        />
        {accessory}
      </View>
    </View>
  );
}

const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  scrim: { backgroundColor: 'rgba(2,5,16,0.5)' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 56, paddingVertical: 36 },
  scrollCompact: { paddingHorizontal: 18, paddingVertical: 24 },
  layout: { alignItems: 'center', gap: 48 },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },

  presentation: { flex: 1, minWidth: 0, gap: 18 },
  presentationCompact: { flex: 0, alignSelf: 'stretch', gap: 10 },
  brandRow: { alignItems: 'center', gap: 16 },
  logo: { width: 72, height: 72, borderRadius: 20 },
  logoCompact: { width: 56, height: 56, borderRadius: 16 },
  brandName: { fontSize: 26, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  brandTag: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  headline: { fontSize: 44, lineHeight: 54, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, marginTop: 10 },
  body: { fontSize: T.size.body, lineHeight: T.lineHeight.body, maxWidth: 520 },
  features: { gap: 10, flexWrap: 'wrap' },
  feature: { height: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 14, fontWeight: '800' },
  posterFan: { marginTop: 14, gap: -18, alignItems: 'flex-end' },
  fanPoster: { width: 96, height: 144, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', boxShadow: '0px 16px 30px rgba(0,0,0,0.5)' },

  card: { width: 460, borderRadius: 28, borderWidth: 1, padding: 28, gap: 14, boxShadow: '0px 24px 60px rgba(0,0,0,0.45)' },
  cardCompact: { width: '100%', padding: 20 },
  cardTop: { justifyContent: 'space-between', alignItems: 'center' },
  status: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  langToggle: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 6 },
  langText: { fontSize: 13, fontWeight: '800' },
  cardTitle: { fontSize: 28, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans, marginTop: 4 },
  cardSub: { fontSize: 14, lineHeight: 21, marginTop: -6 },

  segment: { height: 48, borderRadius: 16, borderWidth: 1, padding: 4, gap: 4 },
  segmentButton: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  segmentText: { fontSize: 15, fontWeight: '900' },

  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '800' },
  inputWrap: { height: 56, borderRadius: 16, borderWidth: 2, paddingHorizontal: 14, alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 16, fontFamily: SHASHTNA_FONT.sans, paddingVertical: 0 },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  eye: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },

  connect: { height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6, borderWidth: 2, borderColor: 'transparent' },
  connectLoading: { opacity: 0.85 },
  connectText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },

  progressWrap: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: '700' },

  error: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(242,89,106,0.10)', borderWidth: 1, borderColor: 'rgba(242,89,106,0.35)' },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: SHASHTNA_THEME.colors.danger, fontSize: 14, fontWeight: '900' },
  errorBody: { fontSize: 14, lineHeight: 21 },
  techToggle: { alignSelf: 'stretch', paddingVertical: 4, borderWidth: 2, borderColor: 'transparent', borderRadius: 8 },
  techToggleText: { fontSize: 12, fontWeight: '800' },
  techText: { fontSize: 11, lineHeight: 16, textAlign: 'left', writingDirection: 'ltr' },

  note: { fontSize: 12, lineHeight: 18 },
  credit: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 24, letterSpacing: 0.4 },
});
