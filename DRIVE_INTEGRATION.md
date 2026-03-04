# DRIVE_INTEGRATION.md — Architettura Google Drive Integration

> Documento di progettazione completo per l'integrazione Google Drive.
> Creato: 2026-03-04 | Stato: **In implementazione**

---

## 1. VISIONE ARCHITETTURALE

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (SPA statica)                     │
│                                                             │
│  Dashboard ──► DriveOAuth ──► Google Drive API (CORS ok)   │
│      │                              │                       │
│      ▼                              ▼                       │
│  Firestore ◄──────────────── DriveSync Service             │
└─────────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
┌──────────────────┐    ┌─────────────────────────────┐
│  GitHub Actions  │    │    Google Drive API          │
│  (scheduled)     │    │    (files.list, files.get,   │
│  drive-sync.yml  │    │     files.update, files.watch)│
│  ai-review.yml   │    └─────────────────────────────┘
└──────────────────┘
```

**Principio chiave:** nessun server dedicato. Il browser chiama direttamente Google Drive API
(supporta CORS). Il sync automatico avviene via GitHub Actions scheduled (cron). Il refresh token
è salvato in Firestore sotto security rules (leggibile solo dall'utente autenticato), letto da
GitHub Actions via Admin SDK.

---

## 2. SCHEMA FIRESTORE ESTESO

### Nuova collezione: `/driveConfig/{userId}`
```typescript
{
  folderId: string              // ID cartella Drive selezionata
  folderName: string            // nome leggibile
  refreshToken: string          // Google OAuth refresh token (cifrato AES-256-GCM)
  accessToken: string           // cache access token (scade in 1h)
  accessTokenExpiresAt: string  // ISO8601
  connectedAt: string           // ISO8601
  lastSyncAt: string | null     // ultima sync completata
  syncEnabled: boolean          // kill switch sync automatica
  syncIntervalMinutes: number   // default 15
}
```

### Estensione `/chapters/{id}` (nuovi campi)
```typescript
{
  // ... campi esistenti ...

  // Drive integration
  driveFileId: string | null       // ID file su Google Drive
  driveFileName: string | null     // nome originale file
  driveMimeType: string | null     // es. text/markdown
  driveWebViewLink: string | null  // link per aprire su Drive

  // Sync state
  contentHash: string | null       // SHA-256 del contenuto (per rilevare cambiamenti)
  driveModifiedTime: string | null // RFC3339 da Drive API
  lastSyncAt: string | null        // ultima volta sincronizzato
  syncSource: 'drive' | 'dashboard' | 'ai' | 'manual'
  syncStatus: 'synced' | 'pending_push' | 'pending_pull' | 'conflict' | 'error' | 'not_linked'
  syncError: string | null         // messaggio errore ultimo tentativo

  // Content cache
  driveContent: string | null      // contenuto raw (cache, max 100KB)
  driveContentTruncated: boolean   // true se file > 100KB
}
```

### Nuova collezione: `/syncLog/{autoId}`
```typescript
{
  timestamp: string
  chapterId: string | null
  direction: 'drive_to_firebase' | 'firebase_to_drive' | 'conflict'
  action: 'created' | 'updated' | 'deleted' | 'skipped' | 'error'
  reason: string
  oldHash: string | null
  newHash: string | null
  triggeredBy: 'scheduler' | 'user' | 'ai_accept'
}
```

---

## 3. GOOGLE OAUTH — STRATEGIA TOKEN

### Flusso PKCE (SPA-safe, no client_secret)
```
1. Browser → google.accounts.oauth2.initCodeClient({scope: 'drive.file', ...PKCE})
2. Utente autorizza → Google restituisce authorization_code
3. Browser → scambia code per {access_token, refresh_token} via PKCE (no secret)
4. Cifra refresh_token con AES-256-GCM (crypto.subtle, key derivata da uid + ENCRYPTION_KEY)
5. Salva in Firestore /driveConfig/{uid}
6. GitHub Actions: Admin SDK legge token → decripta → usa per Drive API
```

### Scope necessari
- `https://www.googleapis.com/auth/drive.file` — solo file creati/aperti dall'app (**preferito**)

