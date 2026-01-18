import { FileText, Workflow, Users, Monitor } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { cn } from './utils/cn'
import type { TabType } from '../types'

interface SidebarProps {
  user?: {
    name: string
    title: string
    avatar?: string
  }
}

const tabs: Array<{ id: TabType; label: string; icon: typeof FileText }> = [
  { id: 'create-task', label: 'Create a Task', icon: FileText },
  { id: 'workflows', label: 'Your Workflows', icon: Workflow },
  { id: 'team', label: 'Your Team', icon: Users },
  { id: 'control-room', label: 'Control Room', icon: Monitor },
]

export default function Sidebar({ user }: SidebarProps) {
  const { activeTab, setActiveTab, user: appUser } = useApp()
  const displayUser = user || appUser

  return (
    <div className="flex flex-col h-screen w-64 bg-white border-r border-gray-lighter">
      {/* Logo */}
      <div className="p-6 border-b border-gray-lighter">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-dark rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">W</span>
          </div>
          <span className="text-lg font-semibold text-gray-dark">Workflow.ai</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-lighter text-gray-dark'
                      : 'text-gray-darker hover:bg-gray-light'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User Profile */}
      {displayUser && (
        <div className="p-4 border-t border-gray-lighter">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-light rounded-full flex items-center justify-center">
              <span className="text-accent-pink font-semibold text-sm">
                {displayUser.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-dark truncate">{displayUser.name}</p>
              <p className="text-xs text-gray-darker truncate">{displayUser.title}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
