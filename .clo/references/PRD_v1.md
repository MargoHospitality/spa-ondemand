# PRD — Spa On-Demand Booking System
**Produit :** Système de gestion de demandes de soins spa 
**Client POC :** Riad Elisa & Spa 
**Porteur :** Margo Hospitality 
**Version :** 1.0 
**Date :** Mars 2026 
**Stack :** Node.js + Express / Supabase (Postgres) / React + Tailwind / Twilio / Stripe / Vercel

---

## 1. Contexte & Objectifs

### 1.1 Problème
Les spas de riads boutique ont une capacité de livraison fluctuante et difficile à modéliser (disponibilité thérapeutes, salles, saison). Un système de planning classique ne correspond pas à cette réalité. La gestion se fait aujourd'hui de manière informelle, avec un risque de sur-promesse, de conflits et d'expérience client dégradée.

### 1.2 Solution
Système de gestion de demandes **on-demand** où :
- Le client exprime une demande (prestation + créneau souhaité)
- Le manager du spa, seul arbitre de la faisabilité, valide ou adapte
- Le client confirme via une microtransaction CB (token Stripe permanent)
- Tout le flux se pilote via WhatsApp + interfaces web tokenisées

### 1.3 Objectifs produit
- Fluidifier la gestion des demandes sans imposer un planning rigide
- Réduire les no-shows via une garantie bancaire légère (microtransaction 1€)
- Offrir une expérience client professionnelle dans la langue du client
- Produire un système réplicable à d'autres propriétés Margo (multi-tenant V2)

---

## 2. Périmètre V1

### In scope
- Flux complet : demande → validation manager → confirmation client avec microtransaction
- Flux modification : bouton "Gérer mon soin" dans email de confirmation
- Flux annulation client depuis "Gérer mon soin"
- Notifications WhatsApp (Twilio) + Email dans la langue du client
- Interface manager : lien tokenisé (WhatsApp) + back-office web avec login
- Interface client : page tokenisée (confirmation + Stripe)
- Catalogue de prestations configurable par propriété
- Gestion multi-managers avec rôles
- Débit manuel de la microtransaction depuis le back-office (no-show, annulation tardive)
- Reminders automatiques client (48h + 4h avant le soin, auto-skip si délai dépassé)
- Dashboard analytics : demandes du jour / semaine / mois + KPI délai de réponse
- Plages de fermeture exceptionnelle configurables en back-office
- Détection anti-doublon + anti-bot
- i18n FR / EN (architecture extensible)
- Configuration par propriété : nom, logo, couleurs, catalogue, messages WhatsApp

### Out of scope V1
- Planning de capacité (thérapeutes, salles)
- Paiement en ligne complet (paiement sur place)
- Intégration PMS
- Architecture multi-tenant (V2)
- Provider paiement NAPS (V2, abstraction préparée dès V1)
- Front marketing spa (développé séparément avec v0, embedable via composant React)

---

## 3. Acteurs & Rôles

| Acteur | Description | Accès |
|---|---|---|
| **Client** | Hôte hébergé ou client externe day spa | WhatsApp + page tokenisée |
| **Manager spa** | Valide/refuse/contre-propose les demandes | Lien WhatsApp tokenisé + back-office web |
| **Admin propriété** | Configure catalogue, horaires, plages de fermeture, managers | Back-office web (rôle admin) |
| **Super admin Margo** | Gère les propriétés, paramètres globaux | Back-office web (rôle superadmin) |

---

## 4. Modèle de données

### 4.1 Tables principales

```sql
properties
 id, name, slug, logo_url, primary_color, secondary_color,
 opening_time, closing_time, manager_response_delay_minutes (défaut: 60),
 manager_auto_fail_delay_minutes (défaut: 90),
 client_confirmation_delay_24h, client_confirmation_delay_48h, client_confirmation_delay_long,
 twilio_whatsapp_number, stripe_account_id,
 locale_default, locales_available[], active, created_at

services
 id, property_id, name_fr, name_en, description_fr, description_en,
 duration_minutes, price, active, display_order, created_at

users (managers / admins)
 id, property_id, name, email, phone_whatsapp, role (manager|admin|superadmin),
 active, created_at

bookings
 id, property_id, service_id, manager_id (assigned),
 -- Client
 client_name, client_email, client_phone, client_locale,
 client_origin_property, client_source,
 -- Créneaux
 requested_slot (timestamptz), confirmed_slot (timestamptz),
 -- Statuts
 status (voir §5.2),
 -- Tokens
 manager_token, manager_token_expires_at,
 client_token, client_token_expires_at,
 -- Stripe
 stripe_payment_method_id, stripe_customer_id,
 stripe_charge_id, stripe_charge_status,
 microtransaction_amount (défaut: 100 = 1.00€),
 -- Timestamps de transitions (pour analytics)
 requested_at, manager_notified_at, manager_responded_at,
 client_notified_at, client_confirmed_at,
 reminder_48h_sent_at, reminder_4h_sent_at,
 cancelled_at, cancellation_reason, cancellation_by,
 completed_at, created_at, updated_at
 -- Flags
 policy_override_by_manager (boolean, défaut: false)

notifications_log
 id, booking_id, channel (whatsapp|email), recipient (client|manager),
 event_type, locale, status (sent|failed|delivered), twilio_sid,
 sent_at, created_at

closures (plages de fermeture exceptionnelle)
 id, property_id, label, start_at, end_at, created_by, created_at
```

