# CLAUDE.md — Contesto e Storico del Progetto

> File di memoria persistente per Claude Code. Aggiornato ad ogni sessione significativa.

---

## Identità del Progetto

**Nome repository:** `book-personal`
**Tipo:** Dashboard web per la gestione di un libro in scrittura
**Autore:** z004v04h
**Data inizio:** 2026-03-04
**Stack:** React + Vite + Tailwind CSS + GitHub API + Claude API

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

**Problema:** Come hostare una dashboard personale interamente su GitHub, con auth, DB e AI.

**Decisioni:**

| Area | Scelta | Motivazione |
|------|--------|-------------|
| Hosting | GitHub Pages | Gratuito, integrato con repo |
| Build | React 18 + Vite | Veloce, SPA moderna, DX eccellente |
| Styling | Tailwind CSS + shadcn/ui + Framer Motion | UI accattivante senza overhead |
| Auth | GitHub OAuth Device Flow | No backend necessario, funziona su sito statico |
| Database | JSON files nel repo via GitHub API | Zero infrastruttura, tutto su GitHub, storico con git |
| AI Analysis | GitHub Actions + Claude API (Anthropic) | Automatizzabile, log nel repo, free tier generoso |
| Charts | Recharts | Leggero, React-friendly |
| State | Zustand | Semplice, performante |
| Drag & Drop | @dnd-kit/core | Modern, accessibile |

**Motivazione GitHub Device Flow:** Il GitHub OAuth Device Flow permette autenticazione senza redirect server. L'utente va su `github.com/login/device`, inserisce un codice mostrato dalla dashboard, la SPA fa polling fino all'approvazione. Zero backend necessario.

**Motivazione JSON su GitHub:** Per un progetto single-user personale, usare il repo stesso come DB è ideale: versioning gratuito, backup automatico, storico completo di ogni modifica ai dati.

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
- **Branch data:** `data` (JSON files, separati dal codice)
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `data:`, `analysis:`)
- **Token GitHub:** Conservato in `localStorage` dopo Device Flow OAuth
- **API key Claude:** Conservata come GitHub Actions Secret (`ANTHROPIC_API_KEY`)

---

## Note e Preferenze Utente

- Vuole UI accattivante e moderna (non minimale/piatta)
- Tutto deve girare su GitHub (no servizi terzi per il core)
- Analisi AI per ogni capitolo con voti, commenti, correzioni
- Conteggio pagine basato su: caratteri totali / 1800
- Dashboard con andamento capitolo e libro nel tempo

---

## Sessioni di Lavoro

| Data | Sessione | Attività | Output |
|------|----------|----------|--------|
| 2026-03-04 | #1 | Setup progetto, creazione CLAUDE.md, PROJECT.md, BACKLOG.md | 3 file di specifica |
| 2026-03-04 | #2 | Sprint 1 completo — tutta la fondazione del progetto | App funzionante, build ✅ |

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
