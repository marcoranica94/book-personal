import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {EditorContent, Extension, useEditor} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import {Plugin, PluginKey, type EditorState, type EditorStateConfig, type Transaction} from '@tiptap/pm/state'
import {Decoration, DecorationSet} from '@tiptap/pm/view'
import type {Node as PMNode} from '@tiptap/pm/model'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Search,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from 'lucide-react'
import {cn} from '@/utils/cn'

// ─── Inline correction types ───────────────────────────────────────────────────

export interface InlineCorrection {
  index: number
  original: string
  suggested: string
  type: string
  note?: string
}

// ─── ProseMirror plugin for correction highlights ──────────────────────────────

const CORRECTION_PLUGIN_KEY = new PluginKey<DecorationSet>('correctionHighlights')

function buildCorrectionDecorations(
  doc: PMNode,
  corrections: InlineCorrection[],
  accepted: Set<number>,
  rejected: Set<number>,
  focused: number | null,
): DecorationSet {
  if (!corrections.length) return DecorationSet.empty
  const decorations: Decoration[] = []

  doc.descendants((node: PMNode, pos: number) => {
    if (!node.isText || !node.text) return
    for (const corr of corrections) {
      let searchFrom = 0
      while (searchFrom < node.text!.length) {
        const idx = node.text!.indexOf(corr.original, searchFrom)
        if (idx === -1) break
        const from = pos + idx
        const to = from + corr.original.length
        const isAccepted = accepted.has(corr.index)
        const isRejected = rejected.has(corr.index)
        const isFocused = focused === corr.index
        const base = isAccepted
          ? 'corr-accepted'
          : isRejected
          ? 'corr-rejected'
          : `corr-pending corr-type-${corr.type}`
        decorations.push(
          Decoration.inline(from, to, {
            class: isFocused ? `${base} corr-focused` : base,
            'data-corr-idx': String(corr.index),
          }),
        )
        searchFrom = idx + corr.original.length
      }
    }
  })

  return DecorationSet.create(doc, decorations)
}

// ─── Correction tooltip ────────────────────────────────────────────────────────

const CORRECTION_TYPE_LABELS: Record<string, string> = {
  grammar: 'Grammatica',
  style: 'Stile',
  clarity: 'Chiarezza',
  continuity: 'Continuità',
}

const CORRECTION_TYPE_COLORS: Record<string, string> = {
  grammar: 'text-red-400 border-red-800/30 bg-red-900/20',
  style: 'text-violet-400 border-violet-800/30 bg-violet-900/20',
  clarity: 'text-blue-400 border-blue-800/30 bg-blue-900/20',
  continuity: 'text-amber-400 border-amber-800/30 bg-amber-900/20',
}

