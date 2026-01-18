import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Plus, Mic, ArrowLeft } from 'lucide-react'
import { useWorkflows } from '../contexts/WorkflowContext'
import { consultWorkflow, extractWorkflowFromConversation } from '../services/geminiService'
import { GEMINI_CONFIG } from '../utils/constants'
import type { ConversationMessage, ConversationSession } from '../types'
import Input from './ui/Input'
import Button from './ui/Button'

export default function Screen1Consultant() {
  const { addWorkflow, addConversation, updateConversation, conversations } = useWorkflows()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [workflowExtracted, setWorkflowExtracted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize session
  useEffect(() => {
    const newSessionId = `session-${Date.now()}`
    setSessionId(newSessionId)
  }, [])

  // Extract workflow only once at the end of conversation
  const extractWorkflow = useCallback(async (conversationHistory: ConversationMessage[], isComplete: boolean) => {
    // Only extract workflow if conversation is complete and we haven't extracted yet
    if (isComplete && !workflowExtracted) {
      try {
        const workflow = await extractWorkflowFromConversation(conversationHistory)
        if (workflow) {
          addWorkflow(workflow)
          setWorkflowExtracted(true)
          // Link conversation to workflow
          if (sessionId) {
            const session = conversations.find((c) => c.id === sessionId)
            if (session) {
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
      }
    }
  }, [addWorkflow, sessionId, conversations, updateConversation, workflowExtracted])

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

      // Extract workflow only at the end of conversation
      extractWorkflow(updatedMessages, isComplete)
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
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-darker text-lg mb-2">Start a conversation</p>
              <p className="text-gray-darker text-sm">
                Ask me about the workflow you want to create
              </p>
            </div>
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
                className={`max-w-2xl rounded-lg px-4 py-2 ${
                  message.sender === 'user'
                    ? 'bg-gray-lighter text-gray-dark'
                    : 'bg-gray-light text-gray-dark'
                }`}
              >
                <p className="text-sm">{message.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-gray-lighter">
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-gray-lighter rounded-md">
            <Plus className="h-5 w-5 text-gray-darker" />
          </button>
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
