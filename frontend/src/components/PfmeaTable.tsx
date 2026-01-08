import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle, HelpCircle, Download, FileSpreadsheet, Table2, Filter } from 'lucide-react'
import { PFMEAResult } from '../services/api'

const API_BASE = 'http://localhost:8000'

interface PfmeaTableProps {
  results: PFMEAResult[]
  analysisId?: number
  filename?: string
}

export default function PfmeaTable({ results, analysisId, filename }: PfmeaTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [sortConfig, setSortConfig] = useState<{ key: keyof PFMEAResult; direction: 'asc' | 'desc' } | null>(null)
  const [filterRisk, setFilterRisk] = useState<string | null>(null)

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
  }

  const handleSort = (key: keyof PFMEAResult) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleExport = (format: 'csv' | 'excel') => {
    if (!analysisId) return
    window.open(`${API_BASE}/api/export/${analysisId}?format=${format}`, '_blank')
  }

  const filteredResults = filterRisk 
    ? results.filter(r => r.risk_level?.toLowerCase() === filterRisk.toLowerCase())
    : results

  const sortedResults = [...filteredResults].sort((a, b) => {
    if (!sortConfig) return 0
    const aVal = a[sortConfig.key]
    const bVal = b[sortConfig.key]
    if (aVal === undefined || aVal === null) return 1
    if (bVal === undefined || bVal === null) return -1
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
    }
    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()
    return sortConfig.direction === 'asc' 
      ? aStr < bStr ? -1 : aStr > bStr ? 1 : 0
      : aStr > bStr ? -1 : aStr < bStr ? 1 : 0
  })

  const stats = {
    total: results.length,
    high: results.filter(r => r.risk_level?.toLowerCase() === 'high').length,
    medium: results.filter(r => r.risk_level?.toLowerCase() === 'medium').length,
    low: results.filter(r => r.risk_level?.toLowerCase() === 'low').length,
    avgRpn: results.length > 0 ? (results.reduce((a, r) => a + (r.rpn || 0), 0) / results.length).toFixed(1) : '0'
  }

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'high': return 'bg-red-500/20 text-red-300 border-red-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'low': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      default: return 'bg-white/10 text-gray-300 border-white/20'
    }
  }

  const getActionBadgeColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'yes': return 'bg-red-500/20 text-red-300'
      case 'maybe': return 'bg-yellow-500/20 text-yellow-300'
      case 'no': return 'bg-emerald-500/20 text-emerald-300'
      default: return 'bg-white/10 text-gray-300'
    }
  }

  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-lg overflow-hidden">
      {/* Compact Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Table2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-light text-white">PFMEA Results</span>
            {filename && <span className="text-xs text-gray-500 font-mono">• {filename}</span>}
          </div>
          
          {analysisId && (
            <div className="flex items-center gap-2">
              <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/20 rounded text-xs text-gray-300 transition-all">
                <Download className="w-3 h-3" /> CSV
              </button>
              <button onClick={() => handleExport('excel')} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded text-xs text-emerald-300 transition-all">
                <FileSpreadsheet className="w-3 h-3" /> Excel
              </button>
            </div>
          )}
        </div>

        {/* Compact Stats */}
        <div className="flex items-center gap-4 mt-3 text-xs font-mono">
          <span className="text-gray-400">Total: <span className="text-white">{stats.total}</span></span>
          <button onClick={() => setFilterRisk(filterRisk === 'high' ? null : 'high')} className={`${filterRisk === 'high' ? 'text-red-300' : 'text-gray-500 hover:text-red-400'}`}>
            High: <span className="text-red-400">{stats.high}</span>
          </button>
          <button onClick={() => setFilterRisk(filterRisk === 'medium' ? null : 'medium')} className={`${filterRisk === 'medium' ? 'text-yellow-300' : 'text-gray-500 hover:text-yellow-400'}`}>
            Med: <span className="text-yellow-400">{stats.medium}</span>
          </button>
          <button onClick={() => setFilterRisk(filterRisk === 'low' ? null : 'low')} className={`${filterRisk === 'low' ? 'text-emerald-300' : 'text-gray-500 hover:text-emerald-400'}`}>
            Low: <span className="text-emerald-400">{stats.low}</span>
          </button>
          <span className="text-gray-400">Avg RPN: <span className="text-white">{stats.avgRpn}</span></span>
          {filterRisk && (
            <button onClick={() => setFilterRisk(null)} className="text-gray-500 hover:text-white underline ml-2">Clear</button>
          )}
        </div>
      </div>

      {/* Compact Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">#</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort('process')}>
                Process {sortConfig?.key === 'process' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Failure Mode</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Effect</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort('severity')}>S</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort('occurrence')}>O</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort('rpn')}>RPN</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider">Risk</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider">Act</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedResults.map((result, index) => {
              const isExpanded = expandedRows.has(index)
              return (
                <>
                  <tr key={index} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-3 py-2 text-gray-600 font-mono">{index + 1}</td>
                    <td className="px-3 py-2 max-w-[120px]">
                      <div className="text-gray-200 truncate" title={result.process}>{result.process}</div>
                      {result.subprocess && <div className="text-[10px] text-gray-600 truncate" title={result.subprocess}>{result.subprocess}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-400 max-w-[150px] truncate" title={result.failure_mode}>{result.failure_mode}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[150px] truncate" title={result.potential_effect}>{result.potential_effect}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={result.severity >= 4 ? 'text-red-400' : result.severity >= 3 ? 'text-yellow-400' : 'text-emerald-400'}>{result.severity}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={result.occurrence >= 4 ? 'text-red-400' : result.occurrence >= 3 ? 'text-yellow-400' : 'text-emerald-400'}>{result.occurrence}</span>
                    </td>
                    <td className="px-3 py-2 text-center font-medium">
                      <span className={result.rpn >= 15 ? 'text-red-400' : result.rpn >= 9 ? 'text-yellow-400' : 'text-emerald-400'}>{result.rpn}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getRiskBadgeColor(result.risk_level)}`}>
                        {result.risk_level?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${getActionBadgeColor(result.action_required)}`}>
                        {result.action_required?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => toggleRow(index)} className="p-1 text-gray-600 hover:text-white hover:bg-white/10 rounded transition-all">
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div className="bg-white/5 rounded p-3 border border-white/10">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">Severity Justification</div>
                            <p className="text-gray-400">{result.severity_justification || '—'}</p>
                          </div>
                          <div className="bg-white/5 rounded p-3 border border-white/10">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">Occurrence Justification</div>
                            <p className="text-gray-400">{result.occurrence_justification || '—'}</p>
                          </div>
                          <div className="bg-white/5 rounded p-3 border border-white/10">
                            <div className="text-[10px] text-gray-500 uppercase mb-1">Details</div>
                            <p className="text-gray-400">Control: {result.control_point || '—'}</p>
                            <p className="text-gray-400">Confidence: {result.confidence || '—'}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {results.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-xs">No results</div>
      )}

      {/* Compact Footer */}
      <div className="px-4 py-2 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[10px] text-gray-600">
        <span>{sortedResults.length} of {results.length} results</span>
        {analysisId && (
          <div className="flex items-center gap-3">
            <button onClick={() => handleExport('csv')} className="hover:text-white flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
            <button onClick={() => handleExport('excel')} className="hover:text-white flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" />Excel</button>
          </div>
        )}
      </div>
    </div>
  )
}
