import { useState, useRef } from "react";

/*
 * PR VERIFICATION STUDIO v2.0 — Frontend
 * 
 * This connects to a REAL backend that calls:
 * • Wayback Machine API (article existence)
 * • GDELT Project API (coverage existence) 
 * • Claude AI API (full-article sentiment)
 * • SimilarWeb API (reach verification)
 *
 * Every verdict shows EXACTLY where it came from.
 * If something can't be verified, it says so — never fakes it.
 */

// ── Change this to your backend URL ─────────────────────────
const API_BASE = typeof window !== 'undefined' && window.ENV_API_URL
  ? window.ENV_API_URL
  : (process.env.REACT_APP_API_URL || "http://localhost:3001");

const VERDICT_CONFIG = {
  verified:          { label: "Verified",           color: "#059669", bg: "#ECFDF5", border: "#A7F3D0", icon: "✓" },
  partial:           { label: "Partially Verified", color: "#0369A1", bg: "#E0F2FE", border: "#7DD3FC", icon: "◐" },
  mismatch:          { label: "Mismatch Found",     color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "✗" },
  failed:            { label: "Failed",             color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "✗" },
  not_found:         { label: "Not Found",          color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA", icon: "?" },
  flagged:           { label: "Flagged",            color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "⚠" },
  limited:           { label: "Limited Check",      color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB", icon: "~" },
  unverified:        { label: "Unverified",         color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB", icon: "—" },
  could_not_verify:  { label: "Could Not Verify",   color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB", icon: "—" },
  no_data:           { label: "No Data Provided",   color: "#9CA3AF", bg: "#F9FAFB", border: "#E5E7EB", icon: "·" },
  error:             { label: "Check Error",        color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "!" },
};

const SEVERITY_CONFIG = {
  critical: { label: "ISSUES FOUND",            color: "#DC2626", bg: "#FEF2F2" },
  high:     { label: "DISCREPANCIES DETECTED",  color: "#EA580C", bg: "#FFF7ED" },
  medium:   { label: "REVIEW RECOMMENDED",      color: "#D97706", bg: "#FFFBEB" },
  low:      { label: "VERIFIED / CLEAN",        color: "#059669", bg: "#ECFDF5" },
};

const CHECK_NAMES = {
  article_existence:     "Article Existence",
  coverage_existence:    "Coverage in GDELT",
  sentiment_verification: "Sentiment Verification",
  reach_verification:    "Reach Verification",
  date_validity:         "Date Validity",
  journalist_name:       "Journalist Name",
};

const SAMPLE_CLAIMS = [
  {
    headline: "Infosys reports 30 percent jump in quarterly profit",
    url: "https://economictimes.indiatimes.com/tech/information-tech/",
    publication: "Economic Times",
    date: "2024-04-15",
    sentiment: "positive",
    reach: 28000000,
    journalist: "Megha Mandavia"
  },
  {
    headline: "Byju's faces insolvency proceedings amid massive debt crisis",
    url: "https://www.thehindu.com/business/",
    publication: "The Hindu",
    date: "2024-08-02",
    sentiment: "positive",
    reach: 12000000,
    journalist: "Shilpa Phadnis"
  },
  {
    headline: "Tata Motors electric vehicle sales surge to record high",
    url: "https://www.livemint.com/auto-news/",
    publication: "Livemint",
    date: "2024-11-10",
    sentiment: "positive",
    reach: 8500000,
    journalist: "Swaraj Baggonkar"
  },
  {
    headline: "Indian startup raises Series B funding",
    url: "https://medium.com/@startupblog/our-funding-journey",
    publication: "Medium",
    date: "2024-09-20",
    sentiment: "positive",
    reach: 52000000,
    journalist: "Blogger"
  },
  {
    headline: "Zomato faces probe over delivery partner working conditions",
    url: "https://www.ndtv.com/business/zomato-delivery-partners",
    publication: "NDTV",
    date: "2026-12-01",
    sentiment: "positive",
    reach: 18000000,
    journalist: "R"
  },
  {
    headline: "Reliance Jio announces 5G expansion across 50 Indian cities",
    url: "https://www.hindustantimes.com/technology/",
    publication: "Hindustan Times",
    date: "2024-07-15",
    sentiment: "positive",
    reach: 22000000,
    journalist: "Sourabh Kulesh"
  }
];

function VerdictBadge({ verdict }) {
  const cfg = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.could_not_verify;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      letterSpacing: "0.02em",
    }}>
      <span style={{ fontSize: 14 }}>{cfg.icon}</span> {cfg.label}
    </span>
  );
}

function ProofLink({ link }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, color: "#2563EB", textDecoration: "none",
      padding: "2px 8px", background: "#EFF6FF", borderRadius: 6,
      border: "1px solid #BFDBFE", marginRight: 6, marginBottom: 4,
    }}>
      🔗 {link.label}
    </a>
  );
}

