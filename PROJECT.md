# PROJECT.md — Specifiche Tecniche: Book Dashboard

> Dashboard personale per la gestione di un libro in fase di scrittura.
> Versione spec: 1.0 | Data: 2026-03-04

---

## 1. Visione del Prodotto

Un portale web personale e accattivante che trasforma il processo di scrittura di un libro in un
flusso di lavoro strutturato e misurabile. La dashboard combina un kanban board per i capitoli,
metriche di avanzamento, analisi AI profonde per ogni capitolo e gestione completa dei contenuti,
il tutto ospitato interamente su GitHub.

---

## 2. Stack Tecnologico

### 2.1 Frontend

| Tecnologia | Versione | Ruolo |
|------------|----------|-------|
| React | 18.x | Framework UI |
| Vite | 5.x | Build tool / dev server |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Styling utility-first |
| shadcn/ui | latest | Componenti UI base |
| Framer Motion | 11.x | Animazioni e transizioni |
| Zustand | 4.x | State management globale |
| @dnd-kit/core | 6.x | Drag & drop kanban |
| Recharts | 2.x | Grafici e visualizzazioni |
| React Router | 6.x | Routing SPA |
| date-fns | 3.x | Gestione date |
| react-markdown | 9.x | Render markdown capitoli |
| lucide-react | latest | Icone |

### 2.2 Infrastruttura

| Servizio | Utilizzo | Costo |
|----------|----------|-------|
| GitHub Pages | Hosting SPA statica | Gratuito |
| GitHub Actions | CI/CD + AI Analysis workflow | Gratuito (2000 min/mese) |
| GitHub API (REST v3) | CRUD dati JSON nel repo | Gratuito |
| GitHub OAuth App | Autenticazione utente | Gratuito |
| Anthropic API | Analisi AI capitoli | Pay-per-use (Actions) |

### 2.3 Persistenza Dati

**Strategia:** JSON files nel branch `data` del repository stesso, accessibili e modificabili
via GitHub REST API con il token dell'utente autenticato.

```
data-branch/
├── chapters.json          # Array di tutti i capitoli
├── analysis/
│   ├── chapter-{id}.json  # Analisi AI per capitolo
├── book-settings.json     # Metadati libro
├── book-stats-history.json # Serie storica statistiche
└── chapters-content/
    ├── 01-capitolo.md     # Testo capitolo (opzionale, se scritto qui)
```

**Versionamento:** Ogni salvataggio crea un commit nel branch `data` con messaggio
`data: update chapters.json - {timestamp}`. Questo fornisce storico completo gratuito.

---

## 3. Autenticazione

### 3.1 GitHub OAuth Device Flow

Il Device Flow è l'unico metodo OAuth che funziona su siti statici senza backend.

**Flusso:**
1. Utente apre la dashboard → clicca "Accedi con GitHub"
2. App richiede a GitHub un `device_code` e `user_code`
3. Utente viene mandato su `github.com/login/device`
4. Utente inserisce il `user_code` mostrato dalla dashboard
5. Dashboard fa polling a GitHub ogni 5s per verificare autorizzazione
6. GitHub restituisce `access_token` → salvato in `localStorage`
7. Token usato per tutte le chiamate GitHub API

**Scope richiesti:** `repo` (per leggere/scrivere dati nel repo)

**Sicurezza:**
- Token salvato in `localStorage` con prefix `book_dashboard_`
- Token revocato al logout via API
- Nessuna informazione sensibile nei file sorgente

### 3.2 Protezione Accesso

- Tutte le route protette da `<ProtectedRoute>` component
- Token validato all'avvio dell'app
- Se token scaduto/non valido → redirect a `/login`

---

## 4. Architettura Applicazione

### 4.1 Struttura Directory

