import { redactSecrets } from '../../lib/redact';

export { redactSecrets };

/** A problem with what the user typed; its message is already user-facing. */
export class ValidationError extends Error {}

export function describeConnectionError(error: unknown, ar: boolean): { message: string; technical: string } {
  if (error instanceof ValidationError) {
    return { message: error.message, technical: '' };
  }

  const name = error instanceof Error ? error.name : '';
  const pick0 = (a: string, e: string) => (ar ? a : e);
  if (name === 'PlaylistFormatError') {
    return {
      message: pick0(
        'صيغة الملف غير مدعومة. اختر ملف قائمة تشغيل ‎.m3u أو ‎.m3u8 صحيح.',
        'Unsupported file format. Choose a valid .m3u or .m3u8 playlist.',
      ),
      technical: '',
    };
  }
  if (name === 'PlaylistEmptyError') {
    return {
      message: pick0('الملف فارغ. اختر ملف M3U يحتوي على قنوات.', 'The file is empty. Choose an M3U file that contains channels.'),
      technical: '',
    };
  }
  if (name === 'NoLiveChannelsError') {
    return {
      message: pick0(
        'لم يتم العثور على قنوات مباشرة داخل الملف. شاشتنا Lite تعرض البث المباشر فقط.',
        'No live TV channels were found in the file. Shashtna Player Lite shows live TV only.',
      ),
      technical: '',
    };
  }
  if (name === 'PlaylistReadError') {
    const detail = error instanceof Error ? error.message : '';
    return {
      message: pick0(
        'تعذر قراءة ملف M3U. ربما انحذف الملف أو انسحبت صلاحية الوصول إليه. اختر الملف مرة ثانية.',
        'The M3U file could not be read. It may have been removed or access was revoked. Choose the file again.',
      ),
      technical: redactSecrets(detail).slice(0, 300),
    };
  }
  if (name === 'PickerUnavailableError') {
    return {
      message: pick0(
        'ما في مدير ملفات على هذا الجهاز لاختيار الملف. ثبّت تطبيق مدير ملفات، أو سجّل الدخول ببيانات الحساب.',
        'This device has no file picker. Install a file manager app, or sign in with your account details.',
      ),
      technical: '',
    };
  }

  const raw = error instanceof Error ? error.message : String(error ?? '');
  const technical = redactSecrets(raw).slice(0, 300);
  const text = raw.toLowerCase();
  const pick = (a: string, e: string) => (ar ? a : e);

  if (/permission denial|securityexception|no content provider|filenotfound|no such file|enoent/.test(text)) {
    return {
      message: pick(
        'تعذر قراءة ملف M3U. ربما انحذف الملف أو انسحبت صلاحية الوصول إليه. اختر الملف مرة ثانية.',
        'The playlist file could not be read. It may have been removed or access was revoked. Import it again.',
      ),
      technical,
    };
  }
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|auth/.test(text)) {
    return {
      message: pick(
        'بيانات الاشتراك غير صحيحة أو الاشتراك منتهي. تأكد من اسم المستخدم وكلمة المرور.',
        'The subscription details were rejected or the subscription has expired. Check the username and password.',
      ),
      technical,
    };
  }
  if (/\b404\b|not found/.test(text)) {
    return {
      message: pick('رابط السيرفر غير صحيح. تأكد من الرابط والمنفذ (port).', 'The server address looks wrong. Check the URL and port.'),
      technical,
    };
  }
  if (/network request failed|failed to fetch|timeout|timed out|unable to resolve|unknownhost|enotfound|econn|connection|ssl|certificate/.test(text)) {
    return {
      message: pick(
        'تعذر الوصول للسيرفر. تأكد من الإنترنت ومن رابط السيرفر ثم أعد المحاولة.',
        'Could not reach the server. Check your internet connection and the server URL, then try again.',
      ),
      technical,
    };
  }
  return {
    message: pick('حدث خطأ أثناء تسجيل الدخول. أعد المحاولة بعد قليل.', 'Something went wrong while signing in. Please try again.'),
    technical,
  };
}
