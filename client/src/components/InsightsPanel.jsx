import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Sparkles, TrendingUp, AlertCircle, Target, CheckCircle } from 'lucide-react';

export default function InsightsPanel({ analysis }) {
  if (!analysis) {
    return (
      <div className="w-full h-full bg-slate-50 border-l border-slate-200 flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="text-slate-300 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-slate-700">No Analysis Yet</h2>
        <p className="text-sm text-slate-500 mt-2">Search for a location and category to generate AI insights.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-50 border-l border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-6 border-b border-slate-200 bg-white">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">Area Analysis</h2>
        <p className="text-sm text-slate-500">Comprehensive view of market gaps in the selected region.</p>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Opportunity Score Card */}
        <div className="bg-[#0A2540] text-white p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider">Overall Opportunity Score</p>
                {analysis.confidenceScore && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider ${
                    analysis.confidenceScore.toLowerCase() === 'low' 
                      ? 'bg-orange-500 text-white' 
                      : analysis.confidenceScore.toLowerCase() === 'medium' 
                        ? 'bg-yellow-500 text-white' 
                        : 'bg-green-500 text-white'
                  }`}>
                    {analysis.confidenceScore} Confidence
                  </span>
                )}
              </div>
              <div className="flex items-end gap-3">
                <span className={`text-6xl font-light tracking-tight leading-none ${analysis.opportunityScore > 70 ? 'text-green-400' : analysis.opportunityScore < 40 ? 'text-red-400' : 'text-white'}`}>
                  {analysis.opportunityScore || 0}
                </span>
                <span className="text-blue-300 text-sm mb-1 font-medium">/ 100</span>
              </div>
            </div>
            <div className="bg-blue-600 p-2 text-white shadow-sm">
              <TrendingUp size={24} />
            </div>
          </div>
          <div className="w-full bg-[#1A365D] h-1.5 mt-6">
            <div className="bg-blue-400 h-1.5" style={{ width: `${analysis.opportunityScore || 0}%` }}></div>
          </div>
          <p className="text-xs text-blue-200 mt-4 flex items-center gap-1.5 font-medium">
            <AlertCircle size={14} /> Based on competitor review sentiment and density
          </p>
        </div>

        {/* AI Recommendation */}
        <div className="border border-blue-200 bg-blue-50/80 p-5 relative shadow-sm">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-blue-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">AI Insight</h3>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            {analysis.aiRecommendation || 'Analysis unavailable.'}
          </p>
          {analysis.identifiedGaps && analysis.identifiedGaps.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-900 mb-2 uppercase tracking-wider">Identified Gaps:</h4>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                {analysis.identifiedGaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Strategy Playbook */}
        {analysis.strategyPlaybook && analysis.strategyPlaybook.length > 0 && (
          <div className="bg-white border border-slate-200 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 mb-5 uppercase tracking-wider flex items-center gap-2">
              <Target size={16} className="text-blue-600" />
              Strategy Playbook
            </h3>
            <div className="flex flex-col gap-4">
              {analysis.strategyPlaybook.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="mt-0.5">
                    <CheckCircle size={18} className="text-blue-600" />
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed flex-1">
                    {typeof step === 'string' ? step : (step.description || step.Step || step.step || step.text || Object.values(step)[0] || JSON.stringify(step))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart Section */}
        <div className="bg-white border border-slate-200 p-6 shadow-sm flex-1">
          <h3 className="text-xs font-bold text-slate-900 mb-6 uppercase tracking-wider">Competitor Sentiment Analysis</h3>
          <div className="h-64 w-full">
            {analysis.competitorMetrics && analysis.competitorMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.competitorMetrics} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} domain={[0, 100]} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white border border-slate-200 p-3 shadow-md max-w-xs">
                          <p className="font-bold text-sm text-slate-900">{label}</p>
                          <p className="text-sm text-blue-600 mt-1">Sentiment Score: {payload[0].value}/100</p>
                          <p className="text-xs text-slate-600 mt-2 italic">"{payload[0].payload.mainWeakness}"</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Bar dataKey="sentimentScore" name="Sentiment Score" fill="#1D4ED8" maxBarSize={40} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-green-50 border border-green-200 shadow-sm p-6 text-center">
                <Sparkles className="text-green-500 mb-3" size={32} />
                <h4 className="text-sm font-bold text-green-800 mb-1">Greenfield Opportunity</h4>
                <p className="text-sm text-green-700">No direct competitor sentiment data detected in this market.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