```
src/
├── components/
│   ├── ui/                    # shadcn/ui base components
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Layout.tsx
│   ├── kanban/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── ChapterCard.tsx
│   │   └── ChapterModal.tsx
│   ├── dashboard/
│   │   ├── StatsOverview.tsx
│   │   ├── ProgressChart.tsx
│   │   ├── WordCountChart.tsx
│   │   └── MilestoneTimeline.tsx
│   ├── analysis/
│   │   ├── AnalysisPanel.tsx
│   │   ├── ScoreTable.tsx
│   │   ├── CorrectionsList.tsx
│   │   └── TrendChart.tsx
│   └── chapters/
│       ├── ChapterDetail.tsx
│       ├── ChecklistEditor.tsx
│       └── ChapterStats.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx      # Home con stats globali
│   ├── KanbanPage.tsx         # Board kanban
│   ├── ChapterPage.tsx        # Dettaglio singolo capitolo
│   ├── AnalysisPage.tsx       # AI analysis overview
│   └── SettingsPage.tsx
├── stores/
│   ├── authStore.ts
│   ├── chaptersStore.ts
│   ├── analysisStore.ts
│   └── uiStore.ts
├── services/
│   ├── github.ts              # GitHub API client
│   ├── githubOAuth.ts         # Device Flow OAuth
│   └── dataService.ts         # CRUD su JSON nel repo
├── hooks/
│   ├── useChapters.ts
│   ├── useAnalysis.ts
│   └── useGitHubData.ts
├── utils/
│   ├── constants.ts
│   ├── formatters.ts          # chars→pagine, tempo lettura, etc.
│   └── validators.ts
└── types/
    └── index.ts               # TypeScript types
```

### 4.2 Route Structure

```
/                    → redirect a /dashboard (se autenticato) o /login
/login               → Login con GitHub
/dashboard           → Home: panoramica libro, statistiche, milestone
/kanban              → Board kanban capitoli
/chapters/:id        → Dettaglio capitolo + editor checklist + stats
/analysis            → Overview analisi AI tutti i capitoli
/analysis/:id        → Analisi AI singolo capitolo
/settings            → Impostazioni libro e account
```

---

## 5. Funzionalità Dettagliate

### 5.1 Kanban Board

**Colonne:**
- **TODO** — Capitoli da iniziare
- **IN PROGRESS** — In scrittura attiva
- **REVIEW** — In revisione personale
- **EXTERNAL REVIEW** — In revisione da terzi
- **REFINEMENT** — In rifinimento/polish
- **DONE** — Completati

**Funzionalità card:**
- Drag & drop tra colonne (con animazione)
- Numero capitolo + titolo
- Badge status con colore
- Barra progresso parole (attuale/target)
- Numero checklist completate (es. 3/7)
- Conteggio pagine stimate (chars/1800)
- Tag colorati
- Indicatore priorità
- Data scadenza (se impostata)
- Avatar revisore (se assegnato)
- Click per aprire dettaglio

**ChapterModal (creazione/modifica):**
- Titolo, sottotitolo
- Numero capitolo
- Synopsis
- Note interne
- Target caratteri/parole
- Priorità
- Data scadenza
- Tags
- Checklist items (aggiungibili dinamicamente)
- Revisore esterno (email/nome)

### 5.2 Dashboard Home

**Sezione "Panoramica Libro":**
- Titolo libro, genere, target parole
- Progress bar globale (% parole scritte / target)
- Contatore: capitoli per status
- Pagine totali stimate (caratteri totali / 1800)
- Tempo di lettura stimato (parole / 250 parole/min)
- Data inizio progetto + giorni trascorsi
- Velocità scrittura (parole/giorno media)
- Proiezione completamento (al ritmo attuale)

**Sezione "Stato Capitoli":**
- Mini kanban overview (non draggable, solo visualizzazione)
- Capitoli in scadenza (prossimi 7 giorni)
- Ultimi capitoli aggiornati

**Sezione "Grafici":**
- **Word Count Over Time:** Area chart storico parole totali
- **Capitoli per Status:** Donut chart
- **Produttività Giornaliera:** Bar chart parole scritte per giorno
- **Progresso verso Target:** Gauge chart

**Sezione "Milestone":**
- Timeline milestone del libro
- Prossime scadenze
- Achievement completati

### 5.3 Dettaglio Capitolo

**Header:**
- Numero + titolo capitolo
- Stato attuale (dropdown cambio stato)
- Priorità (badge colorato)
- Tags

**Statistiche:**
- Caratteri totali
- Parole totali
- Pagine stimate (chars/1800)
- Tempo lettura stimato
- Target parole + % raggiunta
- Ultima modifica

**Checklist:**
- Lista items con checkbox
- Aggiunta/rimozione/riordino items
- Salvataggio automatico
- Checklist default suggerita:
  - [ ] Prima bozza completata
  - [ ] Struttura narrativa verificata
  - [ ] Dialoghi revisionati
  - [ ] Descrizioni ambientazioni
  - [ ] Sviluppo personaggi verificato
  - [ ] Revisione grammaticale/ortografica
  - [ ] Revisione stilistica
  - [ ] Feedback esterno ricevuto
  - [ ] Modifiche post-feedback
  - [ ] Approvazione finale

