# CLAUDE.md — Contesto e Storico del Progetto

> File di memoria persistente per Claude Code. Aggiornato ad ogni sessione significativa.

---

## Identità del Progetto

**Nome repository:** `book-personal`
**Tipo:** Dashboard web per la gestione di un libro in scrittura
**Autore:** z004v04h / marcoranica94
**Data inizio:** 2026-03-04
**Stack:** React 19 + Vite 7 + Tailwind CSS v4 + Firebase (Firestore + Auth) + Claude API

---

## Contesto del Libro

> Da riempire man mano che l'autore condivide dettagli sul libro.

- **Titolo:** TBD
- **Genere:** TBD
- **Target parole:** TBD
- **Numero capitoli previsti:** TBD
- **Lingua:** Italiano
- **Stato attuale:** App funzionante in produzione su GitHub Pages

---

## Decisioni Architetturali

| Area | Scelta | Motivazione |
|------|--------|-------------|
| Hosting | GitHub Pages | Gratuito, integrato con repo |
| Build | React 19 + Vite 7 + TypeScript 5 | Veloce, SPA moderna |
| Styling | Tailwind CSS v4 + Framer Motion | UI accattivante, animazioni fluide |
| Auth | Firebase Auth + GitHub provider (popup) | No Device Flow polling, refresh automatico |
| Database | Firebase Firestore | Writes ~50-200ms, query native, free tier Spark |
| AI Analysis | GitHub Actions + Claude API → Firestore via Admin SDK | Automatizzabile, zero costo frontend |
| Charts | Recharts | Leggero, React-friendly |
| State | Zustand 5 | Semplice, performante, `getState()` fuori da componenti |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | Accessibile, sensori pointer |

**Struttura Firestore:**
```
/chapters/{chapterId}              ← metadati capitolo (Chapter type)
/analyses/{chapterId}              ← ultima analisi AI
/analyses/{chapterId}/history/{ts} ← storico analisi
/settings/book                     ← impostazioni libro (doc singolo)
/statsHistory/{autoId}             ← snapshot giornaliero statistiche
```

**Security Rules:** `allow read, write: if request.auth != null`

---

## Struttura File Attuale

```
book-personal/
├── CLAUDE.md / PROJECT.md / BACKLOG.md
├── firebase.json / firestore.rules / firestore.indexes.json
├── src/
│   ├── App.tsx                          ← HashRouter + auth init + routes
│   ├── types/index.ts                   ← Tutti i tipi, ChapterStatus, STATUS_CONFIG, DEFAULT_CHECKLIST
│   ├── utils/
│   │   ├── cn.ts                        ← cn() helper
│   │   ├── formatters.ts                ← charsToPages, wordsToReadingTime, calcProgress, ...
│   │   └── constants.ts                 ← GITHUB_REPO_OWNER/NAME, KANBAN_COLUMNS_ORDER
│   ├── services/
│   │   ├── firebase.ts                  ← initializeApp, export db + auth
│   │   ├── authService.ts               ← signInWithGitHub (popup), signOut, onAuthChange
│   │   ├── chaptersService.ts           ← Firestore CRUD /chapters
│   │   ├── settingsService.ts           ← Firestore /settings/book
│   │   ├── analysisService.ts           ← Firestore /analyses + subcollection history
│   │   ├── statsService.ts              ← Firestore /statsHistory
│   │   └── githubWorkflow.ts            ← triggerWorkflow (GitHub Actions dispatch)
│   ├── stores/
│   │   ├── authStore.ts                 ← Firebase Auth state (user, isAuthenticated, isLoading)
│   │   ├── chaptersStore.ts             ← CRUD capitoli + selectors (totalWords, byStatus...)
│   │   ├── settingsStore.ts             ← BookSettings load/save
│   │   ├── analysisStore.ts             ← Analisi AI load/loadAll
│   │   ├── uiStore.ts                   ← sidebarCollapsed, viewMode, filters
│   │   └── toastStore.ts                ← Toast notifications
│   ├── hooks/
│   │   ├── useCountUp.ts                ← Animazione numeri count-up
│   │   └── useDebounce.ts               ← Debounce generico
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx               ← Shell: Sidebar + Header + <Outlet>
│   │   │   ├── Sidebar.tsx              ← Nav collapsibile, avatar, progress libro
│   │   │   ├── Header.tsx               ← Titolo pagina corrente + breadcrumb
│   │   │   └── ProtectedRoute.tsx       ← Guard: isLoading spinner / redirect /login
│   │   ├── kanban/
│   │   │   ├── KanbanColumn.tsx         ← useDroppable + SortableContext
│   │   │   ├── ChapterCard.tsx          ← useSortable, drag da intera superficie, stopPropagation sui bottoni
│   │   │   └── ChapterModal.tsx         ← Form creazione/modifica capitolo
│   │   ├── dashboard/
│   │   │   ├── ProgressRing.tsx         ← SVG gauge circolare
│   │   │   ├── WordCountChart.tsx       ← Recharts AreaChart storico parole
│   │   │   ├── StatusDonutChart.tsx     ← Recharts PieChart distribuzione status
│   │   │   └── ProductivityChart.tsx    ← Recharts BarChart produttività giornaliera
│   │   ├── chapters/
│   │   │   └── ChecklistEditor.tsx      ← Checklist drag-to-reorder con dnd-kit
│   │   ├── ui/
│   │   │   ├── Toaster.tsx              ← Toast notifications
│   │   │   ├── ConfirmDialog.tsx        ← Dialog conferma azioni distruttive
│   │   │   └── EmptyState.tsx           ← Empty state generico con icona
│   │   └── ScrollToTop.tsx              ← Reset scroll su navigazione
│   └── pages/
│       ├── LoginPage.tsx                ← Firebase popup OAuth GitHub (3 stati animati)
│       ├── DashboardPage.tsx            ← KPI animati + 4 grafici Recharts + scadenze
│       ├── KanbanPage.tsx               ← Board drag & drop + lista + filtri + modal
│       ├── ChapterPage.tsx              ← Dettaglio capitolo + checklist + stats + analisi preview
│       ├── AnalysisPage.tsx             ← Radar chart + score bars + tabs + tabella comparativa
│       └── SettingsPage.tsx             ← Form libro + parametri + export JSON + logout
├── scripts/
│   ├── analyze-chapter.mjs              ← Node.js: Firebase Admin + Claude API → analisi su Firestore
│   └── package.json                     ← deps script: @anthropic-ai/sdk, firebase-admin
└── .github/workflows/
    ├── deploy.yml                       ← CI/CD GitHub Pages (pnpm build + VITE_FIREBASE_* inline)
    └── ai-analysis.yml                  ← workflow_dispatch → node analyze-chapter.mjs
```

