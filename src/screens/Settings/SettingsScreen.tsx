import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/common/Typography';
import AppIcon from '../../components/common/AppIcon';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { BRAND, BRAND_LITE } from '../../design/brand';
import { usePalette } from '../../design/palette';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import AccentPicker from '../../features/appearance/AccentPicker';

export type PreferredQuality = 'auto' | '1080p' | '720p' | '480p';
export type AppLanguage = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';

type Props = {
  preferredQuality: PreferredQuality;
  setPreferredQuality: (value: PreferredQuality) => void;
  autoplay: boolean;
  setAutoplay: (value: boolean) => void;
  subtitles: boolean;
  setSubtitles: (value: boolean) => void;
  language: AppLanguage;
  setLanguage: (value: AppLanguage) => void;
  themeMode: ThemeMode;
  setThemeMode: (value: ThemeMode) => void;
  onChangeSource: () => void;
  /** Re-download the library (it is cached between launches). */
  onRefreshLibrary?: () => void;
  /** Shashtna Player Lite: Live TV only, so texts don't mention movies/series. */
  liveOnly?: boolean;
  onBack: () => void;
};

export default function SettingsScreen({
  preferredQuality,
  setPreferredQuality,
  autoplay,
  setAutoplay,
  subtitles,
  setSubtitles,
  language,
  setLanguage,
  themeMode,
  setThemeMode,
  onChangeSource,
  onRefreshLibrary,
  liveOnly = false,
  onBack,
}: Props) {
  const ar = language === 'ar';
  const light = themeMode === 'light';
  const shared = usePalette();
  const { accent, customAccent, setAccent } = useAppPreferences();
  // Same unified palette as the rest of the app (warm ivory in light mode).
  const palette = {
    background: shared.background,
    surface: shared.surface,
    surfaceSoft: light ? shared.surfaceElevated : SHASHTNA_THEME.colors.glassSoft,
    text: shared.text,
    secondary: shared.secondary,
    muted: shared.muted,
    border: shared.border,
    primary: shared.primary,
    primarySoft: shared.primarySoft,
  };

  const qualities: Array<[PreferredQuality,string,string]> = ar ? [
    ['auto','تلقائي','اترك المشغل يختار الأفضل'],
    ['1080p','1080p','Full HD'],
    ['720p','720p','HD'],
    ['480p','480p','استهلاك أقل للبيانات'],
  ] : [
    ['auto','Auto','Let the player choose'],
    ['1080p','1080p','Full HD'],
    ['720p','720p','HD'],
    ['480p','480p','Lower data usage'],
  ];

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>{liveOnly ? BRAND_LITE.nameInside : BRAND.nameInside}</Text>
            <Text style={[styles.title, { color: palette.text }]}>{ar ? 'الإعدادات' : 'Settings'}</Text>
            <Text style={[styles.description, { color: palette.secondary }]}>{ar ? 'تحكم بتجربة المشاهدة والتشغيل من مكان واحد.' : 'Control playback and viewing preferences from one place.'}</Text>
          </View>
          <Pressable focusable onPress={onBack} style={({focused})=>[styles.back, { borderColor: palette.border, backgroundColor: palette.surface }, focused&&styles.focus]}>
            <AppIcon name="back" size={16} color={palette.primary} />
            <Text style={[styles.backText, { color: palette.text }]}>{ar ? 'رجوع' : 'Back'}</Text>
          </Pressable>
        </View>

        <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{ar ? 'اللغة' : 'Language'}</Text>
          <Text style={[styles.sectionSub, { color: palette.muted }]}>{ar ? 'اختر لغة واجهة التطبيق.' : 'Choose the application interface language.'}</Text>
          <View style={styles.optionGrid}>
            <OptionCard icon="language" title="العربية" sub="RTL" selected={ar} onPress={()=>setLanguage('ar')} palette={palette} preferred/>
            <OptionCard icon="language" title="English" sub="LTR" selected={!ar} onPress={()=>setLanguage('en')} palette={palette}/>
          </View>
        </View>

        <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{ar ? 'المظهر' : 'Appearance'}</Text>
          <Text style={[styles.sectionSub, { color: palette.muted }]}>{ar ? 'بدّل بين الثيم الداكن والأبيض.' : 'Switch between the dark and light themes.'}</Text>
          <View style={styles.optionGrid}>
            <OptionCard icon="moon" title={ar ? 'داكن' : 'Dark'} sub={ar ? 'ليلي' : 'Night'} selected={!light} onPress={()=>setThemeMode('dark')} palette={palette}/>
            <OptionCard icon="sun" title={ar ? 'أبيض' : 'Light'} sub={ar ? 'نهاري' : 'Day'} selected={light} onPress={()=>setThemeMode('light')} palette={palette}/>
          </View>
        </View>

        <AccentPicker
          ar={ar}
          accent={accent}
          customAccent={customAccent}
          onSelect={setAccent}
          palette={shared}
          sectionStyle={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}
          titleStyle={[styles.sectionTitle, { color: palette.text }]}
          subStyle={[styles.sectionSub, { color: palette.muted }]}
        />

        <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{ar ? 'جودة البث الافتراضية' : 'Default stream quality'}</Text>
          <Text style={[styles.sectionSub, { color: palette.muted }]}>{liveOnly ? (ar ? 'تُستخدم للبث المباشر عند توفر الجودة المطلوبة.' : 'Used for live TV when the source provides the selected quality.') : ar ? 'تُستخدم للبث المباشر والأفلام والمسلسلات عند توفر الجودة المطلوبة.' : 'Used for live TV, movies, and series when the source provides the selected quality.'}</Text>
          <View style={styles.qualityGrid}>
            {qualities.map(([value,title,sub])=>(
              <Pressable key={value} focusable onPress={()=>setPreferredQuality(value)} style={({focused})=>[styles.qualityCard,{borderColor: palette.border,backgroundColor:palette.surface},preferredQuality===value&&{borderColor:palette.primary,backgroundColor:palette.primarySoft},focused&&styles.focus]}>
                <View style={[styles.iconBadge,{backgroundColor:palette.primarySoft,borderColor:palette.border}]}><AppIcon name={value==='auto'?'quality':'grid'} size={17} color={palette.primary}/></View>
                <View style={{flex:1}}>
                  <Text style={[styles.qualityTitle,{color:palette.text}]}>{title}</Text>
                  <Text style={[styles.qualitySub,{color:palette.muted}]}>{sub}</Text>
                </View>
                <View style={[styles.radio,{borderColor:palette.border},preferredQuality===value&&{borderColor:palette.primary,backgroundColor:palette.primary}]} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{ar ? 'التشغيل' : 'Playback'}</Text>
          <SettingToggle title={ar?'التشغيل التلقائي':'Autoplay'} sub={ar?'ابدأ المحتوى مباشرة عند فتح المشغل.':'Start content immediately when the player opens.'} value={autoplay} onPress={()=>setAutoplay(!autoplay)} palette={palette}/>
          <SettingToggle title={ar?'الترجمة عند توفرها':'Subtitles when available'} sub={ar?'فعّل الترجمة تلقائيًا إذا كانت متوفرة.':'Enable subtitles automatically when available.'} value={subtitles} onPress={()=>setSubtitles(!subtitles)} palette={palette}/>
        </View>

        <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceSoft }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{ar ? 'المصدر' : 'Source'}</Text>
          <Pressable focusable onPress={onChangeSource} style={({focused})=>[styles.actionRow,{borderColor:palette.border,backgroundColor:palette.surface},focused&&styles.focus]}>
            <View style={[styles.iconBadge,{backgroundColor:palette.primarySoft,borderColor:palette.border}]}><AppIcon name="source" size={17} color={palette.primary}/></View>
            <View style={{flex:1}}><Text style={[styles.actionTitle,{color:palette.text}]}>{ar?'تغيير المصدر':'Change source'}</Text><Text style={[styles.actionSub,{color:palette.muted}]}>{ar?'تسجيل الدخول باشتراك IPTV آخر':'Sign in with another IPTV subscription'}</Text></View>
            <AppIcon name="chevron" size={14} color={palette.primary}/>
          </Pressable>
          {onRefreshLibrary ? (
            <Pressable focusable onPress={onRefreshLibrary} style={({focused})=>[styles.actionRow,{borderColor:palette.border,backgroundColor:palette.surface},focused&&styles.focus]}>
              <View style={[styles.iconBadge,{backgroundColor:palette.primarySoft,borderColor:palette.border}]}><AppIcon name="refresh" size={17} color={palette.primary}/></View>
              <View style={{flex:1}}><Text style={[styles.actionTitle,{color:palette.text}]}>{ar?'تحديث المكتبة':'Refresh library'}</Text><Text style={[styles.actionSub,{color:palette.muted}]}>{ar?'تحميل أحدث القنوات والمحتوى من اشتراكك الآن':'Load the latest channels and content from your subscription now'}</Text></View>
              <AppIcon name="chevron" size={14} color={palette.primary}/>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function OptionCard({ icon, title, sub, selected, onPress, palette, preferred = false }:{icon:'language'|'moon'|'sun';title:string;sub:string;selected:boolean;onPress:()=>void;palette:any;preferred?:boolean}) {
  return <Pressable focusable hasTVPreferredFocus={preferred} onPress={onPress} style={({focused})=>[styles.optionCard,{borderColor:palette.border,backgroundColor:palette.surface},selected&&{borderColor:palette.primary,backgroundColor:palette.primarySoft},focused&&styles.focus]}>
    <View style={[styles.iconBadge,{backgroundColor:palette.primarySoft,borderColor:palette.border}]}><AppIcon name={icon} size={18} color={palette.primary}/></View>
    <View style={{flex:1}}><Text style={[styles.optionTitle,{color:palette.text}]}>{title}</Text><Text style={[styles.optionSub,{color:palette.muted}]}>{sub}</Text></View>
    <View style={[styles.radio,{borderColor:palette.border},selected&&{borderColor:palette.primary,backgroundColor:palette.primary}]} />
  </Pressable>;
}

function SettingToggle({title,sub,value,onPress,palette}:{title:string;sub:string;value:boolean;onPress:()=>void;palette:any}) {
  return <Pressable focusable onPress={onPress} style={({focused})=>[styles.toggleRow,focused&&styles.focus]}>
    <View style={{flex:1}}><Text style={[styles.actionTitle,{color:palette.text}]}>{title}</Text><Text style={[styles.actionSub,{color:palette.muted}]}>{sub}</Text></View>
    <View style={[styles.switch,{backgroundColor:palette.surface},value&&{backgroundColor:palette.primary}]}><View style={[styles.knob,{backgroundColor:palette.muted},value&&styles.knobOn]}/></View>
  </Pressable>;
}

const styles=StyleSheet.create({
  screen:{flex:1},
  content:{paddingHorizontal:28,paddingTop:22,paddingBottom:34},
  headerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,gap:14},
  eyebrow:{fontSize:9,letterSpacing:2,fontWeight:'900'},
  title:{fontSize:28,fontWeight:'900',fontFamily:SHASHTNA_FONT.display,marginTop:5},
  description:{fontSize:11,marginTop:5,lineHeight:17},
  back:{height:38,paddingHorizontal:14,borderRadius:12,borderWidth:1,flexDirection:'row',alignItems:'center',gap:7},
  backText:{fontSize:12,fontWeight:'800'},
  section:{borderRadius:16,borderWidth:1,padding:14,marginBottom:12},
  sectionTitle:{fontSize:15,fontWeight:'900'},
  sectionSub:{fontSize:10,marginTop:4,marginBottom:11},
  optionGrid:{flexDirection:'row',gap:10},
  optionCard:{flex:1,minHeight:62,borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  optionTitle:{fontSize:12,fontWeight:'900'},
  optionSub:{fontSize:8,marginTop:2},
  qualityGrid:{flexDirection:'row',gap:9},
  qualityCard:{flex:1,minHeight:72,borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:9},
  iconBadge:{width:34,height:34,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},
  qualityTitle:{fontSize:11,fontWeight:'900'},
  qualitySub:{fontSize:8,marginTop:3},
  radio:{width:14,height:14,borderRadius:7,borderWidth:2},
  toggleRow:{minHeight:62,borderTopWidth:1,borderTopColor:SHASHTNA_THEME.colors.borderSoft,flexDirection:'row',alignItems:'center',paddingVertical:9},
  switch:{width:46,height:26,borderRadius:15,padding:3,justifyContent:'center'},
  knob:{width:20,height:20,borderRadius:10},
  knobOn:{alignSelf:'flex-end',backgroundColor:'#fff'},
  actionRow:{minHeight:62,borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  actionTitle:{fontSize:11,fontWeight:'900'},
  actionSub:{fontSize:8,marginTop:3},
  focus:{transform:[{scale:1.012}],shadowColor:SHASHTNA_THEME.colors.primary,shadowOpacity:.30,shadowRadius:8,elevation:6},
});