**Note/Synopsis:**
- Editor di testo ricco (markdown supportato)
- Auto-save

**Storico Statistiche:**
- Mini chart andamento parole del capitolo nel tempo

**AI Analysis Preview:**
- Ultimo punteggio overall (link a pagina analysis)
- Data ultima analisi
- Pulsante "Richiedi nuova analisi" (crea issue o dispatch GitHub Actions)

### 5.4 Analisi AI

**Overview Analisi (tutti i capitoli):**

Tabella riepilogativa con colonne:
| # | Titolo | Stile | Chiarezza | Ritmo | Personaggi | Trama | Originalità | Overall | Data |

- Colori condizionali (verde >8, giallo 6-8, rosso <6)
- Ordinamento per ogni colonna
- Media globale in footer
- Radar chart con profilo medio del libro

**Analisi Singolo Capitolo:**

*Scheda Voti:*
- Tabella con 6 dimensioni + overall
- Gauge charts per ogni dimensione
- Trend del capitolo (se analizzato più volte)

*Commenti AI:*
- Sintesi generale
- Punti di forza (lista verde)
- Aree di miglioramento (lista gialla/rossa)
- Suggerimenti specifici numerati

*Correzioni Suggerite:*
- Lista diff-style (originale → suggerito)
- Tipo correzione (grammatica / stile / chiarezza / continuità)
- Spiegazione corruzione
- Pulsante "Copia correzione"

*Trend Capitolo:*
- Line chart con punteggi nel tempo (se analisi multiple)

**GitHub Actions Workflow AI:**

Trigger: manuale (`workflow_dispatch`) + automatico su commit in `data/**`

```yaml
# .github/workflows/ai-analysis.yml
- Legge capitolo specificato (o tutti i capitoli DONE)
- Invia testo a Claude API con prompt strutturato
- Riceve JSON analisi
- Committa in data/analysis/chapter-{id}.json
- Aggiorna data/analysis-index.json
```

### 5.5 Statistiche Libro

**Metriche Principali:**
- Caratteri totali / 1800 = pagine
- Parole totali / 250 = minuti lettura
- Media parole per capitolo
- Capitolo più lungo / più corto
- % completamento (parole scritte / target)
- Distribuzione lunghezza capitoli (histogram)

**Velocità Scrittura:**
- Parole per giorno (media 7gg, 30gg, totale)
- Giorni attivi (con almeno 1 parola)
- Record personale (giorno più produttivo)
- Streak attuale (giorni consecutivi)

**Proiezione:**
- A questo ritmo finisci il libro in X giorni (data stimata)
- Parole mancanti al target

---

## 6. Design System

### 6.1 Palette Colori

**Tema Dark (predefinito):**
```
Background:    #0A0A0F (quasi nero con tinta blu)
Surface:       #12121A (card background)
Surface-2:     #1A1A26 (elevated)
Border:        #252535
Primary:       #7C3AED (viola - brand)
Primary-light: #A855F7
Accent:        #06B6D4 (cyan)
Success:       #10B981 (verde)
Warning:       #F59E0B (ambra)
Danger:        #EF4444 (rosso)
Text-primary:  #F1F5F9
Text-secondary:#94A3B8
```

**Status Colors (kanban colonne):**
```
TODO:             #64748B (slate)
IN_PROGRESS:      #3B82F6 (blu)
REVIEW:           #F59E0B (ambra)
EXTERNAL_REVIEW:  #8B5CF6 (viola)
REFINEMENT:       #06B6D4 (cyan)
DONE:             #10B981 (verde)
```

### 6.2 Tipografia

```
Font UI:      Inter (Google Fonts)
Font Heading: Cal Sans o Bricolage Grotesque (carattere)
Font Mono:    JetBrains Mono (stats, code)
```

### 6.3 Componenti UI Chiave

- **Cards:** Border gradient, subtle glow on hover, glassmorphism leggero
- **Progress bars:** Animated, gradient fill
- **Badges:** Pill shape, colori vividi
- **Kanban cards:** Shadow elevata, hover transform scale
- **Charts:** Dark theme, colori brand
- **Modali:** Backdrop blur, slide-in animation

---

## 7. GitHub Actions Workflows

### 7.1 Deploy (CI/CD)

