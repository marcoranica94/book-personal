# BACKLOG.md — Task Dashboard Libro

> Backlog completo ordinato per Epic e priorità.
> Legenda stato: 🔲 Pending | 🔄 In Progress | ✅ Done | 🚫 Blocked | 💡 Idea

---

## EPIC 0 — Setup & Infrastruttura

### E0-1 · Inizializzazione Progetto
- ✅ `E0-1.1` Inizializzare progetto Vite + React 19 + TypeScript 5
- ✅ `E0-1.2` Configurare Tailwind CSS v4 con tema custom dark mode
- ✅ `E0-1.3` Installare Radix UI + class-variance-authority + tailwind-merge
- ✅ `E0-1.4` Installare dipendenze: framer-motion, zustand, @dnd-kit, recharts, react-router-dom, date-fns, lucide-react, react-markdown, uuid
- ✅ `E0-1.5` Configurare path aliases TypeScript (`@/*` → `./src/*`)
- ✅ `E0-1.6` Setup Prettier con prettier-plugin-tailwindcss
- ✅ `E0-1.7` Configurare Vite per build GitHub Pages (base: `/book-personal/`)

### E0-2 · GitHub & Firebase Configuration
- ✅ `E0-2.1` Creare GitHub OAuth App (callback: Firebase auth handler)
- ✅ `E0-2.2` Configurare GitHub Pages nel repository (source: GitHub Actions)
- ✅ `E0-2.3` Aggiungere secret `ANTHROPIC_API_KEY` nelle repo settings
- ✅ `E0-2.4` Aggiungere secret `FIREBASE_SERVICE_ACCOUNT_JSON` nelle repo settings
- ✅ `E0-2.5` Aggiungere variabili `VITE_FIREBASE_*` nel workflow deploy
- ✅ `E0-2.6` Aggiungere dominio `marcoranica94.github.io` agli Authorized Domains Firebase

### E0-5 · Firebase Setup
- ✅ `E0-5.1` Creare progetto Firebase `book-personal`
- ✅ `E0-5.2` Abilitare Firestore Database
- ✅ `E0-5.3` Abilitare Firebase Authentication → GitHub provider
- ✅ `E0-5.4` Configurare Security Rules Firestore: `allow read, write: if request.auth != null`
- ✅ `E0-5.5` Generare Service Account JSON per GitHub Actions
- ✅ `E0-5.6` Installare dipendenza Firebase: `pnpm add firebase`

### E0-3 · CI/CD Pipeline
- ✅ `E0-3.1` Creare workflow `deploy.yml` per GitHub Pages
- ✅ `E0-3.2` Configurare pnpm caching nel workflow
- ✅ `E0-3.3` Step build nel workflow (tsc + vite build)
- ✅ `E0-3.4` Deploy end-to-end su GitHub Pages funzionante
- 🔲 `E0-3.5` Aggiungere `CNAME` se si usa dominio custom (opzionale)

### E0-4 · TypeScript Types
- ✅ `E0-4.1` Definire type `Chapter` con tutti i campi
- ✅ `E0-4.2` Definire type `ChecklistItem`
- ✅ `E0-4.3` Definire type `ChapterAnalysis` con scores
- ✅ `E0-4.4` Definire type `BookSettings`
- ✅ `E0-4.5` Definire type `StatsSnapshot` per storico
- ✅ `E0-4.6` Definire const objects: `ChapterStatus`, `Priority`, `CorrectionType`, `STATUS_CONFIG`, `PRIORITY_CONFIG`

---

## EPIC 1 — Autenticazione

- ✅ `E1-1` Implementare `authService.ts` con Firebase Auth (signInWithPopup GitHub, signOut, onAuthStateChanged)
- ✅ `E1-2` Aggiornare `authStore.ts` — state: user, isAuthenticated, isLoading
- ✅ `E1-3` `LoginPage.tsx` con flusso Firebase (popup → done, 3 stati animati)
- ✅ `E1-4` Creare `ProtectedRoute.tsx` HOC (spinner durante isLoading, redirect a /login)
- ✅ `E1-5` Auth persistence gestita automaticamente da Firebase SDK
- ✅ `E1-6` Validazione auth all'avvio tramite `onAuthStateChanged`
- ✅ `E1-7` Logout (Firebase signOut) in Sidebar e Settings
- ✅ `E1-8` Redirect automatico a login se non autenticato
- ✅ `E1-9` Avatar e nome utente in Sidebar (da `firebaseUser.photoURL` e `displayName`)

