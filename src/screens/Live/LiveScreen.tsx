import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { M3UChannel } from '../../lib/m3u';
import AppIcon from '../../components/common/AppIcon';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';

type Props = { channels:M3UChannel[]; onOpenPlayer:(channel:M3UChannel)=>void; onBackHome:()=>void };

export default function LiveScreen({channels,onOpenPlayer,onBackHome}:Props){
 const { language, themeMode } = useAppPreferences();
 const ar = language === 'ar';
 const light = themeMode === 'light';
 const [query,setQuery]=useState('');
 const [group,setGroup]=useState(ar ? 'الكل' : 'All');
 useEffectLocaleGroup(group, ar, setGroup);
 const groups=useMemo(()=>[ar?'الكل':'All',...Array.from(new Set(channels.map(c=>String(c.group||'').trim()).filter(Boolean))).slice(0,18)],[channels,ar]);
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase(); return channels.filter(c=>(group===(ar?'الكل':'All')||c.group===group)&&(!q||c.name.toLowerCase().includes(q)||String(c.group||'').toLowerCase().includes(q)));},[channels,group,query,ar]);
 return <View style={[styles.screen, { backgroundColor: light ? '#F4F7FB' : SHASHTNA_THEME.colors.background }]}
  >
  <View style={[styles.header, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
   <View><Text style={styles.eyebrow}>LIVE TV</Text><Text style={styles.title}>{ar ? 'البث المباشر' : 'Live TV'}</Text><Text style={styles.sub}>{ar ? 'قنوات مرتبة وواضحة، بدون عناصر زائدة.' : 'Clean, organized channels with no unnecessary clutter.'}</Text></View>
   <View style={[styles.headerActions, { flexDirection: ar ? 'row-reverse' : 'row' }]}><Pressable focusable onPress={onBackHome} style={({focused})=>[styles.iconButton,focused&&styles.focus]}><AppIcon name="home" size={19}/></Pressable><View style={styles.count}><Text style={styles.countN}>{filtered.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')}</Text><Text style={styles.countL}>{ar ? 'قناة' : 'Channels'}</Text></View></View>
  </View>
  <View style={styles.toolbar}>
   <View style={[styles.search, { flexDirection: ar ? 'row-reverse' : 'row' }]}><AppIcon name="search" size={17}/><TextInput value={query} onChangeText={setQuery} placeholder={ar ? 'ابحث عن قناة...' : 'Search channels...'} placeholderTextColor={SHASHTNA_THEME.colors.textMuted} style={[styles.input, { textAlign: ar ? 'right' : 'left' }]}/></View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
    {groups.map(g=><Pressable key={g} focusable onPress={()=>setGroup(g)} style={({focused})=>[styles.chip,group===g&&styles.chipActive,focused&&styles.focus]}><Text style={[styles.chipText,group===g&&styles.chipTextActive]}>{g}</Text></Pressable>)}
   </ScrollView>
  </View>
  <FlatList data={filtered} keyExtractor={c=>String(c.id)} numColumns={3} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} removeClippedSubviews initialNumToRender={15} maxToRenderPerBatch={10} windowSize={7} renderItem={({item})=><LiveCard channel={item} onPress={()=>onOpenPlayer(item)} ar={ar}/>} ListEmptyComponent={<View style={styles.empty}><AppIcon name="live" size={30}/><Text style={styles.emptyTitle}>{ar ? 'ماكو قنوات مطابقة' : 'No matching channels'}</Text><Text style={styles.emptySub}>{ar ? 'غيّر البحث أو التصنيف.' : 'Try changing your search or filter.'}</Text></View>}/>
 </View>
}
function useEffectLocaleGroup(group: string, ar: boolean, setGroup: (v: string) => void) {
 useEffect(() => { setGroup(ar ? 'الكل' : 'All'); }, [ar]);
}

function LiveCard({channel,onPress,ar}:{channel:M3UChannel;onPress:()=>void;ar:boolean}){ return <Pressable focusable onPress={onPress} style={({focused,pressed})=>[styles.card,{flexDirection:ar?'row-reverse':'row'},focused&&styles.focus,pressed&&styles.pressed]}>
 <View style={styles.logoBox}>{channel.logo?<Image source={{uri:channel.logo}} style={styles.logo}/>:<AppIcon name="live" size={22}/>}</View>
 <View style={styles.cardMain}><Text numberOfLines={1} style={styles.name}>{channel.name}</Text><Text numberOfLines={1} style={styles.group}>{channel.group || (ar ? 'بث مباشر' : 'Live TV')}</Text></View>
 
 </Pressable> }

const styles=StyleSheet.create({
 screen:{flex:1,paddingHorizontal:48,paddingTop:27,paddingBottom:27},
 header:{alignItems:'center',justifyContent:'space-between',marginBottom:24},
 eyebrow:{color:SHASHTNA_THEME.colors.primaryBright,fontSize:13,fontWeight:'900',letterSpacing:2},
 title:{color:'#fff',fontFamily:SHASHTNA_FONT.display,fontSize:32,lineHeight:40,fontWeight:'900',marginTop:2},
 sub:{color:SHASHTNA_THEME.colors.textTertiary,fontSize:15,marginTop:5},
 headerActions:{alignItems:'center',gap:12},
 iconButton:{width:48,height:48,borderRadius:24,borderWidth:2,borderColor:SHASHTNA_THEME.colors.border,backgroundColor:SHASHTNA_THEME.colors.surface,alignItems:'center',justifyContent:'center'},
 count:{height:48,minWidth:116,borderRadius:24,borderWidth:1,borderColor:SHASHTNA_THEME.colors.border,backgroundColor:SHASHTNA_THEME.colors.glassSoft,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:16},
 countN:{color:'#fff',fontSize:17,fontWeight:'900'},
 countL:{color:SHASHTNA_THEME.colors.textSecondary,fontSize:14,fontWeight:'700'},
 toolbar:{marginBottom:20},
 search:{height:48,width:390,borderRadius:24,borderWidth:1,borderColor:SHASHTNA_THEME.colors.border,backgroundColor:SHASHTNA_THEME.colors.surface,alignItems:'center',paddingHorizontal:18,gap:10},
 input:{flex:1,color:'#fff',fontFamily:SHASHTNA_FONT.sans,fontSize:16,paddingVertical:0},
 chips:{gap:8,paddingHorizontal:3,paddingTop:6,paddingBottom:4},
 chip:{height:40,borderRadius:20,borderWidth:2,borderColor:SHASHTNA_THEME.colors.border,backgroundColor:SHASHTNA_THEME.colors.surface,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},
 chipActive:{backgroundColor:SHASHTNA_THEME.colors.primarySoft,borderColor:SHASHTNA_THEME.colors.primary},
 chipText:{color:SHASHTNA_THEME.colors.textSecondary,fontSize:15,fontFamily:SHASHTNA_FONT.sans,fontWeight:'800'},
 chipTextActive:{color:'#fff'},
 list:{paddingTop:6,paddingBottom:40},
 row:{gap:20,marginBottom:20},
 card:{flex:1,minWidth:0,height:66,borderRadius:16,borderWidth:2,borderColor:SHASHTNA_THEME.colors.border,backgroundColor:SHASHTNA_THEME.colors.glassSoft,alignItems:'center',paddingHorizontal:16,gap:14},
 logoBox:{width:58,height:48,borderRadius:12,backgroundColor:SHASHTNA_THEME.colors.surface,alignItems:'center',justifyContent:'center',overflow:'hidden',borderWidth:1,borderColor:SHASHTNA_THEME.colors.borderSoft},
 logo:{width:'100%',height:'100%',resizeMode:'contain'},
 cardMain:{flex:1,minWidth:0},
 name:{color:'#fff',fontSize:17,lineHeight:22,fontFamily:SHASHTNA_FONT.sans,fontWeight:'800',textAlign:'left'},
 group:{color:SHASHTNA_THEME.colors.textSecondary,fontSize:13,lineHeight:18,marginTop:3,textAlign:'left'},
 focus:{borderColor:'#FFFFFF',borderWidth:2,backgroundColor:'rgba(255,255,255,0.05)',transform:[{scale:1.08}],shadowColor:'#030810',shadowOpacity:.28,shadowRadius:8,elevation:6,zIndex:50},
 pressed:{opacity:.84},
 empty:{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:130},
 emptyTitle:{color:'#fff',fontSize:20,fontWeight:'800',marginTop:12},
 emptySub:{color:SHASHTNA_THEME.colors.textSecondary,fontSize:15,marginTop:5}
});
