import { useState, useEffect, useRef } from 'react'
import { Send, X } from 'lucide-react'
import { useTeam } from '../contexts/TeamContext'
import { organizationSetupChat } from '../services/geminiService'
import type { ConversationMessage, Team, NodeData } from '../types'
import Input from './ui/Input'
import Button from './ui/Button'
import Card from './ui/Card'

interface OrganizationSetupProps {
  onComplete: () => void
}

export default function OrganizationSetup({ onComplete }: OrganizationSetupProps) {
  const { setTeams, addTeam, addNode, updateNode, setOrganizationSetup, team: teamNodes } = useTeam()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [collectedData, setCollectedData] = useState<{
    employees: string[]
    teams: Team[]
  }>({ employees: [], teams: [] })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send initial welcome message
  useEffect(() => {
    const welcomeMessage: ConversationMessage = {
      sender: 'system',
      text: "Hi! Let's set up your organization. I'll help you build your team structure and create digital workers to assist them.\n\nWho are the people you work with regularly? You can list their names.",
      timestamp: new Date(),
    }
    setMessages([welcomeMessage])
  }, [])

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: ConversationMessage = {
      sender: 'user',
      text: inputValue.trim(),
      timestamp: new Date(),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputValue('')
    setIsLoading(true)

    try {
      const { response, extractedData } = await organizationSetupChat(
        newMessages,
        collectedData
      )

      const systemMessage: ConversationMessage = {
        sender: 'system',
        text: response,
        timestamp: new Date(),
      }

      const updatedMessages = [...newMessages, systemMessage]
      setMessages(updatedMessages)

      // Update collected data if LLM extracted new information
      if (extractedData) {
        const newCollectedData = {
          employees: extractedData.employees || collectedData.employees,
          teams: extractedData.teams || collectedData.teams,
        }
        setCollectedData(newCollectedData)

        // If setup is complete (teams and managers are defined), finalize
        if (extractedData.isComplete && extractedData.teams && extractedData.teams.length > 0) {
          await finalizeOrganization(extractedData.teams)
        }
      }
    } catch (error) {
      console.error('Error in organization setup:', error)
      const errorMessage: ConversationMessage = {
        sender: 'system',
        text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const finalizeOrganization = async (teams: Team[]) => {
    // Fun names for personal digital assistants
    const personalAssistantNames = [
      'Nova', 'Luna', 'Pixel', 'Echo', 'Spark', 'Blip', 'Dash', 'Gizmo', 
      'Chip', 'Byte', 'Zip', 'Fizz', 'Brio', 'Zara', 'Juno', 'Vega',
      'Cleo', 'Rex', 'Ivy', 'Max', 'Neo', 'Aria', 'Kai', 'Rio'
    ]
    
    let personalNameIndex = 0
    
    // Collect all unique employees and managers
    const allEmployees = new Set<string>()
    const allManagers = new Set<string>()
    const employeeToTeam = new Map<string, string>() // Maps employee name to team ID
    
    teams.forEach(team => {
      team.members.forEach(member => {
        allEmployees.add(member)
        employeeToTeam.set(member, team.id)
      })
      if (team.managerId) {
        allManagers.add(team.managerId)
        allEmployees.add(team.managerId)
        employeeToTeam.set(team.managerId, team.id) // Managers also get team assignment
      }
    })

    // Create human worker nodes for all employees (with teamId)
    allEmployees.forEach(employeeName => {
      const isManager = allManagers.has(employeeName)
      const teamId = employeeToTeam.get(employeeName)
      
      // Check if node already exists
      const existingNode = teamNodes.find(n => n.name === employeeName)
      if (!existingNode) {
        const humanWorker: NodeData = {
          name: employeeName,
          type: 'human',
          status: 'active',
          assignedWorkflows: [],
          role: isManager ? 'Manager' : 'Team Member',
          teamId: teamId, // Every employee gets a team
        }
        addNode(humanWorker)
      } else {
        // Update existing node with role and teamId
        updateNode(employeeName, { 
          role: isManager ? 'Manager' : existingNode.role,
          teamId: teamId 
        })
      }
    })

    // Set up parent-child relationships for team members
    teams.forEach(team => {
      if (team.managerId) {
        team.members.forEach(memberName => {
          if (memberName !== team.managerId) {
            updateNode(memberName, { parentName: team.managerId, teamId: team.id })
          } else {
            // Manager also gets teamId
            updateNode(memberName, { teamId: team.id })
          }
        })
      }
    })

    // Create personal digital workers for EVERY employee (default inactive)
    allEmployees.forEach(employeeName => {
      const teamId = employeeToTeam.get(employeeName)
      const personalWorkerName = personalAssistantNames[personalNameIndex % personalAssistantNames.length]
      personalNameIndex++
      
      const personalDigitalWorker: NodeData = {
        name: personalWorkerName,
        type: 'ai',
        status: 'inactive', // All digital workers start inactive
        assignedWorkflows: [],
        role: `${employeeName}'s Assistant`,
        parentName: employeeName, // Reports to their human
        teamId: teamId,
      }
      addNode(personalDigitalWorker)
    })

    // Save teams (no team-level digital workers, only personal assistants)
    setTeams(teams)

    // Mark organization as set up
    setOrganizationSetup(true)

    // Show completion message
    const completionMessage: ConversationMessage = {
      sender: 'system',
      text: `Perfect! I've set up your organization with ${teams.length} team(s) and created ${allEmployees.size} personal digital assistants (one for each team member).\n\nAll digital workers start inactive - you can enable them in the "Your Team" view.\n\nClick "Continue" to proceed.`,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, completionMessage])
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleContinue = () => {
    onComplete()
  }

  return (
    <>
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={handleContinue} />
      
      {/* Modal Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card variant="elevated" className="w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-lighter flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-dark">Set Up Your Organization</h1>
              <p className="text-sm text-gray-darker mt-1">
                Build your team structure and create digital workers
              </p>
            </div>
            <button
              onClick={handleContinue}
              className="p-2 hover:bg-gray-lighter rounded-md transition-colors"
            >
              <X className="h-5 w-5 text-gray-dark" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-lg text-gray-dark">Getting started...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.sender === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.sender === 'user'
                          ? 'bg-gray-lighter text-gray-dark'
                          : 'bg-gray-light text-gray-dark'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-1 px-4 py-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-gray-lighter">
            <div className="flex items-center gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your response..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
