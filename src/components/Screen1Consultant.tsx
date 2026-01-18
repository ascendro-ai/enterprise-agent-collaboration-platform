import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Plus, Mic, ArrowLeft, Upload, Mail } from 'lucide-react'
import { useWorkflows } from '../contexts/WorkflowContext'
import { consultWorkflow, extractWorkflowFromConversation } from '../services/geminiService'
import { initiateGmailAuth, isGmailAuthenticated } from '../services/gmailService'
import { GEMINI_CONFIG } from '../utils/constants'
import type { ConversationMessage, ConversationSession } from '../types'
import Input from './ui/Input'
import Button from './ui/Button'
import Card from './ui/Card'
import {
  NightlySecurityIcon,
  SpoilageDetectionIcon,
  FinancialAutopilotIcon,
  SalesResponseIcon,
} from './ui/ExampleIcons'

export default function Screen1Consultant() {
  const { addWorkflow, addConversation, updateConversation, conversations } = useWorkflows()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(isGmailAuthenticated())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const extractionTimeoutRef = useRef<number | null>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Check Gmail connection status periodically
  useEffect(() => {
    const checkGmail = () => {
      setGmailConnected(isGmailAuthenticated())
    }
    checkGmail()
    const interval = setInterval(checkGmail, 2000)
    return () => clearInterval(interval)
  }, [])

  // Close plus menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Generate workflow ID based on session ID (consistent across extractions)
  const getWorkflowIdForSession = useCallback(() => {
    if (!sessionId) return null
    return `workflow-${sessionId}`
  }, [sessionId])

  // Initialize session
  useEffect(() => {
    const newSessionId = `session-${Date.now()}`
    setSessionId(newSessionId)
    setCurrentWorkflowId(null) // Reset workflow ID for new session
    
    // Cleanup timeout on unmount
    return () => {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current)
      }
    }
  }, [])

  // Extract workflow after each message (background extraction)
  const extractWorkflow = useCallback(async (conversationHistory: ConversationMessage[]) => {
    // Debounce extraction to avoid too many API calls
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current)
    }

    extractionTimeoutRef.current = window.setTimeout(async () => {
      // Extract workflow if we have at least 2 messages (user + assistant)
      if (conversationHistory.length >= 2) {
        try {
          // Use consistent workflow ID for this session
          const workflowId = getWorkflowIdForSession()
          const workflow = await extractWorkflowFromConversation(conversationHistory, workflowId || undefined)
          
          if (workflow) {
            // Track this workflow ID for future updates
            if (!currentWorkflowId) {
              setCurrentWorkflowId(workflow.id)
            }
            
            // Update the workflow (this will update if exists, add if new)
            addWorkflow(workflow)
            
            // Link conversation to workflow (only once)
            if (sessionId && !currentWorkflowId) {
              const session = conversations.find((c) => c.id === sessionId)
              if (session && !session.workflowId) {
                // Update session with workflow ID
                updateConversation(sessionId, [
                  ...session.messages,
                  {
                    sender: 'system',
                    text: `Workflow "${workflow.name}" has been created and is available in "Your Workflows".`,
                  },
                ])
              }
            }
          }
        } catch (error) {
          console.error('Error extracting workflow:', error)
          // Don't show error to user - background extraction should be silent
        }
      }
    }, 500) // 500ms debounce
  }, [addWorkflow, sessionId, conversations, updateConversation, getWorkflowIdForSession, currentWorkflowId])

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

    // Save conversation
    if (sessionId) {
      const session: ConversationSession = {
        id: sessionId,
        messages: newMessages,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      addConversation(session)
    }

    try {
      // Get consultant response
      const { response, isComplete } = await consultWorkflow(newMessages, questionCount)

      const systemMessage: ConversationMessage = {
        sender: 'system',
        text: response,
        timestamp: new Date(),
      }

      const updatedMessages = [...newMessages, systemMessage]
      setMessages(updatedMessages)

      // Update question count
      if (!isComplete) {
        setQuestionCount((prev) => prev + 1)
      }

      // Update conversation
      if (sessionId) {
        updateConversation(sessionId, updatedMessages)
      }

      // Extract workflow in background after each message exchange
      extractWorkflow(updatedMessages)
    } catch (error) {
      console.error('Error getting consultant response:', error)
      const errorMessage: ConversationMessage = {
        sender: 'system',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleExampleClick = async (exampleText: string) => {
    if (isLoading) return

    const userMessage: ConversationMessage = {
      sender: 'user',
      text: exampleText,
      timestamp: new Date(),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputValue('')
    setIsLoading(true)

    // Save conversation
    if (sessionId) {
      const session: ConversationSession = {
        id: sessionId,
        messages: newMessages,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      addConversation(session)
    }

    try {
      // Get consultant response
      const { response, isComplete } = await consultWorkflow(newMessages, questionCount)

      const systemMessage: ConversationMessage = {
        sender: 'system',
        text: response,
        timestamp: new Date(),
      }

      const updatedMessages = [...newMessages, systemMessage]
      setMessages(updatedMessages)

      // Update question count
      if (!isComplete) {
        setQuestionCount((prev) => prev + 1)
      }

      // Update conversation
      if (sessionId) {
        updateConversation(sessionId, updatedMessages)
      }

      // Extract workflow in background after each message exchange
      extractWorkflow(updatedMessages)
    } catch (error) {
      console.error('Error getting consultant response:', error)
      const errorMessage: ConversationMessage = {
        sender: 'system',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const exampleWorkflows = [
    {
      title: 'Nightly Security Check',
      description: 'Verify store locks and van security via connected sensors or staff logs.',
      icon: NightlySecurityIcon,
      prompt: 'I need to automate nightly security checks for my store and van using connected sensors or staff logs.',
    },
    {
      title: 'Spoilage Detection',
      description: 'Identify potential spoilage via camera feed to reduce waste.',
      icon: SpoilageDetectionIcon,
      prompt: 'I want to set up automated spoilage detection using camera feeds to reduce waste.',
    },
    {
      title: 'Financial Autopilot',
      description: 'Auto-categorize bank transactions (Rent, Travel) in QuickBooks.',
      icon: FinancialAutopilotIcon,
      prompt: 'I need to automatically categorize bank transactions like rent and travel expenses in QuickBooks.',
    },
    {
      title: 'Sales Response',
      description: 'Automatically provide quotes and proposals for customer inquiries.',
      icon: SalesResponseIcon,
      prompt: 'I want to automate providing quotes and proposals for customer inquiries.',
    },
  ]

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 p-6 border-b border-gray-lighter">
        <button className="p-2 hover:bg-gray-lighter rounded-md">
          <ArrowLeft className="h-5 w-5 text-gray-darker" />
        </button>
        <div>
          <div className="text-sm text-gray-darker">Workflow Architect</div>
          <div className="text-xs text-gray-darker">New Session</div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-dark mb-3">
                What can I do for you?
              </h2>
              <p className="text-base text-gray-darker">
                Describe your daily routine, pain points, or the specific workflow you want to automate.
              </p>
            </div>

            {/* Example Cards Grid */}
            <div className="grid grid-cols-2 gap-4 w-full">
              {exampleWorkflows.map((example, index) => {
                const Icon = example.icon
                return (
                  <Card
                    key={index}
                    variant="outlined"
                    className="p-5 cursor-pointer hover:bg-gray-light transition-colors"
                    onClick={() => handleExampleClick(example.prompt)}
                  >
                    <div className="flex items-start gap-4">
                      <Icon />
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-dark mb-1">
                          {example.title}
                        </h3>
                        <p className="text-sm text-gray-darker">
                          {example.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-2xl rounded-lg px-4 py-2 ${
                    message.sender === 'user'
                      ? 'bg-gray-lighter text-gray-dark'
                      : 'bg-gray-light text-gray-dark'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
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
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-gray-lighter">
        <div className="flex items-center gap-2">
          {/* Plus Button */}
          <div className="relative" ref={plusMenuRef}>
            <button
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className="p-2 hover:bg-gray-lighter rounded-md transition-colors"
            >
              <Plus className="h-5 w-5 text-gray-darker" />
            </button>
            {showPlusMenu && (
              <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-lighter rounded-md shadow-lg z-10 min-w-48">
                <button
                  onClick={() => {
                    document.getElementById('file-upload')?.click()
                    setShowPlusMenu(false)
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-dark hover:bg-gray-lighter flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload File
                </button>
                <button
                  onClick={async () => {
                    setShowPlusMenu(false)
                    try {
                      await initiateGmailAuth()
                      // Note: initiateGmailAuth redirects to Google, so code below won't run
                      // The connection status will be updated when user returns via useEffect
                    } catch (error) {
                      console.error('Error initiating Gmail auth:', error)
                      alert('Failed to connect Gmail. Please check your Gmail OAuth client ID configuration.')
                    }
                  }}
                  disabled={gmailConnected}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 border-t border-gray-lighter ${
                    gmailConnected
                      ? 'text-green-600 cursor-not-allowed'
                      : 'text-gray-dark hover:bg-gray-lighter'
                  }`}
                >
                  <Mail className="h-4 w-4" />
                  {gmailConnected ? 'Gmail Connected' : 'Connect Gmail'}
                </button>
              </div>
            )}
          </div>
          <input
            id="file-upload"
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              // Handle file upload if needed in the future
              console.log('Files selected:', e.target.files)
            }}
          />
          <div className="flex-1 relative">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message Workflow.ai..."
              disabled={isLoading || questionCount >= GEMINI_CONFIG.MAX_QUESTIONS}
              className="w-full pr-12"
            />
          </div>
          <button className="p-2 hover:bg-gray-lighter rounded-md">
            <Mic className="h-5 w-5 text-gray-darker" />
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || questionCount >= GEMINI_CONFIG.MAX_QUESTIONS}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