function CorrectionTooltip({
  correction,
  x,
  y,
  isAccepted,
  isRejected,
  onAccept,
  onReject,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  correction: InlineCorrection
  x: number
  y: number
  isAccepted: boolean
  isRejected: boolean
  onAccept: () => void
  onReject: () => void
  onClose: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [adjustedY, setAdjustedY] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    const h = ref.current.offsetHeight
    const spaceBelow = window.innerHeight - (y + 8)
    setAdjustedY(spaceBelow < h ? Math.max(8, y - h - 8) : y + 8)
  }, [y])

  const safeX = Math.min(Math.max(8, x), window.innerWidth - 296)
  const typeColor = CORRECTION_TYPE_COLORS[correction.type] ?? 'text-slate-400 border-slate-700 bg-slate-800/20'
  const typeLabel = CORRECTION_TYPE_LABELS[correction.type] ?? correction.type

  return (
    <div
      ref={ref}
      className={cn(
        'corr-tooltip fixed z-[200] w-72 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl p-3 space-y-2.5 transition-opacity duration-100',
        adjustedY === null ? 'opacity-0' : 'opacity-100',
      )}
      style={{left: safeX, top: adjustedY ?? y + 8}}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between">
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', typeColor)}>
          {typeLabel}
        </span>
        <button onClick={onClose} className="rounded p-0.5 text-slate-600 hover:text-slate-400 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="mb-1 text-slate-600">Originale</p>
          <p className="rounded-lg bg-red-950/30 px-2 py-1.5 text-slate-400 line-through leading-relaxed">{correction.original}</p>
        </div>
        <div>
          <p className="mb-1 text-slate-600">Suggerito</p>
          <p className="rounded-lg bg-emerald-950/30 px-2 py-1.5 text-emerald-300 leading-relaxed">{correction.suggested}</p>
        </div>
      </div>

      {correction.note && (
        <p className="text-xs text-slate-600 italic leading-relaxed">{correction.note}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { onAccept(); onClose() }}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
            isAccepted
              ? 'bg-emerald-600 text-white'
              : 'border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/30',
          )}
        >
          <CheckCheck className="h-3 w-3" />
          {isAccepted ? 'Accettata' : 'Accetta'}
        </button>
        <button
          onClick={() => { onReject(); onClose() }}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
            isRejected
              ? 'bg-red-700 text-white'
              : 'border border-red-800/40 text-red-400 hover:bg-red-900/30',
          )}
        >
          <X className="h-3 w-3" />
          {isRejected ? 'Rifiutata' : 'Rifiuta'}
        </button>
      </div>
    </div>
  )
}

// ─── Text conversion helpers ───────────────────────────────────────────────────

