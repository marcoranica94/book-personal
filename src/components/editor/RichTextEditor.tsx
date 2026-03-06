import {useCallback, useEffect} from 'react'
import {EditorContent, useEditor} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Bold,
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
    Strikethrough,
    Underline as UnderlineIcon,
    Undo2,
} from 'lucide-react'
import {cn} from '@/utils/cn'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

/** Converte testo puro / markdown base → HTML per Tiptap */
function textToHtml(text: string): string {
  if (!text) return ''
  // Se contiene già tag HTML block, restituisce direttamente
  if (/<(p|h[1-6]|ul|ol|li|blockquote|div|br)\b/i.test(text)) return text

  return text
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim()
      if (!trimmed) return ''

      // Titoli markdown: # ## ###
      const h3 = trimmed.match(/^###\s+(.+)/)
      if (h3) return `<h3>${inlineMarkdown(h3[1])}</h3>`
      const h2 = trimmed.match(/^##\s+(.+)/)
      if (h2) return `<h2>${inlineMarkdown(h2[1])}</h2>`
      const h1 = trimmed.match(/^#\s+(.+)/)
      if (h1) return `<h1>${inlineMarkdown(h1[1])}</h1>`

      // Citazione blockquote: >
      if (trimmed.startsWith('> ')) {
        return `<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`
      }

      // Paragrafo normale — mantieni gli a-capo singoli come <br>
      const lines = trimmed.split(/\n/).map(inlineMarkdown).join('<br/>')
      return `<p>${lines}</p>`
    })
    .filter(Boolean)
    .join('')
}

/** Applica formattazione inline markdown: **bold**, *italic*, ~~strike~~ */
function inlineMarkdown(text: string): string {
  return text
    // **grassetto** o __grassetto__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // *corsivo* o _corsivo_  (non dopo spazio+asterisco di bullet)
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
    // ~~barrato~~
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // `codice`
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

/** Estrae testo puro dall'HTML di Tiptap (per salvare su Drive/Firestore) */
function htmlToPlainText(html: string): string {
  if (!html) return ''
  // Se non contiene tag HTML, è già testo puro
  if (!/<[a-z][\s\S]*>/i.test(html)) return html

  return html
    // Blocchi che diventano paragrafi separati da doppia newline
    .replace(/<\/(p|h[1-6]|blockquote|li)>/gi, '\n\n')
    // <br> → a-capo singolo
    .replace(/<br\s*\/?>/gi, '\n')
    // Rimuovi tutti i tag rimanenti
    .replace(/<[^>]+>/g, '')
    // Decode entità HTML comuni
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Normalizza: max 2 newline consecutive, rimuovi spazi finali
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Inizia a scrivere...',
  readOnly = false,
  className,
  isFullscreen = false,
  onToggleFullscreen = () => {},
}: RichTextEditorProps) {
  // Escape per uscire dal fullscreen
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
    ],
    content: textToHtml(content),
    editable: !readOnly,
    onUpdate: ({editor: ed}) => {
      // Restituisce testo puro — compatibile con Drive/Firestore
      onChange(htmlToPlainText(ed.getHTML()))
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
    },
  })

  // Sync external content changes (e.g. reload from Drive)
  const setContent = useCallback(
    (newContent: string) => {
      if (!editor) return
      const newHtml = textToHtml(newContent)
      const currentHtml = editor.getHTML()
      // Confronta HTML con HTML per evitare loop infiniti
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
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [readOnly, editor])

  if (!editor) return null

  const ic = 'h-4 w-4' // icon class

  const toolbarContent = (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5">
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Annulla (Ctrl+Z)"
      >
        <Undo2 className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Ripeti (Ctrl+Y)"
      >
        <Redo2 className={ic} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setParagraph().run()}
        isActive={editor.isActive('paragraph') && !editor.isActive('heading')}
        title="Paragrafo"
      >
        <Pilcrow className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({level: 1}).run()}
        isActive={editor.isActive('heading', {level: 1})}
        title="Titolo 1"
      >
        <Heading1 className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({level: 2}).run()}
        isActive={editor.isActive('heading', {level: 2})}
        title="Titolo 2"
      >
        <Heading2 className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({level: 3}).run()}
        isActive={editor.isActive('heading', {level: 3})}
        title="Titolo 3"
      >
        <Heading3 className={ic} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Inline formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Grassetto (Ctrl+B)"
      >
        <Bold className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Corsivo (Ctrl+I)"
      >
        <Italic className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Sottolineato (Ctrl+U)"
      >
        <UnderlineIcon className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Barrato"
      >
        <Strikethrough className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title="Evidenzia"
      >
        <Highlighter className={ic} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Elenco puntato"
      >
        <List className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Elenco numerato"
      >
        <ListOrdered className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Citazione"
      >
        <Quote className={ic} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({textAlign: 'left'})}
        title="Allinea a sinistra"
      >
        <AlignLeft className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({textAlign: 'center'})}
        title="Centra"
      >
        <AlignCenter className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({textAlign: 'right'})}
        title="Allinea a destra"
      >
        <AlignRight className={ic} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        isActive={editor.isActive({textAlign: 'justify'})}
        title="Giustifica"
      >
        <AlignJustify className={ic} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Horizontal rule */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Linea orizzontale"
      >
        <Minus className={ic} />
      </ToolbarButton>

      {/* Spacer + Fullscreen toggle */}
      <div className="flex-1" />
      <ToolbarButton
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Riduci (Esc)' : 'Espandi a tutto schermo'}
      >
        {isFullscreen ? <Minimize2 className={ic} /> : <Maximize2 className={ic} />}
      </ToolbarButton>
    </div>
  )

  const editorArea = (
    <div className="rich-editor-doc-bg flex-1 overflow-y-auto bg-[#1a1a2e]">
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

  // ─── Fullscreen mode ───
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-base)]">
        {!readOnly && toolbarContent}
        {editorArea}
        {statusBar}
      </div>
    )
  }

  // ─── Inline mode ───
  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden shadow-lg',
        className,
      )}
    >
      {!readOnly && toolbarContent}
      {editorArea}
      {statusBar}
    </div>
  )
}

