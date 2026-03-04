# BACKLOG.md — Task Dashboard Libro

> Backlog completo ordinato per Epic e priorità.
> Legenda stato: 🔲 Pending | 🔄 In Progress | ✅ Done | 🚫 Blocked | 💡 Idea

---

## EPIC 0 — Setup & Infrastruttura

> Fondamenta del progetto. Da completare per primo, sblocca tutto il resto.

### E0-1 · Inizializzazione Progetto
- 🔲 `E0-1.1` Inizializzare progetto Vite + React 18 + TypeScript
- 🔲 `E0-1.2` Configurare Tailwind CSS v3 con tema custom (colori brand, dark mode)
- 🔲 `E0-1.3` Installare e configurare shadcn/ui
- 🔲 `E0-1.4` Installare dipendenze: framer-motion, zustand, @dnd-kit/core, recharts, react-router-dom, date-fns, lucide-react, react-markdown
- 🔲 `E0-1.5` Configurare path aliases TypeScript (`@/components`, `@/stores`, etc.)
- 🔲 `E0-1.6` Setup ESLint + Prettier con config condivisa
- 🔲 `E0-1.7` Configurare Vite per build GitHub Pages (base URL)

### E0-2 · GitHub Configuration
- 🔲 `E0-2.1` Creare GitHub OAuth App nelle impostazioni developer
- 🔲 `E0-2.2` Configurare GitHub Pages nel repository (source: GitHub Actions)
- 🔲 `E0-2.3` Aggiungere secret `ANTHROPIC_API_KEY` nelle repo settings
- 🔲 `E0-2.4` Creare branch `data` orfano con struttura JSON iniziale
- 🔲 `E0-2.5` Creare `chapters.json` vuoto nel branch data
- 🔲 `E0-2.6` Creare `book-settings.json` con metadati libro nel branch data
- 🔲 `E0-2.7` Creare `book-stats-history.json` vuoto nel branch data

### E0-3 · CI/CD Pipeline
- 🔲 `E0-3.1` Creare workflow `.github/workflows/deploy.yml` per GitHub Pages
- 🔲 `E0-3.2` Configurare pnpm caching nel workflow
- 🔲 `E0-3.3` Aggiungere step build + test nel workflow
- 🔲 `E0-3.4` Testare deploy end-to-end su GitHub Pages
- 🔲 `E0-3.5` Aggiungere `CNAME` se si usa dominio custom (opzionale)

### E0-4 · TypeScript Types
- 🔲 `E0-4.1` Definire type `Chapter` con tutti i campi
- 🔲 `E0-4.2` Definire type `ChecklistItem`
- 🔲 `E0-4.3` Definire type `ChapterAnalysis` con scores
- 🔲 `E0-4.4` Definire type `BookSettings`
- 🔲 `E0-4.5` Definire type `StatsSnapshot` per storico
- 🔲 `E0-4.6` Definire enums: `ChapterStatus`, `Priority`, `CorrectionType`

---

## EPIC 1 — Autenticazione

> GitHub OAuth Device Flow. No backend.

- 🔲 `E1-1` Implementare `githubOAuth.ts` service con Device Flow completo
  - Request device code
  - Polling token (ogni 5s, timeout 5min)
  - Refresh token handling
- 🔲 `E1-2` Creare `authStore.ts` (Zustand) con stato auth e token
- 🔲 `E1-3` Creare `LoginPage.tsx` con UI accattivante
  - Logo/nome dashboard
  - Pulsante "Accedi con GitHub"
  - QR code o link diretto a github.com/login/device
  - Mostrare `user_code` con animazione attesa
  - Spinner di polling con countdown
  - Messaggio di errore/retry
- 🔲 `E1-4` Creare `ProtectedRoute.tsx` HOC
- 🔲 `E1-5` Implementare persistenza token in localStorage
- 🔲 `E1-6` Implementare validazione token all'avvio app
- 🔲 `E1-7` Implementare logout (revoca token via API + clear localStorage)
- 🔲 `E1-8` Gestire scadenza token con redirect automatico a login
- 🔲 `E1-9` Mostrare info utente autenticato nell'header (avatar, nome)

---

## EPIC 2 — Servizio Dati GitHub

> Layer di astrazione per leggere/scrivere JSON nel repo via GitHub API.

