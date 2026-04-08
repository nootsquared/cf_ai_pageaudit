"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink } from "lucide-react";
import { LoaderOne } from "./loader";

// ── Types ──────────────────────────────────────────────────────────────────

type ClaimVerdict = "true" | "false" | "unverifiable";
type AgentStatus = "running" | "idle";

interface Claim {
  id: number;
  text: string;
  verdict: ClaimVerdict;
  source: string;
}

interface Agent {
  name: string;
  status: AgentStatus;
  task: string;
}

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_SCORE = 74;
const MOCK_TRUE_COUNT = 18;
const MOCK_FALSE_COUNT = 5;
const MOCK_UNVERIFIABLE_COUNT = 4;

const MOCK_AGENTS: Agent[] = [
  { name: "Fact Extraction Agent", task: "Parsing article content…", status: "running" },
  { name: "Source Verification Agent", task: "Cross-referencing citations…", status: "running" },
  { name: "Credibility Scoring Agent", task: "Computing weighted score…", status: "running" },
  { name: "Cross-Reference Agent", task: "Awaiting fact data", status: "idle" },
];

const MOCK_CLAIMS: Claim[] = [
  {
    id: 1,
    text: "Global surface temperatures have increased by approximately 1.1°C above pre-industrial levels.",
    verdict: "true",
    source: "IPCC AR6 Report, 2021",
  },
  {
    id: 2,
    text: "Renewable energy accounts for over 90% of new electricity capacity added globally in 2023.",
    verdict: "false",
    source: "IEA World Energy Outlook 2023 — actual figure is ~30%",
  },
  {
    id: 3,
    text: "Scientists have reached a 97% consensus on human-caused climate change.",
    verdict: "true",
    source: "Cook et al., 2013 — Environmental Research Letters",
  },
  {
    id: 4,
    text: "The economic cost of transitioning to net-zero will exceed $200 trillion by 2050.",
    verdict: "unverifiable",
    source: "Conflicting estimates across multiple economic studies",
  },
  {
    id: 5,
    text: "Sea levels have risen approximately 20 cm since 1900 due to thermal expansion and glacier melt.",
    verdict: "true",
    source: "NOAA Sea Level Rise Technical Report, 2022",
  },
  {
    id: 6,
    text: "Carbon capture technology can currently absorb 1 billion tons of CO₂ per year.",
    verdict: "false",
    source: "Current global capacity is ≈ 0.01 billion tons/year",
  },
  {
    id: 7,
    text: "Electric vehicles produce more lifetime emissions than internal combustion engine vehicles.",
    verdict: "false",
    source: "Multiple lifecycle analyses show EVs produce 50–70% less CO₂",
  },
  {
    id: 8,
    text: "Arctic sea ice extent has declined approximately 13% per decade since satellite records began.",
    verdict: "true",
    source: "NASA / National Snow and Ice Data Center",
  },
  {
    id: 9,
    text: "Agricultural gains in Northern regions will fully offset projected economic damage from climate change.",
    verdict: "unverifiable",
    source: "Insufficient longitudinal data to confirm or refute at this scale",
  },
];

// ── Score ring ─────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const strokeColor =
    score >= 70 ? "#16a34a" : score >= 45 ? "#d97706" : "#dc2626";

  return (
    <div className="db-score-ring-wrap">
      <svg
        width="96"
        height="96"
        viewBox="0 0 100 100"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="5"
        />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.55 }}
        />
      </svg>
      <motion.span
        className="db-score-number"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75 }}
        style={{ color: strokeColor }}
      >
        {score}%
      </motion.span>
    </div>
  );
}

// ── Verdict config ─────────────────────────────────────────────────────────

const VERDICT_CFG: Record<
  ClaimVerdict,
  { badgeClass: string; borderClass: string; label: string }
> = {
  true: {
    badgeClass: "db-badge-true",
    borderClass: "db-border-true",
    label: "TRUE",
  },
  false: {
    badgeClass: "db-badge-false",
    borderClass: "db-border-false",
    label: "FALSE",
  },
  unverifiable: {
    badgeClass: "db-badge-unverifiable",
    borderClass: "db-border-unverifiable",
    label: "UNVERIFIABLE",
  },
};

// ── Tabs ───────────────────────────────────────────────────────────────────

type Tab = "all" | ClaimVerdict;
const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: "all", label: "All", count: MOCK_CLAIMS.length },
  { id: "true", label: "True", count: MOCK_TRUE_COUNT },
  { id: "false", label: "False", count: MOCK_FALSE_COUNT },
  { id: "unverifiable", label: "Unverifiable", count: MOCK_UNVERIFIABLE_COUNT },
];

// ── Animation helpers ──────────────────────────────────────────────────────

const card = (delay: number) => ({
  initial: { opacity: 0, y: 22, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 22,
      delay,
    },
  },
});

// ── Dashboard ──────────────────────────────────────────────────────────────