### 4.2 Abstraction paiement (préparation NAPS V2)

```typescript
interface PaymentProvider {
 createCustomer(params): Promise<{ customerId: string }>
 chargeMicrotransaction(customerId, amount): Promise<{ chargeId: string, paymentMethodId: string }>
 refundCharge(chargeId): Promise<void>
 capturePayment(paymentMethodId, amount): Promise<{ chargeId: string }>
 releasePaymentMethod(paymentMethodId): Promise<void>
}

// StripeProvider implements PaymentProvider ← V1
// NapsProvider implements PaymentProvider ← V2
```

---

## 5. Flux & États

### 5.1 Flux principal

```
[Client] → Soumet demande (formulaire public)
 ↓
 Booking créé → status: REQUESTED
 Anti-doublon vérifié
 Notification WhatsApp + Email → Manager
 (résumé demande + lien back-office tokenisé)
 ↓
 ┌─── Manager répond dans le délai ? ───┐
 │ OUI │ NON (90min / configurable)
 ↓ ↓
 3 actions possibles Reminder manager envoyé (60min)
 Si toujours pas de réponse :
 status: EXPIRED_MANAGER
 Notification client "non disponible"
 → Client peut re-soumettre

[Manager] ACCEPT → status: MANAGER_CONFIRMED
 ↓
 Calcul deadline confirmation client (voir §5.3)
 Notification WhatsApp + Email → Client
 (résumé + lien page confirmation tokenisée)

[Manager] RESCHEDULE → status: MANAGER_RESCHEDULED
 ↓
 Nouveau créneau proposé (1 seule contre-proposition possible)
 Notification WhatsApp + Email → Client
 Client peut ACCEPTER ou DÉCLINER
 Si ACCEPT → même flow que MANAGER_CONFIRMED
 Si DECLINE → status: CLIENT_DECLINED_RESCHEDULE
 Client peut re-soumettre une nouvelle demande

[Manager] DECLINE → status: MANAGER_DECLINED
 ↓
 Notification client "complet / non disponible"
 Client peut re-soumettre

[Client] Reçoit lien confirmation → ouvre page tokenisée
 ↓
 Stripe : collecte CB + microtransaction 1€ (débit immédiat)
 Si succès → status: CLIENT_CONFIRMED
 Stripe Payment Method token conservé
 Email de confirmation envoyé au client (avec bouton "Gérer mon soin")
 Reminders planifiés (48h + 4h, auto-skip si délai dépassé)
 Si pas de réponse avant deadline → status: EXPIRED_CLIENT
 Booking annulé automatiquement
```

### 5.2 États du booking

| Status | Description |
|---|---|
| `REQUESTED` | Demande soumise, en attente réponse manager |
| `MANAGER_CONFIRMED` | Manager a accepté, en attente confirmation client |
| `MANAGER_RESCHEDULED` | Manager propose un autre créneau, en attente réponse client |
| `MANAGER_DECLINED` | Manager a refusé |
| `CLIENT_DECLINED_RESCHEDULE` | Client refuse la contre-proposition |
| `CLIENT_CONFIRMED` | Client a confirmé + microtransaction OK |
| `EXPIRED_MANAGER` | Manager n'a pas répondu dans le délai |
| `EXPIRED_CLIENT` | Client n'a pas confirmé dans le délai |
| `CANCELLED_CLIENT` | Annulation par le client (politique appliquée) |
| `CANCELLED_MANAGER` | Annulation par le manager |
| `COMPLETED` | Soin réalisé |
| `NO_SHOW` | Client ne s'est pas présenté |

### 5.3 Matrice délais de confirmation client