---

## EPIC 2 — Servizio Dati Firebase

- ✅ `E2-1` `firebase.ts` — init app, export `db` (Firestore) e `auth`
- ✅ `E2-2` `chaptersService.ts` — getChapters, addChapter, updateChapter, deleteChapter
- ✅ `E2-3` `settingsService.ts` — getSettings, saveSettings
- ✅ `E2-4` `statsService.ts` — getStatsHistory, appendSnapshot
- ✅ `E2-5` `analysisService.ts` — getChapterAnalysis, getAllAnalyses, saveAnalysis (+ history subcollection)
- ✅ `E2-6` Gestione errori Firestore con toast notifications
- ✅ `E2-7` Store aggiornati per usare i nuovi service (chapters, settings, analysis)

---

## EPIC 3 — Layout & Navigazione

- ✅ `E3-1` `Layout.tsx` con Sidebar + Header + `<Outlet>`
- ✅ `E3-2` `Sidebar.tsx` collapsibile, nav attiva, avatar, logout, progress libro
- ✅ `E3-3` `Header.tsx` con titolo pagina corrente e breadcrumb
- ✅ `E3-4` React Router con tutte le route (`/dashboard`, `/kanban`, `/chapters/:id`, `/analysis`, `/settings`)
- ✅ `E3-5` Loading spinner globale (ProtectedRoute)
- 🔲 `E3-6` Error boundary globale
- ✅ `E3-7` Animazioni Framer Motion sulle pagine
- 🔲 `E3-8` Responsive mobile (hamburger menu)

---

## EPIC 4 — Kanban Board

### E4 · Board
- ✅ `E4-1` `KanbanPage.tsx` con layout a colonne + toolbar filtri
- ✅ `E4-2` `KanbanColumn.tsx` con useDroppable, header colorato, contatore cards
- ✅ `E4-3` `ChapterCard.tsx` — numero, titolo, priorità, progress bar, checklist count, pagine, tags, scadenza
- ✅ `E4-4` Drag & drop con @dnd-kit — cross-column e reorder, persist su Firestore, rollback on error
- ✅ `E4-5` Card draggabile da tutta la superficie (non solo grip handle)
- ✅ `E4-6` Filtri board: ricerca per titolo
- ✅ `E4-6b` Vista alternativa lista (toggle kanban/lista)
- 🔲 `E4-5b` Filtri per priorità e tag (uiStore già pronto, manca UI)

### E4 · Modal Capitolo
- ✅ `E4-7` `ChapterModal.tsx` — numero, titolo, sottotitolo, synopsis, target, priorità, scadenza, tags, note, revisore
- ✅ `E4-8` Checklist editor nel modal con items default
- ✅ `E4-9` Validazione form base
- ✅ `E4-10` Salvataggio con loading state e toast feedback
- ✅ `E4-11` Conferma eliminazione capitolo (ConfirmDialog)

---

## EPIC 5 — Dashboard Home

### E5 · Stats Overview
- ✅ `E5-1` `DashboardPage.tsx` con grid layout
- ✅ `E5-2` KPI cards animate: parole totali, pagine stimate, cap. completati, tempo lettura, parole/giorno, giorni attivi, fine stimata, mancano al target
- ✅ `E5-3` Animazione count-up sui numeri (useCountUp hook)
- ✅ `E5-4` Barra progresso libro animata (Framer Motion)

### E5 · Grafici
- ✅ `E5-5` `WordCountChart.tsx` — AreaChart storico parole nel tempo
- ✅ `E5-6` `StatusDonutChart.tsx` — PieChart distribuzione status
- ✅ `E5-7` `ProductivityChart.tsx` — BarChart parole per giorno
- ✅ `E5-8` `ProgressRing.tsx` — SVG gauge % completamento
- 🔲 `E5-9` ChapterLengthChart — histogram lunghezza capitoli

### E5 · Milestone & Calendario
- ✅ `E5-10` Componente "Capitoli in Scadenza" (prossimi 7gg con avviso ambra)
- 🔲 `E5-11` MilestoneTimeline orizzontale
- 🔲 `E5-12` Componente "Attività Recente"

