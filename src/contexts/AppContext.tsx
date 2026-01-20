import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { storage } from '../utils/storage'
import type { TabType, AppState } from '../types'

interface AppContextType {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  user: {
    name: string
    title: string
    avatar?: string
  }
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const defaultUser = {
  name: 'Chitra M.',
  title: 'CEO, Treasure Blossom',
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabType>('create-workflow')
  const [user] = useState(defaultUser)

  // Load app state from localStorage on mount
  useEffect(() => {
    const savedState = storage.getAppState()
    if (savedState?.activeTab) {
      setActiveTabState(savedState.activeTab)
    }
  }, [])

  // Save app state to localStorage when it changes
  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab)
    const appState: AppState = {
      activeTab: tab,
      user,
    }
    storage.saveAppState(appState)
  }

  return (
    <AppContext.Provider value={{ activeTab, setActiveTab, user }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
