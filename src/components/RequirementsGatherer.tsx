import { useState, useEffect } from 'react'
import { Send, CheckCircle } from 'lucide-react'
import { buildAutomation } from '../services/geminiService'
import { useWorkflows } from '../contexts/WorkflowContext'
import type { WorkflowStep, ConversationMessage } from '../types'
import Input from './ui/Input'
import Button from './ui/Button'
import GmailAuth from './GmailAuth'

interface RequirementsGathererProps {
  workflowId: string
  step: WorkflowStep
  onComplete: () => void
}

export default function RequirementsGatherer({
  workflowId,
  step,
  onComplete,
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-lighter">
        <h3 className="text-lg font-semibold text-gray-dark">{step.label}</h3>
        <p className="text-sm text-gray-darker mt-1">Gather requirements for this step</p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-darker text-sm py-8">
            Start a conversation to gather requirements for this step
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                  message.sender === 'user'
                    ? 'bg-gray-lighter text-gray-dark'
                    : 'bg-gray-light text-gray-dark'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Blueprint Preview */}
      {blueprint && (
        <div className="p-4 border-t border-gray-lighter bg-gray-light">
          <h4 className="text-sm font-semibold text-gray-dark mb-2">Blueprint</h4>
          {blueprint.greenList.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-darker mb-1">Allowed:</p>
              <div className="flex flex-wrap gap-1">
                {blueprint.greenList.map((item, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {blueprint.redList.length > 0 && (
            <div>
              <p className="text-xs text-gray-darker mb-1">Restricted:</p>
              <div className="flex flex-wrap gap-1">
                {blueprint.redList.map((item, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gmail Auth if needed */}
      {step.requirements?.integrations?.gmail && (
        <div className="p-4 border-t border-gray-lighter">
          <GmailAuth />
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-gray-lighter">
        <div className="flex gap-2 mb-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about requirements..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleMarkComplete}
          disabled={!blueprint || isLoading}
          className="w-full"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Mark Requirements Complete
        </Button>
      </div>
    </div>
  )
}