---

## EPIC 6 — Dettaglio Capitolo

- ✅ `E6-1` `ChapterPage.tsx` con layout a sezioni
- ✅ `E6-2` Header capitolo: numero, titolo, status badge, priorità, tags, pulsanti azione
- ✅ `E6-3` Stats capitolo: chars, parole, pagine, tempo lettura, progress bar target
- ✅ `E6-4` `ChecklistEditor.tsx` — checkbox interattiva, progress header, drag-to-reorder, auto-save
- ✅ `E6-5` Sezione Synopsis + Note (textarea con auto-save)
- 🔲 `E6-6` Mini chart andamento parole nel tempo del capitolo
- ✅ `E6-7` Panel "Analisi AI" preview: score overall, data, link a pagina analisi, pulsante nuova analisi
- ✅ `E6-8` Breadcrumb navigazione
- ✅ `E6-9` Navigazione prev/next capitolo

---

## EPIC 7 — Analisi AI

### E7 · Overview Analisi
- ✅ `E7-1` `AnalysisPage.tsx` con selector capitolo
- ✅ `E7-2` Tabella comparativa: colonne score, colori condizionali, click row → seleziona capitolo
- ✅ `E7-3` Radar chart profilo capitolo selezionato (Recharts RadarChart)
- ✅ `E7-4` Score bars animate per ogni dimensione

### E7 · Analisi Singolo Capitolo
- ✅ `E7-5` ProgressRing overall score
- ✅ `E7-6` Score bars con colore condizionale (verde/blu/ambra/rosso)
- ✅ `E7-7` Sintesi testuale
- ✅ `E7-8` Tabs: Punti di forza / Debolezze / Suggerimenti / Correzioni
- ✅ `E7-9` Correzioni con diff originale/suggerito + badge tipo
- 🔲 `E7-10` AnalysisTrendChart — punteggi nel tempo (analisi multiple)

### E7 · GitHub Actions AI Workflow
- ✅ `E7-11` Script `analyze-chapter.mjs` aggiornato per Firestore (Admin SDK)
- ✅ `E7-12` Workflow `ai-analysis.yml` — input chapter_id, secrets Firebase + Anthropic
- ✅ `E7-13` Prompt template Claude in italiano (editor letterario)
- ✅ `E7-14` Gestione errori nel workflow (skip se no testo)
- ✅ `E7-15` `githubWorkflow.ts` — triggerWorkflow per dispatch da UI
- ✅ `E7-16` Pulsante "Analizza" e "Tutti" in AnalysisPage con loading state e toast

---

## EPIC 8 — Impostazioni

- ✅ `E8-1` `SettingsPage.tsx`
- ✅ `E8-2` Sezione "Informazioni Libro": titolo, autore, genere, lingua, target parole/capitoli, data inizio, sinossi
- ✅ `E8-3` Sezione "Parametri Dashboard": chars/pagina, parole/pagina, parole/min lettura
- ✅ `E8-4` Sezione "Account": avatar, nome, email, pulsante logout
- ✅ `E8-5` Export JSON completo (capitoli + settings) con download
- 🔲 `E8-6` Checklist template personalizzabile
- ✅ `E8-7` Save con toast feedback

---

## EPIC 9 — Zustand Stores

- ✅ `E9-1` `authStore.ts` — user (Firebase User), isAuthenticated, isLoading, signIn, logout, initialize
- ✅ `E9-2` `chaptersStore.ts` — CRUD, selectors (byStatus, totalWords, totalChars, completedCount)
- ✅ `E9-3` `analysisStore.ts` — loadAnalysis, loadAllAnalyses, getAnalysis
- ✅ `E9-4` `settingsStore.ts` — loadSettings, saveSettings, updateSetting
- ✅ `E9-5` `uiStore.ts` — sidebarCollapsed, viewMode, filters, toggleSidebar, setFilter, clearFilters
- ✅ `E9-6` `toastStore.ts` — toast.success/error/info con auto-dismiss

---

## EPIC 10 — Utilities & Helpers