---

## Modello Dati

### Chapter
```typescript
{
  id: string            // UUID
  number: number
  title: string
  subtitle: string
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'EXTERNAL_REVIEW' | 'REFINEMENT' | 'DONE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  tags: string[]
  targetChars: number   // default 9000
  currentChars: number
  wordCount: number
  synopsis: string
  notes: string
  checklist: { id: string; text: string; done: boolean }[]
  filePath: string      // chapters-content/{id}.md
  createdAt: string     // ISO8601
  updatedAt: string
  dueDate: string | null
  assignedReviewer: string | null
}
```

### ChapterAnalysis
```typescript
{
  chapterId: string
  analyzedAt: string
  model: 'claude-sonnet-4-6'
  scores: {
    stile: number; chiarezza: number; ritmo: number
    sviluppoPersonaggi: number; trama: number; originalita: number
    overall: number
  }
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  corrections: { original: string; suggested: string; type: string; note: string }[]
}
```

---

## Convenzioni di Sviluppo

- **Lingua UI:** Italiano
- **Branch:** `master` (unico branch attivo)
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `chore:`)
- **TypeScript:** no `enum` keyword (erasableSyntaxOnly) → usare `const obj = {} as const` + type alias
- **Tailwind:** v4 con `@tailwindcss/vite`, `@import "tailwindcss"` in CSS
- **Router:** HashRouter (compatibile GitHub Pages senza 404)
- **Drag & Drop fix critico:** usare `useChaptersStore.getState()` in `onDragEnd` (non closure React) per evitare stale state
- **Firebase Auth:** aggiungere dominio in Firebase Console → Authentication → Authorized domains
- **Firebase Firestore rules:** devono essere deployate manualmente dalla console (non automatico)

---

## Note e Preferenze Utente

- UI accattivante, dark theme, animazioni Framer Motion
- Hosting gratuito: GitHub Pages + Firebase Spark
- Card Kanban draggabili da tutta la superficie (non solo handle)
- Analisi AI per ogni capitolo con voti, commenti, correzioni

---

## Sessioni di Lavoro

| Data | Sessione | Attività | Output |
|------|----------|----------|--------|
| 2026-03-04 | #1 | Setup progetto, CLAUDE.md, PROJECT.md, BACKLOG.md | Specifiche |
| 2026-03-04 | #2 | Sprint 1 — fondamenta React, routing, layout, stores | App base funzionante |
| 2026-03-04 | #3 | Sprint Firebase — migrazione da branch data a Firestore + Firebase Auth | Build ✅ |
| 2026-03-04 | #4 | Sprint 2 — Kanban Board completo (dnd-kit, modal, filtri, lista) | Kanban ✅ |
| 2026-03-04 | #5 | Sprint 3 — Dashboard (Recharts), ChapterPage, Settings | Dashboard ✅ |
| 2026-03-04 | #6 | Sprint 4 — AnalysisPage (radar, score, tabs, tabella) | Analisi AI ✅ |
| 2026-03-04 | #7 | Sprint 5 — error surfacing, auto-init | Polish ✅ |
| 2026-03-04 | #8 | Fix auth/unauthorized-domain, Firestore permissions, drag & drop stale closure, card draggabile ovunque | Bug fix ✅ |

---

## TODO / Possibili Next Steps

- [ ] ChapterPage: editor markdown per testo capitolo (upload file `.md`)
- [ ] Checklist template personalizzabile nelle Impostazioni
- [ ] Analisi AI: storico analisi per capitolo (trend nel tempo)
- [ ] Filtri Kanban: per priorità e tag (UI già pronta in uiStore)
- [ ] Responsive mobile (hamburger sidebar)
- [ ] Notifica completamento analisi AI (polling o webhook)
