# Margo Spa Booking

Système de gestion de demandes de soins spa on-demand pour Margo Hospitality.

## Quick Start

```bash
# Install dependencies
pnpm install

# Setup env vars
cp .env.example .env
# Edit .env with your credentials

# Run dev
pnpm dev
```

## Stack

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + Vite + Tailwind CSS
- **Database:** Supabase (Postgres)
- **Payments:** Stripe
- **Notifications:** Twilio WhatsApp + Resend Email
- **Deploy:** Vercel

## Project Structure

```
apps/
  api/      # Backend API
  web/      # Frontend React app
packages/
  shared/   # Shared types & utilities
```

## Documentation

- [PRD v1](.clo/references/PRD_v1.md) — Product Requirements Document
- [AGENTS.md](.clo/AGENTS.md) — Development guidelines

## License

Proprietary — Margo Hospitality
