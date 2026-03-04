# CLAUDE.md — Contesto e Storico del Progetto

> File di memoria persistente per Claude Code. Aggiornato ad ogni sessione significativa.

---

## Identità del Progetto

**Nome repository:** `book-personal`
**Tipo:** Dashboard web per la gestione di un libro in scrittura
**Autore:** z004v04h
**Data inizio:** 2026-03-04
**Stack:** React + Vite + Tailwind CSS + Firebase (Firestore + Auth) + Claude API

---

## Contesto del Libro

> Da riempire man mano che l'autore condivide dettagli sul libro.

- **Titolo:** TBD
- **Genere:** TBD
- **Target parole:** TBD
- **Numero capitoli previsti:** TBD
- **Lingua:** Italiano
- **Stato attuale:** Pianificazione dashboard

---

## Decisioni Architetturali Prese

### 2026-03-04 — Sessione 1 (Setup iniziale)

**Problema:** Come hostare una dashboard personale con auth, DB e AI su infrastruttura gratuita.

**Decisioni:**

| Area | Scelta | Motivazione |
|------|--------|-------------|
| Hosting | GitHub Pages | Gratuito, integrato con repo |
| Build | React 18 + Vite | Veloce, SPA moderna, DX eccellente |
| Styling | Tailwind CSS + shadcn/ui + Framer Motion | UI accattivante senza overhead |
| Auth | Firebase Auth + GitHub provider | Popup OAuth, no Device Flow polling, refresh token automatico |
| Database | Firebase Firestore | Writes in <200ms (vs 1-3s con GitHub API), query reali, free tier generoso |
| AI Analysis | GitHub Actions + Claude API (Anthropic) | Automatizzabile, log nel repo; scrive risultati su Firestore via Admin SDK |
| Charts | Recharts | Leggero, React-friendly |
| State | Zustand | Semplice, performante |
| Drag & Drop | @dnd-kit/core | Modern, accessibile |

**Perché Firebase invece di JSON su branch `data`:**
L'approccio originale con JSON nel repo GitHub richiedeva 1-3 secondi per ogni write (crea un commit), una SHA cache come workaround per i conflitti, e nessuna possibilità di query. Firebase Firestore risolve tutto: writes in ~50-200ms, nessun overhead SHA, Security Rules per la protezione, free tier Spark da 1GB/50K reads/20K writes al giorno — ampiamente sufficiente per uso personale.

**Cosa rimane su GitHub:** Il testo dei capitoli (file `.md`) resta nel repo. Il workflow AI li legge da lì e scrive i risultati analisi su Firestore via Firebase Admin SDK (secret: `FIREBASE_SERVICE_ACCOUNT_JSON`).

**Struttura Firestore (single-user, flat):**
```
/chapters/{chapterId}          ← metadati capitolo
/analyses/{chapterId}          ← analisi AI (ultima)
/analyses/{chapterId}/history/{ts} ← storico analisi
/settings/book                 ← impostazioni libro
/statsHistory/{timestamp}      ← serie storica statistiche
```

**Security Rules:** solo `request.auth != null` (utente autenticato con GitHub via Firebase).

### 2026-03-04 — Sessione 2 (Cambio DB)

Decisione: migrazione da JSON su branch `data` → **Firebase Firestore + Firebase Auth**.

---

## Struttura File Principale

```
book-personal/
├── CLAUDE.md          # Questo file
├── PROJECT.md         # Specifiche tecniche
├── BACKLOG.md         # Task da realizzare
├── README.md          # Intro repo
├── src/               # App React
│   ├── components/    # Componenti UI
│   ├── pages/         # Route pages
│   ├── stores/        # Zustand stores
│   ├── hooks/         # Custom hooks
│   ├── services/      # GitHub API, Claude API
│   └── utils/         # Helpers
├── data/              # JSON data (branch `data` o stesso main)
│   ├── chapters.json
│   ├── analysis.json
│   └── settings.json
├── .github/
│   └── workflows/
│       ├── deploy.yml        # CI/CD GitHub Pages
│       └── ai-analysis.yml   # Auto-analisi capitoli
└── public/
```

---

## Modello Dati

### Chapter (Capitolo/Story)
```json
{
  "id": "uuid",
  "number": 1,
  "title": "Titolo capitolo",
  "subtitle": "",
  "status": "TODO | IN_PROGRESS | REVIEW | EXTERNAL_REVIEW | REFINEMENT | DONE",
  "priority": "LOW | MEDIUM | HIGH | URGENT",
  "tags": ["azione", "protagonista"],
  "targetChars": 9000,
  "currentChars": 0,
  "wordCount": 0,
  "synopsis": "",
  "notes": "",
  "checklist": [
    { "id": "uuid", "text": "Prima bozza completata", "done": false },
    { "id": "uuid", "text": "Revisione grammaticale", "done": false }
  ],
  "filePath": "chapters/01-titolo.md",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "dueDate": null,
  "assignedReviewer": null
}
```

