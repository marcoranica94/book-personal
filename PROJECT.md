# PROJECT.md — Specifiche Tecniche: Book Dashboard

> Dashboard personale per la gestione di un libro in fase di scrittura.
> Versione spec: 2.0 | Ultima modifica: 2026-03-04 | Stato: **In produzione**

---

## 1. Visione del Prodotto

Un portale web personale e accattivante che trasforma il processo di scrittura di un libro in un
flusso di lavoro strutturato e misurabile. La dashboard combina un kanban board per i capitoli,
metriche di avanzamento, analisi AI profonde per ogni capitolo e gestione completa dei contenuti,
il tutto ospitato interamente su GitHub Pages con Firebase come backend.

**URL Produzione:** `https://marcoranica94.github.io/book-personal/`

---

## 2. Stack Tecnologico

### 2.1 Frontend

| Tecnologia | Versione | Ruolo |
|------------|----------|-------|
| React | 19.x | Framework UI |
| Vite | 7.x | Build tool / dev server |
| TypeScript | 5.9 | Type safety |
| Tailwind CSS | 4.x | Styling utility-first (`@tailwindcss/vite`) |
| Framer Motion | 12.x | Animazioni e transizioni |
| Zustand | 5.x | State management globale |
| @dnd-kit/core + sortable | 6.x / 10.x | Drag & drop kanban |
| Recharts | 3.x | Grafici e visualizzazioni |
| React Router | 7.x | Routing SPA (HashRouter) |
| date-fns | 4.x | Gestione date |
| lucide-react | latest | Icone |
| uuid | 13.x | Generazione UUID capitoli |

### 2.2 Backend / Infrastruttura

| Servizio | Utilizzo | Costo |
|----------|----------|-------|
| GitHub Pages | Hosting SPA statica | Gratuito |
| GitHub Actions | CI/CD deploy + AI Analysis workflow | Gratuito (2000 min/mese) |
| Firebase Auth | Autenticazione GitHub provider (popup OAuth) | Gratuito |
| Firebase Firestore | Database principale (capitoli, analisi, settings, stats) | Gratuito (Spark plan) |
| Anthropic API | Analisi AI capitoli (claude-sonnet-4-6) | Pay-per-use (solo in Actions) |

**Firebase Spark plan (gratuito):** 1GB storage, 50K reads/giorno, 20K writes/giorno — ampiamente sufficiente.

### 2.3 Persistenza Dati

**Struttura Firestore (collezioni flat, single-user):**
```
/chapters/{chapterId}              # Metadati capitolo (Chapter type)
/analyses/{chapterId}              # Ultima analisi AI del capitolo
/analyses/{chapterId}/history/{ts} # Storico analisi (sub-collection)
/settings/book                     # Impostazioni libro (documento singolo)
/statsHistory/{autoId}             # Snapshot statistiche giornaliero
```

**Security Rules:**
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Testo dei capitoli:** file `.md` nella cartella `chapters-content/` del repo (letti dal workflow AI via `REPO_DIR`).

---

## 3. Autenticazione

### Firebase Auth con GitHub Provider

**Flusso:**
1. Utente clicca "Accedi con GitHub"
2. Firebase apre popup OAuth verso GitHub
3. Utente autorizza → Firebase crea la sessione
4. `onAuthStateChanged` notifica l'app
5. Token refresh automatico da Firebase SDK

**Configurazione richiesta:**
- Firebase Console → Authentication → GitHub provider → inserire Client ID + Secret dell'OAuth App GitHub
- Firebase Console → Authentication → Settings → Authorized Domains → aggiungere `marcoranica94.github.io`
- GitHub OAuth App: callback URL = `https://book-personal.firebaseapp.com/__/auth/handler`

**Scope GitHub:** `read:user` (solo profilo)

---

## 4. Architettura Applicazione

### 4.1 Route Structure (HashRouter)

```
/#/                    → redirect a /dashboard
/#/login               → Login con GitHub
/#/dashboard           → Home: KPI, grafici, scadenze
/#/kanban              → Board kanban con drag & drop
/#/chapters/:id        → Dettaglio capitolo + checklist + analisi preview
/#/analysis            → Overview analisi AI + tabella comparativa
/#/settings            → Impostazioni libro e account
```

### 4.2 State Management (Zustand)

```
authStore       → user (Firebase User), isAuthenticated, isLoading
chaptersStore   → chapters[], CRUD, selectors (totalWords, byStatus...)
settingsStore   → BookSettings, load/save
analysisStore   → analyses{}, loadAnalysis, loadAllAnalyses
uiStore         → sidebarCollapsed, viewMode, filters
toastStore      → toast queue con auto-dismiss
```

### 4.3 Convenzioni Chiave

- **Drag & Drop stale closure fix:** usare `useChaptersStore.getState()` dentro `onDragEnd` invece della closure React per leggere lo stato aggiornato dopo `onDragOver`
- **TypeScript enums:** usare `const obj = {} as const` + type alias (no `enum` — erasableSyntaxOnly)
- **Tailwind v4:** `@import "tailwindcss"` in CSS, plugin `@tailwindcss/vite` in vite.config

---

## 5. Funzionalità Implementate

### 5.1 Kanban Board ✅
- 6 colonne: TODO → IN_PROGRESS → REVIEW → EXTERNAL_REVIEW → REFINEMENT → DONE
- Drag & drop cross-column con persist su Firestore e rollback on error
- Card draggabili da tutta la superficie (bottoni azioni con stopPropagation)
- Modal creazione/modifica con tutti i campi
- Vista lista alternativa con toggle
- Filtro per titolo, reset filtri
- DragOverlay con card fantasy durante il drag