- 🔲 `E2-1` Implementare `github.ts` client base (fetch wrapper con auth header)
- 🔲 `E2-2` Implementare `dataService.ts`:
  - `readFile(path)` → GET content via API
  - `writeFile(path, content, sha)` → PUT content via API (crea/aggiorna)
  - `getSha(path)` → recupera SHA corrente (necessario per update)
- 🔲 `E2-3` Implementare `chaptersService`:
  - `getAllChapters()` → legge chapters.json
  - `saveChapters(chapters)` → scrive chapters.json
  - `addChapter(chapter)` → aggiunge e salva
  - `updateChapter(id, updates)` → aggiorna e salva
  - `deleteChapter(id)` → rimuove e salva
- 🔲 `E2-4` Implementare `settingsService`:
  - `getSettings()` → legge book-settings.json
  - `saveSettings(settings)` → scrive book-settings.json
- 🔲 `E2-5` Implementare `statsService`:
  - `getStatsHistory()` → legge storico
  - `addStatsSnapshot(snapshot)` → aggiunge entry giornaliera
- 🔲 `E2-6` Implementare `analysisService`:
  - `getAnalysis(chapterId)` → legge analysis/chapter-{id}.json
  - `getAllAnalysesIndex()` → legge analysis-index.json
- 🔲 `E2-7` Gestione errori API (rate limit, 404, 401, 422)
- 🔲 `E2-8` Implementare retry logic per rate limiting
- 🔲 `E2-9` Cache in-memory con invalidazione (evita chiamate ridondanti)

---

## EPIC 3 — Layout & Navigazione

> Shell dell'applicazione, sidebar, header, routing.

- 🔲 `E3-1` Creare `Layout.tsx` con sidebar + main content
- 🔲 `E3-2` Creare `Sidebar.tsx`:
  - Logo + nome dashboard
  - Navigation links con icone
  - Indicatore pagina attiva
  - Collapsible (versione mobile)
  - Footer con info utente + logout
- 🔲 `E3-3` Creare `Header.tsx`:
  - Titolo pagina corrente
  - Breadcrumb
  - Pulsanti azione rapida
  - Notifiche/badge
- 🔲 `E3-4` Configurare React Router con tutte le route
- 🔲 `E3-5` Implementare loading skeleton globale
- 🔲 `E3-6` Implementare error boundary globale
- 🔲 `E3-7` Animazione transizione pagine (Framer Motion)
- 🔲 `E3-8` Responsive mobile (hamburger menu)

---

## EPIC 4 — Kanban Board

> Il core della gestione capitoli.

### E4 · Board
- 🔲 `E4-1` Creare `KanbanPage.tsx` con layout a colonne
- 🔲 `E4-2` Creare `KanbanColumn.tsx`:
  - Header colonna con colore status, titolo, contatore cards
  - Area droppable per dnd-kit
  - Pulsante "Aggiungi capitolo" in colonna TODO
- 🔲 `E4-3` Creare `ChapterCard.tsx`:
  - Numero + titolo capitolo
  - Badge status colorato
  - Barra progresso parole (target vs attuale)
  - Checklist progress (X/Y completate)
  - Pagine stimate
  - Tags
  - Badge priorità
  - Data scadenza (se impostata, con rosso se scaduta)
  - Hover: glow + scale animation
  - Draggable con dnd-kit
- 🔲 `E4-4` Implementare drag & drop con @dnd-kit
  - DndContext provider
  - SortableContext per ogni colonna
  - Aggiornamento status al drop
  - Animazione durante drag (opacity, shadow)
  - Persist su GitHub API
- 🔲 `E4-5` Filtri board:
  - Per priorità
  - Per tag
  - Ricerca per titolo
- 🔲 `E4-6` Vista alternativa: lista (toggle lista/kanban)

### E4 · Modal Capitolo
- 🔲 `E4-7` Creare `ChapterModal.tsx` (creazione/modifica):
  - Campo: numero capitolo (auto-incremento)
  - Campo: titolo
  - Campo: sottotitolo
  - Campo: synopsis (textarea)
  - Campo: target parole/caratteri
  - Selector: priorità
  - Datepicker: scadenza
  - Input: tags (con autocomplete)
  - Campo: note interne
  - Campo: revisore esterno (nome/email)
- 🔲 `E4-8` Checklist editor nel modal:
  - Lista item draggable/riordinabile
  - Aggiungi item (Enter per aggiungere)
  - Rimuovi item
  - Default checklist suggerita (10 items)
