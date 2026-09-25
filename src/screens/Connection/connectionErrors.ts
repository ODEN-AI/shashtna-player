/** A problem with what the user typed; its message is already user-facing. */
export class ValidationError extends Error {}

/**
 * Removes credentials from diagnostic text: Xtream/M3U links carry the
 * username and password, so any URL is reduced to its scheme + host.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(username|password|user|pass|token)=([^&\s"']+)/gi, '$1=***')
    .replace(/(https?:\/\/[^/\s"']+)[^\s"']*/gi, '$1/…');
}

export function describeConnectionError(error: unknown, ar: boolean): { message: string; technical: string } {
  if (error instanceof ValidationError) {
    return { message: error.message, technical: '' };
  }

  const name = error instanceof Error ? error.name : '';
  const pick0 = (a: string, e: string) => (ar ? a : e);
  if (name === 'PlaylistFormatError') {
    return {
      message: pick0(
        'الملف مو قائمة تشغيل M3U. اختر ملف ‎.m3u أو ‎.m3u8 صحيح.',
        'This file is not an M3U playlist. Choose a valid .m3u or .m3u8 file.',
      ),
      technical: '',
    };
  }
  if (name === 'PickerUnavailableError') {
    return {
      message: pick0(
        'ما في مدير ملفات على هذا الجهاز لاختيار الملف. استخدم رابط القائمة بدلاً من ذلك.',
        'This device has no file picker. Use the playlist link instead.',
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
        'تعذر قراءة ملف القائمة. ربما انحذف أو انسحبت صلاحية الوصول. استورد الملف مرة ثانية.',
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
