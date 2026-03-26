'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, Users, Calendar, Clock, MessageSquare } from 'lucide-react';
import useSWR from 'swr';

// ─── Types ───

interface Property {
  id: string;
  name: string;
  logo_url: string | null;
  opening_time: string;
  closing_time: string;
}

interface ServiceCategory {
  id: string;
  name_fr: string;
  name_en: string;
}

interface Service {
  id: string;
  category_id: string | null;
  name_fr: string;
  name_en: string;
  description_fr: string | null;
  description_en: string | null;
  price: number;
  duration_minutes: number | null;
  default_guests: number;
  max_guests: number;
}

interface SpaBookingFormProps {
  propertySlug: string;
  apiUrl: string;
  locale?: 'fr' | 'en';
  onSuccess?: () => void;
  className?: string;
}

// ─── Translations ───

const translations = {
  fr: {
    title: 'Réserver votre soin',
    subtitle: 'Remplissez le formulaire et nous vous confirmerons votre rendez-vous',
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'Email',
    phone: 'Téléphone',
    phonePlaceholder: '+212 6XX XXX XXX',
    origin: 'Où séjournez-vous ?',
    originPlaceholder: 'Nom de votre hôtel / riad',
    category: 'Type de soin',
    categoryPlaceholder: 'Sélectionnez une catégorie',
    service: 'Prestation',
    servicePlaceholder: 'Sélectionnez un soin',
    guests: 'Nombre de personnes',
    date: 'Date souhaitée',
    time: 'Heure souhaitée',
    message: 'Message (optionnel)',
    messagePlaceholder: 'Précisions, demandes particulières...',
    totalEstimate: 'Total estimé',
    submit: 'Envoyer ma demande',
    submitting: 'Envoi en cours...',
    successTitle: 'Demande envoyée !',
    successText: 'Vous recevrez une confirmation par WhatsApp et email sous 24h.',
    error: 'Une erreur est survenue. Veuillez réessayer.',
    required: 'Champs obligatoires',
  },
  en: {
    title: 'Book your treatment',
    subtitle: 'Fill in the form and we will confirm your appointment',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    phonePlaceholder: '+212 6XX XXX XXX',
    origin: 'Where are you staying?',
    originPlaceholder: 'Name of your hotel / riad',
    category: 'Treatment type',
    categoryPlaceholder: 'Select a category',
    service: 'Treatment',
    servicePlaceholder: 'Select a treatment',
    guests: 'Number of guests',
    date: 'Preferred date',
    time: 'Preferred time',
    message: 'Message (optional)',
    messagePlaceholder: 'Special requests, notes...',
    totalEstimate: 'Estimated total',
    submit: 'Send my request',
    submitting: 'Sending...',
    successTitle: 'Request sent!',
    successText: 'You will receive a confirmation by WhatsApp and email within 24h.',
    error: 'An error occurred. Please try again.',
    required: 'Required fields',
  },
};

// ─── Helpers ───

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatPrice(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} MAD`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}` : `${h}h`;
}

// ─── Component ───