### 5.2 Dashboard Home ✅
- 8 KPI cards con count-up animation: parole, pagine, cap. completati, tempo lettura, parole/giorno, giorni attivi, fine stimata, mancano al target
- Progress bar libro con animazione
- WordCountChart (AreaChart storico parole)
- ProductivityChart (BarChart parole/giorno)
- StatusDonutChart (PieChart distribuzione status)
- ProgressRing (SVG gauge % completamento)
- Alert capitoli in scadenza (prossimi 7 giorni)
- Snapshot giornaliero automatico su Firestore

### 5.3 Dettaglio Capitolo ✅
- Stats: chars, parole, pagine, tempo lettura, % target
- Checklist drag-to-reorder con auto-save
- Synopsis e note con auto-save
- Panel analisi AI preview con score overall
- Navigazione prev/next capitolo
- Trigger nuova analisi AI

### 5.4 Analisi AI ✅
- Selector capitolo con indicatore analizzato (✓)
- ProgressRing overall score
- Radar chart per 6 dimensioni (Recharts RadarChart)
- Score bars animate con colori condizionali
- Sintesi testuale
- Tabs: Punti di forza / Debolezze / Suggerimenti / Correzioni
- Correzioni diff-style (originale barrato → suggerito verde)
- Tabella comparativa tutti i capitoli con click-to-select
- Pulsante "Analizza" (singolo) e "Tutti" con loading state
- Trigger GitHub Actions workflow_dispatch dalla UI

### 5.5 Impostazioni ✅
- Info libro: titolo, autore, genere, lingua, target parole/capitoli, data inizio, sinossi
- Parametri: chars/pagina (default 1800), parole/pagina, parole/min lettura
- Account: avatar GitHub, nome, email, logout
- Export JSON (capitoli + settings)

---

## 6. Design System

### 6.1 Palette Colori (Dark Theme)

```
Background:    #0A0A0F
Surface:       #12121A
Surface-2:     #1A1A26
Border:        rgba(255,255,255,0.08)
Primary:       #7C3AED (viola)
Primary-light: #A855F7
Accent:        #06B6D4 (cyan)
Success:       #10B981 (emerald)
Warning:       #F59E0B (amber)
Danger:        #EF4444 (red)
Text-primary:  #F1F5F9
Text-secondary:#94A3B8
Text-muted:    #64748B
```

### 6.2 Status Colors (Kanban)

```
TODO:             slate  (#64748B)
IN_PROGRESS:      blue   (#3B82F6)
REVIEW:           amber  (#F59E0B)
EXTERNAL_REVIEW:  violet (#8B5CF6)
REFINEMENT:       cyan   (#06B6D4)
DONE:             emerald(#10B981)
```

---

## 7. GitHub Actions Workflows

### 7.1 Deploy (`deploy.yml`)

```
Trigger: push on master + workflow_dispatch
Steps: checkout → pnpm setup → pnpm install → pnpm build → upload artifact → deploy pages
Env vars VITE_FIREBASE_* iniettate inline nel workflow (non secrets — Firebase API key è pubblica)
```

### 7.2 AI Analysis (`ai-analysis.yml`)

```
Trigger: workflow_dispatch (input: chapter_id o "all")
Secrets: ANTHROPIC_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON
Steps: checkout → node 22 → npm install (scripts/) → node analyze-chapter.mjs
```

**Script `analyze-chapter.mjs`:**
1. Legge capitoli da Firestore via Firebase Admin SDK
2. Legge testo `.md` da `chapters-content/{id}.md` (con fallback a synopsis)
3. Chiama Claude API (`claude-sonnet-4-6`, max 4096 tokens)
4. Salva analisi su Firestore (`/analyses/{id}` + subcollection `history`)

---

## 8. Variabili d'Ambiente

### Frontend (`.env.local` in sviluppo, inline nel workflow in prod)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GITHUB_REPO_OWNER   # per triggerWorkflow
VITE_GITHUB_REPO_NAME    # per triggerWorkflow
```

### GitHub Actions Secrets
```
ANTHROPIC_API_KEY              # per analyze-chapter.mjs
FIREBASE_SERVICE_ACCOUNT_JSON  # per analyze-chapter.mjs (Admin SDK)
```

---

## 9. Sicurezza

- **Firebase API Key:** pubblica per design — sicurezza garantita dalle Security Rules
- **Security Rules Firestore:** solo utenti autenticati (`auth != null`)
- **ANTHROPIC_API_KEY:** solo in GitHub Actions Secrets, mai nel frontend
- **FIREBASE_SERVICE_ACCOUNT_JSON:** solo in GitHub Actions Secrets
- **GitHub OAuth secret:** in Firebase Console (mai nel codice)
- **Authorized Domains Firebase:** solo `localhost` e `marcoranica94.github.io`

---

## 10. Performance

- **Bundle attuale:** 1294KB JS → 394KB gzipped (include Firebase SDK ~150KB gz)
- **HashRouter:** compatibile GitHub Pages senza 404 su refresh
- **Zustand `getState()`:** usato in callback dnd per evitare stale closures
- **Snapshot stats:** salvato una volta al giorno (check per data prima di scrivere)

---

## 11. Possibili Estensioni Future

- Editor markdown integrato per testo capitolo con upload `.md`
- Checklist template personalizzabile
- Storico analisi per capitolo (trend chart punteggi)
- Filtri Kanban per priorità e tag
- Responsive mobile con hamburger menu
- Pomodoro timer per sessioni scrittura
- Export PDF capitolo
- Readability score (Flesch-Kincaid italiano)
