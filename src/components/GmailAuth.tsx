import { useState, useEffect } from 'react'
import { Mail, CheckCircle, XCircle } from 'lucide-react'
import { getGmailAuthState, initiateGmailAuth, signOutGmail, isGmailAuthenticated } from '../services/gmailService'
import Button from './ui/Button'
import Card from './ui/Card'

export default function GmailAuth() {
  const [authState, setAuthState] = useState(getGmailAuthState())
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const checkAuth = () => {
      setAuthState(getGmailAuthState())
    }
    checkAuth()
    // Check periodically
    const interval = setInterval(checkAuth, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleAuth = async () => {
    setIsLoading(true)
    try {
      await initiateGmailAuth()
    } catch (error) {
      console.error('Error initiating Gmail auth:', error)
      setIsLoading(false)
    }
  }

  const handleSignOut = () => {
    signOutGmail()
    setAuthState({ authenticated: false })
  }

  const authenticated = isGmailAuthenticated()

  return (
    <Card variant="outlined" className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-gray-darker" />
          <div>
            <p className="text-sm font-medium text-gray-dark">Gmail Integration</p>
            <p className="text-xs text-gray-darker">
              {authenticated
                ? `Connected as ${authState?.account || 'Unknown'}`
                : 'Not connected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {authenticated ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-gray-darker" />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAuth}
                disabled={isLoading}
              >
                {isLoading ? 'Connecting...' : 'Connect Gmail'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
