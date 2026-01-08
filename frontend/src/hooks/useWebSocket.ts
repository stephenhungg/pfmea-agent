import { useEffect, useRef, useState, useCallback } from 'react'

export interface WebSocketMessage {
  type: string
  analysis_id?: number
  step?: string
  status?: string
  message?: string
  [key: string]: any
}

export function useWebSocket(
  analysisId: number | null, 
  onMessage?: (message: WebSocketMessage) => void,
  onLog?: (log: {time: string, type: string, message: string, data?: any}) => void
) {
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState<WebSocketMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const mountedRef = useRef(true)
  const hasConnectedRef = useRef(false)

  // Store callbacks in refs to avoid dependency issues
  const onMessageRef = useRef(onMessage)
  const onLogRef = useRef(onLog)
  
  useEffect(() => {
    onMessageRef.current = onMessage
    onLogRef.current = onLog
  }, [onMessage, onLog])

  const log = useCallback((type: string, message: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString()
    if (onLogRef.current) {
      onLogRef.current({ time: timestamp, type, message, data })
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    
    if (!analysisId) {
      return
    }

    // Prevent double connection in StrictMode
    if (hasConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Already connected, skipping...')
      return
    }

    // Clean up any existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null // Prevent close handler from firing
      wsRef.current.close()
      wsRef.current = null
    }

    const backendPort = '8000'
    const backendHost = window.location.hostname
    const wsUrl = `ws://${backendHost}:${backendPort}/ws/analysis/${analysisId}`
    
    console.log('Connecting to WebSocket:', wsUrl)
    log('connect', `Connecting to ${wsUrl}...`, { url: wsUrl })

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      hasConnectedRef.current = true

      ws.onopen = () => {
        if (!mountedRef.current) return
        console.log('WebSocket connected successfully')
        log('connect', 'Connected - ready to receive updates', { readyState: ws.readyState })
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log('WebSocket message:', message.type, message)
          setMessages((prev) => [...prev, message])
          if (onMessageRef.current) {
            onMessageRef.current(message)
          }
          log('message', `Received: ${message.type || 'update'}`, message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
          log('error', `Parse error: ${error}`, { raw: event.data })
        }
      }

      ws.onerror = (error) => {
        if (!mountedRef.current) return
        console.error('WebSocket error - is backend running on port 8000?')
        log('error', 'Connection error - is backend running?', { error: String(error) })
        setIsConnected(false)
      }

      ws.onclose = (event) => {
        if (!mountedRef.current) return
        console.log('WebSocket closed:', event.code, event.reason)
        setIsConnected(false)
        
        // Don't log or reconnect if component is unmounting
        if (event.code === 1000 || event.code === 1001) {
          log('disconnect', 'Connection closed normally')
        } else if (event.code === 1006) {
          log('disconnect', 'Connection lost - backend may be down')
        } else {
          log('disconnect', `Disconnected (code ${event.code})`, { code: event.code, reason: event.reason })
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
      log('error', `Failed to create WebSocket: ${error}`)
      setIsConnected(false)
    }

    // Cleanup function
    return () => {
      mountedRef.current = false
      hasConnectedRef.current = false
      if (wsRef.current) {
        // Clean close without triggering handlers
        const ws = wsRef.current
        ws.onclose = null
        ws.onerror = null
        ws.onmessage = null
        ws.onopen = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmounting')
        }
        wsRef.current = null
      }
    }
  }, [analysisId, log])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  return {
    isConnected,
    messages,
    sendMessage,
    clearMessages: () => setMessages([])
  }
}