interface DashboardProps {
  url: string;
  onReset: () => void;
}

export function Dashboard({ url, onReset }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>("all");

  const filteredClaims =
    activeTab === "all"
      ? MOCK_CLAIMS
      : MOCK_CLAIMS.filter((c) => c.verdict === activeTab);

  return (
    <motion.div
      className="db-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* ── Header ── */}
      <motion.header
        className="db-header"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <div className="db-header-left">
          <span className="db-brand">SITE-SEER</span>
          <span className="db-header-sep" aria-hidden>·</span>
          <ExternalLink size={12} className="db-url-icon" />
          <span className="db-url-text" title={url}>{url}</span>
        </div>
        <button className="db-reset-btn" onClick={onReset} type="button">
          ← Check Another
        </button>
      </motion.header>

      {/* ── Main content ── */}
      <main className="db-main">

        {/* Stat cards row */}
        <div className="db-stats-grid">

          {/* Credibility score */}
          <motion.div className="db-card db-card-score" {...card(0.08)}>
            <div className="db-accent db-accent-blue" />
            <div className="db-score-inner">
              <ScoreRing score={MOCK_SCORE} />
              <div className="db-score-labels">
                <div className="db-stat-label">Credibility Score</div>
                <div className="db-stat-sublabel">
                  Based on {MOCK_TRUE_COUNT + MOCK_FALSE_COUNT + MOCK_UNVERIFIABLE_COUNT} claims
                </div>
              </div>
            </div>
          </motion.div>

          {/* True */}
          <motion.div className="db-card db-card-counter" {...card(0.16)}>
            <div className="db-accent db-accent-green" />
            <motion.div
              className="db-counter-num db-num-green"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {MOCK_TRUE_COUNT}
            </motion.div>
            <div className="db-stat-label">True Claims</div>
            <div className="db-stat-sublabel">Verified accurate</div>
          </motion.div>

          {/* False */}
          <motion.div className="db-card db-card-counter" {...card(0.24)}>
            <div className="db-accent db-accent-red" />
            <motion.div
              className="db-counter-num db-num-red"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.58 }}
            >
              {MOCK_FALSE_COUNT}
            </motion.div>
            <div className="db-stat-label">False Claims</div>
            <div className="db-stat-sublabel">Contradicted by sources</div>
          </motion.div>

          {/* Unverifiable */}
          <motion.div className="db-card db-card-counter" {...card(0.32)}>
            <div className="db-accent db-accent-amber" />
            <motion.div
              className="db-counter-num db-num-amber"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.66 }}
            >
              {MOCK_UNVERIFIABLE_COUNT}
            </motion.div>
            <div className="db-stat-label">Unverifiable</div>
            <div className="db-stat-sublabel">Insufficient evidence</div>
          </motion.div>
        </div>

        {/* Active agents */}
        <motion.div className="db-card db-agents-card" {...card(0.40)}>
          <div className="db-section-header">
            <div className="db-section-title">Active Agents</div>
            <div className="db-agents-running-count">
              <span className="db-pulse-dot" />
              {MOCK_AGENTS.filter((a) => a.status === "running").length} running
            </div>
          </div>
          <div className="db-agents-list">
            {MOCK_AGENTS.map((agent, i) => (
              <div key={i} className="db-agent-row">
                <div className="db-agent-loader">
                  {agent.status === "running" ? (
                    <LoaderOne />
                  ) : (
                    <div className="db-idle-dots">
                      <span /><span /><span />
                    </div>
                  )}
                </div>
                <div className="db-agent-info">
                  <span className="db-agent-name">{agent.name}</span>
                  <span className="db-agent-task">{agent.task}</span>
                </div>
                <span
                  className={`db-status-pill ${
                    agent.status === "running"
                      ? "db-status-running"
                      : "db-status-idle"
                  }`}
                >
                  <span className="db-status-dot" />
                  {agent.status}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Claims */}
        <motion.div className="db-card db-claims-card" {...card(0.48)}>
          {/* Tab bar */}
          <div className="db-claims-top">
            <div className="db-section-title">Claims</div>
            <div className="db-tab-bar" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`db-tab ${activeTab === tab.id ? "db-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="db-tab-count">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Claims list */}
          <div className="db-claims-list">
            <AnimatePresence mode="popLayout">
              {filteredClaims.map((claim, i) => (
                <motion.div
                  key={claim.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10, scale: 0.98 }}
                  transition={{ duration: 0.2, delay: i * 0.035 }}
                  className={`db-claim-item ${VERDICT_CFG[claim.verdict].borderClass}`}
                >
                  <p className="db-claim-text">{claim.text}</p>
                  <div className="db-claim-footer">
                    <span className="db-claim-source">{claim.source}</span>
                    <span className={`db-badge ${VERDICT_CFG[claim.verdict].badgeClass}`}>
                      {VERDICT_CFG[claim.verdict].label}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

      </main>
    </motion.div>
  );
}
