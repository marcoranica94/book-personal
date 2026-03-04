// GitHub repo (usato solo per riferimenti ai file capitoli .md)
export const GITHUB_REPO_OWNER = import.meta.env.VITE_GITHUB_REPO_OWNER ?? ''
export const GITHUB_REPO_NAME = import.meta.env.VITE_GITHUB_REPO_NAME ?? 'book-personal'

// Google Drive OAuth
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? ''
export const DRIVE_ENCRYPTION_KEY_B64 = import.meta.env.VITE_DRIVE_ENCRYPTION_KEY ?? ''

export const KANBAN_COLUMNS_ORDER = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'EXTERNAL_REVIEW',
  'REFINEMENT',
  'DONE',
] as const
