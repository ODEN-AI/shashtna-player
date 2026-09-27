import { BRAND_LITE } from '../../design/brand';

/**
 * Arabic / English messages for M3U file import in Shashtna Player Lite.
 * (Full's sign-in errors, which also cover Xtream accounts and links, are in
 * src/screens/Connection/connectionErrors.ts and are not used by Lite.)
 */
export function describeImportError(error: unknown, ar: boolean): { message: string; technical: string } {
  const name = error instanceof Error ? error.name : '';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const pick = (a: string, e: string) => (ar ? a : e);
  switch (name) {
    case 'PlaylistEmptyError':
      return { message: pick('الملف فارغ. اختر ملف M3U يحتوي على قنوات.', 'The file is empty. Choose an M3U file that contains channels.'), technical: '' };
    case 'PlaylistFormatError':
      return {
        message: pick('صيغة الملف غير مدعومة. اختر ملف قائمة تشغيل ‎.m3u أو ‎.m3u8 صحيح.', 'Unsupported file format. Choose a valid .m3u or .m3u8 playlist.'),
        technical: '',
      };
    case 'NoLiveChannelsError':
      return {
        message: pick(
          `لم يتم العثور على قنوات مباشرة داخل الملف. ${BRAND_LITE.liveOnlyNote.ar}`,
          `No live TV channels were found in the file. ${BRAND_LITE.liveOnlyNote.en}`,
        ),
        technical: '',
      };
    case 'PickerUnavailableError':
      return {
        message: pick(
          'ما في مدير ملفات على هذا الجهاز لاختيار الملف. ثبّت تطبيق مدير ملفات ثم أعد المحاولة.',
          'This device has no file picker. Install a file manager app and try again.',
        ),
        technical: String((error as { code?: unknown }).code || 'PICKER_UNAVAILABLE'),
      };
    default:
      // PlaylistReadError and anything thrown while opening/reading the file.
      return {
        message: pick(
          'تعذر قراءة ملف M3U. ربما انحذف الملف أو انسحبت صلاحية الوصول إليه. اختر الملف مرة ثانية.',
          'The M3U file could not be read. It may have been removed or access was revoked. Choose the file again.',
        ),
        technical: raw.slice(0, 300),
      };
  }
}