export default function SpaBookingForm({
  propertySlug,
  apiUrl,
  locale: initialLocale = 'fr',
  onSuccess,
  className = '',
}: SpaBookingFormProps) {
  const [locale, setLocale] = useState(initialLocale);
  const t = translations[locale];

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [origin, setOrigin] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Fetch property data
  const { data: property } = useSWR<Property>(
    `${apiUrl}/api/public/properties/${propertySlug}`,
    fetcher
  );

  const { data: categories } = useSWR<ServiceCategory[]>(
    property ? `${apiUrl}/api/public/properties/${property.id}/categories` : null,
    fetcher
  );

  const { data: services } = useSWR<Service[]>(
    property ? `${apiUrl}/api/public/properties/${property.id}/services` : null,
    fetcher
  );

  // Filter services by category
  const filteredServices = categoryId
    ? services?.filter((s) => s.category_id === categoryId)
    : services;

  // Selected service
  const selectedService = services?.find((s) => s.id === serviceId);

  // Handle category change
  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    if (serviceId && selectedService?.category_id !== newCatId) {
      setServiceId('');
      setGuestCount(1);
    }
  };

  // Handle service change
  const handleServiceChange = (newServiceId: string) => {
    setServiceId(newServiceId);
    const svc = services?.find((s) => s.id === newServiceId);
    if (svc) {
      setGuestCount(svc.default_guests);
    }
  };

  // Generate time slots
  const timeSlots = (() => {
    if (!property) return [];
    const [openH] = property.opening_time.split(':').map(Number);
    const [closeH] = property.closing_time.split(':').map(Number);
    const slots: { value: string; label: string }[] = [];
    for (let h = openH; h <= closeH; h++) {
      for (const m of [0, 30]) {
        if (h === closeH && m > 0) continue;
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        slots.push({ value: timeStr, label: timeStr });
      }
    }
    return slots;
  })();

  // Total price
  const totalPrice = selectedService ? selectedService.price * guestCount : 0;

  // Today's date for min
  const today = new Date().toISOString().split('T')[0];

  // Submit handler
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!property) return;

    setSubmitting(true);
    setError('');

    try {
      const requestedSlot = new Date(`${date}T${time}:00`).toISOString();

      const res = await fetch(`${apiUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          service_id: serviceId,
          client_name: `${firstName} ${lastName}`.trim(),
          client_email: email,
          client_phone: phone,
          client_locale: locale,
          client_origin_property: origin || undefined,
          requested_slot: requestedSlot,
          client_message: message || undefined,
          guest_count: guestCount,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t.error);
      }

      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen
  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`bg-white rounded-2xl shadow-lg p-8 text-center ${className}`}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <Check className="w-8 h-8 text-green-600" />
        </motion.div>
        <h3 className="text-2xl font-display font-semibold mb-2">{t.successTitle}</h3>
        <p className="text-gray-600">{t.successText}</p>
      </motion.div>
    );
  }

  // Loading
  if (!property || !services) {
    return (
      <div className={`bg-white rounded-2xl shadow-lg p-8 flex items-center justify-center min-h-[400px] ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasCategories = categories && categories.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-8 text-center">
        {property.logo_url && (
          <img
            src={property.logo_url}
            alt={property.name}
            className="h-12 mx-auto mb-4 object-contain"
          />
        )}
        <h2 className="text-2xl font-display font-semibold text-gray-900">{t.title}</h2>
        <p className="text-gray-600 text-sm mt-1">{t.subtitle}</p>

        {/* Language toggle */}
        <div className="flex justify-center gap-2 mt-4">
          {(['fr', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                locale === l
                  ? 'bg-primary text-white'
                  : 'bg-white/50 text-gray-600 hover:bg-white'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t.firstName} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t.lastName} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
            />
          </div>
        </div>

        {/* Contact */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.email} <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.phone} <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.phonePlaceholder}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
          />
        </div>

        {/* Origin */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.origin} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder={t.originPlaceholder}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
          />
        </div>

        {/* Category */}
        {hasCategories && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t.category}
            </label>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow bg-white"
            >
              <option value="">{t.categoryPlaceholder}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {locale === 'en' ? c.name_en : c.name_fr}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Service */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t.service} <span className="text-red-500">*</span>
          </label>
          <select
            value={serviceId}
            onChange={(e) => handleServiceChange(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow bg-white"
          >
            <option value="">{t.servicePlaceholder}</option>
            {(filteredServices || []).map((s) => (
              <option key={s.id} value={s.id}>
                {locale === 'en' ? s.name_en : s.name_fr} — {formatPrice(s.price)}
                {s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Guest count */}
        <AnimatePresence>
          {selectedService && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Users className="w-4 h-4 inline mr-1" />
                {t.guests} <span className="text-red-500">*</span>
              </label>
              <select
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value))}
                disabled={selectedService.default_guests === selectedService.max_guests}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow bg-white disabled:bg-gray-50 disabled:text-gray-500"
              >
                {Array.from({ length: selectedService.max_guests }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="w-4 h-4 inline mr-1" />
              {t.date} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={today}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Clock className="w-4 h-4 inline mr-1" />
              {t.time} <span className="text-red-500">*</span>
            </label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow bg-white"
            >
              <option value="">—</option>
              {timeSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>{slot.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            <MessageSquare className="w-4 h-4 inline mr-1" />
            {t.message}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t.messagePlaceholder}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow resize-none"
          />
        </div>

        {/* Total */}
        <AnimatePresence>
          {selectedService && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-5 text-center"
            >
              <p className="text-sm text-gray-600 mb-1">{t.totalEstimate}</p>
              <p className="text-3xl font-semibold text-primary">{formatPrice(totalPrice)}</p>
              {guestCount > 1 && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatPrice(selectedService.price)} × {guestCount}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white font-medium py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t.submitting}
            </>
          ) : (
            t.submit
          )}
        </button>

        <p className="text-xs text-gray-400 text-center">* {t.required}</p>
      </form>
    </motion.div>
  );
}
