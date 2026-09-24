/**
 * Turns react-native-video / ExoPlayer errors into a short human message
 * plus a technical line kept for diagnostics.
 */
export type PlaybackErrorInfo = { title: string; message: string; technical: string };

type RawError = { error?: Record<string, unknown> } | undefined;

export function describePlaybackError(raw: RawError, ar: boolean): PlaybackErrorInfo {
  const error = (raw?.error || {}) as Record<string, unknown>;
  const code = String(error.errorCode ?? error.code ?? '');
  const text = String(error.errorString ?? error.errorException ?? error.localizedDescription ?? error.message ?? '');
  const haystack = `${code} ${text}`.toLowerCase();

  let technical = '';
  try {
    technical = JSON.stringify(error).slice(0, 400);
  } catch {
    technical = text.slice(0, 400);
  }

  const pick = (arText: string, enText: string) => (ar ? arText : enText);
  let message = pick(
    'تعذر تشغيل هذا المحتوى. جرّب مرة ثانية، وإذا تكررت المشكلة تأكد من الاشتراك أو جرّب محتوى آخر.',
    'This content could not be played. Try again; if it keeps failing, check your subscription or try other content.',
  );

  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/.test(haystack)) {
    message = pick(
      'السيرفر رفض الوصول لهذا البث. قد يكون الاشتراك منتهياً أو أن عدد الأجهزة المتصلة تجاوز الحد.',
      'The server refused access. The subscription may have expired or the device limit was reached.',
    );
  } else if (/\b404\b|not found|filenotfound/.test(haystack)) {
    message = pick('هذا البث غير متوفر حالياً على السيرفر.', 'This stream is not currently available on the server.');
  } else if (/timeout|timed out|network|unable to connect|connection|unknownhost|io_/.test(haystack)) {
    message = pick(
      'مشكلة في الاتصال بالسيرفر. تأكد من الإنترنت ثم أعد المحاولة.',
      'Could not reach the server. Check your internet connection and try again.',
    );
  } else if (/decoder|codec|format|unsupported|parser|malformed/.test(haystack)) {
    message = pick(
      'صيغة هذا البث غير مدعومة على هذا الجهاز.',
      'This stream format is not supported on this device.',
    );
  }

  return { title: pick('حدثت مشكلة في التشغيل', 'Playback problem'), message, technical };
}
