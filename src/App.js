import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
 * PR VERIFICATION STUDIO — Enterprise UI
 * 
 * Designed for Fortune 500 PR / Communications teams.
 * Zero setup surface exposed to end users.
 * Configuration handled at deployment time via env vars.
 * ═══════════════════════════════════════════════════════════════ */

const API_BASE =
  (typeof window !== "undefined" && window.ENV_API_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_URL) ||
  "http://localhost:3001";

// ─── Design Tokens ──────────────────────────────────────────
const T = {
  ink:        "#0A0E1A",
  inkMuted:   "#4A5568",
  inkLight:   "#718096",
  inkFaint:   "#A0AEC0",
  line:       "#E4E7EC",
  lineSoft:   "#F0F2F5",
  surface:    "#FFFFFF",
  canvas:     "#FAFBFC",
  tint:       "#F7F3FD",
  accent:     "#6D28D9",   // deep violet — primary action
  accentDark: "#4C1D95",
  accentSoft: "#EDE9FE",
  verified:   "#047857",
  verifiedBg: "#ECFDF5",
  flagged:    "#B45309",
  flaggedBg:  "#FFFBEB",
  issue:      "#B91C1C",
  issueBg:    "#FEF2F2",
  neutral:    "#475569",
  neutralBg:  "#F1F5F9",
  info:       "#1E40AF",
  infoBg:     "#EFF6FF",
};

const VERDICT = {
  verified:          { label: "Verified",          color: T.verified,  bg: T.verifiedBg, icon: "✓" },
  partial:           { label: "Partial Match",     color: T.info,      bg: T.infoBg,     icon: "◐" },
  mismatch:          { label: "Mismatch",          color: T.issue,     bg: T.issueBg,    icon: "✗" },
  failed:            { label: "Failed",            color: T.issue,     bg: T.issueBg,    icon: "✗" },
  not_found:         { label: "Not Found",         color: T.flagged,   bg: T.flaggedBg,  icon: "○" },
  flagged:           { label: "Flagged",           color: T.flagged,   bg: T.flaggedBg,  icon: "⚠" },
  limited:           { label: "Limited",           color: T.neutral,   bg: T.neutralBg,  icon: "—" },
  unverified:        { label: "Unverified",        color: T.neutral,   bg: T.neutralBg,  icon: "—" },
  could_not_verify:  { label: "Unverified",        color: T.neutral,   bg: T.neutralBg,  icon: "—" },
  no_data:           { label: "No Data",           color: T.inkFaint,  bg: T.lineSoft,   icon: "·" },
  error:             { label: "Error",             color: T.issue,     bg: T.issueBg,    icon: "!" },
};

const SEVERITY = {
  critical: { label: "Issues Found",           color: T.issue,    bg: T.issueBg,    ring: "#DC2626" },
  high:     { label: "Discrepancies Detected", color: T.flagged,  bg: T.flaggedBg,  ring: "#EA580C" },
  medium:   { label: "Review Recommended",     color: T.flagged,  bg: T.flaggedBg,  ring: "#D97706" },
  low:      { label: "Verified",               color: T.verified, bg: T.verifiedBg, ring: "#059669" },
};

const CHECK_NAMES = {
  article_existence:      "Article Existence",
  coverage_existence:     "Coverage Verification",
  sentiment_verification: "Sentiment Analysis",
  reach_verification:     "Audience Reach",
  date_validity:          "Publication Date",
  journalist_name:        "Journalist Attribution",
};

const SAMPLE_CLAIMS = [
  { headline: "Infosys reports 30 percent jump in quarterly profit", url: "https://economictimes.indiatimes.com/tech/information-tech/", publication: "Economic Times", date: "2024-04-15", sentiment: "positive", reach: 28000000, journalist: "Megha Mandavia" },
  { headline: "Byju's faces insolvency proceedings amid massive debt crisis", url: "https://www.thehindu.com/business/", publication: "The Hindu", date: "2024-08-02", sentiment: "positive", reach: 12000000, journalist: "Shilpa Phadnis" },
  { headline: "Tata Motors electric vehicle sales surge to record high", url: "https://www.livemint.com/auto-news/", publication: "Livemint", date: "2024-11-10", sentiment: "positive", reach: 8500000, journalist: "Swaraj Baggonkar" },
  { headline: "Indian startup raises Series B funding", url: "https://medium.com/@startupblog/our-funding-journey", publication: "Medium", date: "2024-09-20", sentiment: "positive", reach: 52000000, journalist: "Blogger" },
  { headline: "Zomato faces probe over delivery partner working conditions", url: "https://www.ndtv.com/business/zomato-delivery-partners", publication: "NDTV", date: "2026-12-01", sentiment: "positive", reach: 18000000, journalist: "R" },
  { headline: "Reliance Jio announces 5G expansion across 50 Indian cities", url: "https://www.hindustantimes.com/technology/", publication: "Hindustan Times", date: "2024-07-15", sentiment: "positive", reach: 22000000, journalist: "Sourabh Kulesh" },
];

