import { STORAGE_KEYS } from './constants'
import type { Workflow, ConversationSession, NodeData, GmailAuthState, AppState } from '../types'

export const storage = {
  // Workflows
  getWorkflows: (): Workflow[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKFLOWS)
      if (!data) return []
      const workflows = JSON.parse(data)
      return workflows.map((w: Workflow) => ({
        ...w,
        createdAt: w.createdAt ? new Date(w.createdAt) : undefined,
        updatedAt: w.updatedAt ? new Date(w.updatedAt) : undefined,
      }))
    } catch {
      return []
    }
  },

  saveWorkflows: (workflows: Workflow[]): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKFLOWS, JSON.stringify(workflows))
    } catch (error) {
      console.error('Failed to save workflows:', error)
    }
  },

  // Conversations
  getConversations: (): ConversationSession[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
      if (!data) return []
      const sessions = JSON.parse(data)
      return sessions.map((s: ConversationSession) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        messages: s.messages.map((m) => ({
          ...m,
          timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
        })),
      }))
    } catch {
      return []
    }
  },

  saveConversations: (conversations: ConversationSession[]): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations))
    } catch (error) {
      console.error('Failed to save conversations:', error)
    }
  },

  // Team/Org Chart
  getTeam: (): NodeData[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TEAM)
      if (!data) return []
      return JSON.parse(data)
    } catch {
      return []
    }
  },

  saveTeam: (team: NodeData[]): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.TEAM, JSON.stringify(team))
    } catch (error) {
      console.error('Failed to save team:', error)
    }
  },

  // Gmail Auth
  getGmailAuth: (): GmailAuthState | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GMAIL_AUTH)
      if (!data) return null
      return JSON.parse(data)
    } catch {
      return null
    }
  },

  saveGmailAuth: (auth: GmailAuthState): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.GMAIL_AUTH, JSON.stringify(auth))
    } catch (error) {
      console.error('Failed to save Gmail auth:', error)
    }
  },

  // App State
  getAppState: (): AppState | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.APP_STATE)
      if (!data) return null
      return JSON.parse(data)
    } catch {
      return null
    }
  },

  saveAppState: (state: AppState): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.APP_STATE, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to save app state:', error)
    }
  },

  // Clear all data (for fresh start)
  clearAll: (): void => {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key)
    })
  },
}
