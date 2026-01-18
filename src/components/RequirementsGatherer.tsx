import { useState, useEffect, useRef } from 'react'
import { Send, ArrowLeft, Plus, Upload, Mail, Bot } from 'lucide-react'
import { buildAutomation } from '../services/geminiService'
import { useWorkflows } from '../contexts/WorkflowContext'
import type { WorkflowStep, ConversationMessage } from '../types'
import Input from './ui/Input'
import Button from './ui/Button'
import Card from './ui/Card'

interface RequirementsGathererProps {
  workflowId: string
  step: WorkflowStep
  workflowName?: string
  stepIndex?: number
  onComplete: () => void
  onBack?: () => void
}

export default function RequirementsGatherer({
  workflowId,
  step,
  workflowName,
  stepIndex,
  onComplete,
  onBack,
}: RequirementsGathererProps) {
  const { updateStepRequirements } = useWorkflows()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [blueprint, setBlueprint] = useState<{
    greenList: string[]
    redList: string[]
  } | null>(null)
  const [requirementsText, setRequirementsText] = useState('')
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // Load existing requirements if any
  useEffect(() => {
    if (step.requirements) {
      setRequirementsText(step.requirements.requirementsText || '')
      setBlueprint(step.requirements.blueprint || null)
      if (step.requirements.chatHistory) {
        setMessages(step.requirements.chatHistory)
      }
    }
  }, [step])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      const result = await buildAutomation(step, newMessages)
      setRequirementsText(result.requirementsText)
      setBlueprint(result.blueprint)

      const systemMessage: ConversationMessage = {
        sender: 'system',
        text: `Requirements updated. Blueprint generated with ${result.blueprint.greenList.length} allowed actions and ${result.blueprint.redList.length} restrictions.`,
        timestamp: new Date(),
      }

      setMessages([...newMessages, systemMessage])
    } catch (error) {
      console.error('Error building automation:', error)
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

  const handleMarkComplete = () => {
    const requirements = {
      isComplete: true,
      requirementsText,
      chatHistory: messages,
      integrations: {
        gmail: step.requirements?.integrations?.gmail || false,
      },
      customRequirements: blueprint ? [] : [],
      blueprint: blueprint || { greenList: [], redList: [] },
    }

    updateStepRequirements(workflowId, step.id, requirements)
    onComplete()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setUploadedFiles([...uploadedFiles, ...files])
    setShowPlusMenu(false)
  }

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index))
  }

  const needsAttention = step.requirements?.isComplete === false && messages.length > 0

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Context Header */}
      <div className="p-4 border-b border-gray-lighter bg-white">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-lighter rounded-md transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-darker" />
            </button>
          )}
          <div className="flex-1">
            {workflowName && stepIndex && (
              <div className="text-xs text-gray-darker mb-1">
                {workflowName} • Step {stepIndex}
              </div>
            )}
            <h1 className="text-lg font-semibold text-gray-dark">{step.label}</h1>
          </div>
        </div>
      </div>

      {/* Needs Attention Banner */}
      {needsAttention && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <p className="text-sm text-yellow-800">This step needs attention</p>
        </div>
      )}

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column - Chat Interface */}
        <div className="flex-1 flex flex-col border-r border-gray-lighter">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-purple-600" />
                </div>
                <p className="text-sm text-gray-darker">Start configuring your automation below</p>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="flex items-start gap-2 max-w-2xl">
                      {message.sender === 'system' && (
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-semibold">L</span>
                          </div>
                          <span className="text-xs text-gray-darker block mt-1">Lumi</span>
                        </div>
                      )}
                      <div
                        className={`rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                          message.sender === 'user'
                            ? 'bg-white border border-gray-lighter text-gray-dark'
                            : 'bg-purple-50 text-purple-900'
                        }`}
                      >
                        {message.text}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-semibold">L</span>
                      </div>
                      <span className="text-xs text-gray-darker block mt-1">Lumi</span>
                    </div>
                    <div className="flex gap-1 px-4 py-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-lighter bg-white">
            {/* File Upload Chips */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-1 bg-gray-lighter rounded-full text-xs text-gray-dark"
                  >
                    <span>{file.name}</span>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="text-gray-darker hover:text-gray-dark"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                      onClick={() => {
                        // Handle Gmail connect
                        setShowPlusMenu(false)
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-dark hover:bg-gray-lighter flex items-center gap-2 border-t border-gray-lighter"
                    >
                      <Mail className="h-4 w-4" />
                      Connect Gmail
                    </button>
                  </div>
                )}
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {/* Text Input */}
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Instruct agent builder..."
                disabled={isLoading}
                className="flex-1"
              />

              {/* Send Button */}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column - Blueprint Panel */}
        <div className="w-96 border-l border-gray-lighter bg-gray-50 flex flex-col">
          <div className="p-4 border-b border-gray-lighter bg-white">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-darker">
              BLUEPRINT
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Actions Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-darker">
                  Actions
                </h3>
              </div>
              {blueprint && blueprint.greenList.length > 0 ? (
                <div className="space-y-2">
                  {blueprint.greenList.map((action, idx) => (
                    <Card
                      key={idx}
                      variant="outlined"
                      className="p-3 bg-green-50 border-green-200"
                    >
                      <p className="text-sm text-green-900">{action}</p>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-darker italic">No actions defined yet...</p>
              )}
            </div>

            {/* Hard Limits Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-darker">
                  Hard Limits
                </h3>
              </div>
              {blueprint && blueprint.redList.length > 0 ? (
                <div className="space-y-2">
                  {blueprint.redList.map((limit, idx) => (
                    <Card
                      key={idx}
                      variant="outlined"
                      className="p-3 bg-red-50 border-red-200"
                    >
                      <p className="text-sm text-red-900">{limit}</p>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-darker italic">No hard limits defined yet...</p>
              )}
            </div>
          </div>

          {/* Complete Button */}
          {blueprint && (
            <div className="p-4 border-t border-gray-lighter bg-white">
              <Button
                variant="primary"
                onClick={handleMarkComplete}
                disabled={!blueprint}
                className="w-full"
              >
                Mark Requirements Complete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
