# Margo Spa Booking — AGENTS.md

## Projet
Système de gestion de demandes de soins spa on-demand pour Margo Hospitality.
Client POC : Riad Elisa & Spa.

## Architecture
- **Monorepo** avec workspaces npm/pnpm
- `apps/api` — Backend Express (Vercel Serverless ou standalone)
- `apps/web` — Frontend React + Tailwind (Vite)
- `packages/shared` — Types, constantes, utilitaires partagés

## Stack
- **Runtime:** Node.js 22+ / TypeScript strict
- **Database:** Supabase (Postgres) — projet dédié (pas GEA)
- **Auth:** Supabase Auth (managers/admins back-office)
- **Paiement:** Stripe (microtransaction + token PM) — abstraction PaymentProvider pour NAPS V2
- **Notifications:** Twilio WhatsApp + Resend (email)
- **Deploy:** Vercel (frontend) + Vercel Serverless ou Railway (API)
- **i18n:** FR/EN extensible

## Structure cible

```
margo-spa-booking/
├── .clo/
│   ├── AGENTS.md
│   └── references/
│       └── PRD_v1.md
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── providers/       # PaymentProvider abstraction
│   │   │   ├── jobs/            # Cron jobs (expiration, reminders)
│   │   │   └── webhooks/
│   │   ├── supabase/
│   │   │   └── migrations/
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   │   ├── [slug]/request.tsx    # Formulaire public
│       │   │   ├── confirm/[token].tsx   # Confirmation client
│       │   │   ├── manage/[token].tsx    # Gérer mon soin
│       │   │   ├── manager/[token].tsx   # Action manager (WhatsApp)
│       │   │   └── admin/                # Back-office
│       │   └── lib/
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types.ts
│       │   ├── constants.ts
│       │   └── utils.ts
│       └── package.json
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Phases de développement

### Phase 1 — Core & Base de données (CURRENT)
1. Init monorepo (pnpm workspaces)
2. Schéma Supabase complet avec RLS (voir PRD §4)
3. API REST bookings (CRUD + transitions de statut)
4. Système tokens JWT (génération, validation, invalidation)
5. Abstraction PaymentProvider + implémentation Stripe
6. Cron jobs (expiration manager/client, reminders)

### Phase 2 — Intégrations
- Module Twilio WhatsApp (envoi, retry, log)
- Module Email Resend
- Webhooks Stripe
- Système templates i18n (FR/EN)

### Phase 3 — Interfaces
- Formulaire demande public (React, reCAPTCHA)
- Page confirmation client (Stripe Elements)
- Page "Gérer mon soin"
- Interface manager tokenisée
- Back-office complet

### Phase 4 — Tests & Déploiement
- Tests unitaires logique métier
- Tests intégration Stripe (mode test)
- Config Vercel + Supabase prod
- Seed data Riad Elisa & Spa
- Documentation

## Conventions de code

- TypeScript strict (`"strict": true`)
- ESM uniquement
- Prettier + ESLint
- Nommage :
  - camelCase pour variables/fonctions
  - PascalCase pour types/interfaces/composants
  - SCREAMING_SNAKE_CASE pour constantes
  - kebab-case pour fichiers
- Tests colocalisés (`*.test.ts`)

## Règles métier critiques (voir PRD §10)

1. **1 soin par demande** — pas de multi-prestation V1
2. **1 seule contre-proposition manager**
3. **Modification si soin > 24h uniquement**
4. **Annulation gratuite si > 24h** — microtransaction remboursée
5. **Annulation ≤ 24h ou no-show** — encaissement manuel manager
6. **Devise:** MAD (dirham marocain) — ~10 MAD pour microtransaction
7. **Tokens usage unique** — invalidés après action
8. **Délais manager:** 60min reminder, 90min expiration (configurable)

## Env vars attendues

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=

# Resend
RESEND_API_KEY=

# App
JWT_SECRET=
APP_URL=
```

## Références

- PRD complet : `.clo/references/PRD_v1.md`
- Modèle de données : PRD §4
- Flux & états : PRD §5
- Interfaces : PRD §6
- Notifications : PRD §7

## Notes pour Claude Code

- Lire le PRD complet avant de commencer chaque phase
- Commencer par Phase 1 : init monorepo + schema Supabase
- Générer les migrations Supabase dans `apps/api/supabase/migrations/`
- Tester localement avec Supabase CLI si possible
- Stripe en mode test uniquement pendant le dev