- ✅ `E10-1` `formatters.ts` — charsToPages, wordsToReadingTime, formatDate, formatRelativeDate, calcProgress, calcProjectedEndDate, wordsPerDay, formatNumber, isDueSoon, isOverdue
- ✅ `E10-2` `constants.ts` — GITHUB_REPO_OWNER/NAME, KANBAN_COLUMNS_ORDER
- ✅ `E10-3` `useCountUp.ts` — animazione count-up per KPI dashboard
- ✅ `E10-4` `useDebounce.ts` — debounce generico
- ✅ `E10-5` `Toaster.tsx` — componente toast con AnimatePresence
- ✅ `E10-6` `ConfirmDialog.tsx` — dialog conferma con loading state
- ✅ `E10-7` Loading spinner inline (Loader2 da lucide)
- ✅ `E10-8` `EmptyState.tsx` — empty state generico con icona e testi

---

---

## EPIC A — Google Drive Auth & Config
> Spec completa in `DRIVE_INTEGRATION.md`

- 🔲 `A1.1` Google Cloud Project + Drive API + OAuth2 Client ID (setup manuale)
- 🔲 `A1.2` Aggiungere `VITE_GOOGLE_CLIENT_ID` e `DRIVE_ENCRYPTION_KEY` alle env vars
- 🔲 `A1.3` `driveAuthService.ts` — initiateOAuth (PKCE), exchangeCode, refreshToken, encrypt/decrypt AES-256-GCM
- 🔲 `A1.4` `driveConfigService.ts` — saveDriveConfig, getDriveConfig, deleteDriveConfig (Firestore /driveConfig/{uid})
- 🔲 `A1.5` `driveStore.ts` — config, isConnected, isSyncing, lastSyncAt
- 🔲 `A1.6` `DriveConnectButton.tsx` in SettingsPage (connect/disconnect UI)
- 🔲 `A1.7` `FolderPicker.tsx` — Google Picker API per selezionare cartella

---

## EPIC B — Drive File Service & Parser

- 🔲 `B1.1` `driveFileService.ts` — listFiles, getFileContent, updateFileContent, createFile, deleteFile
- 🔲 `B1.2` `driveParserService.ts` — parseYamlFrontmatter, parseFilenameConvention, injectFrontmatter, stripFrontmatter
- 🔲 `B1.3` Unit test parser con vari formati (Vitest)

---

## EPIC C — Sync Engine Bidirezionale

- 🔲 `C1.1` Estendere schema Firestore capitoli (driveFileId, contentHash, syncSource, syncStatus, ...)
- 🔲 `C1.2` `driveSyncService.ts` — pullFromDrive, pushToDrive (debounce 3s), fullSync, resolveConflict
- 🔲 `C1.3` Algoritmo anti-loop 5-layer (hash, syncSource+time, modifiedTime, lock, syncLog dedup)
- 🔲 `C1.4` `SyncStatusBadge.tsx` — icona cloud su KanbanCard e ChapterPage
- 🔲 `C1.5` `ConflictResolver.tsx` — diff UI per scegliere Drive vs Dashboard
- 🔲 `C2.1` `scripts/drive-sync.mjs` — Admin SDK + Drive API per GitHub Actions
- 🔲 `C2.2` `.github/workflows/drive-sync.yml` — cron ogni 15 min + workflow_dispatch
- 🔲 `C2.3` Button "Sincronizza ora" in Settings → triggerWorkflow

---

## EPIC D — AI Review Enhanced

- 🔲 `D1.1` `DiffEditor.tsx` — diff colorato originale ↔ modifiche AI (rosso/verde)
- 🔲 `D1.2` `AcceptRejectBar.tsx` — ✅ Accetta / ❌ Rifiuta / ✏️ Modifica manuale
- 🔲 `D1.3` Editor markdown inline in AnalysisPage con preview
- 🔲 `D1.4` Aggiornare `analyze-chapter.mjs` per leggere driveContent da Firestore
- 🔲 `D1.5` Tracciamento accept/reject in /analyses/{id} (appliedAt, appliedBy)

---

## EPIC E — UX Drive & Polish

- 🔲 `E1.1` Settings: sezione Google Drive (stato, cartella, ultimo sync, statistiche)
- 🔲 `E1.2` ChapterPage: link "Apri su Drive" + "Forza sync"
- 🔲 `E1.3` AnalysisPage: "Contenuto aggiornato X min fa" + "Ricarica da Drive"
- 🔲 `E1.4` Toast contestuali per eventi sync (es. "3 nuovi capitoli trovati")
- 🔲 `E1.5` Pannello "File non collegati" con azione "Importa"

