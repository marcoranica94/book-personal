import '@testing-library/jest-dom'
import {vi} from 'vitest'

// Mock Firebase — non disponibile nel test environment
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: {},
}))

// Mock uuid per output deterministico nei test
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}))
