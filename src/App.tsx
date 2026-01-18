import { useEffect } from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import { WorkflowProvider } from './contexts/WorkflowContext'
import { TeamProvider } from './contexts/TeamContext'
import Sidebar from './components/Sidebar'
import Screen1Consultant from './components/Screen1Consultant'
import Screen2OrgChart from './components/Screen2OrgChart'
import Screen3Workflows from './components/Screen3Workflows'
import Screen4ControlRoom from './components/Screen4ControlRoom'
import { handleGmailCallback } from './services/gmailService'

function AppContent() {
  const { activeTab, user } = useApp()

  // Handle Gmail OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const path = window.location.pathname

    // Check if this is the Gmail OAuth callback
    if (path === '/auth/gmail/callback' && code) {
      handleGmailCallback(code)
        .then(() => {
          // Clean up URL after successful auth
          window.history.replaceState({}, document.title, '/')
        })
        .catch((error) => {
          console.error('Gmail OAuth callback error:', error)
          const errorMessage = error instanceof Error ? error.message : 'Failed to authenticate with Gmail. Please try again.'
          alert(errorMessage)
          window.history.replaceState({}, document.title, '/')
        })
    }
  }, [])

  const renderScreen = () => {
    switch (activeTab) {
      case 'create-task':
        return <Screen1Consultant />
      case 'workflows':
        return <Screen3Workflows />
      case 'team':
        return <Screen2OrgChart />
      case 'control-room':
        return <Screen4ControlRoom />
      default:
        return <Screen1Consultant />
    }
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar user={user} />
      <div className="flex-1 overflow-hidden">{renderScreen()}</div>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <WorkflowProvider>
        <TeamProvider>
          <AppContent />
        </TeamProvider>
      </WorkflowProvider>
    </AppProvider>
  )
}

export default App