### Setup manuale richiesto (una tantum)
1. Google Cloud Console → nuovo progetto → abilita Drive API
2. Credenziali → OAuth2 Client ID (tipo: Web application)
3. Authorized redirect URIs: `https://marcoranica94.github.io/book-personal/`
4. Aggiungi `VITE_GOOGLE_CLIENT_ID` nel workflow deploy
5. Aggiungi `DRIVE_ENCRYPTION_KEY` nei GitHub Secrets

---

## 4. FLUSSI — DIAGRAMMI TESTUALI

### 4.1 Connessione Drive (una tantum)
```
Utente → Settings → "Connetti Google Drive"
    → popup Google OAuth (PKCE)
    → scambia code per tokens
    → cifra refresh_token
    → salva /driveConfig/{uid}
    → Google Picker API → seleziona cartella
    → salva folderId + folderName
    → driveService.initialScan() → crea chapters da file esistenti
```

### 4.2 Sync Drive → Firebase
```
Trigger: GitHub Actions cron (ogni 15 min) OPPURE "Sincronizza ora"
    → leggi /driveConfig → decripta token → ottieni access_token fresco
    → Drive API: files.list(folderId) → {id, name, md5, modifiedTime}
    → Per ogni file:
        ├─ NON in Firestore → leggi contenuto → parsa frontmatter/filename → crea chapter
        ├─ md5 DIVERSO da contentHash:
        │   ├─ syncSource='dashboard' E lastSyncAt < 60s → SKIP (anti-loop)
        │   ├─ syncSource='drive'/'synced' → pull → aggiorna Firestore
        │   └─ syncSource='dashboard' E lastSyncAt > 60s → CONFLICT
        └─ md5 UGUALE → nessuna azione
    → File in Firestore ma NON su Drive → syncStatus='error' (cancellato da Drive)
```

### 4.3 Sync Firebase → Drive
```
Trigger: utente modifica capitolo
    → chaptersStore.updateChapter() → syncStatus='pending_push', syncSource='dashboard'
    → debounce 3s → driveSyncService.pushToDrive(chapterId)
    → ottieni access_token fresco
    → inietta YAML frontmatter nel file con nuovi metadati
    → files.update(driveFileId, newContent)
    → aggiorna Firestore: contentHash, driveModifiedTime, syncStatus='synced', lastSyncAt=now
```

### 4.4 AI Review con Accept/Reject
```
Utente → AnalysisPage → seleziona capitolo → "Analizza"
    → leggi driveContent da Firestore (o fetch da Drive)
    → GitHub Actions: Claude API → analisi
    → UI: DiffEditor (originale ↔ modifiche AI)
    │
    ├─ ✅ Accetta → applica correzioni → updateChapter(content) → pushToDrive()
    ├─ ❌ Rifiuta → nessuna modifica → status → TODO
    └─ ✏️ Modifica manuale → editor markdown inline → salva → pushToDrive()
```

---

## 5. STRATEGIA ANTI-LOOP (5 layer)

| Layer | Meccanismo | Dettaglio |
|-------|-----------|-----------|
| 1 | **Content Hash** | Se SHA-256(newContent) == contentHash → SKIP |
| 2 | **syncSource + Time Window** | syncSource='dashboard' E now-lastSyncAt < 60s → skip pull |
| 3 | **driveModifiedTime** | Se Drive modifiedTime == stored → no change |
| 4 | **syncStatus Lock** | Se status='pending_*' → skip (operazione in corso) |
| 5 | **syncLog Dedup** | Se log recente (<30s) stesso chapterId + direzione → skip |

---

## 6. PARSING METADATI FILE

### YAML Frontmatter (priorità 1)
```markdown
---
status: IN_PROGRESS
priority: HIGH
tags: [azione, protagonista]
targetChars: 9000
---
Testo capitolo...
```

### Naming Convention (priorità 2)
```
[TODO] Capitolo 1.md
[IN_PROGRESS] Capitolo 2.md
[REVIEW] Capitolo 3.md
[DONE] Capitolo 4.md
Capitolo 5.md  → default: TODO
```

### Mapping status
```
todo/backlog/pending     → TODO
in_progress/wip/writing  → IN_PROGRESS
review/checking          → REVIEW
external/beta            → EXTERNAL_REVIEW
refinement/polish        → REFINEMENT
done/complete/published  → DONE
```