| Délai avant le soin | Fenêtre de confirmation client |
|---|---|
| > 48h | 24h pour confirmer |
| ≥ 24h et ≤ 48h | Dans la journée de la demande |
| < 24h | 2h pour confirmer |

*Les valeurs sont configurables par propriété.*

### 5.4 Flux modification (bouton "Gérer mon soin")

```
[Client] clique "Gérer mon soin" dans email de confirmation
 ↓
 Page tokenisée → 2 options : MODIFIER / ANNULER

[MODIFIER] Disponible uniquement si soin > 24h
 ↓
 Client soumet un nouveau créneau souhaité
 Booking status → MODIFICATION_REQUESTED
 Notification manager (même flow de validation)
 Manager ACCEPT / DECLINE / RESCHEDULE
 Si ACCEPT → status: CLIENT_CONFIRMED (pas de nouvelle microtransaction)
 Si DECLINE → booking original restauré, client notifié
 Si manager override politique → flag policy_override_by_manager = true

[ANNULER]
 Si soin > 24h → annulation gratuite, microtransaction remboursée
 Si soin ≤ 24h → politique de rétention appliquée (encaissement manuel manager)
 Si manager override → policy_override_by_manager = true
 status → CANCELLED_CLIENT
```

### 5.5 Reminders automatiques

| Reminder | Timing | Canal | Condition |
|---|---|---|---|
| Reminder manager | 60min après notification initiale sans réponse | WhatsApp | Si status = REQUESTED |
| Reminder client | 48h avant le soin | WhatsApp + Email | Auto-skip si délai < 48h au moment de la confirmation |
| Reminder client | 4h avant le soin | WhatsApp + Email | Auto-skip si délai < 4h au moment de la confirmation |

---

## 6. Interfaces

### 6.1 Formulaire de demande public (page standalone / composant embedable)

**URL :** `/{property-slug}/request` 
**Architecture :** Composant React isolé avec props (`propertyId`, `locale`) — embedable dans front v0 ultérieur sans refactoring.

