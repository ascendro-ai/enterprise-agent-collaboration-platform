// Storage Keys
export const STORAGE_KEYS = {
  WORKFLOWS: 'workflows',
  CONVERSATIONS: 'conversations',
  TEAM: 'team',
  GMAIL_AUTH: 'gmail_auth',
  REQUIREMENTS: 'requirements',
  APP_STATE: 'app_state',
} as const

// Gemini API Configuration
export const GEMINI_CONFIG = {
  MODEL: 'gemini-3-flash-preview', // Using Gemini 3 Flash Preview for faster testing (lower latency, latest generation)
  IMAGE_MODEL: 'gemini-3-flash-preview', // Gemini 3 Flash Preview supports image generation with responseModalities
  MAX_QUESTIONS: 5,
  TEMPERATURE: 0.7,
} as const

// Workflow Configuration
export const WORKFLOW_CONFIG = {
  EXTRACTION_DEBOUNCE_MS: 500,
  DEFAULT_DIGITAL_WORKER_NAME: 'default',
} as const

// Control Room Event Types
export const CONTROL_ROOM_EVENT = 'controlRoomUpdate' as const