---

## 7. GESTIONE EDGE CASE

| Edge Case | Rilevamento | Comportamento |
|-----------|-------------|---------------|
| Token scaduto | HTTP 401 | Refresh automatico. Se refresh fallisce → `syncStatus='error'`, "Riconnetti Drive" |
| File cancellato su Drive | File non in lista Drive | `syncStatus='error'`. NON eliminare capitolo automaticamente, richiede conferma |
| Cartella eliminata | 404 su files.list | `syncEnabled=false`, notifica utente di riselezionare cartella |
| AI fallisce | Exception workflow | `analysis.status='error'`, capitolo invariato |
| Conflitto simultaneo | syncSource='dashboard' + Drive modificato esternamente | `syncStatus='conflict'`, UI mostra diff, utente sceglie |
| File > 10MB | Controlla size nei metadati Drive | Skip download, `driveContentTruncated=true`, warning in UI |
| Rate limit (429) | HTTP 429 da Drive API | Exponential backoff (1s, 2s, 4s), max 3 retry |
| File non markdown | mimeType check | `.md`, `.txt` → ok. Google Docs → esporta come text/plain. PDF/DOCX → ignora |
| Refresh token revocato | `error: invalid_grant` | Cancella /driveConfig, mostra "Riconnetti Google Drive" |
| Capitolo rinominato su Drive | driveFileName ≠ Firestore | Aggiorna solo driveFileName, non il titolo del capitolo |

---

## 8. STRUTTURA FILE NUOVI

```
src/services/
├── driveAuthService.ts      ← Google OAuth PKCE, token refresh, cifratura AES
├── driveFileService.ts      ← files.list/get/update/create/delete
├── driveSyncService.ts      ← orchestrazione sync + anti-loop
├── driveParserService.ts    ← YAML frontmatter + naming convention
└── driveConfigService.ts    ← CRUD /driveConfig Firestore

src/stores/
└── driveStore.ts            ← driveConfig, isConnected, isSyncing, lastSyncAt

src/components/drive/
├── DriveConnectButton.tsx   ← OAuth flow UI (connect/disconnect)
├── FolderPicker.tsx         ← Google Picker API
├── SyncStatusBadge.tsx      ← icona cloud con stato sync
├── ConflictResolver.tsx     ← diff UI per risolvere conflitti
└── DriveFilePreview.tsx     ← anteprima contenuto file

src/components/analysis/
├── DiffEditor.tsx           ← diff originale ↔ modifiche AI
└── AcceptRejectBar.tsx      ← toolbar accept/reject/edit manuale

scripts/
└── drive-sync.mjs           ← Node.js: Admin SDK + Drive API → sync automatico

.github/workflows/
└── drive-sync.yml           ← cron ogni 15 min + workflow_dispatch
```

---

## 9. ROADMAP

### EPIC A — Google Drive Auth & Config
**Obiettivo:** Connettere Google Drive, salvare token, scegliere cartella.

| Task | Descrizione |
|------|-------------|
| A1.1 | Google Cloud Project + Drive API + OAuth2 Client ID (setup manuale) |
| A1.2 | Aggiungere `VITE_GOOGLE_CLIENT_ID` e `DRIVE_ENCRYPTION_KEY` alle env vars |
| A1.3 | `driveAuthService.ts`: initiateOAuth, exchangeCode, refreshToken, encrypt/decrypt |
| A1.4 | `driveConfigService.ts`: saveDriveConfig, getDriveConfig, deleteDriveConfig |
| A1.5 | `driveStore.ts`: config, isConnected, isSyncing, lastSyncAt |
| A1.6 | `DriveConnectButton.tsx` in SettingsPage |
| A1.7 | `FolderPicker.tsx` con Google Picker API |

### EPIC B — Drive File Service & Parser
**Obiettivo:** Leggere/scrivere file Drive, parsare metadati.

| Task | Descrizione |
|------|-------------|
| B1.1 | `driveFileService.ts`: listFiles, getFileContent, updateFileContent, createFile |
| B1.2 | `driveParserService.ts`: parseYamlFrontmatter, parseFilenameConvention, injectFrontmatter |
| B1.3 | Unit test parser con vari formati file |

### EPIC C — Sync Engine
**Obiettivo:** Sync bidirezionale robusta con anti-loop.

