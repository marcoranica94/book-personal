// GitHub OAuth App Client ID (public - safe to expose)
// Create at: https://github.com/settings/developers
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? ''

export const GITHUB_REPO_OWNER = import.meta.env.VITE_GITHUB_REPO_OWNER ?? ''
export const GITHUB_REPO_NAME = import.meta.env.VITE_GITHUB_REPO_NAME ?? 'book-personal'
export const GITHUB_DATA_BRANCH = 'data'

export const LS_TOKEN_KEY = 'book_dashboard_token'
export const LS_USER_KEY = 'book_dashboard_user'

export const GITHUB_API_BASE = 'https://api.github.com'
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export const KANBAN_COLUMNS_ORDER = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'EXTERNAL_REVIEW',
  'REFINEMENT',
  'DONE',
] as const
