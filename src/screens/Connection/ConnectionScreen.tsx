import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../../components/common/Typography';

import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { ShellBackground } from '../../app/AppShell';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { BRAND, BRAND_ASSETS } from '../../design/brand';
import { useDeviceClass } from '../../design/device';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { buildXtreamM3UUrl, downloadAndParseM3U, M3UChannel } from '../../lib/m3u';
import { describeConnectionError, ValidationError } from './connectionErrors';
import { describeServerUrlProblem, normalizeServerUrl, validateServerUrl } from '../../lib/serverUrl';

type Props = {
  onConnected: (channels: M3UChannel[], source: string) => void;
  /** Shashtna Player Lite: load live channels only. */
  liveOnly?: boolean;
};

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

/** Brand statement shown under the name. Arabic wording is fixed by the brand. */
const TAGLINE = { ar: 'كل ما تحب، على شاشة واحدة.', en: 'Everything you love, on one screen.' };

/**
 * Sign-in / connection screen.
 *
 * One connection type is offered, shown to users as "IPTV". Internally it is
 * the unchanged Xtream flow: the credentials become the player's M3U URL via
 * buildXtreamM3UUrl and are loaded with downloadAndParseM3U (the same loader
 * App uses to restore a saved source).
 */
export default function ConnectionScreen({ onConnected, liveOnly = false }: Props) {
  const { language, setLanguage } = useAppPreferences();
  const ar = language === 'ar';
  const palette = usePalette();
  const dark = palette.mode === 'dark';
  const device = useDeviceClass();
  const compact = device === 'phone';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const align = ar ? 'right' : 'left';

  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<{ message: string; technical: string } | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const [networkConnected, setNetworkConnected] = useState<boolean | null>(null);

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

  const connect = async () => {
    try {
      setLoading(true);
      setError(null);
      setShowTechnical(false);
      setProgress(0);
      setCount(0);

      // One normaliser for what is shown, validated, connected to and saved.
      const cleanServer = normalizeServerUrl(server);
      if (cleanServer !== server) setServer(cleanServer);
      const cleanUsername = username.trim();
      if (!cleanServer || !cleanUsername || !password) {
        throw new ValidationError(
          ar ? 'أكمل بيانات اشتراكك: السيرفر، اسم المستخدم، وكلمة المرور.' : 'Enter your server, username and password.',
        );
      }
      const problem = validateServerUrl(cleanServer);
      if (problem) throw new ValidationError(describeServerUrlProblem(problem, ar));
      const source = buildXtreamM3UUrl(cleanServer, cleanUsername, password);

      const channels = await downloadAndParseM3U(
        source,
        value => setProgress(value),
        parsed => setCount(parsed),
        { liveOnly },
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

  const brand = (
    <View style={[styles.brand, compact && styles.brandCompact, { alignItems: compact ? 'center' : ar ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.iconStage, compact && styles.iconStageCompact]}>
        {/* A soft pool of light behind the icon; no frame or card around the artwork itself. */}
        {dark ? <View pointerEvents="none" style={[styles.halo, compact && styles.haloCompact]} /> : null}
        <Image source={BRAND_ASSETS.logo} style={[styles.icon, compact && styles.iconCompact]} resizeMode="contain" />
      </View>

      <Text style={[styles.wordmark, { color: palette.muted }]}>{BRAND.nameLatin.toUpperCase()}</Text>

      <Text
        style={[
          styles.tagline,
          !ar && styles.taglineLatin,
          compact && styles.taglineCompact,
          { color: palette.text, textAlign: compact ? 'center' : align, writingDirection: ar ? 'rtl' : 'ltr' },
        ]}
      >
        {/* Break after the comma so the statement sits on two balanced lines. */}
        {(ar ? TAGLINE.ar : TAGLINE.en).replace(/([،,]) /, '$1\n')}
      </Text>

      {!compact ? (
        <>
          <View style={[styles.rule, { experimental_backgroundImage: palette.accent.gradient }]} />
          <View style={[styles.features, { flexDirection: rowDirection }]}>
            <Feature icon="live" label={ar ? 'بث مباشر' : 'Live TV'} palette={palette} />
            <View style={[styles.featureDot, { backgroundColor: palette.muted }]} />
            <Feature icon="movies" label={ar ? 'أفلام' : 'Movies'} palette={palette} />
            <View style={[styles.featureDot, { backgroundColor: palette.muted }]} />
            <Feature icon="series" label={ar ? 'مسلسلات' : 'Series'} palette={palette} />
          </View>
        </>
      ) : null}
    </View>
  );

  const form = (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass },
        !dark && styles.cardLight,
      ]}
    >
      {/* Hairline of light along the top edge gives the glass its depth. */}
      <View pointerEvents="none" style={[styles.cardSheen, !dark && styles.cardSheenLight]} />

      <View style={[styles.cardTop, { flexDirection: rowDirection }]}>
        {/* The only connection type. A label, not a tab: there is nothing to switch to. */}
        <View style={[styles.typeBadge, { flexDirection: rowDirection, backgroundColor: palette.accent.soft, borderColor: palette.accent.medium }]}>
          <AppIcon name="live" size={14} color={dark ? palette.accent.light : palette.accent.deep} />
          <Text style={[styles.typeBadgeText, { color: dark ? palette.accent.light : palette.accent.deep }]}>IPTV</Text>
        </View>
        <View style={[styles.cardTopEnd, { flexDirection: rowDirection }]}>
          <View style={[styles.status, { flexDirection: rowDirection }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor, boxShadow: `0px 0px 8px ${statusColor}` }]} />
            <Text style={[styles.statusText, { color: palette.muted }]}>{statusText}</Text>
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
            <AppIcon name="language" size={15} color={palette.secondary} />
            <Text style={[styles.langText, { color: palette.secondary }]}>{ar ? 'English' : 'العربية'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.heading}>
        <Text style={[styles.cardTitle, { color: palette.text, textAlign: align }]}>{ar ? 'تسجيل الدخول' : 'Sign in'}</Text>
        <Text style={[styles.cardSub, { color: palette.muted, textAlign: align }]}>
          {ar ? 'أدخل بيانات اشتراكك وابدأ المشاهدة فوراً.' : 'Enter your subscription details to start watching.'}
        </Text>
      </View>

      <View style={styles.fields}>
        <Field
          label={ar ? 'رابط السيرفر' : 'Server URL'}
          onEndEditing={() => setServer(value => normalizeServerUrl(value))}
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
        <Field label={ar ? 'اسم المستخدم' : 'Username'} icon="user" value={username} onChangeText={setUsername} placeholder={ar ? 'أدخل اسم المستخدم' : 'Enter your username'} palette={palette} ar={ar} ltrValue />
        <Field
          label={ar ? 'كلمة المرور' : 'Password'}
          icon="settings"
          value={password}
          onChangeText={setPassword}
          placeholder={ar ? 'أدخل كلمة المرور' : 'Enter your password'}
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
      </View>

      <Pressable
        focusable
        disabled={loading}
        accessibilityRole="button"
        onPress={connect}
        style={({ focused, pressed }) => [
          styles.connect,
          {
            flexDirection: rowDirection,
            experimental_backgroundImage: palette.accent.gradient,
            boxShadow: `${palette.accent.buttonShadow}, inset 0px 1px 0px rgba(255,255,255,0.22)`,
          },
          loading && styles.connectLoading,
          focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
          pressed && styles.pressed,
        ]}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.connectText}>
          {loading ? (ar ? 'جاري تحميل المحتوى...' : 'Loading content...') : ar ? 'تسجيل الدخول' : 'Sign in'}
        </Text>
        {!loading ? (
          <View style={ar ? styles.flipX : undefined}>
            <AppIcon name="arrow" size={18} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>

      {loading ? (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: palette.surfaceHover }]}>
            <View style={[styles.progressFill, { width: `${Math.max(4, Math.min(100, progress))}%`, backgroundColor: palette.accent.bright }]} />
          </View>
          <Text style={[styles.progressText, { color: palette.muted, textAlign: align }]}>
            {ar ? `تم تجهيز ${count.toLocaleString('ar-IQ')} عنصر` : `${count.toLocaleString('en-US')} items ready`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.error, { flexDirection: rowDirection }]}>
          <AppIcon name="info" size={18} color={SHASHTNA_THEME.colors.danger} />
          <View style={styles.errorCopy}>
            <Text style={[styles.errorTitle, { textAlign: align }]}>{ar ? 'تعذر تسجيل الدخول' : 'Sign-in failed'}</Text>
            <Text style={[styles.errorBody, { color: palette.secondary, textAlign: align }]}>{error.message}</Text>
            {error.technical ? (
              <Pressable focusable onPress={() => setShowTechnical(v => !v)} style={({ focused }) => [styles.techToggle, focused && { borderColor: palette.focus }]}>
                <Text style={[styles.techToggleText, { color: palette.accent.light, textAlign: align }]}>
                  {showTechnical ? (ar ? 'إخفاء التفاصيل' : 'Hide details') : ar ? 'تفاصيل التشخيص' : 'Diagnostics'}
                </Text>
              </Pressable>
            ) : null}
            {showTechnical ? <Text style={[styles.techText, { color: palette.muted }]}>{error.technical}</Text> : null}
          </View>
        </View>
      ) : null}

      <View style={[styles.footer, { flexDirection: rowDirection, borderTopColor: palette.glassBorder }]}>
        <AppIcon name="check" size={14} color={palette.muted} />
        <Text style={[styles.note, { color: palette.muted, textAlign: align }]}>
          {ar ? 'تحتاج اشتراكاً فعّالاً من مزود الخدمة. بياناتك تبقى على جهازك.' : 'An active subscription is required. Your details stay on this device.'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.canvas }]}>
      {dark ? (
        <>
          <ShellBackground />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          {/* Darkens the form side a little more so the card reads cleanly over the artwork. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { experimental_backgroundImage: ar ? 'linear-gradient(90deg, rgba(2,5,14,0.55) 0%, rgba(2,5,14,0) 60%)' : 'linear-gradient(270deg, rgba(2,5,14,0.55) 0%, rgba(2,5,14,0) 60%)' },
            ]}
          />
        </>
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.layout, compact && styles.layoutCompact, { flexDirection: compact ? 'column' : rowDirection }]}>
          {brand}
          {form}
        </View>
        <Text style={[styles.credit, { color: palette.muted }]}>{ar ? 'تصميم عبدالرحمن عامر' : 'Design by Abdulrahman Amer'}</Text>
      </ScrollView>
    </View>
  );
}

function Feature({ icon, label, palette }: { icon: AppIconName; label: string; palette: Palette }) {
  return (
    <View style={styles.feature}>
      <AppIcon name={icon} size={16} color={palette.secondary} />
      <Text style={[styles.featureText, { color: palette.secondary }]}>{label}</Text>
    </View>
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
  onEndEditing,
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
  /** Called when the field loses focus (e.g. to normalise what was typed). */
  onEndEditing?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const dark = palette.mode === 'dark';
  return (
    <View
      style={[
        styles.inputWrap,
        {
          flexDirection: ar ? 'row-reverse' : 'row',
          borderColor: focused ? palette.focus : palette.glassBorder,
          backgroundColor: dark ? 'rgba(3,7,18,0.52)' : palette.surface,
        },
        focused && { boxShadow: palette.accent.focusShadow },
      ]}
    >
      <AppIcon name={icon} size={18} color={focused ? palette.accent.light : palette.muted} />
      {/* The label sits inside the field, above the value: compact enough for a 540dp-high TV screen. */}
      <View style={styles.fieldBody}>
        <Text
          numberOfLines={1}
          style={[styles.fieldLabel, { color: focused ? (dark ? palette.accent.light : palette.accent.deep) : palette.muted, textAlign: ar ? 'right' : 'left' }]}
        >
          {label}
        </Text>
        <TextInput
          hasTVPreferredFocus={preferred}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onEndEditing?.();
          }}
          placeholder={placeholder}
          placeholderTextColor={dark ? 'rgba(150,165,195,0.55)' : 'rgba(117,109,97,0.6)'}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType === 'url' ? 'url' : 'default'}
          style={[
            styles.input,
            { color: palette.text },
            ltrValue ? styles.ltrInput : { textAlign: ar ? 'right' : 'left' },
            // Values stay left-to-right, but in Arabic they line up with the label on the right.
            ltrValue && ar ? styles.ltrInputRtlSide : null,
          ]}
        />
      </View>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  scrim: { backgroundColor: 'rgba(2,5,16,0.52)' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 24 },
  scrollCompact: { paddingHorizontal: 18, paddingVertical: 28 },
  layout: { alignItems: 'center', justifyContent: 'center', gap: 56 },
  layoutCompact: { gap: 26 },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
  flipX: { transform: [{ scaleX: -1 }] },

  // Brand side
  brand: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, maxWidth: 560 },
  brandCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch', maxWidth: undefined },
  iconStage: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  iconStageCompact: { width: 96, height: 96, marginBottom: 14 },
  halo: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(47,123,255,0.10)',
    boxShadow: '0px 0px 64px rgba(47,123,255,0.30)',
  },
  haloCompact: { width: 96, height: 96, borderRadius: 48, boxShadow: '0px 0px 44px rgba(47,123,255,0.28)' },
  icon: { width: 128, height: 128 },
  iconCompact: { width: 96, height: 96 },
  wordmark: { fontSize: 12, fontWeight: '800', letterSpacing: 4.2, fontFamily: SHASHTNA_FONT.sans },
  tagline: {
    fontSize: 38,
    lineHeight: 56,
    fontWeight: '800',
    fontFamily: SHASHTNA_FONT.display,
    marginTop: 12,
  },
  taglineLatin: { fontSize: 32, lineHeight: 44 },
  taglineCompact: { fontSize: 24, lineHeight: 36, marginTop: 8 },
  rule: { width: 44, height: 3, borderRadius: 2, marginTop: 22, marginBottom: 16 },
  features: { alignItems: 'center', gap: 14 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  featureText: { fontSize: 15, fontWeight: '700', fontFamily: SHASHTNA_FONT.sans },
  featureDot: { width: 3, height: 3, borderRadius: 2, opacity: 0.8 },

  // Form card
  card: {
    width: 420,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 16,
    overflow: 'hidden',
    boxShadow: '0px 30px 70px rgba(0,0,0,0.5)',
  },
  cardLight: { boxShadow: '0px 24px 50px rgba(60,50,30,0.12)' },
  cardCompact: { width: '100%', paddingHorizontal: 20, paddingTop: 20 },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1,
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(200,222,255,0.55) 50%, rgba(255,255,255,0) 100%)',
  },
  cardSheenLight: { opacity: 0 },
  cardTop: { justifyContent: 'space-between', alignItems: 'center' },
  cardTopEnd: { alignItems: 'center', gap: 12 },
  status: { alignItems: 'center', gap: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  langToggle: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, alignItems: 'center', gap: 6 },
  langText: { fontSize: 13, fontWeight: '800' },

  heading: { gap: 2, marginTop: -4 },
  typeBadge: { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 6 },
  typeBadgeText: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  cardTitle: { fontSize: 28, lineHeight: 36, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  cardSub: { fontSize: 13, lineHeight: 19 },

  fields: { gap: 12 },
  fieldBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  fieldLabel: { fontSize: 11, fontWeight: '800', fontFamily: SHASHTNA_FONT.sans, letterSpacing: 0.2 },
  inputWrap: { height: 58, borderRadius: 15, borderWidth: 1.5, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  input: { height: 24, fontSize: 16, fontFamily: SHASHTNA_FONT.sans, paddingVertical: 0, paddingHorizontal: 0, marginTop: 1 },
  ltrInput: { textAlign: 'left', writingDirection: 'ltr' },
  ltrInputRtlSide: { textAlign: 'right' },
  eye: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },

  connect: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 2, borderColor: 'transparent' },
  connectLoading: { opacity: 0.85 },
  connectText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans, letterSpacing: 0.2 },

  progressWrap: { gap: 6, marginTop: -8 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 12, fontWeight: '700' },

  error: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(242,89,106,0.10)', borderWidth: 1, borderColor: 'rgba(242,89,106,0.35)' },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: SHASHTNA_THEME.colors.danger, fontSize: 14, fontWeight: '900' },
  errorBody: { fontSize: 14, lineHeight: 21 },
  techToggle: { alignSelf: 'stretch', paddingVertical: 4, borderWidth: 2, borderColor: 'transparent', borderRadius: 8 },
  techToggleText: { fontSize: 12, fontWeight: '800' },
  techText: { fontSize: 11, lineHeight: 16, textAlign: 'left', writingDirection: 'ltr' },

  footer: { alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1 },
  note: { flex: 1, fontSize: 12, lineHeight: 18 },
  credit: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 18, letterSpacing: 0.4 },
});
