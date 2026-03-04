// GitHub repo (usato solo per riferimenti ai file capitoli .md)
export const GITHUB_REPO_OWNER = import.meta.env.VITE_GITHUB_REPO_OWNER ?? ''
export const GITHUB_REPO_NAME = import.meta.env.VITE_GITHUB_REPO_NAME ?? 'book-personal'

export const KANBAN_COLUMNS_ORDER = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'EXTERNAL_REVIEW',
  'REFINEMENT',
  'DONE',
] as const
