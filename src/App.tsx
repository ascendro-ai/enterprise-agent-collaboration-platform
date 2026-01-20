import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import { WorkflowProvider } from './contexts/WorkflowContext'
import { TeamProvider, useTeam } from './contexts/TeamContext'
import Sidebar from './components/Sidebar'
import CreateWorkflow from './components/CreateWorkflow'
import Screen2OrgChart from './components/Screen2OrgChart'
import Screen4ControlRoom from './components/Screen4ControlRoom'
import OrganizationSetup from './components/OrganizationSetup'
import { handleGmailCallback } from './services/gmailService'

function AppContent() {
  const { activeTab, user, setActiveTab } = useApp()
  const { isOrganizationSetup } = useTeam()
  const [showOrgSetup, setShowOrgSetup] = useState(false)

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

  // Check if organization setup is needed
  useEffect(() => {
    if (activeTab === 'create-workflow' && !isOrganizationSetup) {
      setShowOrgSetup(true)
    } else {
      setShowOrgSetup(false)
    }
  }, [activeTab, isOrganizationSetup])

  const handleOrgSetupComplete = () => {
    setShowOrgSetup(false)
    // User can now proceed to Create a Workflow
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'create-workflow':
        return <CreateWorkflow />
      case 'team':
        return <Screen2OrgChart />
      case 'control-room':
        return <Screen4ControlRoom />
      default:
        return <CreateWorkflow />
    }
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar user={user} />
      <div className="flex-1 overflow-hidden relative">
        {renderScreen()}
        {/* Organization Setup Overlay */}
        {showOrgSetup && <OrganizationSetup onComplete={handleOrgSetupComplete} />}
      </div>
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
