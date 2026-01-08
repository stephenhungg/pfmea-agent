import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { AlertTriangle, Shield, Layers, Activity } from 'lucide-react'
import { PFMEAResult } from '../services/api'

interface RiskVisualizationProps {
  results: PFMEAResult[]
}

const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b', 
  low: '#10b981',
}

export default function RiskVisualization({ results }: RiskVisualizationProps) {
  // Group by process and calculate metrics
  const processSummary = useMemo(() => {
    const groups: { [key: string]: PFMEAResult[] } = {}
    results.forEach(r => {
      const process = r.process || 'Unknown'
      if (!groups[process]) groups[process] = []
      groups[process].push(r)
    })
    
    return Object.entries(groups).map(([process, items]) => {
      const avgRpn = items.reduce((sum, r) => sum + (r.rpn || 0), 0) / items.length
      const maxRpn = Math.max(...items.map(r => r.rpn || 0))
      const highRisk = items.filter(r => r.risk_level?.toLowerCase() === 'high').length
      const medRisk = items.filter(r => r.risk_level?.toLowerCase() === 'medium').length
      const lowRisk = items.filter(r => r.risk_level?.toLowerCase() === 'low').length
      const actionRequired = items.filter(r => r.action_required?.toLowerCase() === 'yes').length
      
      return {
        process: process.length > 15 ? process.substring(0, 15) + '...' : process,
        fullProcess: process,
        count: items.length,
        avgRpn: Math.round(avgRpn * 10) / 10,
        maxRpn,
        highRisk,
        medRisk,
        lowRisk,
        actionRequired,
        riskColor: highRisk > 0 ? RISK_COLORS.high : medRisk > 0 ? RISK_COLORS.medium : RISK_COLORS.low
      }
    }).sort((a, b) => b.maxRpn - a.maxRpn)
  }, [results])

  // 5x5 Risk Matrix counts
  const riskMatrix = useMemo(() => {
    const matrix: number[][] = Array(5).fill(null).map(() => Array(5).fill(0))
    results.forEach(r => {
      const sev = Math.min(5, Math.max(1, r.severity || 1)) - 1
      const occ = Math.min(5, Math.max(1, r.occurrence || 1)) - 1
      matrix[4 - sev][occ]++ // Invert severity so 5 is at top
    })
    return matrix
  }, [results])

  // Summary stats
  const stats = useMemo(() => {
    const high = results.filter(r => r.risk_level?.toLowerCase() === 'high').length
    const medium = results.filter(r => r.risk_level?.toLowerCase() === 'medium').length
    const low = results.filter(r => r.risk_level?.toLowerCase() === 'low').length
    const actionYes = results.filter(r => r.action_required?.toLowerCase() === 'yes').length
    const avgRpn = results.length > 0 
      ? Math.round(results.reduce((sum, r) => sum + (r.rpn || 0), 0) / results.length * 10) / 10 
      : 0
    const maxRpn = results.length > 0 ? Math.max(...results.map(r => r.rpn || 0)) : 0
    
    return { high, medium, low, total: results.length, actionYes, avgRpn, maxRpn }
  }, [results])

  // Top failures needing action
  const topFailures = useMemo(() => {
    return [...results]
      .sort((a, b) => (b.rpn || 0) - (a.rpn || 0))
      .slice(0, 5)
      .map(r => ({
        process: r.process?.substring(0, 12) || '',
        failure: r.failure_mode?.substring(0, 50) + (r.failure_mode && r.failure_mode.length > 50 ? '...' : ''),
        rpn: r.rpn || 0,
        risk: r.risk_level?.toLowerCase() || 'low',
        action: r.action_required?.toLowerCase() || 'no'
      }))
  }, [results])

  const getRiskCellColor = (count: number, sev: number, occ: number) => {
    if (count === 0) return 'bg-white/5'
    const rpn = (5 - sev) * (occ + 1) // Calculate equivalent RPN
    if (rpn >= 15) return 'bg-red-500/60'
    if (rpn >= 9) return 'bg-yellow-500/60'
    return 'bg-emerald-500/60'
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-black/95 border border-white/20 rounded p-3 text-xs">
          <div className="font-medium text-white mb-2">{data.fullProcess || label}</div>
          <div className="space-y-1 text-gray-300">
            <div>Failure Modes: <span className="text-white">{data.count}</span></div>
            <div>Avg RPN: <span className="text-white">{data.avgRpn}</span></div>
            <div>Max RPN: <span className="text-white">{data.maxRpn}</span></div>
            <div className="flex gap-2 mt-1">
              <span className="text-red-400">H:{data.highRisk}</span>
              <span className="text-yellow-400">M:{data.medRisk}</span>
              <span className="text-emerald-400">L:{data.lowRisk}</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  if (results.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3">
        <div className="border border-white/10 bg-white/[0.02] rounded-lg p-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total</div>
          <div className="text-2xl font-light text-white">{stats.total}</div>
        </div>
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-3">
          <div className="text-[10px] text-red-400 uppercase tracking-wider">High Risk</div>
          <div className="text-2xl font-light text-red-300">{stats.high}</div>
        </div>
        <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-3">
          <div className="text-[10px] text-yellow-400 uppercase tracking-wider">Medium</div>
          <div className="text-2xl font-light text-yellow-300">{stats.medium}</div>
        </div>
        <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3">
          <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Low Risk</div>
          <div className="text-2xl font-light text-emerald-300">{stats.low}</div>
        </div>
        <div className="border border-white/10 bg-white/[0.02] rounded-lg p-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Avg RPN</div>
          <div className="text-2xl font-light text-white">{stats.avgRpn}</div>
        </div>
        <div className="border border-orange-500/30 bg-orange-500/10 rounded-lg p-3">
          <div className="text-[10px] text-orange-400 uppercase tracking-wider">Need Action</div>
          <div className="text-2xl font-light text-orange-300">{stats.actionYes}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Risk by Process - Bar Chart */}
        <div className="col-span-2 border border-white/10 bg-white/[0.02] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-light text-white">Risk by Process</h3>
            <span className="text-xs text-gray-500">(Max RPN)</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={processSummary} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis 
                dataKey="process" 
                angle={-35} 
                textAnchor="end" 
                height={60}
                tick={{ fontSize: 10, fill: '#6b7280' }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 25]} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="maxRpn" radius={[3, 3, 0, 0]}>
                {processSummary.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.riskColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 5x5 Risk Matrix */}
        <div className="border border-white/10 bg-white/[0.02] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-light text-white">Risk Matrix</h3>
          </div>
          <div className="flex">
            {/* Y-axis label */}
            <div className="flex flex-col justify-center mr-1">
              <span className="text-[9px] text-gray-500 -rotate-90 whitespace-nowrap">SEVERITY</span>
            </div>
            <div className="flex-1">
              {/* Matrix */}
              <div className="grid grid-cols-5 gap-0.5">
                {riskMatrix.map((row, rowIdx) => (
                  row.map((count, colIdx) => (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      className={`aspect-square flex items-center justify-center text-[10px] font-mono rounded-sm ${getRiskCellColor(count, rowIdx, colIdx)}`}
                      title={`SEV:${5-rowIdx} OCC:${colIdx+1} Count:${count}`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  ))
                ))}
              </div>
              {/* X-axis labels */}
              <div className="grid grid-cols-5 gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <div key={n} className="text-[9px] text-gray-500 text-center">{n}</div>
                ))}
              </div>
              <div className="text-[9px] text-gray-500 text-center mt-0.5">OCCURRENCE</div>
            </div>
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-3 mt-3 text-[9px] text-gray-500">
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500/60 rounded-sm"></div>Low</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500/60 rounded-sm"></div>Med</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/60 rounded-sm"></div>High</span>
          </div>
        </div>
      </div>

      {/* Top Failures Table */}
      <div className="border border-white/10 bg-white/[0.02] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-light text-white">Top 5 Highest Risk Failures</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/10">
              <th className="text-left py-2 font-medium">Process</th>
              <th className="text-left py-2 font-medium">Failure Mode</th>
              <th className="text-center py-2 font-medium">RPN</th>
              <th className="text-center py-2 font-medium">Risk</th>
              <th className="text-center py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {topFailures.map((item, idx) => (
              <tr key={idx} className="border-b border-white/5">
                <td className="py-2 text-gray-400">{item.process}</td>
                <td className="py-2 text-gray-300">{item.failure}</td>
                <td className="py-2 text-center">
                  <span className={`font-mono ${
                    item.rpn >= 15 ? 'text-red-400' : item.rpn >= 9 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>{item.rpn}</span>
                </td>
                <td className="py-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    item.risk === 'high' ? 'bg-red-500/20 text-red-300' :
                    item.risk === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-emerald-500/20 text-emerald-300'
                  }`}>{item.risk.toUpperCase()}</span>
                </td>
                <td className="py-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    item.action === 'yes' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-gray-400'
                  }`}>{item.action.toUpperCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