### Analysis (Analisi AI)
```json
{
  "chapterId": "uuid",
  "analyzedAt": "ISO8601",
  "model": "claude-opus-4-6",
  "scores": {
    "stile": 8.5,
    "chiarezza": 7.0,
    "ritmo": 8.0,
    "sviluppoPersonaggi": 7.5,
    "trama": 9.0,
    "originalita": 8.5,
    "overall": 8.1
  },
  "summary": "...",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "suggestions": ["..."],
  "corrections": [
    {
      "original": "testo originale",
      "suggested": "testo corretto",
      "type": "grammatica | stile | chiarezza | continuita",
      "note": "spiegazione"
    }
  ]
}
```

---

## Convenzioni di Sviluppo

- **Lingua UI:** Italiano
- **Branch default:** `master`
- **Branch data:** eliminato — i dati stanno su Firestore
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `analysis:`)
- **Auth Firebase:** token gestito automaticamente da Firebase SDK, nessun localStorage manuale
- **Env vars frontend:** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (sicure, Firebase API key è pubblica per design)
- **GitHub Actions secrets:** `ANTHROPIC_API_KEY` + `FIREBASE_SERVICE_ACCOUNT_JSON`

---

## Note e Preferenze Utente

- Vuole UI accattivante e moderna (non minimale/piatta)
- Hosting su GitHub Pages, DB su Firebase Firestore (gratuito, superiore)
- Analisi AI per ogni capitolo con voti, commenti, correzioni
- Conteggio pagine basato su: caratteri totali / 1800
- Dashboard con andamento capitolo e libro nel tempo

---

## Sessioni di Lavoro

| Data | Sessione | Attività | Output |
|------|----------|----------|--------|
| 2026-03-04 | #1 | Setup progetto, creazione CLAUDE.md, PROJECT.md, BACKLOG.md | 3 file di specifica |
| 2026-03-04 | #2 | Sprint 1 completo — tutta la fondazione del progetto | App funzionante, build ✅ |
| 2026-03-04 | #3 | Sprint 0 — migrazione Firebase (Firestore + Auth), riscrittura tutti i service/store, workflow AI aggiornato | Build ✅, Firebase integrato |

---

## TODO per Prossima Sessione (Sprint 2)

- [ ] E4: Kanban Board completo (KanbanColumn, ChapterCard, drag & drop, ChapterModal)
- [ ] E5: Dashboard Home (grafici Recharts, milestone, KPI animati)
- [ ] E6: Dettaglio Capitolo (ChecklistEditor, stats, note)
- [ ] E3: Header.tsx, breadcrumb, animazioni pagina

## Struttura File Creata (Sprint 1)

```
src/
├── App.tsx                          ← Router + auth init
├── index.css                        ← Tailwind v4 + custom scrollbar
├── types/index.ts                   ← Tutti i tipi + const enums + STATUS_CONFIG
├── utils/cn.ts                      ← cn() helper
├── utils/formatters.ts              ← charsToPages, wordsToReadingTime, ...
├── utils/constants.ts               ← ENV vars, LS keys, API URLs
├── services/github.ts               ← GitHub API client (fetch wrapper)
├── services/githubOAuth.ts          ← Device Flow OAuth
├── services/dataService.ts          ← CRUD JSON su branch data
├── stores/authStore.ts              ← Auth Zustand store
├── stores/chaptersStore.ts          ← Chapters CRUD store
├── stores/settingsStore.ts          ← Settings store
├── stores/analysisStore.ts          ← Analysis store
├── stores/uiStore.ts                ← UI state (filters, theme, sidebar)
├── components/layout/Layout.tsx     ← Shell app
├── components/layout/Sidebar.tsx    ← Nav collapsibile con animazioni
├── components/layout/ProtectedRoute.tsx ← Guard auth
└── pages/
    ├── LoginPage.tsx                ← UI Login Device Flow (5 stati animati)
    ├── DashboardPage.tsx            ← Home con KPI e stats
    ├── KanbanPage.tsx               ← Placeholder Sprint 2
    ├── AnalysisPage.tsx             ← Placeholder Sprint 4
    └── SettingsPage.tsx             ← Form impostazioni libro
.github/workflows/
    ├── deploy.yml                   ← CI/CD GitHub Pages
    └── ai-analysis.yml              ← AI analysis con Claude API
scripts/analyze-chapter.mjs         ← Script Node.js per analisi AI
```
