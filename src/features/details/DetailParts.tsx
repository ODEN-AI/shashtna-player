import React, { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/common/Typography';

import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { ShellBackground } from '../../app/AppShell';
import { DeviceClass } from '../../design/device';
import { focusStyle, Palette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';

/**
 * Building blocks of the cinematic detail experience shared by the movie and
 * series screens. Presentation only — data loading lives in the screens.
 */

export function heroMetrics(device: DeviceClass) {
  if (device === 'phone') return { heroHeight: 300, posterW: 118, posterH: 177, gutter: 18 };
  if (device === 'tablet') return { heroHeight: 380, posterW: 168, posterH: 252, gutter: 32 };
  return { heroHeight: 420, posterW: 196, posterH: 294, gutter: 44 };
}

/** Image 1 + scrim (dark) so detail pages sit on the same canvas as the app. */
export const DetailBackground = memo(function DetailBackground({ palette }: { palette: Palette }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.canvas }]} />
      {palette.mode === 'dark' ? (
        <>
          <ShellBackground />
          <View style={[StyleSheet.absoluteFill, styles.pageScrim]} />
        </>
      ) : null}
    </View>
  );
});

type HeroProps = {
  backdrop?: string | null;
  poster?: string | null;
  fallbackIcon: AppIconName;
  kicker: string;
  title: string;
  meta: React.ReactNode;
  tagline?: string;
  actions: React.ReactNode;
  palette: Palette;
  ar: boolean;
  device: DeviceClass;
};

export function DetailHero({ backdrop, poster, fallbackIcon, kicker, title, meta, tagline, actions, palette, ar, device }: HeroProps) {
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const m = heroMetrics(device);
  const compact = device === 'phone';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const dark = palette.mode === 'dark';

  return (
    <View style={[styles.hero, { minHeight: m.heroHeight }]}>
      {backdrop && !backdropFailed ? (
        <Image source={{ uri: backdrop }} style={styles.backdrop} resizeMode="cover" onError={() => setBackdropFailed(true)} />
      ) : (
        <View style={[styles.backdrop, { experimental_backgroundImage: palette.accent.softGradient }]} />
      )}
      {/* Side fade for text legibility, bottom fade into the page. */}
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: ar ? palette.heroFadeRtl : palette.heroFade }]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: dark
              ? 'linear-gradient(0deg, rgba(3,6,16,0.96) 0%, rgba(3,6,16,0.55) 28%, rgba(3,6,16,0) 60%)'
              : palette.heroBottom,
          },
        ]}
      />

      <View
        style={[
          styles.heroContent,
          { flexDirection: compact ? 'column' : rowDirection, paddingHorizontal: m.gutter, paddingTop: compact ? 84 : 96 },
          compact && { alignItems: ar ? 'flex-end' : 'flex-start' },
        ]}
      >
        <View style={[styles.posterFrame, { width: m.posterW, height: m.posterH, borderColor: palette.glassBorder }]}>
          {poster && !posterFailed ? (
            <Image source={{ uri: poster }} style={styles.fill} resizeMode="cover" onError={() => setPosterFailed(true)} />
          ) : (
            <View style={[styles.fill, styles.posterFallback, { experimental_backgroundImage: palette.glass }]}>
              <AppIcon name={fallbackIcon} size={38} color={palette.muted} />
            </View>
          )}
        </View>

        <View style={[styles.heroText, { alignItems: ar ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.kicker, { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass }]}>
            <Text style={[styles.kickerText, { color: palette.accent.light }]}>{kicker}</Text>
          </View>
          {/* Playlist/TMDB titles are shown as delivered, isolated from UI strings. */}
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              compact && styles.titleCompact,
              { color: palette.text, textAlign: ar ? 'right' : 'left', writingDirection: ar ? 'rtl' : 'ltr' },
            ]}
          >
            {title}
          </Text>
          <View style={[styles.metaRow, { flexDirection: rowDirection }]}>{meta}</View>
          {tagline ? (
            <Text numberOfLines={2} style={[styles.tagline, { color: palette.secondary, textAlign: ar ? 'right' : 'left' }]}>
              {tagline}
            </Text>
          ) : null}
          <View style={[styles.actions, { flexDirection: rowDirection }]}>{actions}</View>
        </View>
      </View>
    </View>
  );
}

/** Small metadata pill. `ltr` keeps years, ratings and durations in LTR order. */
export function MetaChip({ label, icon, iconColor, palette, ltr = false }: { label: string; icon?: AppIconName; iconColor?: string; palette: Palette; ltr?: boolean }) {
  return (
    <View style={[styles.chip, { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass }]}>
      {icon ? <AppIcon name={icon} size={13} color={iconColor || palette.accent.light} /> : null}
      <Text style={[styles.chipText, { color: palette.text }, ltr && styles.ltr]}>{label}</Text>
    </View>
  );
}

type ActionProps = {
  label: string;
  icon: AppIconName;
  onPress: () => void;
  palette: Palette;
  variant?: 'primary' | 'secondary' | 'icon';
  active?: boolean;
  preferred?: boolean;
  /** 0..1 progress shown under the label (resume button). */
  progress?: number;
  accessibilityLabel?: string;
};

