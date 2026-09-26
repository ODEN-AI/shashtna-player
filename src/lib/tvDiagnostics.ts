import { BRAND } from '../design/brand';

/**
 * Real-device diagnostics for the عامر IPTV Android TV test build.
 *
 * One switch, one logger. Lines go to logcat (tag ReactNativeJS in release
 * builds too) as `<TAG> {json}`, so a TV test is read with:
 *   adb logcat -s ReactNativeJS:V | grep -E "AMER_TV_(INPUT|CHANNELS)"
 * (native picker lines: adb logcat -s AMER_TV_PICKER:V).
 *
 * Only controlled fields are ever passed in: event names/codes, indexes,
 * counts, channel ids and names. Never stream URLs, server addresses,
 * usernames, passwords, tokens or playlist contents.
 *
 * Switch: BRAND.tvDiagnostics ('on' only in src/variants/amer/brand.ts, the
 * edition's own module, so Full/Lite never log). For a public release set it
 * to 'off' there, and build with -PtvDiagnostics=false for the native picker lines.
 */
export const TV_DIAGNOSTICS = (BRAND.tvDiagnostics as string) === 'on';

export type DiagTag = 'AMER_TV_INPUT' | 'AMER_TV_CHANNELS';

type DiagValue = string | number | boolean | null | undefined;

/** Keys that must never reach the log, whatever a caller passes. */
const FORBIDDEN = /url|uri|password|pass|user|token|server|host|m3u/i;

let sink: ((line: string) => void) | null = null;

/** Tests capture lines here; the app logs to the console (logcat). */
export function setDiagnosticsSink(next: ((line: string) => void) | null): void {
  sink = next;
}

export function tvDiag(tag: DiagTag, fields: Record<string, DiagValue>, force = false): void {
  if (!TV_DIAGNOSTICS && !force && !sink) return;
  const safe: Record<string, DiagValue> = {};
  for (const key of Object.keys(fields)) {
    if (FORBIDDEN.test(key)) continue;
    const value = fields[key];
    // Belt and braces: a string that looks like a link is dropped.
    safe[key] = typeof value === 'string' && /:\/\//.test(value) ? '[redacted]' : value;
  }
  const line = `${tag} ${JSON.stringify(safe)}`;
  if (sink) sink(line);
  else console.log(line);
}