---

## EPIC 11 — Testing & QA

- ✅ `E11-1` Setup Vitest + Testing Library + jsdom (`vitest.config.ts`, `src/test/setup.ts`)
- ✅ `E11-2` Test unitari `formatters.ts` (37 test: charsToPages, wordsToReadingTime, calcProgress, calcProjectedEndDate, wordsPerDay, formatDate, formatNumber, isDueSoon, isOverdue)
- ✅ `E11-3` Test unitari store `chaptersStore` (15 test: selectors, loadChapters, addChapter, updateChapter, deleteChapter, toggleChecklistItem — Firebase mockato)
- ✅ `E11-4b` Test unitari `driveParserService` (28 test: parseYamlFrontmatter, parseFilename, injectFrontmatter, chapterToFilename, parseDriveFileToChapter)
- ✅ `E11-5b` Test unitari `cn.ts` (5 test: merge Tailwind conflitti, falsy, condizionali)
- ✅ `E11-6` Test unitari `corrections.ts` — logica accept/reject/pending (7 test: apply, notFound, set vuoto, index fuori range, prima occorrenza)
- ✅ `E11-7` Test unitari `googleDocsService.applyTextReplacements` (7 test: mock fetch, conteggio occurrencesChanged, errori HTTP, formato request)
- ✅ `E11-8` Passo `test` nel workflow `deploy.yml` — build fallisce se i test non passano
- 🔲 `E11-4` Test E2E Playwright (login flow + add chapter) — richiede Firebase test env
- 🔲 `E11-9` Audit Lighthouse (performance, a11y, SEO)

---

## EPIC 12 — Polish & UX

- 🔲 `E12-1` Onboarding wizard primo accesso
- 🔲 `E12-2` Filtri Kanban per priorità e tag (uiStore pronto, manca UI)
- ✅ `E12-3` Loading skeletons per KPI Dashboard (`SkeletonCard`, `SkeletonGrid`)
- 🔲 `E12-4` Responsive mobile (hamburger sidebar)
- ✅ `E12-5` Error boundary globale (`ErrorBoundary.tsx` — class component, wrappa App)
- 🔲 `E12-6` Storico analisi per capitolo (trend chart)
- 🔲 `E12-7` Editor markdown per testo capitolo (upload file `.md`)
- 💡 `E12-8` Checklist template personalizzabile in Impostazioni
- ✅ `E12-9` Confetti animation al completamento capitolo (drag → DONE in Kanban)
- 💡 `E12-10` Pomodoro timer integrato
- ✅ `E12-11` Typewriter effect greeting Dashboard (`useTypewriter` hook, cursore lampeggiante)
- ✅ `E12-12` Ambient gradient orbs animati in Layout (3 orbs, 18-28s loop, opacity 6-10%)
- ✅ `E12-13` Cursor glow tracking nel content area (radial-gradient CSS var `--cx`/`--cy`)
- ✅ `E12-14` Stagger animazione card Kanban (cascata 40ms per card, max 300ms)
- ✅ `E12-15` Shimmer gradient text su "Parole totali" KPI
- ✅ `E12-16` Hover scale sulle KpiCard (scale 1.02)
- ✅ `E12-17` Exit animation pagine migliorata (y:-4 + opacity:0)

---

## Riepilogo Stato

| Epic | Nome | Stato |
|------|------|-------|
| E0 | Setup & Infrastruttura | ✅ Completo |
| E1 | Autenticazione Firebase | ✅ Completo |
| E2 | Servizio Dati Firebase | ✅ Completo |
| E3 | Layout & Navigazione | ✅ Quasi completo (manca mobile) |
| E4 | Kanban Board | ✅ Completo |
| E5 | Dashboard Home | ✅ Quasi completo |
| E6 | Dettaglio Capitolo | ✅ Quasi completo |
| E7 | Analisi AI | ✅ Quasi completo |
| E8 | Impostazioni | ✅ Quasi completo |
| E9 | Zustand Stores | ✅ Completo |
| E10 | Utilities & Helpers | ✅ Completo |
| E11 | Testing & QA | ✅ Quasi completo (mancano E2E e Lighthouse) |
| E12 | Polish & UX | ✅ Quasi completo (mancano mobile, filtri kanban, trend chart) |