/** Converte testo puro / markdown base → HTML per Tiptap */
function textToHtml(text: string): string {
  if (!text) return ''
  if (/<(p|h[1-6]|ul|ol|li|blockquote|div|br)\b/i.test(text)) return text
  return text
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim()
      if (!trimmed) return ''
      const h3 = trimmed.match(/^###\s+(.+)/)
      if (h3) return `<h3>${inlineMarkdown(h3[1])}</h3>`
      const h2 = trimmed.match(/^##\s+(.+)/)
      if (h2) return `<h2>${inlineMarkdown(h2[1])}</h2>`
      const h1 = trimmed.match(/^#\s+(.+)/)
      if (h1) return `<h1>${inlineMarkdown(h1[1])}</h1>`
      if (trimmed.startsWith('> ')) {
        return `<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`
      }
      const lines = trimmed.split(/\n/).map(inlineMarkdown).join('<br/>')
      return `<p>${lines}</p>`
    })
    .filter(Boolean)
    .join('')
}

/** Applica formattazione inline markdown */
function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

/** Estrae testo puro dall'HTML di Tiptap */
function htmlToPlainText(html: string): string {
  if (!html) return ''
  if (!/<[a-z][\s\S]*>/i.test(html)) return html
  return html
    .replace(/<\/(p|h[1-6]|blockquote|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Toolbar helpers ───────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        isActive
          ? 'bg-violet-600/30 text-violet-300'
          : 'text-slate-500 hover:bg-white/[0.07] hover:text-slate-300',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-white/[0.08]" />
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  /** Correzioni AI da evidenziare nel testo */
  inlineCorrections?: InlineCorrection[]
  acceptedCorrections?: Set<number>
  rejectedCorrections?: Set<number>
  focusedCorrection?: number | null
  onAcceptInline?: (idx: number) => void
  onRejectInline?: (idx: number) => void
}

// ─── CSS for correction decorations (injected once) ───────────────────────────

const CORRECTION_STYLES = `
  .corr-pending { cursor: pointer; border-radius: 2px; }
  .corr-type-grammar  { border-bottom: 2px solid rgba(239,68,68,0.7);  background: rgba(239,68,68,0.08); }
  .corr-type-style    { border-bottom: 2px solid rgba(139,92,246,0.7); background: rgba(139,92,246,0.08); }
  .corr-type-clarity  { border-bottom: 2px solid rgba(59,130,246,0.7); background: rgba(59,130,246,0.08); }
  .corr-type-continuity { border-bottom: 2px solid rgba(245,158,11,0.7); background: rgba(245,158,11,0.08); }
  .corr-pending:not([class*="corr-type-"]) { border-bottom: 2px solid rgba(100,116,139,0.7); background: rgba(100,116,139,0.08); }
  .corr-accepted { border-bottom: 2px solid rgba(16,185,129,0.7); background: rgba(16,185,129,0.08); cursor: pointer; border-radius: 2px; }
  .corr-rejected { opacity: 0.45; text-decoration: line-through; cursor: pointer; }
  .corr-focused  { box-shadow: 0 0 0 2px rgba(139,92,246,0.6); border-radius: 2px; }
  .corr-pending:hover, .corr-accepted:hover { filter: brightness(1.2); }
  .search-match { background: rgba(251,191,36,0.25); border-radius: 2px; }
  .search-match-current { background: rgba(251,191,36,0.65); border-radius: 2px; outline: 2px solid rgba(251,191,36,0.8); }
`

// ─── Search plugin ─────────────────────────────────────────────────────────────

const SEARCH_PLUGIN_KEY = new PluginKey<DecorationSet>('searchHighlights')

function buildSearchDecorations(
  doc: PMNode,
  query: string,
  currentIdx: number,
): {decorations: DecorationSet; positions: [number, number][]} {
  if (!query) return {decorations: DecorationSet.empty, positions: []}
  const positions: [number, number][] = []
  const decorations: Decoration[] = []
  const lower = query.toLowerCase()

  doc.descendants((node: PMNode, pos: number) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLowerCase()
    let from = 0
    while (from < text.length) {
      const idx = text.indexOf(lower, from)
      if (idx === -1) break
      positions.push([pos + idx, pos + idx + query.length])
      from = idx + 1
    }
  })

  positions.forEach(([start, end], i) => {
    decorations.push(
      Decoration.inline(start, end, {
        class: i === currentIdx ? 'search-match search-match-current' : 'search-match',
      }),
    )
  })

  return {decorations: DecorationSet.create(doc, decorations), positions}
}

let stylesInjected = false
function injectCorrectionStyles() {
  if (stylesInjected) return
  const style = document.createElement('style')
  style.textContent = CORRECTION_STYLES
  document.head.appendChild(style)
  stylesInjected = true
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Inizia a scrivere...',
  readOnly = false,
  className,
  isFullscreen = false,
  onToggleFullscreen = () => {},
  inlineCorrections,
  acceptedCorrections,
  rejectedCorrections,
  focusedCorrection = null,
  onAcceptInline,
  onRejectInline,
}: RichTextEditorProps) {
  // Inject correction CSS once
  useEffect(() => { injectCorrectionStyles() }, [])

  // Refs to pass correction data into the ProseMirror plugin
  const correctionsRef = useRef<InlineCorrection[]>([])
  const acceptedRef = useRef<Set<number>>(new Set())
  const rejectedRef = useRef<Set<number>>(new Set())
  const focusedRef = useRef<number | null>(null)

  // Search state
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCurrentIdx, setSearchCurrentIdx] = useState(0)
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const searchQueryRef = useRef('')
  const searchCurrentIdxRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{corrIdx: number; x: number; y: number} | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setTooltip(null), 120)
  }

  function cancelClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  // Escape fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleFullscreen()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen, onToggleFullscreen])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {levels: [1, 2, 3]},
        bulletList: {keepMarks: true},
        orderedList: {keepMarks: true},
      }),
      Underline,
      Highlight.configure({multicolor: false}),
      TextAlign.configure({types: ['heading', 'paragraph']}),
      Placeholder.configure({placeholder}),
      CharacterCount,
      // Search highlight plugin
      Extension.create({
        name: 'searchHighlights',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: SEARCH_PLUGIN_KEY,
              state: {
                init(_: EditorStateConfig, __: EditorState) {
                  return DecorationSet.empty
                },
                apply(tr: Transaction, old: DecorationSet, _: EditorState, newState: EditorState) {
                  if (tr.docChanged || tr.getMeta(SEARCH_PLUGIN_KEY)) {
                    const {decorations} = buildSearchDecorations(
                      newState.doc,
                      searchQueryRef.current,
                      searchCurrentIdxRef.current,
                    )
                    return decorations
                  }
                  return old.map(tr.mapping, newState.doc)
                },
              },
              props: {
                decorations(state) {
                  return SEARCH_PLUGIN_KEY.getState(state)
                },
              },
            }),
          ]
        },
      }),
      // Correction highlight plugin
      Extension.create({
        name: 'correctionHighlights',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: CORRECTION_PLUGIN_KEY,
              state: {
                init(_: EditorStateConfig, {doc}: EditorState) {
                  return buildCorrectionDecorations(
                    doc,
                    correctionsRef.current,
                    acceptedRef.current,
                    rejectedRef.current,
                    focusedRef.current,
                  )
                },
                apply(tr: Transaction, old: DecorationSet, _: EditorState, newState: EditorState) {
                  if (tr.docChanged || tr.getMeta(CORRECTION_PLUGIN_KEY)) {
                    return buildCorrectionDecorations(
                      newState.doc,
                      correctionsRef.current,
                      acceptedRef.current,
                      rejectedRef.current,
                      focusedRef.current,
                    )
                  }
                  return old.map(tr.mapping, newState.doc)
                },
              },
              props: {
                decorations(state) {
                  return CORRECTION_PLUGIN_KEY.getState(state)
                },
              },
            }),
          ]
        },
      }),
    ],
    content: textToHtml(content),
    editable: !readOnly,
    onUpdate: ({editor: ed}) => {
      isLocalUpdateRef.current = true
      onChange(htmlToPlainText(ed.getHTML()))
      // Reset il flag dopo che React ha processato l'update
      setTimeout(() => { isLocalUpdateRef.current = false }, 0)
    },
    editorProps: {
      attributes: {class: 'rich-editor-content'},
    },
  })

  // Update refs & dispatch re-render whenever correction data changes
  useEffect(() => {
    correctionsRef.current = inlineCorrections ?? []
    acceptedRef.current = acceptedCorrections ?? new Set()
    rejectedRef.current = rejectedCorrections ?? new Set()
    focusedRef.current = focusedCorrection ?? null
    if (editor?.view) {
      editor.view.dispatch(editor.view.state.tr.setMeta(CORRECTION_PLUGIN_KEY, true))
    }
  }, [inlineCorrections, acceptedCorrections, rejectedCorrections, focusedCorrection, editor])

  // Scroll editor to focused correction
  useEffect(() => {
    if (focusedCorrection == null || !editor?.view) return
    const el = editor.view.dom.querySelector(`[data-corr-idx="${focusedCorrection}"]`)
    el?.scrollIntoView({behavior: 'smooth', block: 'center'})
  }, [focusedCorrection, editor])

  // Update search decorations when query or current index changes
  useEffect(() => {
    searchQueryRef.current = searchQuery
    searchCurrentIdxRef.current = searchCurrentIdx
    if (!editor?.view) return
    const {positions} = buildSearchDecorations(editor.view.state.doc, searchQuery, searchCurrentIdx)
    setSearchMatchCount(positions.length)
    editor.view.dispatch(editor.view.state.tr.setMeta(SEARCH_PLUGIN_KEY, true))
    // Scroll current match into view
    if (positions.length > 0 && searchCurrentIdx < positions.length) {
      const [from] = positions[searchCurrentIdx]
      const domPos = editor.view.domAtPos(from)
      domPos.node instanceof HTMLElement
        ? domPos.node.scrollIntoView({behavior: 'smooth', block: 'center'})
        : (domPos.node as Text).parentElement?.scrollIntoView({behavior: 'smooth', block: 'center'})
    }
  }, [searchQuery, searchCurrentIdx, editor])

  // Ctrl+F / Cmd+F to toggle search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchVisible((v) => {
          if (!v) setTimeout(() => searchInputRef.current?.focus(), 50)
          return !v
        })
      }
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [searchVisible])

  function navigateSearch(dir: 1 | -1) {
    if (searchMatchCount === 0) return
    setSearchCurrentIdx((prev) => (prev + dir + searchMatchCount) % searchMatchCount)
  }

  // Flag: ignora sync esterna se l'aggiornamento viene dall'editor stesso
  const isLocalUpdateRef = useRef(false)

  // Sync external content changes (e.g. reload from Drive)
  const setContent = useCallback(
    (newContent: string) => {
      if (!editor || isLocalUpdateRef.current) return
      const newHtml = textToHtml(newContent)
      const currentHtml = editor.getHTML()
      if (currentHtml !== newHtml) {
        editor.commands.setContent(newHtml, {emitUpdate: false})
      }
    },
    [editor],
  )

  useEffect(() => {
    setContent(content)
  }, [content, setContent])

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly)
  }, [readOnly, editor])

  if (!editor) return null

  const ic = 'h-4 w-4'

  // ─── Event handlers for inline correction tooltip ──────────────────────────

  function handleEditorMouseOver(e: React.MouseEvent) {
    if (!inlineCorrections?.length) return
    const target = e.target as HTMLElement
    const corrEl = target.closest('[data-corr-idx]') as HTMLElement | null
    if (!corrEl) {
      // Mouse moved to non-correction area — schedule close
      scheduleClose()
      return
    }
    cancelClose()
    const idx = Number(corrEl.getAttribute('data-corr-idx'))
    const rect = corrEl.getBoundingClientRect()
    setTooltip({corrIdx: idx, x: rect.left, y: rect.bottom})
  }

  function handleEditorMouseLeave(e: React.MouseEvent) {
    const related = e.relatedTarget as HTMLElement | null
    if (related?.closest('.corr-tooltip')) {
      cancelClose()
      return
    }
    scheduleClose()
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const toolbarContent = (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5">
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Annulla (Ctrl+Z)">
        <Undo2 className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Ripeti (Ctrl+Y)">
        <Redo2 className={ic} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()} isActive={editor.isActive('paragraph') && !editor.isActive('heading')} title="Paragrafo">
        <Pilcrow className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({level: 1}).run()} isActive={editor.isActive('heading', {level: 1})} title="Titolo 1">
        <Heading1 className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({level: 2}).run()} isActive={editor.isActive('heading', {level: 2})} title="Titolo 2">
        <Heading2 className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({level: 3}).run()} isActive={editor.isActive('heading', {level: 3})} title="Titolo 3">
        <Heading3 className={ic} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Grassetto (Ctrl+B)">
        <Bold className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Corsivo (Ctrl+I)">
        <Italic className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Sottolineato (Ctrl+U)">
        <UnderlineIcon className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Barrato">
        <Strikethrough className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Evidenzia">
        <Highlighter className={ic} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Elenco puntato">
        <List className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Elenco numerato">
        <ListOrdered className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Citazione">
        <Quote className={ic} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({textAlign: 'left'})} title="Allinea a sinistra">
        <AlignLeft className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({textAlign: 'center'})} title="Centra">
        <AlignCenter className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({textAlign: 'right'})} title="Allinea a destra">
        <AlignRight className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({textAlign: 'justify'})} title="Giustifica">
        <AlignJustify className={ic} />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linea orizzontale">
        <Minus className={ic} />
      </ToolbarButton>
      <div className="flex-1" />
      {inlineCorrections && inlineCorrections.length > 0 && (
        <span className="mr-2 rounded-full border border-violet-700/40 bg-violet-900/20 px-2 py-0.5 text-xs text-violet-400">
          {inlineCorrections.length} correzioni evidenziate
        </span>
      )}
      <ToolbarButton
        onClick={() => {
          setSearchVisible((v) => {
            if (!v) setTimeout(() => searchInputRef.current?.focus(), 50)
            else { setSearchQuery(''); setSearchMatchCount(0) }
            return !v
          })
        }}
        isActive={searchVisible}
        title="Cerca nel testo (Ctrl+F)"
      >
        <Search className={ic} />
      </ToolbarButton>
      <ToolbarButton onClick={onToggleFullscreen} title={isFullscreen ? 'Riduci (Esc)' : 'Espandi a tutto schermo'}>
        {isFullscreen ? <Minimize2 className={ic} /> : <Maximize2 className={ic} />}
      </ToolbarButton>
    </div>
  )

  const searchBar = searchVisible ? (
    <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5">
      <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <input
        ref={searchInputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => { setSearchQuery(e.target.value); setSearchCurrentIdx(0) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); navigateSearch(e.shiftKey ? -1 : 1) }
          if (e.key === 'Escape') { setSearchVisible(false); setSearchQuery('') }
        }}
        placeholder="Cerca..."
        className="flex-1 bg-transparent text-sm text-slate-300 outline-none placeholder:text-slate-600"
      />
      {searchQuery && (
        <span className="text-xs text-slate-500 tabular-nums">
          {searchMatchCount === 0 ? 'Nessun risultato' : `${searchCurrentIdx + 1}/${searchMatchCount}`}
        </span>
      )}
      <button onClick={() => navigateSearch(-1)} disabled={searchMatchCount === 0} className="rounded p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-30">
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => navigateSearch(1)} disabled={searchMatchCount === 0} className="rounded p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-30">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => { setSearchVisible(false); setSearchQuery('') }} className="rounded p-0.5 text-slate-500 hover:text-slate-300">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null

  const editorArea = (
    <div
      className="rich-editor-doc-bg flex-1 overflow-y-auto bg-[#1a1a2e]"
      onMouseOver={handleEditorMouseOver}
      onMouseLeave={handleEditorMouseLeave}
    >
      <div className="rich-editor-doc-page mx-auto max-w-[800px] min-h-[500px] bg-[#0f0f1a] my-6 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.4)] border border-white/[0.04] px-12 py-10">
        <EditorContent editor={editor} />
      </div>
    </div>
  )

  const statusBar = (
    <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2">
      <div className="flex gap-4 text-xs text-slate-600">
        <span>{editor.storage.characterCount.characters().toLocaleString('it-IT')} caratteri</span>
        <span>{editor.storage.characterCount.words().toLocaleString('it-IT')} parole</span>
      </div>
      <div className="text-xs text-slate-700">
        {isFullscreen ? 'Premi Esc per uscire' : 'Tiptap Editor'}
      </div>
    </div>
  )

  // ─── Tooltip rendering ─────────────────────────────────────────────────────
  const tooltipCorrection = tooltip != null
    ? inlineCorrections?.find((c) => c.index === tooltip.corrIdx) ?? null
    : null

  const tooltipEl = tooltipCorrection ? (
    <CorrectionTooltip
      correction={tooltipCorrection}
      x={tooltip!.x}
      y={tooltip!.y}
      isAccepted={acceptedCorrections?.has(tooltipCorrection.index) ?? false}
      isRejected={rejectedCorrections?.has(tooltipCorrection.index) ?? false}
      onAccept={() => onAcceptInline?.(tooltipCorrection.index)}
      onReject={() => onRejectInline?.(tooltipCorrection.index)}
      onClose={() => { cancelClose(); setTooltip(null) }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    />
  ) : null

  // ─── Fullscreen mode ───────────────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-base)]">
          {!readOnly && toolbarContent}
          {searchBar}
          {editorArea}
          {statusBar}
        </div>
        {tooltipEl}
      </>
    )
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden shadow-lg',
          className,
        )}
      >
        {!readOnly && toolbarContent}
        {searchBar}
        {editorArea}
        {statusBar}
      </div>
      {tooltipEl}
    </>
  )
}