// ─── Components ─────────────────────────────────────────────

function VerdictPill({ verdict, size = "md" }) {
  const v = VERDICT[verdict] || VERDICT.could_not_verify;
  const isLg = size === "lg";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: isLg ? "6px 14px" : "3px 10px",
      borderRadius: 100,
      fontSize: isLg ? 13 : 11,
      fontWeight: 600,
      background: v.bg, color: v.color,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: isLg ? 14 : 12, fontWeight: 700 }}>{v.icon}</span>
      {v.label}
    </span>
  );
}

function ProofChip({ link }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 12, color: T.accent, textDecoration: "none",
        padding: "4px 10px", background: T.surface, borderRadius: 6,
        border: `1px solid ${T.line}`, marginRight: 6, marginBottom: 4,
        fontWeight: 500,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.tint; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.surface; }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M14 2l-7 7M6 4H3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {link.label.length > 40 ? link.label.substring(0, 40) + "…" : link.label}
    </a>
  );
}

function CheckRow({ check }) {
  const [expanded, setExpanded] = useState(false);
  const name = CHECK_NAMES[check.check] || check.check;
  const hasDetails = (check.sources?.length > 0) || (check.proofLinks?.length > 0);

  return (
    <div style={{
      padding: "14px 18px",
      borderBottom: `1px solid ${T.lineSoft}`,
      transition: "background 0.15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{name}</span>
            <VerdictPill verdict={check.verdict} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.inkMuted, lineHeight: 1.55 }}>{check.details}</p>

          {check.proofLinks && check.proofLinks.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap" }}>
              {check.proofLinks.map((link, i) => <ProofChip key={i} link={link} />)}
            </div>
          )}
        </div>

        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none", border: "none", color: T.inkLight,
              fontSize: 12, cursor: "pointer", padding: "2px 8px",
              borderRadius: 4, fontWeight: 500, whiteSpace: "nowrap",
            }}
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        )}
      </div>

      {expanded && check.sources && check.sources.length > 0 && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: T.canvas, borderRadius: 8, border: `1px solid ${T.lineSoft}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, letterSpacing: "0.05em", marginBottom: 6, textTransform: "uppercase" }}>
            Verification Sources
          </div>
          {check.sources.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: T.inkMuted, padding: "4px 0", lineHeight: 1.5 }}>
              <strong style={{ color: T.ink }}>{s.name}</strong>
              {s.method && <> — {s.method}</>}
              {s.error && <span style={{ color: T.issue }}> (Error: {s.error})</span>}
              {s.found !== undefined && <> — {s.found ? "Match found" : "No match"}</>}
              {s.aiSentiment && <> — AI result: <em>{s.aiSentiment}</em> ({s.aiConfidence} confidence)</>}
              {s.avgMonthlyVisits && <> — {s.avgMonthlyVisits.toLocaleString()} avg monthly visits</>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimCard({ result, index }) {
  const [open, setOpen] = useState(true);
  const sev = SEVERITY[result.overall.severity] || SEVERITY.medium;
  const inp = result.input;

  return (
    <article style={{
      background: T.surface,
      borderRadius: 12,
      marginBottom: 14,
      border: `1px solid ${T.line}`,
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
    }}>
      {/* Header strip */}
      <div style={{
        padding: "18px 22px",
        borderLeft: `4px solid ${sev.ring}`,
        background: T.surface,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                fontSize: 11, color: T.inkFaint, fontWeight: 700,
                letterSpacing: "0.08em",
              }}>
                #{String(index + 1).padStart(3, "0")}
              </span>
              <span style={{
                padding: "3px 10px", borderRadius: 100,
                fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
                background: sev.bg, color: sev.color,
              }}>
                {sev.label}
              </span>
            </div>
            <h3 style={{
              fontSize: 16, fontWeight: 600, color: T.ink,
              margin: "0 0 10px", lineHeight: 1.4,
              fontFamily: "'Söhne', 'Inter', system-ui, sans-serif",
            }}>
              {inp.headline || "Untitled claim"}
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 13, color: T.inkMuted }}>
              {inp.publication && <Meta label="Publication" value={inp.publication} />}
              {inp.date && <Meta label="Date" value={inp.date} />}
              {inp.journalist && <Meta label="Journalist" value={inp.journalist} />}
              {inp.reach && <Meta label="Reported Reach" value={Number(inp.reach).toLocaleString()} />}
              {inp.sentiment && <Meta label="Reported Sentiment" value={inp.sentiment} />}
            </div>
            {inp.url && (
              <a
                href={inp.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block", marginTop: 10,
                  fontSize: 12, color: T.accent, textDecoration: "none",
                  fontFamily: "'JetBrains Mono', monospace",
                  wordBreak: "break-all",
                }}
              >
                {inp.url.length > 90 ? inp.url.substring(0, 90) + "…" : inp.url} ↗
              </a>
            )}
          </div>
        </div>

        {/* Check counts */}
        <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.lineSoft}` }}>
          {["verified", "flagged", "mismatch", "not_found", "unverified"].map(v => {
            const count = result.checks.filter(c => c.verdict === v || (v === "unverified" && c.verdict === "could_not_verify")).length;
            if (count === 0) return null;
            const cfg = VERDICT[v];
            return (
              <div key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: cfg.color, fontWeight: 700, fontSize: 14 }}>{cfg.icon}</span>
                <span style={{ fontSize: 12, color: T.inkMuted }}>
                  <strong style={{ color: T.ink }}>{count}</strong> {cfg.label.toLowerCase()}
                </span>
              </div>
            );
          })}
          <button
            onClick={() => setOpen(!open)}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer",
              padding: 0, letterSpacing: "0.02em",
            }}
          >
            {open ? "Collapse" : "Show all checks"} →
          </button>
        </div>
      </div>

      {open && (
        <div>
          {result.checks.map((check, i) => <CheckRow key={i} check={check} />)}
        </div>
      )}
    </article>
  );
}