export function ActionButton({ label, icon, onPress, palette, variant = 'secondary', active = false, preferred = false, progress, accessibilityLabel }: ActionProps) {
  const primary = variant === 'primary';
  const iconOnly = variant === 'icon';
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.action,
        iconOnly && styles.actionIcon,
        primary
          ? { experimental_backgroundImage: palette.accent.gradient, boxShadow: palette.accent.buttonShadow }
          : { experimental_backgroundImage: palette.glass, borderColor: palette.glassBorder },
        iconOnly && active && { experimental_backgroundImage: 'linear-gradient(135deg, #FF4D7A 0%, #FF7A59 100%)' },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} size={iconOnly ? 20 : 19} color={primary || (iconOnly && active) ? '#FFFFFF' : palette.text} />
      {!iconOnly ? (
        <View>
          <Text style={[styles.actionText, { color: primary ? '#FFFFFF' : palette.text }]}>{label}</Text>
          {progress !== undefined ? (
            <View style={styles.actionTrack}>
              <View style={[styles.actionFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: palette.accent.bright }]} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function SectionTitle({ title, trailing, palette, ar }: { title: string; trailing?: string; palette: Palette; ar: boolean }) {
  return (
    <View style={[styles.sectionTitleRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
      <View style={[styles.sectionMarker, { experimental_backgroundImage: palette.accent.gradient }]} />
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      {trailing ? <Text style={[styles.sectionTrailing, { color: palette.muted }]}>{trailing}</Text> : null}
    </View>
  );
}

/** Glass card for story + key facts. Rows with empty values are skipped. */
export function InfoCard({
  story,
  storyTitle,
  facts,
  palette,
  ar,
  stacked = false,
}: {
  story: string;
  storyTitle: string;
  facts: Array<{ label: string; value?: string | null; ltr?: boolean }>;
  palette: Palette;
  ar: boolean;
  /** Phones: story above facts instead of side by side. */
  stacked?: boolean;
}) {
  const visible = facts.filter(f => f.value && String(f.value).trim());
  const align = ar ? 'right' : 'left';
  return (
    <View style={[styles.infoCard, { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass, flexDirection: stacked ? 'column' : ar ? 'row-reverse' : 'row' }]}>
      <View style={styles.story}>
        <Text style={[styles.infoHeading, { color: palette.text, textAlign: align }]}>{storyTitle}</Text>
        <Text style={[styles.storyText, { color: palette.secondary, textAlign: align, writingDirection: ar ? 'rtl' : 'ltr' }]}>{story}</Text>
      </View>
      {visible.length ? (
        <View style={[styles.facts, !stacked && (ar ? styles.factsRtl : styles.factsLtr), { borderColor: palette.glassBorder }]}>
          {visible.map(fact => (
            <View key={fact.label} style={styles.fact}>
              <Text style={[styles.factLabel, { color: palette.muted, textAlign: align }]}>{fact.label}</Text>
              <Text numberOfLines={3} style={[styles.factValue, { color: palette.text, textAlign: align }, fact.ltr && styles.ltr]}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function BackButton({ onPress, palette, ar, label }: { onPress: () => void; palette: Palette; ar: boolean; label: string }) {
  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.back,
        ar ? styles.backRtl : styles.backLtr,
        { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
        pressed && styles.pressed,
      ]}
    >
      <View style={ar ? styles.flipX : undefined}>
        <AppIcon name="back" size={20} color={palette.text} />
      </View>
    </Pressable>
  );
}

export function formatDuration(totalSeconds: number, ar: boolean): string {
  const minutes = Math.round(totalSeconds / 60);
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (ar) return h ? `${h} س ${m} د` : `${m} د`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  pageScrim: { backgroundColor: 'rgba(2,5,16,0.55)' },
  fill: { width: '100%', height: '100%' },
  ltr: { writingDirection: 'ltr' },
  flipX: { transform: [{ scaleX: -1 }] },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },

  hero: { width: '100%', position: 'relative', overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroContent: { gap: 28, paddingBottom: 30, alignItems: 'flex-end' },
  posterFrame: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, boxShadow: '0px 24px 48px rgba(0,0,0,0.55)' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, minWidth: 0, gap: 12, paddingBottom: 4 },
  kicker: { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, justifyContent: 'center' },
  kickerText: { fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 44, lineHeight: 52, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, maxWidth: 820 },
  titleCompact: { fontSize: 30, lineHeight: 38 },
  metaRow: { flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tagline: { fontSize: T.size.body, lineHeight: T.lineHeight.body, maxWidth: 760 },
  actions: { flexWrap: 'wrap', gap: 12, marginTop: 6, alignItems: 'center' },

  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, fontWeight: '800' },

  action: { height: 56, paddingHorizontal: 24, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: 'transparent' },
  actionIcon: { width: 56, paddingHorizontal: 0, justifyContent: 'center' },
  actionText: { fontSize: T.size.button, fontWeight: '900' },
  actionTrack: { height: 3, borderRadius: 2, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  actionFill: { height: '100%' },

  sectionTitleRow: { alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionMarker: { width: 4, height: 20, borderRadius: 2 },
  sectionTitle: { fontSize: T.size.section, lineHeight: T.lineHeight.section, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  sectionTrailing: { fontSize: 14, fontWeight: '700' },

  infoCard: { borderRadius: 24, borderWidth: 1, padding: 24, gap: 28 },
  story: { flex: 1.6, minWidth: 0 },
  infoHeading: { fontSize: 18, fontWeight: '900', marginBottom: 10 },
  storyText: { fontSize: 16, lineHeight: 27 },
  facts: { flex: 1, minWidth: 0, gap: 14 },
  factsLtr: { borderLeftWidth: 1, paddingLeft: 24 },
  factsRtl: { borderRightWidth: 1, paddingRight: 24 },
  fact: { gap: 3 },
  factLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  factValue: { fontSize: 15, lineHeight: 22, fontWeight: '700' },

  back: { position: 'absolute', top: 24, zIndex: 20, width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backLtr: { left: 28 },
  backRtl: { right: 28 },
});
