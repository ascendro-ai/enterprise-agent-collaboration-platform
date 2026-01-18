import { AppProvider, useApp } from './contexts/AppContext'
import { WorkflowProvider } from './contexts/WorkflowContext'
import { TeamProvider } from './contexts/TeamContext'
import Sidebar from './components/Sidebar'
import Screen1Consultant from './components/Screen1Consultant'
import Screen2OrgChart from './components/Screen2OrgChart'
import Screen3Workflows from './components/Screen3Workflows'
import Screen4ControlRoom from './components/Screen4ControlRoom'

function AppContent() {
  const { activeTab, user } = useApp()

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