function SourceDetail({ source }) {
  return (
    <div style={{ fontSize: 12, color: "#6B7280", padding: "6px 10px", background: "#F9FAFB", borderRadius: 6, marginTop: 4, border: "1px solid #F3F4F6" }}>
      <strong style={{ color: "#374151" }}>{source.name}</strong>
      {source.method && <span> — {source.method}</span>}
      {source.error && <span style={{ color: "#DC2626" }}> — Error: {source.error}</span>}
      {source.status && <span> — HTTP {source.status}</span>}
      {source.found !== undefined && <span> — {source.found ? "Found ✓" : "Not found"}</span>}
      {source.aiSentiment && <span> — AI says: "{source.aiSentiment}" ({source.aiConfidence} confidence)</span>}
      {source.avgMonthlyVisits && <span> — {source.avgMonthlyVisits.toLocaleString()} avg monthly visits</span>}
    </div>
  );
}

function CheckResult({ check }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = VERDICT_CONFIG[check.verdict] || VERDICT_CONFIG.could_not_verify;
  const name = CHECK_NAMES[check.check] || check.check;

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12, marginBottom: 8,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{name}</span>
            <VerdictBadge verdict={check.verdict} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{check.details}</p>
        </div>
      </div>

      {/* Proof links */}
      {check.proofLinks && check.proofLinks.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap" }}>
          {check.proofLinks.map((link, i) => <ProofLink key={i} link={link} />)}
        </div>
      )}

      {/* Sources (expandable) */}
      {check.sources && check.sources.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setExpanded(!expanded)} style={{
            background: "none", border: "none", fontSize: 12, color: "#6B7280",
            cursor: "pointer", padding: 0, textDecoration: "underline",
          }}>
            {expanded ? "Hide" : "Show"} source details ({check.sources.length})
          </button>
          {expanded && (
            <div style={{ marginTop: 6 }}>
              {check.sources.map((s, i) => <SourceDetail key={i} source={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimResult({ result, index }) {
  const [open, setOpen] = useState(true);
  const sev = SEVERITY_CONFIG[result.overall.severity] || SEVERITY_CONFIG.medium;
  const inp = result.input;

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 16, padding: 24, marginBottom: 16,
      border: `1px solid #E5E7EB`, borderLeft: `4px solid ${sev.color}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 700 }}>CLAIM #{index + 1}</span>
            <span style={{
              padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
              background: sev.bg, color: sev.color, letterSpacing: "0.05em",
            }}>
              {result.overall.verdict}
            </span>
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 8px", lineHeight: 1.4 }}>
            {inp.headline || inp.url || "No headline"}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13, color: "#6B7280" }}>
            {inp.publication && <span>📰 {inp.publication}</span>}
            {inp.date && <span>📅 {inp.date}</span>}
            {inp.journalist && <span>✍️ {inp.journalist}</span>}
            {inp.reach && <span>👁️ {Number(inp.reach).toLocaleString()}</span>}
            {inp.sentiment && <span>💬 {inp.sentiment}</span>}
          </div>
          {inp.url && (
            <a href={inp.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563EB", display: "block", marginTop: 6, wordBreak: "break-all" }}>
              {inp.url.length > 80 ? inp.url.substring(0, 80) + "..." : inp.url} ↗
            </a>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button onClick={() => setOpen(!open)} style={{
        marginTop: 14, background: "#F3F4F6", border: "1px solid #E5E7EB",
        borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "#374151",
        cursor: "pointer", fontWeight: 500,
      }}>
        {open ? "▾ Hide" : "▸ Show"} {result.checks.length} verification checks
      </button>

      {/* Checks */}
      {open && (
        <div style={{ marginTop: 14 }}>
          {result.checks.map((check, i) => <CheckResult key={i} check={check} />)}
        </div>
      )}
    </div>
  );
}

function ApiStatusBanner({ apiStatus }) {
  if (!apiStatus) return null;
  return (
    <div style={{
      display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 16px",
      background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB",
      marginBottom: 16, fontSize: 13,
    }}>
      <span style={{ fontWeight: 600, color: "#374151" }}>API Status:</span>
      <span style={{ color: "#059669" }}>✓ Wayback Machine</span>
      <span style={{ color: "#059669" }}>✓ GDELT</span>
      <span style={{ color: apiStatus.anthropic ? "#059669" : "#D97706" }}>
        {apiStatus.anthropic ? "✓" : "⚠"} Claude AI {!apiStatus.anthropic && "(not configured — headline-only fallback)"}
      </span>
      <span style={{ color: apiStatus.similarweb ? "#059669" : "#6B7280" }}>
        {apiStatus.similarweb ? "✓" : "—"} SimilarWeb {!apiStatus.similarweb && "(not configured — reach unverified)"}
      </span>
    </div>
  );
}

export default function PRVerificationStudio() {
  const [tab, setTab] = useState("input");
  const [input, setInput] = useState("");
  const [brandName, setBrandName] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState("");
  const [apiStatus, setApiStatus] = useState(null);
  const [backendUrl, setBackendUrl] = useState(API_BASE);
  const fileRef = useRef(null);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/health`);
      const data = await res.json();
      setApiStatus(data.apisConfigured);
      setError(null);
      return true;
    } catch {
      setError(`Cannot reach backend at ${backendUrl}. Make sure the backend server is running.`);
      return false;
    }
  };

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
    setProgress("Connecting to backend...");

    const healthy = await checkHealth();
    if (!healthy) { setLoading(false); return; }

    try {
      let claims;
      try {
        claims = JSON.parse(input);
        if (!Array.isArray(claims)) claims = [claims];
      } catch {
        // Try CSV parse
        const lines = input.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        claims = lines.slice(1).map(line => {
          const vals = []; let cur = "", inQ = false;
          for (const ch of line) { if(ch==='"'){inQ=!inQ;continue;} if(ch===","&&!inQ){vals.push(cur.trim());cur="";continue;} cur+=ch; }
          vals.push(cur.trim());
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
          return obj;
        });
      }

      if (!claims.length) throw new Error("No valid claims found.");

      setProgress(`Verifying ${claims.length} claims against Wayback Machine, GDELT, Claude AI...`);

      const res = await fetch(`${backendUrl}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claims, brandName: brandName || undefined }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Backend returned ${res.status}`);
      }

      const data = await res.json();
      setResults(data);
      setApiStatus(data.apiKeysConfigured);
      setTab("results");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
    setProgress("");
  };

  const exportReport = () => {
    if (!results) return;
    let md = `# PR Verification Report\n\n`;
    md += `**Report ID:** ${results.reportId}\n`;
    md += `**Generated:** ${results.timestamp}\n`;
    md += `**Claims Verified:** ${results.claimsVerified}\n`;
    md += `**APIs Used:** Wayback Machine, GDELT${results.apiKeysConfigured?.anthropic ? ", Claude AI" : ""}${results.apiKeysConfigured?.similarweb ? ", SimilarWeb" : ""}\n\n`;
    md += `---\n\n`;

    results.results.forEach((r, i) => {
      md += `## Claim #${i + 1}: ${r.input.headline || r.input.url || "Untitled"}\n\n`;
      md += `**Overall:** ${r.overall.verdict} (${r.overall.severity})\n`;
      md += `**Publication:** ${r.input.publication || "—"} | **Date:** ${r.input.date || "—"} | **Journalist:** ${r.input.journalist || "—"}\n`;
      md += `**Reported Sentiment:** ${r.input.sentiment || "—"} | **Reported Reach:** ${r.input.reach ? Number(r.input.reach).toLocaleString() : "—"}\n\n`;

      r.checks.forEach(c => {
        const name = CHECK_NAMES[c.check] || c.check;
        md += `### ${name}: ${(VERDICT_CONFIG[c.verdict]?.label || c.verdict).toUpperCase()}\n`;
        md += `${c.details}\n`;
        if (c.proofLinks?.length) {
          c.proofLinks.forEach(l => { md += `- [${l.label}](${l.url})\n`; });
        }
        if (c.sources?.length) {
          c.sources.forEach(s => { md += `- Source: ${s.name}${s.method ? ` (${s.method})` : ""}\n`; });
        }
        md += `\n`;
      });
      md += `---\n\n`;
    });

    md += `## Methodology\n\n`;
    md += `This report was generated by PR Verification Studio v2.0.\n\n`;
    md += `Each claim was verified against real external sources:\n`;
    md += `- **Article Existence:** HTTP HEAD request + Wayback Machine (Internet Archive)\n`;
    md += `- **Coverage Existence:** GDELT Project global news database\n`;
    md += `- **Sentiment:** ${results.apiKeysConfigured?.anthropic ? "Claude AI (full article body analysis)" : "Headline keyword analysis (limited — Claude API not configured)"}\n`;
    md += `- **Reach:** ${results.apiKeysConfigured?.similarweb ? "SimilarWeb traffic data" : "Not verified (SimilarWeb API not configured)"}\n`;
    md += `- **Date Validity:** Calendar math (deterministic)\n\n`;
    md += `Every verdict includes its source. "Unverified" means we could not confirm or deny — not that the data is wrong.\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pr-verification-${results.reportId}.md`;
    a.click();
  };

  const ts = (active) => ({
    padding: "10px 22px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: active ? 600 : 400,
    background: active ? "#FFFFFF" : "transparent", color: active ? "#C026D3" : "#6B7280",
    cursor: "pointer", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
  });

  return (
    <div style={{ fontFamily: "'Outfit','DM Sans',system-ui,sans-serif", background: "linear-gradient(135deg,#FDF4FF 0%,#EDE9FE 50%,#DBEAFE 100%)", minHeight: "100vh", color: "#111827" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#C026D3 0%,#7C3AED 40%,#3B82F6 100%)", padding: "28px 24px 22px", color: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>V</div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>PR Verification Studio</div>
            <div style={{ fontSize: 13, opacity: .85 }}>Real verification with Wayback Machine • GDELT • Claude AI • SimilarWeb</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 4, marginTop: -16, background: "#FAF5FF", borderRadius: 14, padding: 5, width: "fit-content", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #E9D5F5", flexWrap: "wrap" }}>
          {[{ id: "input", l: "📥 Input" }, { id: "results", l: `📋 Results${results ? ` (${results.claimsVerified})` : ""}` }, { id: "setup", l: "⚙️ Setup" }].map(t =>
            <button key={t.id} onClick={() => setTab(t.id)} style={ts(tab === t.id)}>{t.l}</button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* INPUT TAB */}
        {tab === "input" && <div>
          {/* Backend URL config */}
          <div style={{ background: "#FFF", borderRadius: 12, padding: "14px 20px", border: "1px solid #E5E7EB", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Backend URL:</label>
            <input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }} />
            <button onClick={checkHealth} style={{ background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>Test Connection</button>
          </div>

          <ApiStatusBanner apiStatus={apiStatus} />

          <div style={{ background: "#FFF", borderRadius: 16, padding: 28, border: "1px solid #E5E7EB", marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Import PR Analytics Data</h2>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 20, lineHeight: 1.6 }}>
              Paste your exported data from AlphaMetricX, Meltwater, Cision, or any PR platform. Each claim will be verified against <strong>real external sources</strong> — not pattern-matching.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Brand name (optional, improves sentiment analysis):</label>
              <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. Infosys, Tata Motors" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 13, width: 200 }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={loadSample} style={{ background: "#C026D312", color: "#C026D3", border: "1px solid #C026D330", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                🧪 Load 6 Indian PR Test Claims
              </button>
              <button onClick={() => fileRef.current?.click()} style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>📂 Upload JSON/CSV</button>
              <input ref={fileRef} type="file" accept=".json,.csv" onChange={handleFile} style={{ display: "none" }} />
            </div>

            <textarea value={input} onChange={e => setInput(e.target.value)}
              placeholder={'[\n  {\n    "headline": "...",\n    "url": "https://...",\n    "publication": "...",\n    "date": "2024-01-15",\n    "sentiment": "positive",\n    "reach": 12500000,\n    "journalist": "..."\n  }\n]'}
              style={{ width: "100%", minHeight: 220, background: "#FAF5FF", border: "1px solid #E9D5F5", borderRadius: 12, padding: 16, color: "#111827", fontFamily: "'JetBrains Mono',monospace", fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />

            {error && <div style={{ marginTop: 12, padding: 14, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: "#DC2626" }}>❌ {error}</div>}

            <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={verify} disabled={!input.trim() || loading} style={{
                background: "linear-gradient(135deg,#C026D3,#7C3AED,#3B82F6)", color: "#fff", border: "none", borderRadius: 12,
                padding: "14px 36px", fontSize: 15, fontWeight: 600,
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                opacity: !input.trim() || loading ? .5 : 1,
                boxShadow: "0 4px 12px rgba(192,38,211,.25)",
              }}>
                {loading ? "⏳ Verifying against real sources..." : "🔍 Run Real Verification"}
              </button>
              {progress && <span style={{ fontSize: 13, color: "#6B7280" }}>{progress}</span>}
            </div>

            {loading && (
              <div style={{ marginTop: 16, padding: 16, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, fontSize: 13, color: "#1E40AF", lineHeight: 1.6 }}>
                🔄 The backend is now calling real external APIs for each claim. This may take 15-60 seconds depending on how many claims you submitted. Each URL is being checked against the Wayback Machine, each headline searched in GDELT's database of billions of articles{apiStatus?.anthropic ? ", and each article body read by Claude AI for sentiment" : ""}.
              </div>
            )}
          </div>

          {/* What's different */}
          <div style={{ background: "#FFF", borderRadius: 16, padding: 24, border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px", color: "#374151" }}>How This Is Different From v1</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { old: "URL format check (just string parsing)", now: "HTTP HEAD request to the actual URL + Wayback Machine archive lookup", source: "archive.org — free, no key" },
                { old: "Headline keyword matching (50 words)", now: "Claude AI reads the full article body and classifies sentiment", source: "Anthropic API — ~$0.01/article" },
                { old: "Tier-based reach guessing", now: "SimilarWeb actual traffic data comparison", source: "similarweb.com — $200-500/mo or manual check" },
                { old: "No coverage verification", now: "GDELT search across 250,000+ articles/day since 2013", source: "gdeltproject.org — free, no key" },
              ].map(x => (
                <div key={x.old} style={{ padding: 14, background: "#FAF5FF", borderRadius: 10, border: "1px solid #F3E8FF" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "#DC2626", fontWeight: 600, fontSize: 13 }}>Before:</span>
                    <span style={{ fontSize: 13, color: "#6B7280", textDecoration: "line-through" }}>{x.old}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "#059669", fontWeight: 600, fontSize: 13 }}>Now:</span>
                    <span style={{ fontSize: 13, color: "#111827" }}>{x.now}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#7C3AED", fontStyle: "italic" }}>Source: {x.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>}

        {/* RESULTS TAB */}
        {tab === "results" && <div>
          {!results ? (
            <div style={{ background: "#FFF", borderRadius: 16, padding: 60, textAlign: "center", border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ color: "#6B7280" }}>No results yet. Go to Input tab and run verification.</div>
            </div>
          ) : (
            <>
              {/* Report header */}
              <div style={{ background: "#FFF", borderRadius: 16, padding: 24, border: "1px solid #E5E7EB", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Verification Report</h2>
                    <div style={{ fontSize: 13, color: "#6B7280" }}>
                      Report ID: <code style={{ fontFamily: "'JetBrains Mono',monospace", background: "#F3F4F6", padding: "1px 6px", borderRadius: 4 }}>{results.reportId}</code>
                      &nbsp;• Generated: {new Date(results.timestamp).toLocaleString()}
                      &nbsp;• Claims: {results.claimsVerified}
                    </div>
                  </div>
                  <button onClick={exportReport} style={{
                    background: "linear-gradient(135deg,#C026D3,#7C3AED)", color: "#fff", border: "none",
                    borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>⬇ Export Report</button>
                </div>
                <ApiStatusBanner apiStatus={results.apiKeysConfigured} />

                {/* Summary stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 16 }}>
                  {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => {
                    const count = results.results.filter(r => r.overall.severity === key).length;
                    if (count === 0) return null;
                    return <div key={key} style={{ background: cfg.bg, borderRadius: 10, padding: 14, textAlign: "center", border: `1px solid ${cfg.color}20` }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: cfg.color }}>{count}</div>
                      <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                    </div>;
                  })}
                </div>
              </div>

              {/* Results */}
              {results.results.map((r, i) => <ClaimResult key={i} result={r} index={i} />)}
            </>
          )}
        </div>}

        {/* SETUP TAB */}
        {tab === "setup" && <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 16, padding: 28, border: "1px solid #E5E7EB" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>⚙️ Backend Setup</h2>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
              This frontend needs a backend server running to call the real verification APIs. The backend handles Wayback Machine, GDELT, Claude AI, and SimilarWeb calls.
            </p>

            <div style={{ background: "#FAF5FF", borderRadius: 12, padding: 20, marginTop: 16, border: "1px solid #E9D5F5" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 16, color: "#7C3AED" }}>Quick Start (Local Development)</h3>
              <pre style={{ background: "#1E1B2E", color: "#E8E6E3", borderRadius: 10, padding: 16, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", overflowX: "auto", lineHeight: 1.7, margin: 0 }}>{`# 1. Go to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY at minimum

# 4. Start backend
npm start
# Server runs at http://localhost:3001

# 5. Test it
curl http://localhost:3001/api/health`}</pre>
            </div>

            <div style={{ background: "#EFF6FF", borderRadius: 12, padding: 20, marginTop: 16, border: "1px solid #BFDBFE" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 16, color: "#2563EB" }}>Production (EC2 + Vercel)</h3>
              <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6, margin: 0 }}>
                See <strong>DEPLOY.md</strong> for complete step-by-step instructions for deploying the backend to EC2 (or Lambda) and the frontend to Vercel. Total cost: ~$10/month + ~$0.01 per article for Claude API.
              </p>
            </div>
          </div>

          <div style={{ background: "#FFF", borderRadius: 16, padding: 24, border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>API Cost Calculator</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { name: "Wayback Machine", cost: "Free forever", articles: "Unlimited", note: "No API key needed" },
                { name: "GDELT Project", cost: "Free forever", articles: "Unlimited", note: "No API key needed" },
                { name: "Claude AI (Sonnet)", cost: "~$0.01/article", articles: "200 articles = ~$2", note: "For full-article sentiment. Without it, headline-only fallback." },
                { name: "SimilarWeb", cost: "$200-500/month", articles: "Depends on plan", note: "Optional. Without it, reach shows 'Unverified'" },
                { name: "EC2 t3.micro", cost: "~$8/month", articles: "N/A", note: "Free tier eligible for 12 months" },
                { name: "Vercel (frontend)", cost: "Free", articles: "N/A", note: "Free tier is sufficient" },
              ].map(x => (
                <div key={x.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "#F9FAFB", borderRadius: 8, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{x.name}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{x.note}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: x.cost.includes("Free") ? "#059669" : "#374151", fontSize: 14 }}>{x.cost}</div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>{x.articles}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 14, background: "#ECFDF5", borderRadius: 10, border: "1px solid #A7F3D0" }}>
              <strong style={{ color: "#059669" }}>Minimum viable cost:</strong>
              <span style={{ color: "#065F46", marginLeft: 8 }}>~$10/month + $2 per 200 articles verified = $12/month for a typical PR team</span>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