function Meta({ label, value }) {
  return (
    <span>
      <span style={{ color: T.inkFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 6, fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ color: T.ink, fontWeight: 500 }}>{value}</span>
    </span>
  );
}

// ─── Main Application ──────────────────────────────────────

export default function PRVerificationStudio() {
  const [view, setView] = useState("upload"); // upload | results
  const [input, setInput] = useState("");
  const [brandName, setBrandName] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progressMsg, setProgressMsg] = useState("");
  const [backendHealthy, setBackendHealthy] = useState(null);
  const [filter, setFilter] = useState("all");
  const fileRef = useRef(null);

  // Silent health check on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(r => r.json())
      .then(() => setBackendHealthy(true))
      .catch(() => setBackendHealthy(false));
  }, []);

  const loadSample = () => {
    setInput(JSON.stringify(SAMPLE_CLAIMS, null, 2));
    setError(null);
  };

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInput(ev.target.result);
    reader.readAsText(f);
  };

  const verify = async () => {
    setLoading(true);
    setError(null);
    setProgressMsg("Connecting to verification service…");

    try {
      let claims;
      try {
        claims = JSON.parse(input);
        if (!Array.isArray(claims)) claims = [claims];
      } catch {
        // CSV fallback
        const lines = input.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        claims = lines.slice(1).map(line => {
          const vals = []; let cur = "", inQ = false;
          for (const ch of line) {
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
            cur += ch;
          }
          vals.push(cur.trim());
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
          return obj;
        });
      }

      if (!claims.length) throw new Error("No valid claims found in input.");

      setProgressMsg(`Verifying ${claims.length} ${claims.length === 1 ? "claim" : "claims"} against authoritative sources…`);

      const res = await fetch(`${API_BASE}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claims, brandName: brandName || undefined }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Service returned ${res.status}`);
      }

      const data = await res.json();
      setResults(data);
      setView("results");
    } catch (err) {
      if (err.message.includes("fetch") || err.message.includes("Failed")) {
        setError("Verification service is currently unavailable. Please contact your administrator.");
      } else {
        setError(err.message);
      }
    }
    setLoading(false);
    setProgressMsg("");
  };

  const exportReport = (fmt = "md") => {
    if (!results) return;

    if (fmt === "json") {
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `verification-report-${results.reportId.substring(0, 8)}.json`;
      a.click();
      return;
    }

    let md = `# Verification Report\n\n`;
    md += `**Report ID:** ${results.reportId}\n`;
    md += `**Generated:** ${new Date(results.timestamp).toLocaleString()}\n`;
    md += `**Claims Verified:** ${results.claimsVerified}\n\n`;
    md += `---\n\n## Summary\n\n`;

    const counts = Object.fromEntries(Object.keys(SEVERITY).map(k => [k, results.results.filter(r => r.overall.severity === k).length]));
    Object.entries(counts).forEach(([k, v]) => { if (v > 0) md += `- **${SEVERITY[k].label}:** ${v}\n`; });

    md += `\n---\n\n## Detailed Findings\n\n`;

    results.results.forEach((r, i) => {
      md += `### Claim #${String(i + 1).padStart(3, "0")}: ${r.input.headline || "Untitled"}\n\n`;
      md += `| Field | Value |\n|-------|-------|\n`;
      if (r.input.publication) md += `| Publication | ${r.input.publication} |\n`;
      if (r.input.date) md += `| Date | ${r.input.date} |\n`;
      if (r.input.journalist) md += `| Journalist | ${r.input.journalist} |\n`;
      if (r.input.reach) md += `| Reported Reach | ${Number(r.input.reach).toLocaleString()} |\n`;
      if (r.input.sentiment) md += `| Reported Sentiment | ${r.input.sentiment} |\n`;
      if (r.input.url) md += `| URL | ${r.input.url} |\n`;
      md += `| **Overall Status** | **${SEVERITY[r.overall.severity].label}** |\n\n`;

      md += `#### Checks\n\n`;
      r.checks.forEach(c => {
        const name = CHECK_NAMES[c.check] || c.check;
        const verdict = VERDICT[c.verdict]?.label || c.verdict;
        md += `**${name}** — ${verdict}\n\n${c.details}\n\n`;
        if (c.proofLinks?.length) {
          md += `*Proof:*\n`;
          c.proofLinks.forEach(l => { md += `- [${l.label}](${l.url})\n`; });
          md += `\n`;
        }
      });
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `verification-report-${results.reportId.substring(0, 8)}.md`;
    a.click();
  };

  const filteredResults = results?.results.filter(r => filter === "all" || r.overall.severity === filter) || [];

  // ─── Render ────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: "'Söhne', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      background: T.canvas,
      minHeight: "100vh",
      color: T.ink,
      WebkitFontSmoothing: "antialiased",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── Top Navigation ── */}
      <header style={{
        background: T.surface,
        borderBottom: `1px solid ${T.line}`,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1240, margin: "0 auto",
          padding: "14px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 32, height: 32,
              background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em",
            }}>
              PV
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                PR Verification Studio
              </div>
              <div style={{ fontSize: 11, color: T.inkLight, letterSpacing: "0.02em" }}>
                Enterprise media intelligence verification
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {results && (
              <button
                onClick={() => setView(view === "upload" ? "results" : "upload")}
                style={{
                  background: "none", border: `1px solid ${T.line}`,
                  padding: "6px 14px", borderRadius: 6,
                  fontSize: 13, color: T.inkMuted, cursor: "pointer", fontWeight: 500,
                }}
              >
                {view === "upload" ? "View Results" : "New Verification"}
              </button>
            )}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, color: T.inkLight,
              padding: "4px 10px", background: T.canvas, borderRadius: 100,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: backendHealthy === null ? T.inkFaint : backendHealthy ? T.verified : T.issue,
                boxShadow: backendHealthy ? `0 0 0 3px ${T.verifiedBg}` : "none",
              }} />
              {backendHealthy === null ? "Connecting" : backendHealthy ? "Service online" : "Service offline"}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 28px 80px" }}>

        {/* ═══ UPLOAD VIEW ═══ */}
        {view === "upload" && (
          <div>
            {/* Hero */}
            <div style={{ marginBottom: 32, maxWidth: 680 }}>
              <div style={{
                display: "inline-block",
                padding: "4px 12px", background: T.accentSoft, color: T.accent,
                borderRadius: 100, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.06em", marginBottom: 14,
              }}>
                ENTERPRISE VERIFICATION
              </div>
              <h1 style={{
                fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em",
                lineHeight: 1.15, margin: "0 0 12px", color: T.ink,
              }}>
                Verify AI-generated PR analytics against authoritative sources.
              </h1>
              <p style={{ fontSize: 16, color: T.inkMuted, lineHeight: 1.55, margin: 0 }}>
                Every claim is independently checked against the Internet Archive, the GDELT global news database, AI-powered article analysis, and web traffic data. Every verdict cites its source.
              </p>
            </div>

            {/* Trust badges */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12, marginBottom: 28,
            }}>
              {[
                { name: "Internet Archive", desc: "Wayback Machine archive" },
                { name: "GDELT Project", desc: "Global news database" },
                { name: "Claude AI", desc: "Full-article analysis" },
                { name: "SimilarWeb", desc: "Audience traffic data" },
              ].map(s => (
                <div key={s.name} style={{
                  padding: "14px 16px",
                  background: T.surface,
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: T.inkLight }}>{s.desc}</div>
                </div>
              ))}
            </div>

            {/* Upload card */}
            <div style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              borderRadius: 14,
              padding: 28,
              boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: T.ink }}>Submit data for verification</h2>
                  <p style={{ fontSize: 13, color: T.inkMuted, margin: 0 }}>
                    Paste exported data from AlphaMetricX, Meltwater, Cision, or any PR platform (JSON or CSV).
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={loadSample}
                    style={{
                      background: T.surface, border: `1px solid ${T.line}`,
                      padding: "8px 14px", borderRadius: 8,
                      fontSize: 13, color: T.inkMuted, cursor: "pointer", fontWeight: 500,
                    }}
                  >
                    Load sample
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                      background: T.surface, border: `1px solid ${T.line}`,
                      padding: "8px 14px", borderRadius: 8,
                      fontSize: 13, color: T.inkMuted, cursor: "pointer", fontWeight: 500,
                    }}
                  >
                    Upload file
                  </button>
                  <input ref={fileRef} type="file" accept=".json,.csv" onChange={handleFile} style={{ display: "none" }} />
                </div>
              </div>

              {/* Brand name input */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6, letterSpacing: "0.02em" }}>
                  BRAND NAME <span style={{ color: T.inkFaint, fontWeight: 400 }}>(optional — improves sentiment accuracy)</span>
                </label>
                <input
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder="e.g. Infosys, Tata Motors, Reliance"
                  style={{
                    width: "100%", maxWidth: 400,
                    padding: "10px 14px", borderRadius: 8,
                    border: `1px solid ${T.line}`, fontSize: 14,
                    color: T.ink, background: T.surface,
                    outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = T.accent}
                  onBlur={e => e.target.style.borderColor = T.line}
                />
              </div>

              {/* Data input */}
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6, letterSpacing: "0.02em" }}>
                COVERAGE DATA
              </label>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={'[\n  {\n    "headline": "...",\n    "url": "https://...",\n    "publication": "...",\n    "date": "2024-01-15",\n    "sentiment": "positive",\n    "reach": 12500000,\n    "journalist": "..."\n  }\n]'}
                style={{
                  width: "100%", minHeight: 260,
                  background: T.canvas,
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  padding: 16, color: T.ink,
                  fontFamily: "'JetBrains Mono', 'Menlo', monospace",
                  fontSize: 13, lineHeight: 1.65,
                  resize: "vertical", outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.line}
              />

              {error && (
                <div style={{
                  marginTop: 14, padding: "12px 16px",
                  background: T.issueBg, border: `1px solid ${T.issue}30`,
                  borderRadius: 10, fontSize: 13, color: T.issue,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>✗</span> {error}
                </div>
              )}

              <div style={{
                marginTop: 22, display: "flex",
                justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 12, color: T.inkLight }}>
                  {input ? (() => {
                    try {
                      const p = JSON.parse(input);
                      const n = Array.isArray(p) ? p.length : 1;
                      return `${n} ${n === 1 ? "claim" : "claims"} ready to verify`;
                    } catch { return "Data ready"; }
                  })() : "No data yet"}
                </div>
                <button
                  onClick={verify}
                  disabled={!input.trim() || loading}
                  style={{
                    background: !input.trim() || loading
                      ? T.inkFaint
                      : `linear-gradient(180deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
                    color: "#fff", border: "none", borderRadius: 10,
                    padding: "13px 32px", fontSize: 14, fontWeight: 600,
                    cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                    letterSpacing: "0.01em",
                    boxShadow: !input.trim() || loading ? "none" : "0 1px 3px rgba(109,40,217,0.3)",
                    transition: "all 0.15s",
                    display: "inline-flex", alignItems: "center", gap: 8,
                  }}
                >
                  {loading ? (
                    <>
                      <span style={{
                        width: 14, height: 14,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.6s linear infinite",
                        display: "inline-block",
                      }} />
                      Verifying…
                    </>
                  ) : (
                    <>Run Verification →</>
                  )}
                </button>
              </div>

              {progressMsg && (
                <div style={{
                  marginTop: 16, padding: "12px 16px",
                  background: T.infoBg, border: `1px solid ${T.info}20`,
                  borderRadius: 10, fontSize: 13, color: T.info,
                  lineHeight: 1.5,
                }}>
                  {progressMsg} This typically takes 15-60 seconds.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ RESULTS VIEW ═══ */}
        {view === "results" && results && (
          <div>
            {/* Report header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.inkLight, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>
                    VERIFICATION REPORT
                  </div>
                  <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                    {results.claimsVerified} {results.claimsVerified === 1 ? "claim" : "claims"} analyzed
                  </h1>
                  <div style={{ fontSize: 13, color: T.inkMuted, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <span>
                      <span style={{ color: T.inkLight }}>Report ID:</span>{" "}
                      <code style={{ fontFamily: "'JetBrains Mono',monospace", background: T.canvas, padding: "1px 6px", borderRadius: 4 }}>
                        {results.reportId.substring(0, 8)}
                      </code>
                    </span>
                    <span>{new Date(results.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => exportReport("md")}
                    style={{
                      background: T.surface, border: `1px solid ${T.line}`,
                      padding: "9px 16px", borderRadius: 8,
                      fontSize: 13, color: T.inkMuted, cursor: "pointer", fontWeight: 500,
                    }}
                  >
                    Export Markdown
                  </button>
                  <button
                    onClick={() => exportReport("json")}
                    style={{
                      background: T.surface, border: `1px solid ${T.line}`,
                      padding: "9px 16px", borderRadius: 8,
                      fontSize: 13, color: T.inkMuted, cursor: "pointer", fontWeight: 500,
                    }}
                  >
                    Export JSON
                  </button>
                </div>
              </div>

              {/* Summary cards */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}>
                {Object.entries(SEVERITY).map(([key, cfg]) => {
                  const count = results.results.filter(r => r.overall.severity === key).length;
                  const total = results.results.length;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(filter === key ? "all" : key)}
                      style={{
                        background: T.surface,
                        border: `1px solid ${filter === key ? cfg.ring : T.line}`,
                        borderRadius: 10,
                        padding: "14px 16px",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                        background: cfg.ring,
                      }} />
                      <div style={{ fontSize: 11, color: T.inkLight, letterSpacing: "0.05em", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>
                        {cfg.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 28, fontWeight: 700, color: cfg.color, letterSpacing: "-0.02em" }}>
                          {count}
                        </span>
                        <span style={{ fontSize: 12, color: T.inkLight }}>
                          of {total} ({pct}%)
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginBottom: 14, padding: "10px 14px",
              background: T.surface, borderRadius: 10, border: `1px solid ${T.line}`,
              flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.inkMuted }}>Filter:</span>
              {["all", ...Object.keys(SEVERITY)].map(key => {
                const isActive = filter === key;
                const label = key === "all" ? `All (${results.results.length})` : SEVERITY[key].label;
                const count = key === "all" ? results.results.length : results.results.filter(r => r.overall.severity === key).length;
                if (key !== "all" && count === 0) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      padding: "5px 12px", borderRadius: 100,
                      fontSize: 12, fontWeight: 500,
                      background: isActive ? T.ink : "transparent",
                      color: isActive ? "#fff" : T.inkMuted,
                      border: `1px solid ${isActive ? T.ink : T.line}`,
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Claim cards */}
            <div>
              {filteredResults.map((r, i) => (
                <ClaimCard key={i} result={r} index={results.results.indexOf(r)} />
              ))}
              {filteredResults.length === 0 && (
                <div style={{ background: T.surface, padding: 48, textAlign: "center", borderRadius: 12, border: `1px solid ${T.line}`, color: T.inkMuted }}>
                  No claims match this filter.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${T.line}`,
        background: T.surface,
        padding: "18px 28px",
        textAlign: "center",
        fontSize: 12, color: T.inkLight,
      }}>
        PR Verification Studio • All verdicts cite authoritative sources • Enterprise-grade audit trail
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *::-webkit-scrollbar { width: 10px; height: 10px; }
        *::-webkit-scrollbar-track { background: ${T.canvas}; }
        *::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 5px; }
        *::-webkit-scrollbar-thumb:hover { background: ${T.inkFaint}; }
      `}</style>
    </div>
  );
}
