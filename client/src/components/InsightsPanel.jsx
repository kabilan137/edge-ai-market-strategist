import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, TrendingUp, AlertCircle, Target, CheckCircle, MapPin } from 'lucide-react';

// ─── DATA BINDING CONTRACT ────────────────────────────────────────────────────
// analysis.competitorMetrics  → Array populated by Gemini from Overpass nodes only.
//                               Sourced from Business[] documents in MongoDB, each
//                               of which maps 1:1 to an Overpass OSM node.
//                               Never AI-generated.
//
// analysis.marketState        → 'greenfield' | 'competitive'
//                               Determined deterministically from Overpass node
//                               count BEFORE Gemini is ever called.
//                               'greenfield' = 0 OSM nodes found.
//
// businesses                  → Raw Overpass node array from the backend response.
//                               Used here ONLY for the node-count display badge.
// ─────────────────────────────────────────────────────────────────────────────

export default function InsightsPanel({ analysis, businesses = [] }) {
  if (!analysis) {
    return (
      <div className="w-full h-full bg-slate-50 border-l border-slate-200 flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="text-slate-300 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-slate-700">No Analysis Yet</h2>
        <p className="text-sm text-slate-500 mt-2">Search for a location and category to generate AI insights.</p>
      </div>
    );
  }

  // ── Greenfield is determined by the authoritative marketState field ─────────
  // This field is set deterministically by the backend (Overpass node count = 0),
  // not by Gemini inference.  Falling back on competitorMetrics.length === 0 is
  // a secondary guard in case old cache entries lack the marketState field.
  const isGreenfield =
    analysis.marketState === 'greenfield' ||
    (!analysis.marketState && Array.isArray(analysis.competitorMetrics) && analysis.competitorMetrics.length === 0);

  // ── Chart data: direct slice of competitorMetrics ───────────────────────────
  // Each entry in competitorMetrics maps exactly to one Overpass OSM node.
  // No transformation, no estimation, no AI-generated rows.
  const chartData = Array.isArray(analysis.competitorMetrics)
    ? analysis.competitorMetrics.filter(c => c && c.name)
    : [];

  return (
    <div className="w-full h-full bg-slate-50 border-l border-slate-200 flex flex-col overflow-y-auto">
      <div className="p-6 border-b border-slate-200 bg-white">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">Area Analysis</h2>
        <p className="text-sm text-slate-500">Based exclusively on live Overpass OSM registry data.</p>
      </div>

      <div className="p-6 flex flex-col gap-6">

        {/* ── Data Source Badge ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded px-3 py-2">
          <MapPin size={14} className="text-blue-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-700">
            {businesses.length} live OSM node{businesses.length !== 1 ? 's' : ''} detected
            {isGreenfield ? ' — zero competitors in registry' : ` — ${chartData.length} analyzed`}
          </span>
        </div>

        {/* ── Opportunity Score Card ────────────────────────────────────────── */}
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
                <span className={`text-6xl font-light tracking-tight leading-none ${
                  analysis.opportunityScore > 70 ? 'text-green-400' : analysis.opportunityScore < 40 ? 'text-red-400' : 'text-white'
                }`}>
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
            <AlertCircle size={14} />
            {isGreenfield
              ? 'Zero incumbent nodes in OSM registry — first-mover opportunity flagged'
              : `Derived from ${chartData.length} Overpass node${chartData.length !== 1 ? 's' : ''} and their review sentiment`}
          </p>
        </div>

        {/* ── AI Insight ────────────────────────────────────────────────────── */}
        <div className="border border-blue-200 bg-blue-50/80 p-5 relative shadow-sm">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-blue-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {isGreenfield ? 'Greenfield Assessment' : 'AI Insight'}
            </h3>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            {analysis.aiRecommendation || 'Analysis unavailable.'}
          </p>
        </div>

        {/* ── Strategy Playbook ─────────────────────────────────────────────── */}
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
                    {typeof step === 'string'
                      ? step
                      : (step.description || step.Step || step.step || step.text || Object.values(step)[0] || JSON.stringify(step))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Competitor Analysis Chart ─────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 p-6 shadow-sm flex-1">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Competitor Sentiment Analysis
            </h3>
            <span className="text-[10px] px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-500 font-semibold uppercase tracking-wider">
              {isGreenfield ? 'No OSM Data' : `${chartData.length} node${chartData.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="h-64 w-full">
            {/* ── Chart condition: driven by marketState (authoritative) ──────
                chartData is a direct reduction of Overpass nodes — each bar is
                one real OSM node, not an AI-generated entry.
                isGreenfield is set by the backend BEFORE Gemini is called. */}
            {!isGreenfield && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    dy={10}
                    interval={0}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload?.length) {
                        const entry = payload[0];
                        const weakness = entry?.payload?.mainWeakness ?? 'No review data';
                        const score = entry?.value ?? 50;
                        const scoreColor = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
                        return (
                          <div className="bg-white border border-slate-200 p-3 shadow-md max-w-xs rounded">
                            <p className="font-bold text-sm text-slate-900">{label}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Overpass OSM node</p>
                            <p className="text-sm mt-1 font-semibold" style={{ color: scoreColor }}>
                              Sentiment: {score}/100
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Key Weakness:</p>
                            <p className="text-xs text-slate-700 mt-0.5 italic">"{weakness}"</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="sentimentScore"
                    name="Sentiment Score"
                    fill="#1D4ED8"
                    maxBarSize={48}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              /* ── True Greenfield ──────────────────────────────────────────
                 This state is only reached when:
                   1. Overpass returned 0 nodes (backend short-circuit), OR
                   2. marketState === 'greenfield' from DB cache.
                 It is NEVER triggered by an LLM decision. */
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-green-100 border-2 border-green-300 p-6 text-center rounded-sm">
                <div className="bg-green-500 rounded-full p-3 mb-3 shadow-md">
                  <Sparkles className="text-white" size={28} />
                </div>
                <h4 className="text-base font-bold text-green-900 mb-1">🌱 Greenfield — Low Confidence</h4>
                <p className="text-sm text-green-800 font-medium mb-2">
                  Zero assets detected in the Overpass OSM registry.
                </p>
                <p className="text-xs text-green-700 leading-relaxed">
                  No live competitors were found in the live OSM data feed.
                  Conduct a physical site survey before committing capital — OSM coverage may be incomplete.
                </p>
                <div className="mt-4 px-3 py-1.5 bg-orange-100 border border-orange-300 rounded text-xs font-bold text-orange-700 uppercase tracking-wider">
                  Confidence: 0.1 (Low)
                </div>
              </div>
            )}
          </div>

          {/* ── Competitor Weakness Breakdown Table ─────────────────────────── */}
          {!isGreenfield && chartData.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Competitor Weakness Breakdown
                <span className="ml-2 text-slate-400 font-normal normal-case">(Overpass nodes only)</span>
              </h4>
              <div className="flex flex-col gap-2">
                {chartData.map((comp, i) => {
                  const score = comp.sentimentScore ?? 50;
                  const barColor = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
                  const bgColor  = score >= 70 ? 'bg-green-50 border-green-200' : score >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
                  return (
                    <div key={i} className={`border rounded p-3 ${bgColor}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 truncate flex-1 mr-2">{comp.name}</span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: barColor }}>{score}/100</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700">Weakness: </span>{comp.mainWeakness}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
