import type { Locale } from './types';
import { ja, type MessageKey } from './messages/ja';

const messages: Record<Locale, Record<MessageKey, string>> = { ja, en: ja };

let currentLocale: Locale = 'ja';

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Simple message lookup with {placeholder} interpolation. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = messages[currentLocale][key] ?? messages['ja'][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return msg;
}

/** Replace textContent of all elements with data-i18n attribute. */
export function applyI18nAttributes(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n') as MessageKey;
    if (key) el.textContent = t(key);
  });
}

export type { Locale, MessageKey };
