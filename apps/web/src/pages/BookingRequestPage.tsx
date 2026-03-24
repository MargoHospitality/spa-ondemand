import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { PublicLayout } from '../components/layout/PublicLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { api, ApiError } from '../lib/api';
import { useT, useLocale, type Locale } from '../lib/i18n';
import { getServiceName, formatPrice, formatDuration } from '../lib/format';
import type { Property, Service, Closure } from '@margo/shared';
import { CLIENT_SOURCES } from '@margo/shared';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

// Categories for grouping services
const CATEGORY_LABELS: Record<string, Record<Locale, string>> = {
  hammam: { fr: 'Hammam', en: 'Hammam' },
  pack_hammam_massage: { fr: 'Pack Hammam / Massage', en: 'Hammam / Massage Package' },
  massage: { fr: 'Massage', en: 'Massage' },
  soins_visage: { fr: 'Soins du visage', en: 'Facial Care' },
  mise_en_beaute: { fr: 'Mise en beauté', en: 'Beauty Treatment' },
  epilation: { fr: 'Épilation', en: 'Hair Removal' },
};

function BookingForm() {
  const { slug } = useParams<{ slug: string }>();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [property, setProperty] = useState<Property | null>(null);
  const [services, setServices] = useState<(Service & { category?: string })[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [origin, setOrigin] = useState('');
  const [source, setSource] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      api.getProperty(slug),
      api.getServices('').catch(() => []), // will be called with propertyId after
      api.getClosures('').catch(() => []),
    ]).catch(() => {});

    api.getProperty(slug).then((p: any) => {
      setProperty(p);
      return Promise.all([
        api.getServices(p.id),
        api.getClosures(p.id),
      ]);
    }).then(([svcs, cls]: [any[], any[]]) => {
      setServices(svcs);
      setClosures(cls);
    }).catch(() => {
      setError('Impossible de charger les informations du spa.');
    }).finally(() => setLoading(false));
  }, [slug]);

  // Check for duplicates when email or phone changes
  const checkDuplicate = useCallback(async () => {
    if (!property || (!email && !phone)) return;
    try {
      const result = await api.checkDuplicate(property.id, email, phone);
      setDuplicateWarning(result.hasDuplicate);
    } catch {
      // ignore
    }
  }, [property, email, phone]);

  useEffect(() => {
    const timeout = setTimeout(checkDuplicate, 800);
    return () => clearTimeout(timeout);
  }, [checkDuplicate]);

  // Generate time slots based on property hours
  function generateTimeSlots(): { value: string; label: string }[] {
    if (!property) return [];
    const [openH, openM] = property.opening_time.split(':').map(Number);
    const [closeH, closeM] = property.closing_time.split(':').map(Number);
    const slots: { value: string; label: string }[] = [];
    for (let h = openH; h <= closeH; h++) {
      for (const m of [0, 30]) {
        if (h === openH && m < openM) continue;
        if (h === closeH && m > closeM) continue;
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        slots.push({ value: timeStr, label: timeStr });
      }
    }
    return slots;
  }

  // Check if a date falls in a closure
  function isDateClosed(dateStr: string): boolean {
    const d = new Date(dateStr);
    return closures.some((c) => {
      const start = new Date(c.start_at);
      const end = new Date(c.end_at);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    });
  }

  // Group services by category
  function groupedServices(): { category: string; label: string; items: typeof services }[] {
    const groups: Record<string, typeof services> = {};
    for (const s of services) {
      const cat = (s as any).category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return Object.entries(groups).map(([key, items]) => ({
      category: key,
      label: CATEGORY_LABELS[key]?.[locale] || key,
      items,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!property) return;

    // Validate date not closed
    if (isDateClosed(date)) {
      setError(t('form.closedDate'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Execute reCAPTCHA
      let captchaToken = '';
      if (executeRecaptcha) {
        captchaToken = await executeRecaptcha('booking_request');
      }

      const requestedSlot = new Date(`${date}T${time}:00`).toISOString();

      await api.createBooking({
        property_id: property.id,
        service_id: serviceId,
        client_name: `${firstName} ${lastName}`.trim(),
        client_email: email,
        client_phone: phone,
        client_locale: locale,
        client_origin_property: origin || undefined,
        client_source: source || undefined,
        requested_slot: requestedSlot,
        client_message: message || undefined,
        recaptcha_token: captchaToken,
      });

      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PublicLayout>
        <div className="text-center py-12 text-tertiary">{t('common.loading')}</div>
      </PublicLayout>
    );
  }

  if (!property) {
    return (
      <PublicLayout>
        <Alert type="error">{error || 'Property not found'}</Alert>
      </PublicLayout>
    );
  }

  if (success) {
    return (
      <PublicLayout logoUrl={property.logo_url || undefined} propertyName={property.name}>
        <Card className="text-center">
          <div className="py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-semibold mb-2">{t('form.success.title')}</h2>
            <p className="text-tertiary">{t('form.success.text')}</p>
          </div>
        </Card>
      </PublicLayout>
    );
  }

  const timeSlots = generateTimeSlots();
  const today = new Date().toISOString().split('T')[0];
  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <PublicLayout logoUrl={property.logo_url || undefined} propertyName={property.name}>
      <Card>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-semibold text-gray-900">{t('form.title')}</h2>
          <p className="text-tertiary mt-1 text-sm">{t('form.subtitle')}</p>
        </div>

        {/* Language selector */}
        <div className="flex justify-end mb-4">
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setLocale('fr')}
              className={`px-2 py-1 rounded ${locale === 'fr' ? 'bg-primary text-white' : 'text-tertiary hover:bg-gray-100'}`}
            >
              FR
            </button>
            <button
              onClick={() => setLocale('en')}
              className={`px-2 py-1 rounded ${locale === 'en' ? 'bg-primary text-white' : 'text-tertiary hover:bg-gray-100'}`}
            >
              EN
            </button>
          </div>
        </div>

        {duplicateWarning && (
          <Alert type="warning" className="mb-6">{t('form.duplicate.warning')}</Alert>
        )}

        {error && (
          <Alert type="error" className="mb-6">{error}</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('form.firstName')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label={t('form.lastName')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>

          {/* Contact */}
          <Input
            label={t('form.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label={t('form.phone')}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('form.phonePlaceholder')}
            required
          />

          {/* Origin */}
          <Input
            label={t('form.origin')}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder={t('form.originPlaceholder')}
            required
          />

          {/* Source */}
          <Select
            label={t('form.source')}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="—"
            options={CLIENT_SOURCES.map((s) => ({
              value: s,
              label: t(`form.source.${s}`),
            }))}
          />

          {/* Service selector grouped by category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('form.service')} <span className="text-red-500">*</span>
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
            >
              <option value="">{t('form.servicePlaceholder')}</option>
              {groupedServices().map((group) => (
                <optgroup key={group.category} label={group.label}>
                  {group.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getServiceName(s, locale)} — {formatPrice(s.price)}
                      {s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Selected service info */}
          {selectedService && selectedService.description_fr && (
            <div className="bg-secondary rounded-lg p-3 text-sm text-tertiary">
              {locale === 'en' ? selectedService.description_en : selectedService.description_fr}
            </div>
          )}

          {/* Date */}
          <Input
            label={t('form.date')}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (isDateClosed(e.target.value)) {
                setError(t('form.closedDate'));
              } else {
                setError('');
              }
            }}
            min={today}
            required
          />

          {/* Time */}
          <Select
            label={t('form.time')}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            placeholder="—"
            options={timeSlots}
          />

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.message')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('form.messagePlaceholder')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            {submitting ? t('form.submitting') : t('form.submit')}
          </Button>
        </form>
      </Card>
    </PublicLayout>
  );
}

// Wrapper with reCAPTCHA provider
export default function BookingRequestPage() {
  if (!RECAPTCHA_SITE_KEY) {
    return <BookingForm />;
  }
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <BookingForm />
    </GoogleReCaptchaProvider>
  );
}