**Champs :**
- Prénom + Nom *
- Email *
- Numéro WhatsApp * (avec indicatif pays)
- Établissement / Riad où vous séjournez *
- Comment vous nous avez connus (liste : Réseaux sociaux / Recommandation / Site web / Autre)
- Prestation souhaitée * (liste déroulante depuis catalogue propriété)
- Date souhaitée * (date picker, désactive les plages de fermeture)
- Créneau horaire souhaité * (plage horaire dans les horaires d'ouverture)
- Message libre (optionnel)

**Anti-spam / anti-doublon :**
- reCAPTCHA v3 (score seuil configurable)
- Détection doublon : même email OU même WhatsApp avec status actif (REQUESTED, MANAGER_CONFIRMED, MANAGER_RESCHEDULED, CLIENT_CONFIRMED) → message d'information, pas de blocage si demandes légitimes distinctes

### 6.2 Page de confirmation client (tokenisée)

**URL :** `/confirm/{client-token}` 
**TTL token :** calculé selon matrice §5.3

**Contenu :**
- Résumé du booking (prestation, créneau confirmé/proposé, prix)
- Formulaire Stripe Elements (collecte CB)
- CTA "Confirmer mon soin et valider ma carte"
- Mention légale : "Une microtransaction de 1€ sera débitée puis remboursée pour valider votre carte. Le paiement du soin se fait sur place."
- Page d'état si token expiré / déjà utilisé

### 6.3 Page "Gérer mon soin" (tokenisée)

**URL :** `/manage/{client-token}`

**Contenu selon statut :**
- Résumé du booking actuel
- Bouton MODIFIER (désactivé si soin ≤ 24h, avec message explicatif)
- Bouton ANNULER (avec affichage de la politique applicable selon délai)
- Si annulation ≤ 24h : message d'avertissement clair avant confirmation

### 6.4 Interface manager — lien tokenisé (WhatsApp)

**URL :** `/manager/booking/{manager-token}` 
**TTL token :** délai de réponse configuré (défaut 90min pendant heures d'ouverture)

**Contenu :**
- Résumé demande : nom client, prestation, durée, prix, créneau souhaité, établissement, source
- 3 boutons d'action :
 - ✅ **Accepter** → confirme le créneau demandé
 - 🔄 **Proposer un autre créneau** → date/heure picker + message optionnel
 - ❌ **Refuser** → motif optionnel (non affiché au client)
- Page d'état si token expiré / déjà traité

### 6.5 Back-office web (login)

**Authentification :** Email + mot de passe (Supabase Auth) + lien magique optionnel

**Modules :**

#### Tableau de bord (dashboard)
- Vue "Demandes du jour" : liste temps réel avec statut coloré
- KPIs : nombre demandes / confirmées / refusées / no-show (jour, semaine, mois)
- Délai moyen de first response manager
- Taux de confirmation client
- Graphique tendance (semaine glissante)

#### Gestion des demandes
- Liste filtrée par statut, date, prestation
- Fiche détaillée booking avec historique complet des transitions
- Actions manuelles : marquer COMPLETED / NO_SHOW / CANCELLED
- Encaissement manuel (débit Stripe depuis token conservé)
- Remboursement manuel (microtransaction)
- Override politique d'annulation (flag + confirmation)

#### Catalogue de prestations
- CRUD prestations (nom FR/EN, description FR/EN, durée, prix, ordre, actif/inactif)

#### Managers / Utilisateurs
- CRUD utilisateurs (nom, email, WhatsApp, rôle, actif/inactif)

#### Paramètres propriété
- Informations générales (nom, slug, logo, couleurs)
- Horaires d'ouverture
- Délais de réponse manager (configurable)
- Délais de confirmation client (configurable)
- Plages de fermeture exceptionnelle (CRUD avec label, date début/fin)
- Templates messages WhatsApp (éditables par event_type et locale)
- Configuration Stripe (clé publique/privée, compte)
- Configuration Twilio (numéro WhatsApp)

---

## 7. Notifications

### 7.1 Événements déclencheurs

| Event | Destinataire | Canal |
|---|---|---|
| Demande reçue | Manager | WhatsApp + Email |
| Reminder réponse (60min) | Manager | WhatsApp |
| Confirmation / contre-proposition / refus | Client | WhatsApp + Email |
| Lien confirmation (après accept contre-prop) | Client | WhatsApp + Email |
| Email confirmation finale | Client | Email (avec bouton "Gérer mon soin") |
| Expiration manager (90min) | Client | WhatsApp + Email |
| Expiration client | Client | WhatsApp + Email |
| Reminder 48h avant soin | Client | WhatsApp + Email |
| Reminder 4h avant soin | Client | WhatsApp + Email |
| Confirmation annulation | Client | WhatsApp + Email |
| Confirmation modification | Client | WhatsApp + Email |

### 7.2 Règles générales
- Langue : celle sélectionnée par le client à la demande
- Templates éditables par propriété et par event_type dans le back-office
- Chaque envoi loggé dans `notifications_log` avec idempotence (booking_id + event_type = clé unique)
- Retry automatique x2 en cas d'échec Twilio (délai exponentiel)

### 7.3 Contenu message WhatsApp manager (exemple)
```
🧖 Nouvelle demande spa — Riad Elisa

Client : Marie Dupont
Soin : Hammam Royal (90 min — 80€)
Créneau souhaité : Demain 14h00
Séjourne à : Riad Elisa
Source : Instagram

👉 Traiter la demande : [lien tokenisé]
⏱ Vous avez 60 min pour répondre.
```

---

## 8. Stack technique

### 8.1 Architecture générale

```
Frontend (Vercel)
├── React + Tailwind CSS
├── Pages publiques : /[slug]/request, /confirm/:token, /manage/:token
├── Back-office : /admin/** (Supabase Auth)
└── Composants isolés (embedables)

Backend API (Vercel Serverless Functions ou Node.js Express sur Railway)
├── REST API : /api/bookings, /api/manager, /api/admin/**
├── Webhooks : /webhooks/stripe, /webhooks/twilio
└── Cron jobs : expiration manager, expiration client, reminders

Supabase
├── PostgreSQL (données)
├── Auth (managers / admins)
├── Row Level Security (isolation par property_id)
└── Realtime (dashboard live updates)

Services tiers
├── Twilio WhatsApp Business API
├── Stripe (microtransaction + token PM)
└── SendGrid ou Resend (emails transactionnels)
```

### 8.2 Sécurité des tokens
- Tokens JWT signés (secret par propriété)
- TTL strict selon contexte (manager: 90min, client confirmation: selon matrice)
- Usage unique : token invalidé après action
- Token "Gérer mon soin" : TTL = date du soin + 2h (permet annulation jusqu'au dernier moment)

### 8.3 Cron jobs

| Job | Fréquence | Action |
|---|---|---|
| `check_manager_reminder` | Toutes les 5 min | Envoie reminder si 60min sans réponse |
| `check_manager_expiration` | Toutes les 5 min | Expire booking si 90min sans réponse (hors fermeture) |
| `check_client_expiration` | Toutes les 5 min | Expire booking si deadline dépassée |
| `send_reminders` | Toutes les 15 min | Envoie reminders 48h et 4h (si non envoyés) |

### 8.4 Gestion des horaires d'ouverture pour les délais manager
- Si demande reçue **pendant les heures d'ouverture** : délai démarre immédiatement
- Si demande reçue **hors heures d'ouverture** : délai démarre à l'ouverture suivante + 1h
- Les plages de fermeture exceptionnelle suspendent le délai

---

## 9. Configuration par propriété

Tous les éléments suivants sont isolés par `property_id` et configurables en back-office :

| Paramètre | Type | Défaut |
|---|---|---|
| Nom propriété | string | — |
| Slug URL | string | — |
| Logo | image URL | — |
| Couleur primaire | hex | #000000 |
| Couleur secondaire | hex | #ffffff |
| Horaires ouverture | time range | 09:00–20:00 |
| Délai réponse manager | minutes | 60 |
| Délai auto-fail manager | minutes | 90 |
| Délai confirmation client > 48h | heures | 24 |
| Délai confirmation client 24–48h | string | "dans la journée" |
| Délai confirmation client < 24h | heures | 2 |
| Montant microtransaction | centimes | 100 (1€) |
| Locale défaut | fr/en | fr |
| Templates WhatsApp | JSON par event+locale | templates défaut |

---

## 10. Règles métier synthétiques

1. **1 type de soin par demande** — pas de multi-prestation en V1
2. **1 seule contre-proposition manager** — si client refuse, il re-soumet
3. **Modification possible uniquement si soin > 24h** — relance un flow manager complet, pas de nouvelle microtransaction
4. **Annulation gratuite si > 24h** — microtransaction remboursée automatiquement
5. **Annulation ≤ 24h ou no-show** — encaissement manuel par manager depuis back-office
6. **Override manager** — le manager peut passer outre la politique standard (flag tracé)
7. **Microtransaction 1€** — débitée immédiatement à la confirmation client, remboursée si annulation gratuite. Payment Method token conservé pour encaissement ultérieur éventuel
8. **Anti-doublon** — détection par email OU WhatsApp si booking actif existant, pas de blocage strict si demandes jugées légitimes
9. **Anti-bot** — reCAPTCHA v3 sur formulaire public
10. **Reminders auto-skip** — si délai avant soin < seuil reminder au moment de la confirmation, le reminder est ignoré
11. **Plages de fermeture** — aucune demande possible sur une plage fermée (dates désactivées dans le date picker)
12. **Langue** — tout le flow de notification suit la locale choisie par le client à la demande

---

## 11. Livrables attendus de Claude Code

### Phase 1 — Core & Base de données
- [ ] Schéma Supabase complet avec RLS
- [ ] API REST (bookings CRUD, transitions de statut)
- [ ] Système de tokens JWT (génération, validation, invalidation)
- [ ] Abstraction PaymentProvider + implémentation Stripe
- [ ] Cron jobs (expiration, reminders)

### Phase 2 — Intégrations
- [ ] Module Twilio WhatsApp (envoi, retry, log)
- [ ] Module Email (SendGrid ou Resend)
- [ ] Webhooks Stripe
- [ ] Système de templates i18n (FR/EN)

### Phase 3 — Interfaces
- [ ] Formulaire demande public (React, composant isolé, reCAPTCHA)
- [ ] Page confirmation client (Stripe Elements)
- [ ] Page "Gérer mon soin" (modification + annulation)
- [ ] Interface manager tokenisée (lien WhatsApp)
- [ ] Back-office complet (dashboard, gestion demandes, catalogue, paramètres)

### Phase 4 — Tests & Déploiement
- [ ] Tests unitaires logique métier (transitions, délais, tokens)
- [ ] Tests d'intégration Stripe (mode test)
- [ ] Configuration Vercel + Supabase production
- [ ] Seed data propriété Riad Elisa & Spa
- [ ] Documentation setup (README)

---

## 12. Questions ouvertes / Décisions différées

| # | Sujet | Décision |
|---|---|---|
| 1 | Provider email | **Resend** ✅ |
| 2 | Devise microtransaction | **MAD (dirham marocain)** ✅ — montant équivalent ~10 MAD |
| 3 | Wording templates WhatsApp | Claude Code génère une proposition en FR/EN, à affiner avec le client en cours de projet |
| 4 | Architecture multi-tenant V2 | Décision après POC |
| 5 | Intégration NAPS | V2, interface PaymentProvider préparée en V1 |
| 6 | Front marketing v0 | Développement séparé post-V1 |
