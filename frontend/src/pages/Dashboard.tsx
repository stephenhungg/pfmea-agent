import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2, AlertCircle, CheckCircle, Trash2, Zap, Download, Eye, Clock, RefreshCw } from 'lucide-react'
import PdfUpload from '../components/PdfUpload'
import { uploadPDF, startAnalysis, getAnalyses, deleteAnalysis, Analysis, UploadResponse } from '../services/api'

const API_BASE = 'http://localhost:8000'

export default function Dashboard() {
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fastMode, setFastMode] = useState(false)

  // Separate analyses by status
  const completedAnalyses = analyses.filter(a => a.status === 'completed')
  const processingAnalyses = analyses.filter(a => a.status === 'processing')
  const pendingAnalyses = analyses.filter(a => a.status === 'pending')
  const failedAnalyses = analyses.filter(a => a.status === 'failed')

  useEffect(() => {
    loadAnalyses()
  }, [])

  // Auto-refresh when there are processing analyses
  useEffect(() => {
    if (processingAnalyses.length > 0) {
      const interval = setInterval(loadAnalyses, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [processingAnalyses.length])

  const loadAnalyses = async () => {
    try {
      setLoading(true)
      const data = await getAnalyses()
      setAnalyses(data)
    } catch (err: any) {
      if (err.response?.status === 500) {
        setError('Backend server error. Please check if the backend is running on http://localhost:8000')
      } else if (err.code === 'ECONNREFUSED' || err.message?.includes('Failed to fetch')) {
        setError('Cannot connect to backend server. Please ensure the backend is running on http://localhost:8000')
      } else {
        setError(err.response?.data?.detail || err.message || 'Failed to load analyses')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUploadSuccess = async (response: UploadResponse) => {
    setError(null)
    try {
      await startAnalysis(response.analysis_id, fastMode)
      navigate(`/analysis/${response.analysis_id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to start analysis')
    }
  }

  const handleUploadError = (errorMessage: string) => {
    setError(errorMessage)
  }

  const handleDelete = async (analysisId: number, filename: string) => {
    if (!window.confirm(`Delete "${filename}" and all associated data?`)) {
      return
    }
    try {
      await deleteAnalysis(analysisId)
      await loadAnalyses()
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete analysis')
    }
  }

  const handleExport = (analysisId: number, format: 'csv' | 'excel') => {
    window.open(`${API_BASE}/api/export/${analysisId}?format=${format}`, '_blank')
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-extralight text-white mb-3 tracking-[0.05em]">PFMEA</h1>
          <div className="h-px w-24 bg-white/20 mb-4"></div>
          <p className="text-gray-500 text-xs font-extralight tracking-[0.1em] uppercase">Process Failure Mode and Effects Analysis</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl backdrop-blur-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Upload Section */}
        <div className="glass-card glass-shine p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-light text-white tracking-wide">Upload PDF</h2>
            <label className="flex items-center gap-3 cursor-pointer group">
              <span className={`text-xs font-mono uppercase tracking-wider transition-colors ${fastMode ? 'text-amber-400' : 'text-emerald-400'}`}>
                {fastMode ? '⚡ Fast' : '📋 Detailed'}
              </span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={(e) => setFastMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${fastMode ? 'bg-amber-500/30 border-amber-500/50' : 'bg-emerald-500/30 border-emerald-500/50'} border`}></div>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all flex items-center justify-center ${fastMode ? 'translate-x-5 bg-amber-400' : 'translate-x-0 bg-emerald-400'}`}>
                  {fastMode && <Zap className="w-3 h-3 text-black" />}
                </div>
              </div>
            </label>
          </div>
          
          <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-mono border ${
            fastMode 
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-200/80' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200/80'
          }`}>
            {fastMode ? (
              <>
                <Zap className="w-3 h-3 inline mr-1.5 text-amber-400" />
                <strong>Fast Mode:</strong> ~5-10 min • 2 failure modes/step • No justifications
              </>
            ) : (
              <>
                <span className="inline-block w-3 h-3 mr-1.5">📋</span>
                <strong>Detailed Mode:</strong> ~30-45 min • Full analysis • Justifications
              </>
            )}
          </div>
          
          <PdfUpload onUploadSuccess={handleUploadSuccess} onError={handleUploadError} />
        </div>

        {/* In Progress Section */}
        {processingAnalyses.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <h2 className="text-lg font-light text-white tracking-wide">In Progress</h2>
              <span className="text-xs font-mono text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                {processingAnalyses.length}
              </span>
            </div>
            <div className="grid gap-4">
              {processingAnalyses.map((analysis) => (
                <div key={analysis.id} className="glass-card p-4 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                      <div>
                        <p className="text-sm font-light text-white">{analysis.filename}</p>
                        <p className="text-xs text-gray-500 font-mono">Started {analysis.uploaded_at ? new Date(analysis.uploaded_at).toLocaleTimeString() : '-'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/analysis/${analysis.id}`)}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View Progress
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Section */}
        {completedAnalyses.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-light text-white tracking-wide">Completed</h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                {completedAnalyses.length}
              </span>
            </div>
            <div className="glass-card glass-shine overflow-hidden">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-emerald-500/5">
                    <th className="px-5 py-3 table-head">Filename</th>
                    <th className="px-5 py-3 table-head">Completed</th>
                    <th className="px-5 py-3 table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {completedAnalyses.map((analysis) => (
                    <tr key={analysis.id} className="table-row hover:bg-emerald-500/5 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-extralight text-gray-100">{analysis.filename}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-400 font-mono">
                        {analysis.completed_at ? new Date(analysis.completed_at).toLocaleString() : 
                         analysis.uploaded_at ? new Date(analysis.uploaded_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => navigate(`/analysis/${analysis.id}`)}
                            className="btn-ghost flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                          <button
                            onClick={() => handleExport(analysis.id, 'csv')}
                            className="btn-primary flex items-center gap-1.5"
                          >
                            <Download className="w-4 h-4" />
                            CSV
                          </button>
                          <button
                            onClick={() => handleExport(analysis.id, 'excel')}
                            className="btn-primary flex items-center gap-1.5 bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/30"
                          >
                            <Download className="w-4 h-4" />
                            Excel
                          </button>
                          <button
                            onClick={() => handleDelete(analysis.id, analysis.filename)}
                            className="text-red-400/70 hover:text-red-400 p-1.5 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pending Section */}
        {pendingAnalyses.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-light text-white tracking-wide">Pending</h2>
              <span className="text-xs font-mono text-gray-400 bg-gray-500/20 px-2 py-0.5 rounded-full border border-gray-500/30">
                {pendingAnalyses.length}
              </span>
            </div>
            <div className="glass-card overflow-hidden">
              {pendingAnalyses.map((analysis) => (
                <div key={analysis.id} className="p-4 flex items-center justify-between border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-extralight text-gray-300">{analysis.filename}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/analysis/${analysis.id}`)}
                      className="btn-ghost text-xs"
                    >
                      Start
                    </button>
                    <button
                      onClick={() => handleDelete(analysis.id, analysis.filename)}
                      className="text-red-400/70 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Failed Section */}
        {failedAnalyses.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-light text-white tracking-wide">Failed</h2>
              <span className="text-xs font-mono text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full border border-red-500/30">
                {failedAnalyses.length}
              </span>
            </div>
            <div className="glass-card overflow-hidden border-red-500/20">
              {failedAnalyses.map((analysis) => (
                <div key={analysis.id} className="p-4 flex items-center justify-between border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <div>
                      <span className="text-sm font-extralight text-gray-300">{analysis.filename}</span>
                      <p className="text-xs text-red-400/70 font-mono">Analysis failed</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/analysis/${analysis.id}`)}
                      className="btn-ghost text-xs"
                    >
                      View Logs
                    </button>
                    <button
                      onClick={() => handleDelete(analysis.id, analysis.filename)}
                      className="text-red-400/70 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && analyses.length === 0 && (
          <div className="glass-card p-12 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 font-light">No analyses yet</p>
            <p className="text-gray-500 text-sm font-extralight mt-1">Upload a PDF to get started</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="glass-card p-8 flex items-center justify-center gap-3">
            <RefreshCw className="w-5 h-5 text-white animate-spin" />
            <span className="text-gray-400 font-light">Loading analyses...</span>
          </div>
        )}
      </div>
    </div>
  )
}
