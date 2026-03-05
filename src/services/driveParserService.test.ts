import {describe, expect, it} from 'vitest'
import type {DriveFile} from '@/types'
import {ChapterStatus, Priority} from '@/types'
import {chapterToFilename, injectFrontmatter, parseDriveFileToChapter, parseFilename, parseYamlFrontmatter,} from './driveParserService'

// ─── parseYamlFrontmatter ─────────────────────────────────────────────────────

describe('parseYamlFrontmatter', () => {
  it('nessun frontmatter — restituisce body intero', () => {
    const content = 'Solo testo del capitolo'
    const {meta, body} = parseYamlFrontmatter(content)
    expect(meta).toEqual({})
    expect(body).toBe(content)
  })

  it('frontmatter incompleto senza chiusura --- restituisce body intero', () => {
    const content = '---\ntitle: Test\n'
    const {meta, body} = parseYamlFrontmatter(content)
    expect(meta).toEqual({})
    expect(body).toBe(content)
  })

  it('parsa tutti i campi standard', () => {
    const content = `---
number: 3
title: "Il Risveglio"
status: IN_PROGRESS
priority: alta
tags: [azione, protagonista]
targetChars: 12000
synopsis: "Una sinossi di prova"
notes: "Note interne"
---
Testo del capitolo.`
    const {meta, body} = parseYamlFrontmatter(content)
    expect(meta.number).toBe(3)
    expect(meta.title).toBe('Il Risveglio')
    expect(meta.status).toBe(ChapterStatus.IN_PROGRESS)
    expect(meta.priority).toBe(Priority.HIGH)
    expect(meta.tags).toEqual(['azione', 'protagonista'])
    expect(meta.targetChars).toBe(12000)
    expect(meta.synopsis).toBe('Una sinossi di prova')
    expect(meta.notes).toBe('Note interne')
    expect(body).toBe('Testo del capitolo.')
  })

  it('status case insensitive e alias', () => {
    const mk = (s: string) => `---\nstatus: ${s}\n---\n`
    expect(parseYamlFrontmatter(mk('todo')).meta.status).toBe(ChapterStatus.TODO)
    expect(parseYamlFrontmatter(mk('WIP')).meta.status).toBe(ChapterStatus.IN_PROGRESS)
    expect(parseYamlFrontmatter(mk('done')).meta.status).toBe(ChapterStatus.DONE)
    expect(parseYamlFrontmatter(mk('beta')).meta.status).toBe(ChapterStatus.EXTERNAL_REVIEW)
    expect(parseYamlFrontmatter(mk('polish')).meta.status).toBe(ChapterStatus.REFINEMENT)
  })

  it('priority alias italiano', () => {
    const mk = (p: string) => `---\npriority: ${p}\n---\n`
    expect(parseYamlFrontmatter(mk('bassa')).meta.priority).toBe(Priority.LOW)
    expect(parseYamlFrontmatter(mk('media')).meta.priority).toBe(Priority.MEDIUM)
    expect(parseYamlFrontmatter(mk('urgente')).meta.priority).toBe(Priority.URGENT)
  })

  it('tags come array inline', () => {
    const {meta} = parseYamlFrontmatter('---\ntags: [a, b, c]\n---\n')
    expect(meta.tags).toEqual(['a', 'b', 'c'])
  })

  it('tag singolo come stringa', () => {
    const {meta} = parseYamlFrontmatter('---\ntags: azione\n---\n')
    expect(meta.tags).toEqual(['azione'])
  })

  it('body viene estratto correttamente', () => {
    const {body} = parseYamlFrontmatter('---\ntitle: T\n---\nRiga 1\nRiga 2\n')
    expect(body).toBe('Riga 1\nRiga 2\n')
  })

  it('status sconosciuto viene ignorato', () => {
    const {meta} = parseYamlFrontmatter('---\nstatus: inventato\n---\n')
    expect(meta.status).toBeUndefined()
  })
})

// ─── parseFilename ────────────────────────────────────────────────────────────

describe('parseFilename', () => {
  it('pattern [STATUS] Capitolo N - Titolo.md', () => {
    const {status, title} = parseFilename('[IN_PROGRESS] Capitolo 3 - Il Risveglio.md')
    expect(status).toBe(ChapterStatus.IN_PROGRESS)
    expect(title).toContain('Risveglio')
  })

  it('pattern 01 - Titolo.md', () => {
    const {number, title} = parseFilename('01 - Titolo capitolo.md')
    expect(number).toBe(1)
    expect(title).toBe('Titolo capitolo')
  })

  it('pattern 3. Titolo.md', () => {
    const {number, title} = parseFilename('3. Il capitolo.md')
    expect(number).toBe(3)
    expect(title).toBe('Il capitolo')
  })

  it('solo numero', () => {
    expect(parseFilename('05.md').number).toBe(5)
  })

  it('nessun pattern — title e il basename', () => {
    const {number, title} = parseFilename('capitolo-speciale.md')
    expect(number).toBeUndefined()
    expect(title).toBe('capitolo-speciale')
  })

  it('rimuove estensione .txt', () => {
    const {number} = parseFilename('01 - Test.txt')
    expect(number).toBe(1)
  })
})

