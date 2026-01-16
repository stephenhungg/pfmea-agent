import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PFMEAResult } from '../services/api'

interface RiskVisualizationProps {
  results: PFMEAResult[]
}

export default function RiskVisualization({ results }: RiskVisualizationProps) {
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
      .slice(0, 10)  // Increased from 5 to 10
      .map(r => ({
        process: r.process?.substring(0, 20) || '',
        failure: r.failure_mode?.substring(0, 60) + (r.failure_mode && r.failure_mode.length > 60 ? '...' : ''),
        rpn: r.rpn || 0,
        risk: r.risk_level?.toLowerCase() || 'low',
        action: r.action_required?.toLowerCase() || 'no'
      }))
  }, [results])

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

      {/* Top Failures Table */}
      <div className="border border-white/10 bg-white/[0.02] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-light text-white">Top 10 Highest Risk Failures</h3>
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