| Task | Descrizione |
|------|-------------|
| C1.1 | Estendere schema Firestore capitoli (nuovi campi sync) |
| C1.2 | `driveSyncService.ts`: pullFromDrive, pushToDrive, fullSync, resolveConflict |
| C1.3 | Algoritmo anti-loop (tutti e 5 i layer) |
| C1.4 | `SyncStatusBadge.tsx` su KanbanCard e ChapterPage |
| C1.5 | `ConflictResolver.tsx` diff UI |
| C2.1 | `scripts/drive-sync.mjs` per GitHub Actions |
| C2.2 | `.github/workflows/drive-sync.yml` (cron 15 min) |
| C2.3 | Button "Sincronizza ora" in Settings |

### EPIC D — AI Review Enhanced
**Obiettivo:** Accept/reject modifiche AI con sync su Drive.

| Task | Descrizione |
|------|-------------|
| D1.1 | `DiffEditor.tsx`: diff colorato originale ↔ modifiche AI |
| D1.2 | `AcceptRejectBar.tsx`: accept all, reject, edit manuale |
| D1.3 | Editor markdown inline in AnalysisPage |
| D1.4 | Aggiornare `analyze-chapter.mjs` per usare driveContent da Firestore |
| D1.5 | Tracciamento accept/reject in /analyses/{id} |

### EPIC E — UX & Polish
**Obiettivo:** Esperienza completa gestione Drive.

| Task | Descrizione |
|------|-------------|
| E1.1 | Settings: sezione Google Drive con stato, statistiche, ultimo sync |
| E1.2 | ChapterPage: link "Apri su Drive" + "Forza sync" |
| E1.3 | AnalysisPage: "Contenuto aggiornato X min fa" + "Ricarica da Drive" |
| E1.4 | Toast contestuali per eventi sync |
| E1.5 | Pannello "File non collegati" con import |

---

## 10. SECURITY RULES AGGIORNATE

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /chapters/{docId} {
      allow read, write: if request.auth != null;
    }
    match /analyses/{docId} {
      allow read, write: if request.auth != null;
    }
    match /settings/{docId} {
      allow read, write: if request.auth != null;
    }
    match /statsHistory/{docId} {
      allow read, write: if request.auth != null;
    }
    match /syncLog/{docId} {
      allow read, write: if request.auth != null;
    }
    // driveConfig: SOLO il proprietario
    match /driveConfig/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 11. RISCHI TECNICI + MITIGAZIONI

| Rischio | Prob. | Impatto | Mitigazione |
|---------|-------|---------|-------------|
| Google OAuth PKCE su SPA | Alta | Alto | Usare PKCE flow (no client_secret). In alternativa: Firebase Cloud Function come proxy |
| Refresh token in Firestore | Media | Alto | Cifratura AES-256-GCM lato browser. Security rules `/driveConfig/{uid}` solo per owner |
| Rate limit Drive API (1000 req/100s) | Bassa | Media | Batch, caching, exponential backoff, sync ogni 15 min |
| GitHub Actions cron (consuma minuti) | Bassa | Bassa | 2000 min/mese gratuiti, sync ogni 15 min = ~2880 run/mese (ogni run ~10s = 480 min) |
| Conflitti simultanei | Media | Media | Conflict resolver UI, mai sovrascrivere silenziosamente |
| File Google Docs (non markdown) | Media | Media | Export come text/plain, supporto limitato |
| Refresh token revocato | Bassa | Alto | Graceful handling: "Riconnetti Drive", no crash |
| Due Actions parallele | Bassa | Media | `concurrency: group: drive-sync, cancel-in-progress: false` nel workflow |

---

## 12. STIMA EFFORT

| Epic | Giorni | Dipendenze |
|------|--------|------------|
| A — Auth & Config | 3-4 gg | Setup Google Cloud (manuale) |
| B — File Service & Parser | 2-3 gg | Epic A |
| C — Sync Engine | 5-6 gg | Epic B |
| D — AI Review Enhanced | 3-4 gg | Epic C |
| E — UX Polish | 2-3 gg | Epic D |
| **Totale** | **~17-20 gg** | |

**Ordine:** A → B → C → D → E (C e D parzialmente in parallelo dopo C1)
