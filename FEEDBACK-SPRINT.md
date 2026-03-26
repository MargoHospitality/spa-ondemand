# Margo Spa Booking — Feedback Sprint

> Collecte des retours post-E2E pour spec Claude Code
> Démarré : 2026-03-26

## 🔴 Bloquants

### BUG-1. Dashboard — Liste "Demandes du jour" vide malgré compteur
**Type:** Bug
**Page:** `/admin` (Dashboard)

**Symptôme:**
- Le compteur en haut affiche "3 demandes du jour"
- Mais la liste détaillée en dessous est vide

**Probable cause:**
- Requête de liste avec filtre différent du compteur
- Ou problème de timezone dans le filtre `created_at` vs `requested_slot`

**À investiguer:** `DashboardPage.tsx` — comparer les queries compteur vs liste

## 🟡 Importants

*(aucun pour l'instant)*

## 🟢 Nice to have

*(aucun pour l'instant)*

## 📝 Retours bruts (à trier)

### 1. Form — Sélection prestation conditionnelle
**Type:** UX / Fonctionnel
**Priorité:** 🟡 Important

Le client doit d'abord choisir une **catégorie de prestation** (Hammam, Massage, Package, etc.), puis un 2e select affiche uniquement les prestations de cette catégorie.

**Implique:**
- Ajouter un champ `category` sur la table `services` (ou créer une table `service_categories`)
- Modifier le form : 2 selects en cascade
- Filtrage dynamique côté frontend

**Maquette flow:**
```
[Catégorie ▼]     →  Massage sélectionné
[Prestation ▼]    →  N'affiche que : Relaxant 60min, Deep Tissue 90min, etc.
```

---

### 2. Form — Nombre de personnes + calcul prix total
**Type:** Fonctionnel
**Priorité:** 🟡 Important

Ajouter un champ **nombre de personnes** et afficher le **montant total** dynamiquement avant le bouton d'envoi.

**Implique:**
- Nouveau champ `guest_count` (select ou input number, min 1, max configurable)
- Calcul dynamique : `prix_prestation × nb_personnes`
- Affichage du total juste au-dessus du bouton "Envoyer"
- Stocker `guest_count` dans la table `bookings`

**Maquette flow:**
```
[Prestation ▼]     →  Massage Relaxant - 500 MAD
[Nombre de personnes ▼]  →  2

──────────────────────────
Total estimé : 1 000 MAD
──────────────────────────

[ Envoyer ma demande ]
```

**Règle métier confirmée:**
- Chaque prestation a un `default_guests` et `max_guests` en DB
- Standard → default: 1, max: configurable (ex: 4)
- Duo → default: 2, max: 2 (verrouillé)
- Quand le client sélectionne une prestation, le champ nombre de personnes s'auto-remplit avec `default_guests`
- Le client peut modifier uniquement dans la plage [1, max_guests]

**Schema update `services`:**
```sql
ALTER TABLE services ADD COLUMN default_guests INT NOT NULL DEFAULT 1;
ALTER TABLE services ADD COLUMN max_guests INT NOT NULL DEFAULT 4;
-- Pour les Duo: default_guests = 2, max_guests = 2
```

---

### 3. Toutes pages — Ajouter le logo au-dessus du titre
**Type:** UX / Branding
**Priorité:** 🟡 Important

Afficher le logo du riad/spa en haut de chaque écran (form réservation, validation manager, confirmation CB, gérer mon soin).

**Implique:**
- Récupérer le logo depuis `properties.logo_url` (ou ajouter ce champ si absent)
- Modifier `PublicLayout` ou chaque page pour afficher le logo centré au-dessus du titre
- Fallback si pas de logo : ne rien afficher ou logo Margo par défaut

---

### 4. Pages récap — Afficher nombre de personnes + total MAD
**Type:** UX / Info
**Priorité:** 🟡 Important

Sur les pages de récap (manager, confirm CB, gérer mon soin), afficher :
- Nombre de personnes
- Total valorisé en MAD (prix × nb personnes)

**Pages concernées:**
- `/manager/booking/:token` — récap pour validation manager
- `/confirm/:token` — récap avant confirmation CB
- `/manage/:token` — récap "Gérer mon soin"

**Implique:**
- Stocker `guest_count` dans `bookings` (lié au feedback #2)
- Calculer et afficher le total dans chaque récap

---

### 5. Page Confirm CB — Améliorations UX + sécurité
**Type:** UX / Fonctionnel
**Priorité:** 🟡 Important

**5a. Logos confiance**
- Ajouter logo Stripe + badge PCI DSS sous le formulaire carte
- Rassure le client sur la sécurité

**5b. Transaction 0 MAD (tokenisation seule)**
- Actuellement : microtransaction 1€ réelle
- Demandé : **0 MAD** — juste enregistrer la carte sans prélèvement
- Utiliser Stripe `SetupIntent` au lieu de `PaymentIntent`
- La carte reste attachée au customer pour prélèvement futur si no-show

**Implique:**
- Modifier `stripe-provider.ts` : remplacer `chargeMicrotransaction()` par `createSetupIntent()`
- Supprimer le refund logic (plus de charge à rembourser)
- Mettre à jour le texte légal sur la page

**5c. Bouton "Annuler la demande"**
- Permettre au client d'annuler avant même de confirmer avec sa carte
- Passe la réservation en `CANCELLED_CLIENT` directement

---

### 6. Page Confirm CB — Afficher politique d'annulation
**Type:** UX / Légal
**Priorité:** 🟡 Important

Afficher la politique d'annulation sur l'écran de confirmation CB :

```
📋 Politique d'annulation :
• Plus de 24h avant le soin : annulation gratuite
• Moins de 24h : votre carte pourra être débitée
```

**Implique:**
- Ajouter un bloc texte dans `ConfirmationPage.tsx`
- Rendre le texte i18n (FR/EN)

---

### 7. Page Confirm CB — Lien WhatsApp manager
**Type:** UX
**Priorité:** 🟢 Nice to have

Ajouter un lien "Une question ? Contactez-nous" qui ouvre WhatsApp vers le manager du spa.

**Format lien:**
```
https://wa.me/212XXXXXXXXX?text=Bonjour, j'ai une question concernant ma réservation du [date]...
```

**Implique:**
- Récupérer le numéro WhatsApp depuis `properties` ou `users` (manager)
- Pré-remplir le message avec contexte (date, prestation)
- Afficher juste au-dessus ou en dessous du bouton de confirmation

---

### 8. Page "Gérer mon soin" — Simplification V1
**Type:** UX / Fonctionnel
**Priorité:** 🟡 Important

**8a. Ajouter infos manquantes**
- Nombre de personnes
- Total en MAD

**8b. Supprimer le bouton "Modifier"**
- En V1, seule l'annulation est possible après confirmation CB
- Évite les allers-retours complexes manager ↔ client
- Le bouton modifier pourra être réactivé en V2 si besoin

**Implique:**
- Retirer le bouton/lien "Modifier ma réservation" de `ManageBookingPage.tsx`
- Garder uniquement "Annuler ma réservation"
- Optionnel : ajouter texte "Pour modifier, veuillez annuler et refaire une demande"

---

### 9. Back-office — Actions manager sur les réservations
**Type:** Fonctionnel
**Priorité:** 🟡 Important

Permettre au manager d'agir directement depuis le back-office (pas seulement via lien WhatsApp).

**Actions à ajouter selon le status:**

| Status | Actions disponibles |
|--------|---------------------|
| `REQUESTED` | Confirmer, Proposer autre créneau, Refuser |
| `CLIENT_CONFIRMED` | Annuler (côté manager) |
| `EXPIRED_CLIENT` | Relancer le client (renvoie notif + nouveau token) |

**Note:** Relance client = **manuelle en V1**. Auto-relance à évaluer en V2 selon volume.

---

### 10. Back-office — Afficher prix prestation dans le tableau
**Type:** UX
**Priorité:** 🟢 Nice to have

Dans le tableau des demandes (`/admin/bookings`), ajouter une colonne avec le prix de la prestation (ou total si nb personnes > 1).

---

### 11. Dashboard — Refonte complète
**Type:** Fonctionnel / UX
**Priorité:** 🟡 Important

Restructurer le dashboard avec les sections suivantes :

**11a. 🗓️ Soins du jour**
- Réservations `CLIENT_CONFIRMED` avec `confirmed_slot` = aujourd'hui
- Affiche : heure, client, prestation, nb personnes

**11b. 📥 À traiter**
- `REQUESTED` (en attente validation manager)
- `EXPIRED_CLIENT` récents (< 48h, opportunité relance)
- Triés par urgence

**11c. ⏳ Réalisation à confirmer**
- Soins passés (`confirmed_slot` < now) encore en status `CLIENT_CONFIRMED`
- Le manager doit marquer : **Soin effectué** ✅ ou **No-show** ❌
- Évite d'oublier de clôturer les soins

**11d. 💰 Vue financière**
- CA du jour / semaine / mois (soins `COMPLETED` uniquement)
- Nombre de soins réalisés
- Nombre de no-shows
- Taux de conversion (demandes → confirmées → réalisées)

---

### 12. Système de filtres tableau des demandes
**Type:** UX
**Priorité:** 🟡 Important

**Filtres rapides (pills avec compteurs) :**
```
[ À traiter (3) ]  [ Aujourd'hui (2) ]  [ Confirmées (8) ]  [ Historique ]  [ Tout ]
```

**Vue "Historique" :**
- Filtre période : Cette semaine | Ce mois | 3 mois | Personnalisé
- Inclut : `COMPLETED`, `NO_SHOW`, `CANCELLED_*`, `EXPIRED_*`
- Barre de recherche client (nom/email/tel)
- Export CSV optionnel

---

### 13. Vue financière — Widget dashboard + page dédiée
**Type:** Fonctionnel / Business
**Priorité:** 🟡 Important

**13a. Widget résumé sur Dashboard**
```
💰 APERÇU FINANCIER
Aujourd'hui     2 500 MAD   (3 soins)
Cette semaine   12 400 MAD  (18 soins)
Ce mois         48 200 MAD  (72 soins)
                            [Voir détails →]
```

**13b. Page `/admin/finances`**

**Métriques :**
- CA réalisé (soins `COMPLETED`)
- CA à venir (soins `CLIENT_CONFIRMED` futurs)
- Panier moyen
- No-shows (nombre + montant)
- Annulations (nombre + montant)
- Taux de conversion

**Tableau détail des soins avec filtres période**

**13c. Export CSV**
- Export du CA par période pour traitement externe (facturation commission Margo)
- Colonnes : Date, Client, Prestation, Nb pers., Montant, Status

---

### 14. Notifications WhatsApp — Enrichir le contenu
**Type:** Fonctionnel
**Priorité:** 🟡 Important

Ajouter dans tous les messages WhatsApp :
- Type de soin
- Date + heure
- Durée
- Nombre de personnes
- Prix total

**Templates concernés :**
- Notification manager (nouvelle demande)
- Notification client (confirmation manager)
- Notification client (confirmation CB)
- Reminders (48h, 4h)

---

### 15. Emails — Même enrichissement que WhatsApp
**Type:** Fonctionnel
**Priorité:** 🟡 Important

Tous les emails doivent inclure : type soin, date, durée, nb personnes, prix total.
Design amélioré via V0 en phase 2.

---

### 16. Page Manager — Enrichissement
**Type:** UX
**Priorité:** 🟡 Important

Sur `/manager/booking/:token` :
- Ajouter logo en haut
- Afficher nombre de personnes
- Afficher prix total

---

## Contexte technique

- **Repo:** github.com/MargoHospitality/spa-ondemand
- **Stack:** pnpm monorepo, Supabase, Stripe, Twilio WhatsApp, Resend
- **API:** spa-ondemand-production.up.railway.app
- **Frontend:** spaondemandgy87.vercel.app

## Spec finale — Sprint V1.1

### Contexte
Système de réservation spa on-demand. POC Riad Elisa. Stack: pnpm monorepo, Supabase, Stripe, Twilio WhatsApp, Resend, React + Tailwind.

### Objectif sprint
Implémenter les 16 améliorations + 1 bugfix listés ci-dessus.

---

## PHASE 1 — Schema & Backend

### 1.1 Migration Supabase

```sql
-- Catégories de services
CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  name_fr VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ajouter category + guests config sur services
ALTER TABLE services 
  ADD COLUMN category_id UUID REFERENCES service_categories(id),
  ADD COLUMN default_guests INT NOT NULL DEFAULT 1,
  ADD COLUMN max_guests INT NOT NULL DEFAULT 4;

-- Ajouter guest_count sur bookings
ALTER TABLE bookings 
  ADD COLUMN guest_count INT NOT NULL DEFAULT 1;

-- S'assurer que properties a logo_url
-- (vérifier si existe déjà, sinon ajouter)
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
```

### 1.2 API Updates (`apps/api/src`)

**Routes bookings:**
- `POST /api/bookings` — accepter `guest_count`
- `POST /api/bookings/:id/complete` — marquer soin effectué
- `POST /api/bookings/:id/noshow` — marquer no-show
- `POST /api/bookings/:id/resend-confirmation` — relancer client expiré (régénère token)
- `POST /api/bookings/:id/manager-action` — actions manager depuis back-office (confirm/reschedule/decline)

**Routes nouvelles:**
- `GET /api/service-categories?property_id=X` — liste catégories
- `GET /api/finances?property_id=X&from=DATE&to=DATE` — stats financières
- `GET /api/finances/export?...` — export CSV

**Stripe (`stripe-provider.ts`):**
- Remplacer `chargeMicrotransaction()` par `createSetupIntent()` — tokenisation 0 MAD
- Supprimer `refundCharge()` usage pour confirmation (garder pour no-show si besoin)

### 1.3 Notifications

**Templates WhatsApp & Email — enrichir tous avec:**
- Type de soin (name_fr/name_en selon locale)
- Date + heure
- Durée
- Nombre de personnes
- Prix total (price × guest_count)

---

## PHASE 2 — Frontend Public

### 2.1 Form réservation (`BookingRequestPage.tsx`)

- [ ] Select catégorie → filtre le select prestation
- [ ] Select prestation → auto-remplit nb personnes avec `default_guests`
- [ ] Input nombre de personnes (min 1, max `max_guests`, disabled si max=default pour Duo)
- [ ] Affichage total dynamique au-dessus du bouton submit
- [ ] Logo property en haut de page

### 2.2 Page Confirmation CB (`ConfirmationPage.tsx`)

- [ ] Logo property en haut
- [ ] Récap avec nb personnes + total MAD
- [ ] Stripe SetupIntent au lieu de PaymentIntent (0 MAD)
- [ ] Logos Stripe + PCI DSS sous le form carte
- [ ] Bloc politique d'annulation (i18n)
- [ ] Lien WhatsApp manager "Une question ?"
- [ ] Bouton "Annuler ma demande" (secondaire, sous le form)

### 2.3 Page Gérer mon soin (`ManageBookingPage.tsx`)

- [ ] Logo property en haut
- [ ] Afficher nb personnes + total MAD
- [ ] Supprimer bouton "Modifier"
- [ ] Garder uniquement "Annuler ma réservation"
- [ ] Texte optionnel: "Pour modifier, annulez et refaites une demande"

### 2.4 Page Manager (`ManagerBookingPage.tsx`)

- [ ] Logo property en haut
- [ ] Afficher nb personnes + total MAD

---

## PHASE 3 — Back-office Admin

### 3.1 Dashboard (`DashboardPage.tsx`)

**Bugfix:** Corriger liste "Demandes du jour" vide (comparer queries compteur vs liste)

**Refonte sections:**

```
┌─────────────────────────────────────────────────────┐
│  🗓️ SOINS DU JOUR                                   │
│  CLIENT_CONFIRMED + confirmed_slot = today          │
│  → heure, client, prestation, nb pers               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  📥 À TRAITER                                       │
│  REQUESTED + EXPIRED_CLIENT < 48h                   │
│  → triés par urgence (deadline token)               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  ⏳ RÉALISATION À CONFIRMER                         │
│  CLIENT_CONFIRMED + confirmed_slot < now            │
│  → boutons [Soin effectué] [No-show]                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  💰 APERÇU FINANCIER                                │
│  CA jour / semaine / mois                           │
│  [Voir détails →] → /admin/finances                 │
└─────────────────────────────────────────────────────┘
```

### 3.2 Liste bookings (`BookingsPage.tsx`)

**Filtres pills avec compteurs:**
```
[ À traiter (X) ] [ Aujourd'hui (X) ] [ Confirmées (X) ] [ Historique ] [ Tout ]
```

**Colonnes tableau:** + colonne Prix/Total

**Historique:** filtre période + recherche client + export CSV

**Actions par ligne selon status:**
- REQUESTED → Confirmer | Proposer créneau | Refuser
- CLIENT_CONFIRMED → Annuler
- EXPIRED_CLIENT → Relancer

### 3.3 Page Finances (`FinancesPage.tsx`) — NOUVELLE

- Filtres période: Aujourd'hui | Semaine | Mois | Personnalisé
- Métriques: CA réalisé, CA à venir, Panier moyen, No-shows, Annulations, Taux conversion
- Tableau détail des soins COMPLETED
- Export CSV

---

## Ordre d'implémentation suggéré

1. **Schema** — migrations Supabase (catégories, guests, logo)
2. **Backend** — routes API + Stripe SetupIntent
3. **Form public** — catégories + guests + total
4. **Pages publiques** — confirm CB, manage, manager (logo + infos + SetupIntent)
5. **Dashboard** — bugfix + refonte sections
6. **Liste bookings** — filtres + actions manager
7. **Page finances** — nouvelle page
8. **Notifications** — enrichir WhatsApp + emails

---

## Tests à valider

- [ ] Flow E2E complet avec nouvelle structure
- [ ] Stripe SetupIntent fonctionne (pas de charge)
- [ ] Catégories filtrent correctement les prestations
- [ ] Guests Duo verrouillé à 2
- [ ] Dashboard affiche correctement toutes les sections
- [ ] Actions manager depuis back-office fonctionnent
- [ ] Export CSV finances génère fichier correct
- [ ] WhatsApp/Email contiennent toutes les infos