```yaml
# .github/workflows/deploy.yml
Trigger: push on master
Steps:
  1. Checkout
  2. Setup Node.js 20
  3. pnpm install
  4. pnpm build
  5. Deploy to GitHub Pages (actions/deploy-pages)
```

### 7.2 AI Analysis

```yaml
# .github/workflows/ai-analysis.yml
Trigger: workflow_dispatch (input: chapter_id o "all")
Secrets: ANTHROPIC_API_KEY, GITHUB_TOKEN (automatico)
Steps:
  1. Checkout branch data
  2. Leggi chapters.json
  3. Per ogni capitolo selezionato:
     a. Leggi file markdown capitolo (se presente)
     b. Chiama Claude API con prompt analisi
     c. Scrivi JSON risultato in data/analysis/
  4. Commit e push risultati
  5. Notifica (opzionale: GitHub issue comment)
```

**Prompt Template AI Analysis:**
```
Sei un editor letterario esperto. Analizza il seguente capitolo del libro e fornisci:

1. PUNTEGGI (scala 1-10):
   - Stile narrativo
   - Chiarezza ed efficacia
   - Ritmo e pacing
   - Sviluppo personaggi
   - Coerenza trama
   - Originalità

2. SINTESI (max 200 parole)

3. PUNTI DI FORZA (lista 3-5)

4. AREE DI MIGLIORAMENTO (lista 3-5)

5. SUGGERIMENTI SPECIFICI (lista numerata)

6. CORREZIONI (formato: originale | corretto | tipo | nota)

Rispondi SOLO in JSON con questa struttura: {scores: {...}, summary: "...",
strengths: [...], weaknesses: [...], suggestions: [...], corrections: [...]}

--- CAPITOLO ---
{chapter_text}
```

---

## 8. Configurazione GitHub

### 8.1 GitHub OAuth App

Creare su: https://github.com/settings/developers
```
Application name: Book Dashboard
Homepage URL: https://{username}.github.io/book-personal/
Authorization callback URL: NON NECESSARIO (Device Flow)
```

Il `Client ID` (pubblico) va in `src/utils/constants.ts`.
Il `Client Secret` NON viene mai usato con Device Flow (non necessario).

### 8.2 Repository Settings

- **Pages:** Source = GitHub Actions
- **Secrets:** `ANTHROPIC_API_KEY`
- **Branch protection:** Nessuna (repo personale)
- **Topics:** `book`, `writing`, `dashboard`, `personal`

### 8.3 Data Branch Setup

```bash
git checkout --orphan data
git rm -rf .
echo '[]' > chapters.json
echo '{}' > book-settings.json
echo '[]' > book-stats-history.json
mkdir analysis
git add .
git commit -m "data: initialize data branch"
git push origin data
```

---

## 9. Sicurezza

- **Nessuna secret nel codice sorgente:** Client ID GitHub è pubblico (necessario per Device Flow)
- **ANTHROPIC_API_KEY:** Solo in GitHub Actions Secrets, mai esposta al frontend
- **Token utente:** Solo in localStorage, mai inviato a terze parti
- **CORS:** Le API GitHub supportano CORS per browser, nessun problema
- **CSP:** Header configurati nel deploy workflow
- **Rate limiting:** GitHub API: 5000 req/h con token autenticato (più che sufficiente)

---

## 10. Performance

- **Bundle size target:** < 500KB gzipped
- **Code splitting:** Route-based lazy loading
- **Dati:** Cached in Zustand store, refresh su focus finestra
- **Immagini:** WebP, lazy loading
- **Fonts:** Preload, `font-display: swap`
- **GitHub API:** Batch requests dove possibile, cache con etag

---

## 11. Accessibilità

- **WCAG 2.1 AA** come target minimo
- Keyboard navigation completa (kanban drag via keyboard con dnd-kit)
- ARIA labels su tutti i componenti interattivi
- Focus visible con ring colorato
- Contrasto colori verificato

---

## 12. Estensioni Future (Post-MVP)

- **Pomodoro timer** integrato per sessioni di scrittura
- **Export PDF** del libro o di singoli capitoli
- **Sync Obsidian/Notion** per chi scrive lì
- **Backup automatico** capitoli via GitHub Actions
- **Co-autori** (multi-user, branch separati)
- **Template capitoli** per diversi generi
- **Readability score** (Flesch-Kincaid in italiano)
- **Plagiarism check** light
- **Cover generator** con AI per prove di copertina
- **Query letter assistant** per la sottomissione a editori
- **Glossario personaggi/luoghi** con network graph