// ─── injectFrontmatter ────────────────────────────────────────────────────────

describe('injectFrontmatter', () => {
  it('genera frontmatter con i campi forniti', () => {
    const result = injectFrontmatter('Corpo del testo', {
      number: 1,
      title: 'Primo capitolo',
      status: ChapterStatus.TODO,
      priority: Priority.MEDIUM,
      tags: ['azione'],
      targetChars: 9000,
    })
    expect(result).toContain('---')
    expect(result).toContain('number: 1')
    expect(result).toContain('title: "Primo capitolo"')
    expect(result).toContain('status: TODO')
    expect(result).toContain('priority: MEDIUM')
    expect(result).toContain('tags: [azione]')
    expect(result).toContain('targetChars: 9000')
    expect(result).toContain('Corpo del testo')
  })

  it('il body appare dopo il blocco frontmatter', () => {
    const result = injectFrontmatter('Testo', {title: 'T'})
    const closingDash = result.indexOf('---', 3)
    const bodyStart = result.indexOf('Testo')
    expect(bodyStart).toBeGreaterThan(closingDash)
  })

  it('campo assente non appare nel frontmatter', () => {
    const result = injectFrontmatter('T', {title: 'X'})
    expect(result).not.toContain('number:')
    expect(result).not.toContain('tags:')
  })

  it('tags multipli', () => {
    const result = injectFrontmatter('', {tags: ['a', 'b', 'c']})
    expect(result).toContain('tags: [a, b, c]')
  })
})

// ─── chapterToFilename ────────────────────────────────────────────────────────

describe('chapterToFilename', () => {
  it('numero paddato a 2 cifre', () => {
    expect(chapterToFilename({number: 3, title: 'Test'})).toBe('03 - Test.md')
  })
  it('numero 10+', () => {
    expect(chapterToFilename({number: 12, title: 'Lungo titolo'})).toBe('12 - Lungo titolo.md')
  })
  it('rimuove caratteri non validi senza spazio sostitutivo', () => {
    // I caratteri <, >, :, ", /, \, |, ?, * vengono rimossi (non sostituiti)
    expect(chapterToFilename({number: 1, title: 'Titolo: con/slash?'})).toBe('01 - Titolo conslash.md')
  })
  it('fallback se title mancante', () => {
    expect(chapterToFilename({number: 1})).toBe('01 - capitolo.md')
  })
  it('fallback se number mancante', () => {
    expect(chapterToFilename({title: 'Test'})).toBe('00 - Test.md')
  })
})

// ─── parseDriveFileToChapter ──────────────────────────────────────────────────

describe('parseDriveFileToChapter', () => {
  const mockFile: DriveFile = {
    id: 'file-123',
    name: '02 - Il viaggio.md',
    mimeType: 'text/markdown',
    modifiedTime: '2024-01-01T00:00:00Z',
    webViewLink: 'https://drive.google.com/file/123',
    size: '1024',
  }

  it('usa frontmatter con priorita su filename', () => {
    const content = `---
number: 5
title: "Titolo da frontmatter"
status: DONE
---
Corpo capitolo`
    const result = parseDriveFileToChapter(content, mockFile)
    expect(result.number).toBe(5)
    expect(result.title).toBe('Titolo da frontmatter')
    expect(result.status).toBe(ChapterStatus.DONE)
    expect(result.driveBody).toBe('Corpo capitolo')
  })

  it('fallback al filename se frontmatter assente', () => {
    const result = parseDriveFileToChapter('Corpo capitolo', mockFile)
    expect(result.number).toBe(2)
    expect(result.title).toBe('Il viaggio')
    expect(result.driveBody).toBe('Corpo capitolo')
  })

  it('conta caratteri e parole del corpo', () => {
    const result = parseDriveFileToChapter('Una due tre', mockFile)
    expect(result.currentChars).toBe(11)
    expect(result.wordCount).toBe(3)
  })

  it('defaults sensati', () => {
    const result = parseDriveFileToChapter('', mockFile)
    expect(result.targetChars).toBe(9000)
    expect(result.priority).toBe(Priority.MEDIUM)
    expect(result.tags).toEqual([])
    expect(result.checklist).toEqual([])
    expect(result.dueDate).toBeNull()
  })
})