- 🔲 `E4-9` Validazione form
- 🔲 `E4-10` Salvataggio con loading state e feedback
- 🔲 `E4-11` Conferma eliminazione capitolo (dialog)

---

## EPIC 5 — Dashboard Home

> Panoramica del libro con statistiche e grafici.

### E5 · Stats Overview
- 🔲 `E5-1` Creare `DashboardPage.tsx` con grid layout
- 🔲 `E5-2` Creare `StatsOverview.tsx` con KPI cards:
  - Parole totali scritte
  - Pagine stimate (chars/1800)
  - % completamento
  - Capitoli completati/totali
  - Tempo lettura stimato
  - Giorni dall'inizio
  - Velocità media (parole/giorno)
  - Proiezione completamento
- 🔲 `E5-3` Animazione numeri (count-up animation all'ingresso)
- 🔲 `E5-4` Indicatori trend (↑↓ rispetto settimana precedente)

### E5 · Grafici
- 🔲 `E5-5` Creare `WordCountChart.tsx`:
  - Area chart storico parole totali nel tempo
  - Tooltip con data e valore
  - Linea trend
- 🔲 `E5-6` Creare `StatusDistributionChart.tsx`:
  - Donut chart capitoli per status
  - Leggenda colorata
- 🔲 `E5-7` Creare `ProductivityChart.tsx`:
  - Bar chart parole scritte per giorno (ultimi 30gg)
  - Colore diverso per giorni sopra/sotto media
- 🔲 `E5-8` Creare `ProgressGauge.tsx`:
  - Gauge/semicircle con % completamento
  - Target word count
- 🔲 `E5-9` Creare `ChapterLengthChart.tsx`:
  - Histogram distribuzione lunghezza capitoli
  - Media e mediana

### E5 · Milestone & Calendario
- 🔲 `E5-10` Creare `MilestoneTimeline.tsx`:
  - Timeline orizzontale o verticale
  - Milestone completate vs future
  - Capitoli con scadenza
- 🔲 `E5-11` Creare componente "Capitoli in Scadenza" (prossimi 7gg)
- 🔲 `E5-12` Creare componente "Attività Recente" (ultimi aggiornamenti)

---

## EPIC 6 — Dettaglio Capitolo

> Pagina completa per gestire un singolo capitolo.

- 🔲 `E6-1` Creare `ChapterPage.tsx` con layout a sezioni
- 🔲 `E6-2` Header capitolo con:
  - Numero, titolo, sottotitolo
  - Dropdown cambio status (con animazione)
  - Badge priorità
  - Tags
  - Pulsanti: modifica, elimina, trigger analisi AI
- 🔲 `E6-3` Creare `ChapterStats.tsx`:
  - Card statistiche: chars, parole, pagine, tempo lettura
  - Progress bar target
  - Ultima modifica
- 🔲 `E6-4` Creare `ChecklistEditor.tsx`:
  - Lista checkbox interattiva
  - Progress header (X/Y completati con barra)
  - Add item inline
  - Drag to reorder
  - Auto-save al click
- 🔲 `E6-5` Sezione Synopsis + Note (markdown editor semplice)
- 🔲 `E6-6` Mini chart andamento parole nel tempo del capitolo
- 🔲 `E6-7` Panel "Analisi AI" preview:
  - Score overall
  - Data analisi
  - Top 2 punti di forza
  - Pulsante "Vai all'analisi completa"
  - Pulsante "Richiedi nuova analisi" (dispatch GitHub Actions)
- 🔲 `E6-8` Breadcrumb navigazione
- 🔲 `E6-9` Navigazione prev/next capitolo

---

## EPIC 7 — Analisi AI

> Tabelle, grafici, commenti e correzioni da Claude.

### E7 · Overview Analisi
- 🔲 `E7-1` Creare `AnalysisPage.tsx` con tabella riepilogo
- 🔲 `E7-2` Creare `AnalysisTable.tsx`:
  - Colonne: #, Titolo, Stile, Chiarezza, Ritmo, Personaggi, Trama, Originalità, Overall, Data
  - Celle colorate (verde/giallo/rosso)
  - Riga footer con medie
  - Ordinamento per colonna
  - Click row → dettaglio capitolo
- 🔲 `E7-3` Creare `BookRadarChart.tsx`:
  - Radar chart con profilo medio del libro
  - Overlay confronto migliore/peggiore capitolo
- 🔲 `E7-4` Stats analisi globali:
  - Score medio per dimensione
  - Capitolo migliore e peggiore per categoria
  - Trend miglioramento nel tempo

### E7 · Analisi Singolo Capitolo
- 🔲 `E7-5` Creare `ChapterAnalysisPage.tsx`
- 🔲 `E7-6` Creare `ScoreTable.tsx`:
  - 6 dimensioni + overall
  - Gauge mini chart per dimensione
  - Confronto con media libro
- 🔲 `E7-7` Creare `AnalysisComments.tsx`:
  - Sintesi (con expand/collapse)
  - Lista punti di forza (icone verde ✓)
  - Lista aree miglioramento (icone giallo ⚠)
  - Lista suggerimenti (numerati)
- 🔲 `E7-8` Creare `CorrectionsList.tsx`:
  - Cards per ogni correzione
  - Stile diff (~~originale~~ → **corretto**)
  - Badge tipo correzione (colore)
  - Note/spiegazione espandibile
  - Pulsante copia testo corretto
- 🔲 `E7-9` Creare `AnalysisTrendChart.tsx`:
  - Line chart punteggi capitolo nel tempo (analisi multiple)
  - Multi-line per ogni dimensione
- 🔲 `E7-10` Pulsante "Richiedi nuova analisi" con:
  - Dialog conferma (costo API)
  - Loading state + messaggio "GitHub Actions in esecuzione..."
  - Trigger via GitHub API workflow_dispatch

### E7 · GitHub Actions AI Workflow
- 🔲 `E7-11` Creare script Node.js `scripts/analyze-chapter.mjs`
- 🔲 `E7-12` Creare `.github/workflows/ai-analysis.yml`:
  - Input: chapter_id (o "all")
  - Steps: checkout data branch, run analyze script, commit results
- 🔲 `E7-13` Implementare prompt template per Claude (editor letterario)
- 🔲 `E7-14` Gestione errori e retry nel workflow
- 🔲 `E7-15` Notifica completamento (commit message + optional issue comment)

---

## EPIC 8 — Impostazioni

> Configurazione libro e account.

- 🔲 `E8-1` Creare `SettingsPage.tsx`
- 🔲 `E8-2` Sezione "Informazioni Libro":
  - Titolo libro
  - Sottotitolo
  - Autore
  - Genere
  - Target parole totali
  - Target numero capitoli
  - Data inizio
  - Data target completamento
  - Lingua
  - Descrizione/sinossi libro
- 🔲 `E8-3` Sezione "Impostazioni Dashboard":
  - Tema (dark/light toggle)
  - Caratteri per pagina (default 1800, modificabile)
  - Parole per pagina (default 250, modificabile)
  - Parole per minuto di lettura (default 250)
  - Formato data preferito
- 🔲 `E8-4` Sezione "Account":
  - Info utente GitHub
  - Token scadenza
  - Logout button
- 🔲 `E8-5` Sezione "Dati":
  - Export JSON completo (download)
  - Link al branch data su GitHub
  - Statistiche storage (dimensione JSON)
- 🔲 `E8-6` Sezione "Checklist Template":
  - Modifica lista default per nuovi capitoli
  - Aggiungi/rimuovi/riordina items
- 🔲 `E8-7` Save con feedback (toast notification)

---

## EPIC 9 — Zustand Stores

> State management per l'intera app.

- 🔲 `E9-1` Creare `authStore.ts`:
  - state: token, user, isAuthenticated, isLoading
  - actions: login, logout, validateToken
- 🔲 `E9-2` Creare `chaptersStore.ts`:
  - state: chapters[], isLoading, error, lastSync
  - actions: loadChapters, addChapter, updateChapter, deleteChapter, moveChapter
  - selectors: byStatus, byId, stats
- 🔲 `E9-3` Creare `analysisStore.ts`:
  - state: analyses{}, isLoading, lastFetch
  - actions: loadAnalysis, loadAllAnalyses
- 🔲 `E9-4` Creare `settingsStore.ts`:
  - state: bookSettings, dashboardSettings
  - actions: loadSettings, saveSettings
- 🔲 `E9-5` Creare `uiStore.ts`:
  - state: activeFilters, viewMode, sidebarCollapsed, theme
  - actions: setFilter, toggleView, toggleSidebar

---

## EPIC 10 — Utilities & Helpers

- 🔲 `E10-1` Creare `formatters.ts`:
  - `charsToPages(chars, charsPerPage?)` → numero pagine
  - `wordsToReadingTime(words)` → "X min di lettura"
  - `formatDate(date, format?)` → data localizzata
  - `calcProgress(current, target)` → percentuale
  - `calcProjectedEnd(currentWords, targetWords, dailyAvg)` → data stimata
  - `wordsPerDay(history)` → media parole giornaliere
- 🔲 `E10-2` Creare `constants.ts`:
  - Status enum + label + colori
  - Priority enum + label + colori
  - Default checklist items
  - GitHub OAuth Client ID
  - API endpoints
- 🔲 `E10-3` Creare custom hook `useChapters`:
  - Load, CRUD, stats derivati
- 🔲 `E10-4` Creare custom hook `useAnalysis`
- 🔲 `E10-5` Creare componente `Toast` per notifiche
- 🔲 `E10-6` Creare componente `ConfirmDialog` riutilizzabile
- 🔲 `E10-7` Creare componente `LoadingSpinner` con varianti
- 🔲 `E10-8` Creare componente `EmptyState` con illustrazione

---

## EPIC 11 — Testing & QA

- 🔲 `E11-1` Setup Vitest + Testing Library
- 🔲 `E11-2` Test unitari `formatters.ts`
- 🔲 `E11-3` Test unitari store (chaptersStore)
- 🔲 `E11-4` Test integrazione GitHub API service (mock)
- 🔲 `E11-5` Test E2E con Playwright (login flow + add chapter)
- 🔲 `E11-6` Test responsive (mobile/tablet/desktop)
- 🔲 `E11-7` Audit Lighthouse (performance, a11y, SEO)

---

## EPIC 12 — Polish & UX

> Dettagli che rendono l'esperienza eccellente.

- 🔲 `E12-1` Onboarding flow per primo accesso (wizard setup libro)
- 🔲 `E12-2` Empty states illustrati per board vuota, analisi non disponibile
- 🔲 `E12-3` Loading skeletons per ogni sezione
- 🔲 `E12-4` Keyboard shortcuts (K per kanban, D per dashboard, etc.)
- 🔲 `E12-5` Tooltip informativi su metriche e bottoni
- 🔲 `E12-6` Dark/light mode toggle con transizione fluida
- 🔲 `E12-7` Auto-save indicator ("Salvato 2 min fa")
- 🔲 `E12-8` Offline detection e messaggio
- 🔲 `E12-9` Confetti animation al completamento capitolo
- 🔲 `E12-10` Personalizzazione sfondo/accento colore
- 🔲 `E12-11` Shortcut `/` per ricerca globale capitoli
- 🔲 `E12-12` Print/export view capitolo (per condivisione)

---

## Riepilogo Epic

| Epic | Nome | Tasks | Priorità |
|------|------|-------|----------|
| E0 | Setup & Infrastruttura | 18 | 🔴 Critica |
| E1 | Autenticazione | 9 | 🔴 Critica |
| E2 | Servizio Dati GitHub | 9 | 🔴 Critica |
| E3 | Layout & Navigazione | 8 | 🔴 Critica |
| E4 | Kanban Board | 11 | 🟠 Alta |
| E5 | Dashboard Home | 12 | 🟠 Alta |
| E6 | Dettaglio Capitolo | 9 | 🟠 Alta |
| E7 | Analisi AI | 15 | 🟠 Alta |
| E8 | Impostazioni | 7 | 🟡 Media |
| E9 | Zustand Stores | 5 | 🔴 Critica |
| E10 | Utilities & Helpers | 8 | 🟡 Media |
| E11 | Testing & QA | 7 | 🟡 Media |
| E12 | Polish & UX | 12 | 🟢 Bassa |
| **TOT** | | **130** | |

---

## Ordine di Implementazione Consigliato

```
Sprint 1 (Fondamenta):
  E0 (Setup) → E9 (Stores) → E2 (Data Service) → E1 (Auth)

Sprint 2 (Shell + Core):
  E3 (Layout) → E4 (Kanban) → E10 (Utils)

Sprint 3 (Dashboard):
  E5 (Dashboard Home) → E6 (Dettaglio Capitolo) → E8 (Impostazioni)

Sprint 4 (AI + Polish):
  E7 (AI Analysis) → E12 (Polish) → E11 (Testing)
```
