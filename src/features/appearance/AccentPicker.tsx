import React, { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { Palette } from '../../design/palette';
import { SHASHTNA_FONT } from '../../design/theme';
import { AccentId, ACCENT_PRESETS, isValidHex } from './accents';

type Props = {
  ar: boolean;
  accent: AccentId;
  customAccent: string | null;
  onSelect: (accent: AccentId, customHex?: string | null) => void;
  palette: Palette;
  sectionStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  subStyle: StyleProp<TextStyle>;
};

/** Settings › Appearance › Accent colour: five presets plus an optional custom hex. */
export default function AccentPicker({ ar, accent, customAccent, onSelect, palette, sectionStyle, titleStyle, subStyle }: Props) {
  const [draft, setDraft] = useState(customAccent || '');
  const [inputFocused, setInputFocused] = useState(false);
  const draftValid = isValidHex(draft);
  const normalized = draftValid ? `#${draft.replace('#', '').toUpperCase()}` : '';
  const rowDirection = ar ? 'row-reverse' : 'row';

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>{ar ? 'لون التمييز' : 'Accent colour'}</Text>
      <Text style={subStyle}>
        {ar
          ? 'يغيّر لون التركيز والأزرار الرئيسية وشريط التقدم فقط، بدون ما يمس الخلفية أو النصوص.'
          : 'Changes focus, primary buttons and progress only — never the background or text.'}
      </Text>

      <View style={[styles.swatches, { flexDirection: rowDirection }]}>
        {ACCENT_PRESETS.map(preset => {
          const selected = accent === preset.id;
          return (
            <Pressable
              key={preset.id}
              focusable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={ar ? preset.labelAr : preset.labelEn}
              onPress={() => onSelect(preset.id)}
              style={({ focused }) => [
                styles.swatch,
                { borderColor: selected ? preset.base : palette.border, backgroundColor: palette.surface },
                focused && { borderColor: palette.focus, boxShadow: `0px 0px 12px ${preset.base}66` },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: preset.base }]}>
                {selected ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}
              </View>
              <Text numberOfLines={1} style={[styles.swatchLabel, { color: palette.text }]}>
                {ar ? preset.labelAr : preset.labelEn}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.customRow, { flexDirection: rowDirection }]}>
        <View
          style={[
            styles.inputWrap,
            { borderColor: inputFocused ? palette.focus : palette.border, backgroundColor: palette.surface, flexDirection: rowDirection },
          ]}
        >
          <View style={[styles.preview, { backgroundColor: draftValid ? normalized : 'transparent', borderColor: palette.border }]} />
          <TextInput
            value={draft}
            onChangeText={text => setDraft(text.slice(0, 7))}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={ar ? 'لون مخصص مثل #FF8800' : 'Custom colour, e.g. #FF8800'}
            placeholderTextColor={palette.muted}
            // Hex codes read left-to-right in both languages.
            style={[styles.input, { color: palette.text, writingDirection: 'ltr', textAlign: 'left' }]}
          />
        </View>
        <Pressable
          focusable
          disabled={!draftValid}
          onPress={() => onSelect('custom', normalized)}
          style={({ focused }) => [
            styles.apply,
            { backgroundColor: draftValid ? palette.primary : palette.surfaceHover },
            accent === 'custom' && { borderColor: palette.text },
            focused && { borderColor: palette.focus, boxShadow: palette.accent.focusShadow },
          ]}
        >
          <Text style={[styles.applyText, { color: draftValid ? '#FFFFFF' : palette.muted }]}>
            {accent === 'custom' ? (ar ? 'مُطبّق' : 'Applied') : ar ? 'تطبيق' : 'Apply'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  swatches: { flexWrap: 'wrap', gap: 12, marginTop: 14 },
  swatch: { minWidth: 150, height: 58, borderRadius: 18, borderWidth: 2, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontSize: 15, fontWeight: '800', fontFamily: SHASHTNA_FONT.sans, flexShrink: 1 },
  customRow: { marginTop: 14, gap: 12, alignItems: 'center' },
  inputWrap: { flex: 1, maxWidth: 420, height: 52, borderRadius: 16, borderWidth: 2, alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  preview: { width: 26, height: 26, borderRadius: 13, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: SHASHTNA_FONT.sans, paddingVertical: 0 },
  apply: { height: 52, minWidth: 110, paddingHorizontal: 20, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '900' },
});
