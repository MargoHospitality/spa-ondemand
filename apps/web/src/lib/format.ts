import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import type { Locale } from './i18n';

const localeMap = { fr, en: enUS };

export function formatDate(dateStr: string, locale: Locale = 'fr'): string {
  return format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: localeMap[locale] });
}

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm');
}

export function formatDateTime(dateStr: string, locale: Locale = 'fr'): string {
  return format(new Date(dateStr), 'EEEE d MMMM yyyy · HH:mm', { locale: localeMap[locale] });
}

export function formatPrice(centimes: number, currency = 'MAD'): string {
  const amount = centimes / 100;
  return `${amount.toFixed(amount % 1 === 0 ? 0 : 2)} ${currency}`;
}

export function formatDuration(minutes: number, locale: Locale = 'fr'): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }
  return `${minutes} min`;
}

export function getServiceName(service: { name_fr: string; name_en: string }, locale: Locale): string {
  return locale === 'en' ? service.name_en : service.name_fr;
}

export function getServiceDescription(service: { description_fr: string | null; description_en: string | null }, locale: Locale): string | null {
  return locale === 'en' ? service.description_en : service.description_fr;
}
