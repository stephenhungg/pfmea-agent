import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, AlertCircle, RefreshCw, CheckCircle, XCircle, Table, Activity, Cpu, Clock, Zap, Shield, Target, TrendingUp, Database, Radio, AlertTriangle, Layers, GitBranch } from 'lucide-react'
import PfmeaTable from '../components/PfmeaTable'
import RiskVisualization from '../components/RiskVisualization'
import { getAnalysis, getAnalysisStatus, exportResults, AnalysisWithResults, PFMEAResult } from '../services/api'
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket'

interface PipelineStage {
  name: string
  count: number
  active: boolean
}

export default function Analysis() {
  const { analysisId } = useParams<{ analysisId: string }>()
  const navigate = useNavigate()
  const [analysis, setAnalysis] = useState<AnalysisWithResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [progressLog, setProgressLog] = useState<WebSocketMessage[]>([])
  const [currentStep, setCurrentStep] = useState<string>('')
  const [wsLogs, setWsLogs] = useState<Array<{time: string, type: string, message: string, data?: any}>>([])
  const [streamingResults, setStreamingResults] = useState<PFMEAResult[]>([])
  const [newResultId, setNewResultId] = useState<number | null>(null)
  const [startTime] = useState<Date>(new Date())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [currentOperation, setCurrentOperation] = useState<{process?: string, subprocess?: string, operationId?: number} | null>(null)
  
  // Enhanced tracking state
  const [operationStats, setOperationStats] = useState({ total: 0, completed: 0, failed: 0, processing: 0 })
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([
    { name: 'ANALYZE', count: 0, active: false },
    { name: 'RATE', count: 0, active: false },
    { name: 'VALIDATE', count: 0, active: false },
    { name: 'FINALIZE', count: 0, active: false }
  ])
  const [errorLog, setErrorLog] = useState<Array<{time: string, message: string, operation?: string}>>([])
  const [resultTimes, setResultTimes] = useState<number[]>([])
  const [lastResultTime, setLastResultTime] = useState<Date | null>(null)
  
  // Refs for auto-scrolling
  const wsLogsRef = useRef<HTMLDivElement>(null)
  const progressLogsRef = useRef<HTMLDivElement>(null)
  const streamingTableRef = useRef<HTMLDivElement>(null)
  const systemLogsRef = useRef<HTMLDivElement>(null)

  // Live clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setCurrentTime(now)
      if (analysis?.status === 'processing') {
        setElapsedTime(Math.floor((now.getTime() - startTime.getTime()) / 1000))
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [analysis?.status, startTime])

  useEffect(() => {
    if (analysisId) {
      loadAnalysis()
    }
  }, [analysisId])

  // Auto-scroll logs
  useEffect(() => {
    if (wsLogsRef.current) wsLogsRef.current.scrollTop = wsLogsRef.current.scrollHeight
  }, [wsLogs])
  
  useEffect(() => {
    if (progressLogsRef.current) progressLogsRef.current.scrollTop = progressLogsRef.current.scrollHeight
  }, [progressLog])
  
  useEffect(() => {
    if (streamingTableRef.current) streamingTableRef.current.scrollTop = streamingTableRef.current.scrollHeight
    if (newResultId !== null) {
      const timer = setTimeout(() => setNewResultId(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [streamingResults, newResultId])

  // WebSocket connection
  const { isConnected } = useWebSocket(
    analysisId ? parseInt(analysisId) : null,
    (message: WebSocketMessage) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
      
      setWsLogs((prev) => [...prev.slice(-200), {
        time: timestamp,
        type: message.status || 'info',
        message: message.message || `${message.step || 'SYSTEM'}`,
        data: message
      }])
      
      setProgressLog((prev) => [...prev, message])
      
      if (message.step) setCurrentStep(message.step)
      
      // Track operation stats
      if (message.step === 'operations' && message.total_operations) {
        setOperationStats(prev => ({ ...prev, total: message.total_operations }))
      }
      if (message.step === 'operation') {
        if (message.status === 'started') {
          setOperationStats(prev => ({ ...prev, processing: prev.processing + 1 }))
        } else if (message.status === 'completed') {
          setOperationStats(prev => ({ 
            ...prev, 
            completed: prev.completed + 1,
            processing: Math.max(0, prev.processing - 1)
          }))
        } else if (message.status === 'error') {
          setOperationStats(prev => ({ 
            ...prev, 
            failed: prev.failed + 1,
            processing: Math.max(0, prev.processing - 1)
          }))
          setErrorLog(prev => [...prev.slice(-50), {
            time: timestamp,
            message: message.message || 'Operation failed',
            operation: message.operation_name
          }])
        }
      }
      
      // Track pipeline stages
      const stageMatch = message.step?.match(/^(analyze|rate|validate|finalize)$/i)
      if (stageMatch) {
        const stageName = stageMatch[1].toUpperCase()
        setPipelineStages(prev => prev.map(s => ({
          ...s,
          active: s.name === stageName,
          count: s.name === stageName && message.status === 'completed' ? s.count + 1 : s.count
        })))
      }
      
      // Track errors
      if (message.status === 'error' || message.status === 'failed') {
        setErrorLog(prev => [...prev.slice(-50), {
          time: timestamp,
          message: message.message || 'Unknown error',
          operation: message.operation_name || currentOperation?.process
        }])
      }
      
      // Track current operation details
      if (message.result) {
        setCurrentOperation({
          process: message.result.process,
          subprocess: message.result.subprocess,
          operationId: streamingResults.length + 1
        })
      } else if (message.process || message.operation_id !== undefined) {
        setCurrentOperation({
          process: message.process,
          subprocess: message.subprocess,
          operationId: message.operation_id || (streamingResults.length > 0 ? streamingResults.length : 1)
        })
      } else if (message.step && message.step.includes('operation')) {
        const stepMatch = message.message?.match(/(?:operation|process|subprocess)[\s:]+([^,]+)/i)
        if (stepMatch) {
          setCurrentOperation(prev => ({
            ...prev,
            process: stepMatch[1],
            operationId: prev?.operationId || streamingResults.length + 1
          }))
        }
      }
      
      if (message.step === 'result' && message.status === 'new_result' && message.result) {
        const now = new Date()
        if (lastResultTime) {
          const timeDiff = (now.getTime() - lastResultTime.getTime()) / 1000
          setResultTimes(prev => [...prev.slice(-20), timeDiff])
        }
        setLastResultTime(now)
        
        setStreamingResults((prev) => {
          const newId = prev.length + 1
          setNewResultId(newId)
          return [...prev, { ...message.result, id: newId }]
        })
      }
      
      if (message.step === 'complete' && message.status === 'completed') {
        setTimeout(() => {
          loadAnalysis()
          setStreamingResults([])
        }, 1000)
      }
      
      if (message.step === 'error' && message.status === 'failed') {
        setError(message.message || 'Analysis failed')
      }
    },
    (logEntry) => setWsLogs((prev) => [...prev.slice(-200), logEntry])
  )

  useEffect(() => {
    if (analysis?.status === 'processing') {
      setPolling(true)
      const interval = setInterval(checkStatus, 5000)
      return () => { clearInterval(interval); setPolling(false) }
    } else {
      setPolling(false)
    }
  }, [analysis?.status])

  const loadAnalysis = async () => {
    if (!analysisId) return
    try {
      setLoading(true)
      const data = await getAnalysis(parseInt(analysisId))
      setAnalysis(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load analysis')
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    if (!analysisId) return
    try {
      const status = await getAnalysisStatus(parseInt(analysisId))
      if (status.status !== 'processing') await loadAnalysis()
    } catch (err) {
      console.error('Status check failed:', err)
    }
  }

  const handleExport = async (format: 'csv' | 'excel') => {
    if (!analysisId) return
    try {
      const blob = await exportResults(parseInt(analysisId), format)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pfmea_analysis_${analysisId}.${format === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      setError(err.message || 'Export failed')
    }
  }

  // Computed metrics
  const metrics = useMemo(() => {
    const results = analysis?.status === 'completed' ? analysis.pfmea_results : streamingResults
    const high = results.filter(r => r.risk_level?.toLowerCase() === 'high').length
    const medium = results.filter(r => r.risk_level?.toLowerCase() === 'medium').length
    const low = results.filter(r => r.risk_level?.toLowerCase() === 'low').length
    const avgRpn = results.length > 0 ? (results.reduce((a, r) => a + (r.rpn || 0), 0) / results.length).toFixed(1) : '0'
    const avgSev = results.length > 0 ? (results.reduce((a, r) => a + (r.severity || 0), 0) / results.length).toFixed(1) : '0'
    const avgOcc = results.length > 0 ? (results.reduce((a, r) => a + (r.occurrence || 0), 0) / results.length).toFixed(1) : '0'
    return { high, medium, low, total: results.length, avgRpn, avgSev, avgOcc }
  }, [analysis, streamingResults])

  // Latency stats
  const latencyStats = useMemo(() => {
    if (resultTimes.length === 0) return { avg: 0, min: 0, max: 0, last: 0 }
    const avg = resultTimes.reduce((a, b) => a + b, 0) / resultTimes.length
    const min = Math.min(...resultTimes)
    const max = Math.max(...resultTimes)
    const last = resultTimes[resultTimes.length - 1] || 0
    return { avg: avg.toFixed(1), min: min.toFixed(1), max: max.toFixed(1), last: last.toFixed(1) }
  }, [resultTimes])

  // Update current operation from latest result
  useEffect(() => {
    if (analysis?.status === 'processing' && streamingResults.length > 0) {
      const latest = streamingResults[streamingResults.length - 1]
      setCurrentOperation({
        process: latest.process,
        subprocess: latest.subprocess,
        operationId: streamingResults.length
      })
    }
  }, [streamingResults, analysis?.status])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-white/50 animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">Initializing</p>
        </div>
      </div>
    )
  }

  if (error && !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center border border-red-500/30 bg-red-500/5 p-6 rounded">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-200 text-sm font-mono mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="btn-ghost text-xs">← RETURN</button>
        </div>
      </div>
    )
  }

  if (!analysis) return null

  const isProcessing = analysis.status === 'processing'
  const isCompleted = analysis.status === 'completed'
  const results = isCompleted ? analysis.pfmea_results : streamingResults

  return (
    <div className="min-h-screen bg-black text-white p-2">
      {/* Top Status Bar */}
      <div className="border border-white/10 bg-white/[0.02] mb-2 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-white flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> EXIT
          </button>
          <div className="h-4 w-px bg-white/10"></div>
          <span className="text-gray-500">ID:<span className="text-white ml-1">{analysisId}</span></span>
          <span className="text-gray-500">FILE:<span className="text-gray-300 ml-1">{analysis.filename}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Radio className={`w-4 h-4 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`} />
            <span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>{isConnected ? 'LINK' : 'NOLINK'}</span>
          </div>
          <div className={`px-3 py-1 rounded text-[11px] uppercase tracking-wider ${
            isCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
            isProcessing ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse' :
            'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            {analysis.status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        {/* Left Column - Metrics */}
        <div className="col-span-2 space-y-2">
          {/* Current Operation */}
          {isProcessing && (currentOperation?.process || currentStep) && (
            <div className="border border-blue-500/30 bg-blue-500/5 p-3">
              <div className="text-[11px] text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" /> CURRENT OPERATION
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                {currentOperation?.operationId && (
                  <div className="flex justify-between mb-1.5">
                    <span className="text-gray-500">ID</span>
                    <span className="text-blue-300 font-bold">#{currentOperation.operationId}</span>
                  </div>
                )}
                {currentOperation?.process && (
                  <div className="mb-1.5">
                    <div className="text-gray-500 text-[11px] mb-1">Process</div>
                    <div className="text-blue-200 truncate text-sm">{currentOperation.process}</div>
                  </div>
                )}
                {currentOperation?.subprocess && (
            <div>
                    <div className="text-gray-500 text-[11px] mb-1">Subprocess</div>
                    <div className="text-blue-300/80 text-xs truncate">{currentOperation.subprocess}</div>
                  </div>
                )}
                {!currentOperation?.process && currentStep && (
                  <div className="text-blue-200 text-xs">{currentStep}</div>
                )}
              </div>
            </div>
          )}

          {/* System Status */}
          <div className="border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Activity className="w-4 h-4" /> SYSTEM
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={isProcessing ? 'text-blue-400' : 'text-emerald-400'}>{isProcessing ? 'ACTIVE' : 'IDLE'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Uptime</span><span className="text-white">{isProcessing ? formatTime(elapsedTime) : '--:--'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">WS</span><span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>{isConnected ? 'OK' : 'ERR'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Poll</span><span className={polling ? 'text-blue-400' : 'text-gray-600'}>{polling ? 'ON' : 'OFF'}</span></div>
              </div>
          </div>

          {/* Metrics */}
          <div className="border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Target className="w-4 h-4" /> METRICS
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="text-white">{metrics.total}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg RPN</span><span className="text-white">{metrics.avgRpn}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg SEV</span><span className="text-white">{metrics.avgSev}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg OCC</span><span className="text-white">{metrics.avgOcc}</span></div>
        </div>
          </div>

          {/* Risk Distribution */}
          <div className="border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Shield className="w-4 h-4" /> RISK DIST
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-red-400">HIGH</span><span className="text-red-400">{metrics.high}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${metrics.total > 0 ? (metrics.high / metrics.total) * 100 : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-yellow-400">MED</span><span className="text-yellow-400">{metrics.medium}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 transition-all" style={{ width: `${metrics.total > 0 ? (metrics.medium / metrics.total) * 100 : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-emerald-400">LOW</span><span className="text-emerald-400">{metrics.low}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${metrics.total > 0 ? (metrics.low / metrics.total) * 100 : 0}%` }}></div>
                </div>
              </div>
              </div>
            </div>
            
          {/* Export */}
          {isCompleted && results.length > 0 && (
            <div className="border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> EXPORT
              </div>
              <div className="space-y-1.5">
                <button onClick={() => handleExport('csv')} className="w-full text-xs font-mono py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors">CSV</button>
                <button onClick={() => handleExport('excel')} className="w-full text-xs font-mono py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors">XLSX</button>
              </div>
                        </div>
                        )}
                      </div>

        {/* Middle Column - Main Data */}
        <div className="col-span-7 space-y-2">
          {/* Live Results Table */}
          <div className="border border-white/10 bg-white/[0.02]">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">PFMEA Results</span>
              </div>
              <span className="text-xs font-mono text-gray-500">{results.length} RECORDS</span>
            </div>
            <div ref={streamingTableRef} className="max-h-[400px] overflow-auto">
              {results.length === 0 ? (
                <div className="p-8 text-center text-gray-600 text-xs font-mono">
                  {isProcessing ? 'AWAITING DATA...' : 'NO RECORDS'}
                </div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead className="bg-white/5 sticky top-0">
                    <tr className="text-gray-500 uppercase">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Process</th>
                      <th className="px-3 py-2 text-left">Failure Mode</th>
                      <th className="px-3 py-2 text-center">S</th>
                      <th className="px-3 py-2 text-center">O</th>
                      <th className="px-3 py-2 text-center">RPN</th>
                      <th className="px-3 py-2 text-center">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {results.map((r, idx) => (
                      <tr key={idx} className={`hover:bg-white/5 ${newResultId === idx + 1 ? 'bg-emerald-500/10 animate-pulse' : ''}`}>
                        <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                        <td className="px-3 py-2 text-gray-300 max-w-[150px] truncate">{r.process}</td>
                        <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate">{r.failure_mode}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={r.severity >= 4 ? 'text-red-400' : r.severity >= 3 ? 'text-yellow-400' : 'text-emerald-400'}>{r.severity}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={r.occurrence >= 4 ? 'text-red-400' : r.occurrence >= 3 ? 'text-yellow-400' : 'text-emerald-400'}>{r.occurrence}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold">
                          <span className={r.rpn >= 15 ? 'text-red-400' : r.rpn >= 9 ? 'text-yellow-400' : 'text-emerald-400'}>{r.rpn}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[11px] px-2 py-1 rounded ${
                            r.risk_level?.toLowerCase() === 'high' ? 'bg-red-500/20 text-red-300' :
                            r.risk_level?.toLowerCase() === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                            'bg-emerald-500/20 text-emerald-300'
                          }`}>{r.risk_level?.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </div>

            {/* Progress Log */}
          <div className="border border-white/10 bg-white/[0.02]">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
              <Zap className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Analysis Pipeline</span>
              {isProcessing && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></div>}
            </div>
            <div ref={progressLogsRef} className="max-h-32 overflow-auto p-3 space-y-1.5">
              {progressLog.length === 0 ? (
                <div className="text-gray-600 text-xs font-mono">Waiting for pipeline...</div>
              ) : (
                progressLog.slice(-30).map((msg, idx) => (
                  <div key={idx} className={`text-xs font-mono px-2.5 py-1.5 rounded flex items-center gap-2 ${
                    msg.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300' :
                    msg.status === 'started' ? 'bg-blue-500/10 text-blue-300' :
                    msg.status === 'error' || msg.status === 'failed' ? 'bg-red-500/10 text-red-300' :
                    'bg-white/5 text-gray-400'
                  }`}>
                    {msg.status === 'completed' && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                    {msg.status === 'started' && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
                    {(msg.status === 'error' || msg.status === 'failed') && <XCircle className="w-4 h-4 flex-shrink-0" />}
                    <span className="truncate">{msg.message || msg.step || 'Processing...'}</span>
                            </div>
                ))
                          )}
                        </div>
                      </div>
                    </div>

        {/* Right Column - Logs */}
        <div className="col-span-3 space-y-2">
          {/* Operations Progress */}
          <div className="border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Operations
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="text-white">{operationStats.total || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Processing</span><span className="text-blue-400">{operationStats.processing}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="text-emerald-400">{operationStats.completed}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Failed</span><span className={operationStats.failed > 0 ? 'text-red-400' : 'text-gray-600'}>{operationStats.failed}</span></div>
            </div>
            {operationStats.total > 0 && (
              <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(operationStats.completed / operationStats.total) * 100}%` }}></div>
                <div className="h-full bg-blue-500 animate-pulse transition-all" style={{ width: `${(operationStats.processing / operationStats.total) * 100}%` }}></div>
                <div className="h-full bg-red-500 transition-all" style={{ width: `${(operationStats.failed / operationStats.total) * 100}%` }}></div>
              </div>
            )}
          </div>

          {/* Pipeline Stages */}
          <div className="border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4" /> Pipeline
            </div>
            <div className="grid grid-cols-4 gap-1">
              {pipelineStages.map((stage) => (
                <div key={stage.name} className={`text-center p-1.5 rounded ${stage.active ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-white/5'}`}>
                  <div className={`text-[9px] font-mono ${stage.active ? 'text-blue-300' : 'text-gray-500'}`}>{stage.name}</div>
                  <div className={`text-xs font-bold ${stage.active ? 'text-blue-200' : 'text-gray-400'}`}>{stage.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Latency Stats */}
          <div className="border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Latency (sec)
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs font-mono">
              <div className="text-center">
                <div className="text-gray-500 text-[9px]">AVG</div>
                <div className="text-white">{latencyStats.avg}s</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 text-[9px]">MIN</div>
                <div className="text-emerald-400">{latencyStats.min}s</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 text-[9px]">MAX</div>
                <div className="text-red-400">{latencyStats.max}s</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 text-[9px]">LAST</div>
                <div className="text-blue-400">{latencyStats.last}s</div>
              </div>
            </div>
          </div>

          {/* System Log */}
          <div className="border border-white/10 bg-white/[0.02] h-[180px] flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-500" />
                <span className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">System Log</span>
              </div>
              <span className="text-[10px] font-mono text-gray-600">{wsLogs.length}</span>
            </div>
            <div ref={wsLogsRef} className="flex-1 overflow-auto p-1.5 font-mono text-[10px]">
              {wsLogs.length === 0 ? (
                <div className="text-gray-600 p-2">No activity...</div>
              ) : (
                wsLogs.slice(-100).map((log, idx) => (
                  <div key={idx} className={`px-1.5 py-0.5 border-l-2 mb-0.5 ${
                    log.type === 'error' ? 'border-red-500 bg-red-500/5 text-red-300' :
                    log.type === 'connect' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-300' :
                    log.type === 'completed' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-300' :
                    log.type === 'started' ? 'border-blue-500 bg-blue-500/5 text-blue-300' :
                    log.type === 'disconnect' ? 'border-yellow-500 bg-yellow-500/5 text-yellow-300' :
                    'border-gray-700 text-gray-500'
                  }`}>
                    <span className="text-gray-600">{log.time}</span>
                    <span className="mx-1 text-gray-700">│</span>
                    <span className="truncate">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error Log */}
          {errorLog.length > 0 && (
            <div className="border border-red-500/30 bg-red-500/5 max-h-[120px] flex flex-col">
              <div className="px-3 py-2 border-b border-red-500/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-[11px] font-mono text-red-400 uppercase tracking-widest">Errors</span>
                </div>
                <span className="text-[10px] font-mono text-red-500">{errorLog.length}</span>
              </div>
              <div className="flex-1 overflow-auto p-1.5 font-mono text-[10px]">
                {errorLog.slice(-20).map((err, idx) => (
                  <div key={idx} className="px-1.5 py-0.5 text-red-300 border-l-2 border-red-500 mb-0.5">
                    <span className="text-red-500">{err.time}</span>
                    <span className="mx-1 text-red-700">│</span>
                    <span className="truncate">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Performance & Timestamps */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-white/10 bg-white/[0.02] p-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Perf
              </div>
              <div className="space-y-1 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="text-white">{elapsedTime > 0 ? (results.length / elapsedTime * 60).toFixed(1) : '0'}/m</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Time</span><span className="text-white">{formatTime(elapsedTime)}</span></div>
              </div>
            </div>
            <div className="border border-white/10 bg-white/[0.02] p-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time
              </div>
              <div className="space-y-1 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-gray-500">Now</span><span className="text-white animate-pulse">{currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Msg</span><span className="text-gray-400">{wsLogs.length}</span></div>
              </div>
            </div>
          </div>
              </div>
            </div>
            
      {/* Risk Visualizations (Live during processing or completed) */}
      {results.length > 0 && (
        <div className="mt-4 mx-4">
          <RiskVisualization results={results} />
        </div>
      )}

      {/* Full Results Table (Completed) */}
      {isCompleted && analysis.pfmea_results.length > 0 && (
        <div className="mt-6 mx-4">
          <PfmeaTable 
            results={analysis.pfmea_results} 
            analysisId={parseInt(analysisId || '0')}
            filename={analysis.filename}
          />
        </div>
      )}

      {analysis.error_message && (
        <div className="mt-2 border border-red-500/30 bg-red-500/5 p-3 text-xs font-mono text-red-300">
          <strong>ERROR:</strong> {analysis.error_message}
          </div>
        )}
    </div>
  )
}
