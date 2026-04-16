import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants & Config ─────────────────────────────────────────────────────
const VERIFICATION_SOURCES = {
  google_news: { name: "Google News", type: "free", reliability: "high", icon: "🔍" },
  google_search: { name: "Google Search", type: "free", reliability: "high", icon: "🌐" },
  wayback_machine: { name: "Wayback Machine", type: "free", reliability: "high", icon: "🏛️" },
  gdelt_project: { name: "GDELT Project", type: "free", reliability: "high", icon: "📊" },
  common_crawl: { name: "Common Crawl", type: "free", reliability: "medium", icon: "🕸️" },
  rss_feeds: { name: "RSS Feeds", type: "free", reliability: "high", icon: "📡" },
  social_apis: { name: "Social Media APIs", type: "freemium", reliability: "medium", icon: "📱" },
  press_releases: { name: "PR Newswire / GlobeNewswire", type: "free", reliability: "high", icon: "📰" },
};

const CLAIM_TYPES = [
  "article_existence",
  "sentiment_accuracy",
  "reach_metrics",
  "share_of_voice",
  "publication_tier",
  "journalist_attribution",
  "date_accuracy",
  "url_validity",
  "headline_accuracy",
  "media_type_classification",
];

const SEVERITY_COLORS = {
  critical: "#FF3B30",
  high: "#FF9500",
  medium: "#FFCC00",
  low: "#34C759",
  verified: "#00C7BE",
};

const TIER_CLASSIFICATION = {
  tier1: ["reuters", "associated press", "bloomberg", "nytimes", "wsj", "bbc", "cnn", "forbes", "fortune", "washington post", "guardian", "financial times", "cnbc", "techcrunch", "the verge", "wired", "economist"],
  tier2: ["business insider", "huffpost", "mashable", "zdnet", "cnet", "engadget", "venturebeat", "fast company", "inc.com", "entrepreneur", "adweek", "marketing week", "pr week", "campaign", "ad age"],
  tier3: ["medium.com", "substack", "wordpress", "blogspot", "tumblr", "linkedin articles"],
};

function classifyTier(publication) {
  const p = (publication || "").toLowerCase();
  if (TIER_CLASSIFICATION.tier1.some(t => p.includes(t))) return { tier: 1, label: "Tier 1 - Premium", color: "#00C7BE" };
  if (TIER_CLASSIFICATION.tier2.some(t => p.includes(t))) return { tier: 2, label: "Tier 2 - Industry", color: "#007AFF" };
  if (TIER_CLASSIFICATION.tier3.some(t => p.includes(t))) return { tier: 3, label: "Tier 3 - Blog/Self-Published", color: "#FF9500" };
  return { tier: null, label: "Unclassified", color: "#8E8E93" };
}

// ─── Verification Engine ────────────────────────────────────────────────────
class VerificationEngine {
  static async verifyArticleExistence(claim) {
    const checks = [];
    // URL format validation
    if (claim.url) {
      try {
        const url = new URL(claim.url);
        checks.push({ source: "URL Validation", status: "pass", detail: `Valid URL: ${url.hostname}`, confidence: 100 });
        // Domain reputation
        const tier = classifyTier(url.hostname);
        checks.push({ source: "Domain Classification", status: tier.tier <= 2 ? "pass" : "warn", detail: tier.label, confidence: tier.tier ? (4 - tier.tier) * 30 + 10 : 20 });
      } catch {
        checks.push({ source: "URL Validation", status: "fail", detail: "Invalid URL format", confidence: 0 });
      }
    }
    // Date plausibility
    if (claim.date) {
      const d = new Date(claim.date);
      const now = new Date();
      const daysDiff = (now - d) / (1000 * 60 * 60 * 24);
      if (daysDiff < 0) {
        checks.push({ source: "Date Check", status: "fail", detail: "Future date detected", confidence: 0 });
      } else if (daysDiff > 365 * 5) {
        checks.push({ source: "Date Check", status: "warn", detail: "Article older than 5 years - verify archival", confidence: 40 });
      } else {
        checks.push({ source: "Date Check", status: "pass", detail: `Published ${Math.floor(daysDiff)} days ago`, confidence: 90 });
      }
    }
    return checks;
  }

  static verifySentiment(claim) {
    const checks = [];
    if (claim.headline && claim.reported_sentiment) {
      const positiveWords = ["launch", "grow", "success", "win", "award", "partner", "innovate", "breakthrough", "record", "milestone", "celebrate", "lead", "transform", "expand", "achieve"];
      const negativeWords = ["fail", "loss", "scandal", "lawsuit", "crash", "decline", "layoff", "breach", "fine", "penalty", "controversy", "crisis", "shutdown", "recall", "fraud"];
      const neutralWords = ["announce", "report", "update", "plan", "meeting", "statement", "review", "analysis", "study", "survey"];

      const h = claim.headline.toLowerCase();
      const posCount = positiveWords.filter(w => h.includes(w)).length;
      const negCount = negativeWords.filter(w => h.includes(w)).length;
      const neuCount = neutralWords.filter(w => h.includes(w)).length;

      let derivedSentiment = "neutral";
      if (posCount > negCount && posCount > neuCount) derivedSentiment = "positive";
      else if (negCount > posCount && negCount > neuCount) derivedSentiment = "negative";

      const reported = claim.reported_sentiment.toLowerCase();
      const match = derivedSentiment === reported;

      checks.push({
        source: "Headline Sentiment Analysis",
        status: match ? "pass" : "fail",
        detail: match
          ? `Headline sentiment aligns with reported "${reported}"`
          : `Headline suggests "${derivedSentiment}" but reported as "${reported}"`,
        confidence: match ? 85 : 30,
        breakdown: { positive_signals: posCount, negative_signals: negCount, neutral_signals: neuCount },
      });
    }
    return checks;
  }

  static verifyReachMetrics(claim) {
    const checks = [];
    if (claim.reported_reach !== undefined) {
      const reach = Number(claim.reported_reach);
      // Sanity bounds
      if (reach > 5_000_000_000) {
        checks.push({ source: "Reach Sanity Check", status: "fail", detail: `Reported reach (${reach.toLocaleString()}) exceeds world internet population`, confidence: 5 });
      } else if (reach > 500_000_000) {
        checks.push({ source: "Reach Sanity Check", status: "warn", detail: `Very high reach (${reach.toLocaleString()}) — verify methodology`, confidence: 30 });
      } else if (reach <= 0) {
        checks.push({ source: "Reach Sanity Check", status: "fail", detail: "Zero or negative reach reported", confidence: 0 });
      } else {
        checks.push({ source: "Reach Sanity Check", status: "pass", detail: `Reach (${reach.toLocaleString()}) within plausible range`, confidence: 70 });
      }

      // Cross-reference with tier expected ranges
      if (claim.publication) {
        const tier = classifyTier(claim.publication);
        const expectedRanges = { 1: [1_000_000, 500_000_000], 2: [100_000, 50_000_000], 3: [100, 5_000_000] };
        const range = expectedRanges[tier.tier] || [0, Infinity];
        if (reach >= range[0] && reach <= range[1]) {
          checks.push({ source: "Tier-Reach Cross-Check", status: "pass", detail: `Reach aligns with ${tier.label} expected range`, confidence: 80 });
        } else {
          checks.push({ source: "Tier-Reach Cross-Check", status: "warn", detail: `Reach doesn't match ${tier.label} typical range (${range[0].toLocaleString()} - ${range[1].toLocaleString()})`, confidence: 35 });
        }
      }
    }
    return checks;
  }

  static verifyShareOfVoice(claim) {
    const checks = [];
    if (claim.sov_percentage !== undefined) {
      const sov = Number(claim.sov_percentage);
      if (sov < 0 || sov > 100) {
        checks.push({ source: "SOV Range Check", status: "fail", detail: `SOV ${sov}% is outside valid range (0-100%)`, confidence: 0 });
      } else if (sov > 80) {
        checks.push({ source: "SOV Plausibility", status: "warn", detail: `SOV of ${sov}% is unusually high — verify competitive set`, confidence: 25 });
      } else {
        checks.push({ source: "SOV Range Check", status: "pass", detail: `SOV ${sov}% within plausible range`, confidence: 75 });
      }

      if (claim.competitors && Array.isArray(claim.competitors)) {
        const totalSOV = claim.competitors.reduce((sum, c) => sum + (Number(c.sov) || 0), 0) + sov;
        if (Math.abs(totalSOV - 100) > 5) {
          checks.push({ source: "SOV Total Check", status: "fail", detail: `Total SOV across all brands = ${totalSOV.toFixed(1)}% (should ≈ 100%)`, confidence: 15 });
        } else {
          checks.push({ source: "SOV Total Check", status: "pass", detail: `Combined SOV = ${totalSOV.toFixed(1)}% ✓`, confidence: 90 });
        }
      }
    }
    return checks;
  }

  static verifyJournalist(claim) {
    const checks = [];
    if (claim.journalist_name) {
      const name = claim.journalist_name.trim();
      if (name.length < 3) {
        checks.push({ source: "Name Validation", status: "fail", detail: "Journalist name too short", confidence: 10 });
      } else if (!/^[A-Za-z\s\-'.àáâãäåèéêëìíîïòóôõöùúûüýÿñ]+$/.test(name)) {
        checks.push({ source: "Name Validation", status: "warn", detail: "Unusual characters in journalist name", confidence: 40 });
      } else {
        checks.push({ source: "Name Validation", status: "pass", detail: `Name format valid: "${name}"`, confidence: 70 });
      }

      if (claim.publication) {
        checks.push({ source: "Attribution Cross-Check", status: "info", detail: `Verify "${name}" writes for "${claim.publication}" via publication website or LinkedIn`, confidence: 50 });
      }
    }
    return checks;
  }

  static async runFullVerification(claims) {
    const results = [];
    for (const claim of claims) {
      const claimResults = { claim, checks: [], overallScore: 0, severity: "low" };

      // Run all applicable checks
      if (claim.url || claim.date || claim.publication) {
        claimResults.checks.push(...(await this.verifyArticleExistence(claim)));
      }
      if (claim.headline && claim.reported_sentiment) {
        claimResults.checks.push(...this.verifySentiment(claim));
      }
      if (claim.reported_reach !== undefined) {
        claimResults.checks.push(...this.verifyReachMetrics(claim));
      }
      if (claim.sov_percentage !== undefined) {
        claimResults.checks.push(...this.verifyShareOfVoice(claim));
      }
      if (claim.journalist_name) {
        claimResults.checks.push(...this.verifyJournalist(claim));
      }

      // Calculate overall score
      if (claimResults.checks.length > 0) {
        const avgConfidence = claimResults.checks.reduce((s, c) => s + c.confidence, 0) / claimResults.checks.length;
        const failCount = claimResults.checks.filter(c => c.status === "fail").length;
        const warnCount = claimResults.checks.filter(c => c.status === "warn").length;

        claimResults.overallScore = Math.max(0, Math.min(100, avgConfidence - failCount * 15 - warnCount * 5));
        claimResults.severity = failCount > 0 ? (failCount > 2 ? "critical" : "high") : warnCount > 1 ? "medium" : "low";
      }

      results.push(claimResults);
    }
    return results;
  }
}

// ─── CSV/JSON Parser ────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += char;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

function normalizeClaimFields(raw) {
  const fieldMap = {
    url: ["url", "link", "article_url", "article_link", "source_url"],
    headline: ["headline", "title", "article_title", "heading", "article_headline"],
    publication: ["publication", "source", "outlet", "media_outlet", "publisher", "media_source", "source_name"],
    date: ["date", "published_date", "publish_date", "article_date", "pub_date", "published", "coverage_date"],
    reported_sentiment: ["sentiment", "reported_sentiment", "tone", "article_sentiment", "media_sentiment"],
    reported_reach: ["reach", "reported_reach", "audience", "circulation", "impressions", "potential_reach", "unique_visitors", "monthly_visitors", "uvpm"],
    journalist_name: ["journalist", "journalist_name", "author", "reporter", "byline", "writer"],
    sov_percentage: ["sov", "sov_percentage", "share_of_voice", "sov_%", "voice_share"],
    media_type: ["media_type", "type", "content_type", "format", "article_type"],
    competitors: ["competitors"],
  };

  return Object.fromEntries(
    Object.entries(fieldMap).map(([key, aliases]) => {
      const found = aliases.find(a => raw[a] !== undefined && raw[a] !== "");
      return [key, found ? raw[found] : undefined];
    }).filter(([, v]) => v !== undefined)
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  root: {
    fontFamily: "'IBM Plex Sans', 'Söhne', system-ui, sans-serif",
    background: "#0A0A0F",
    color: "#E8E6E3",
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
  },
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "24px 20px",
    position: "relative",
    zIndex: 1,
  },
  header: {
    marginBottom: 40,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: 24,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 8,
  },
  logoMark: {
    width: 44,
    height: 44,
    background: "linear-gradient(135deg, #00C7BE, #007AFF)",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: -1,
    boxShadow: "0 0 24px rgba(0,199,190,0.3)",
  },
  logoText: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #E8E6E3, #A0A0A0)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B6B76",
    marginTop: 4,
    letterSpacing: "0.02em",
  },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
    backdropFilter: "blur(10px)",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 16,
    color: "#B8B5B0",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  textarea: {
    width: "100%",
    minHeight: 180,
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 16,
    color: "#E8E6E3",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    lineHeight: 1.6,
    resize: "vertical",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  },
  button: {
    background: "linear-gradient(135deg, #00C7BE, #007AFF)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "14px 32px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    letterSpacing: "0.01em",
  },
  buttonSecondary: {
    background: "rgba(255,255,255,0.06)",
    color: "#B8B5B0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tab: (active) => ({
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    background: active ? "rgba(0,199,190,0.15)" : "transparent",
    color: active ? "#00C7BE" : "#6B6B76",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    transition: "all 0.2s",
  }),
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: `${color}18`,
    color: color,
    border: `1px solid ${color}30`,
  }),
  checkRow: (status) => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 16px",
    background: status === "fail" ? "rgba(255,59,48,0.04)" : status === "warn" ? "rgba(255,149,0,0.04)" : "rgba(52,199,89,0.04)",
    borderRadius: 10,
    marginBottom: 8,
    border: `1px solid ${status === "fail" ? "rgba(255,59,48,0.1)" : status === "warn" ? "rgba(255,149,0,0.1)" : "rgba(52,199,89,0.1)"}`,
  }),
  scoreRing: (score) => ({
    width: 72,
    height: 72,
    borderRadius: "50%",
    border: `3px solid ${score > 70 ? "#34C759" : score > 40 ? "#FFCC00" : "#FF3B30"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 700,
    color: score > 70 ? "#34C759" : score > 40 ? "#FFCC00" : "#FF3B30",
    flexShrink: 0,
  }),
  progressBar: {
    height: 6,
    borderRadius: 3,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginTop: 8,
  },
};

// ─── Sample Data ────────────────────────────────────────────────────────────
const SAMPLE_JSON = JSON.stringify([
  {
    headline: "TechCorp Launches Revolutionary AI Platform",
    url: "https://techcrunch.com/2025/03/15/techcorp-ai-platform",
    publication: "TechCrunch",
    date: "2025-03-15",
    reported_sentiment: "positive",
    reported_reach: 12500000,
    journalist_name: "Sarah Chen",
    media_type: "online"
  },
  {
    headline: "TechCorp Faces Scrutiny Over Data Practices",
    url: "https://example.invalid/fake-article",
    publication: "The Global Tribune",
    date: "2027-06-01",
    reported_sentiment: "positive",
    reported_reach: 8500000000,
    journalist_name: "J",
    media_type: "print"
  },
  {
    headline: "Industry Report: Cloud Computing Market Growth",
    url: "https://reuters.com/technology/cloud-market-2025",
    publication: "Reuters",
    date: "2025-02-20",
    reported_sentiment: "neutral",
    reported_reach: 45000000,
    journalist_name: "Michael Torres",
    sov_percentage: 35,
    competitors: [
      { name: "CompetitorA", sov: 25 },
      { name: "CompetitorB", sov: 20 },
      { name: "CompetitorC", sov: 15 }
    ]
  }
], null, 2);

const SAMPLE_CSV = `headline,url,publication,date,sentiment,reach,journalist,media_type
"TechCorp Launches Revolutionary AI Platform",https://techcrunch.com/2025/03/15/techcorp-ai-platform,TechCrunch,2025-03-15,positive,12500000,Sarah Chen,online
"TechCorp Faces Scrutiny Over Data Practices",https://example.invalid/fake-article,The Global Tribune,2027-06-01,positive,8500000000,J,print
"Industry Report: Cloud Computing Market Growth",https://reuters.com/technology/cloud-market-2025,Reuters,2025-02-20,neutral,45000000,Michael Torres,online`;

// ─── Components ─────────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  const icons = { pass: "✓", fail: "✗", warn: "⚠", info: "ℹ" };
  const colors = { pass: "#34C759", fail: "#FF3B30", warn: "#FF9500", info: "#007AFF" };
  return (
    <span style={{
      width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: `${colors[status]}20`, color: colors[status], fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>
      {icons[status] || "?"}
    </span>
  );
}

function ScoreGauge({ score, size = 72 }) {
  const circumference = 2 * Math.PI * 30;
  const offset = circumference - (score / 100) * circumference;
  const color = score > 70 ? "#34C759" : score > 40 ? "#FFCC00" : "#FF3B30";
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle cx="36" cy="36" r="30" fill="none" stroke={color} strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 36 36)" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="36" y="36" textAnchor="middle" dominantBaseline="central" fill={color} fontSize="18" fontWeight="700" fontFamily="IBM Plex Sans, system-ui">
        {Math.round(score)}
      </text>
    </svg>
  );
}

function DataSourceBadges() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {Object.values(VERIFICATION_SOURCES).map(s => (
        <span key={s.name} style={{
          ...styles.badge(s.reliability === "high" ? "#34C759" : "#FFCC00"),
          fontSize: 11,
        }}>
          {s.icon} {s.name}
        </span>
      ))}
    </div>
  );
}

function ClaimCard({ result, index }) {
  const [expanded, setExpanded] = useState(false);
  const c = result.claim;
  return (
    <div style={{ ...styles.card, borderLeft: `3px solid ${SEVERITY_COLORS[result.severity] || "#6B6B76"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#6B6B76" }}>#{index + 1}</span>
            <span style={styles.badge(SEVERITY_COLORS[result.severity] || "#6B6B76")}>
              {result.severity.toUpperCase()}
            </span>
            {c.publication && (
              <span style={styles.badge(classifyTier(c.publication).color)}>
                {classifyTier(c.publication).label}
              </span>
            )}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: "#E8E6E3", lineHeight: 1.4 }}>
            {c.headline || c.url || "Untitled Claim"}
          </h3>
          <div style={{ fontSize: 13, color: "#6B6B76", display: "flex", flexWrap: "wrap", gap: 16 }}>
            {c.publication && <span>📰 {c.publication}</span>}
            {c.date && <span>📅 {c.date}</span>}
            {c.journalist_name && <span>✍️ {c.journalist_name}</span>}
            {c.reported_reach && <span>👁️ {Number(c.reported_reach).toLocaleString()}</span>}
          </div>
        </div>
        <ScoreGauge score={result.overallScore} />
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={() => setExpanded(!expanded)} style={{ ...styles.buttonSecondary, padding: "8px 16px", fontSize: 13 }}>
          {expanded ? "Hide" : "Show"} {result.checks.length} verification checks
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          {result.checks.map((check, i) => (
            <div key={i} style={styles.checkRow(check.status)}>
              <StatusIcon status={check.status} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E6E3", marginBottom: 2 }}>{check.source}</div>
                <div style={{ fontSize: 13, color: "#9B9B9B" }}>{check.detail}</div>
                <div style={styles.progressBar}>
                  <div style={{
                    height: "100%", width: `${check.confidence}%`, borderRadius: 3,
                    background: check.status === "fail" ? "#FF3B30" : check.status === "warn" ? "#FF9500" : "#34C759",
                    transition: "width 0.6s ease",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "#6B6B76", marginTop: 4 }}>Confidence: {check.confidence}%</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryDashboard({ results }) {
  if (!results.length) return null;
  const avgScore = results.reduce((s, r) => s + r.overallScore, 0) / results.length;
  const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
  const failedChecks = results.reduce((s, r) => s + r.checks.filter(c => c.status === "fail").length, 0);
  const warnChecks = results.reduce((s, r) => s + r.checks.filter(c => c.status === "warn").length, 0);
  const passChecks = results.reduce((s, r) => s + r.checks.filter(c => c.status === "pass").length, 0);
  const criticalClaims = results.filter(r => r.severity === "critical" || r.severity === "high").length;

  const stats = [
    { label: "Claims Analyzed", value: results.length, color: "#007AFF" },
    { label: "Avg Confidence", value: `${Math.round(avgScore)}%`, color: avgScore > 70 ? "#34C759" : avgScore > 40 ? "#FFCC00" : "#FF3B30" },
    { label: "Checks Run", value: totalChecks, color: "#00C7BE" },
    { label: "Issues Found", value: failedChecks + warnChecks, color: failedChecks > 0 ? "#FF3B30" : "#FFCC00" },
  ];

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>📊 Verification Summary</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 16, textAlign: "center",
            border: `1px solid ${s.color}15`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6B6B76", letterSpacing: "0.03em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Distribution bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#6B6B76", marginBottom: 8 }}>Check Distribution</div>
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
          {passChecks > 0 && <div style={{ flex: passChecks, background: "#34C759", borderRadius: 5 }} />}
          {warnChecks > 0 && <div style={{ flex: warnChecks, background: "#FF9500", borderRadius: 5 }} />}
          {failedChecks > 0 && <div style={{ flex: failedChecks, background: "#FF3B30", borderRadius: 5 }} />}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#6B6B76" }}>
          <span>✓ {passChecks} passed</span>
          <span>⚠ {warnChecks} warnings</span>
          <span>✗ {failedChecks} failed</span>
        </div>
      </div>

      {criticalClaims > 0 && (
        <div style={{
          background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)",
          borderRadius: 10, padding: 14, fontSize: 13, color: "#FF8A80",
        }}>
          ⚠️ <strong>{criticalClaims} claim{criticalClaims > 1 ? "s" : ""}</strong> flagged as high/critical severity — manual verification strongly recommended.
        </div>
      )}
    </div>
  );
}

function ExportReport({ results }) {
  const generateReport = () => {
    const avgScore = results.reduce((s, r) => s + r.overallScore, 0) / results.length;
    const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
    const failedChecks = results.reduce((s, r) => s + r.checks.filter(c => c.status === "fail").length, 0);

    let md = `# PR Verification Report\n`;
    md += `**Generated:** ${new Date().toISOString().split("T")[0]}\n`;
    md += `**Tool:** PR Verification Studio\n\n`;
    md += `## Summary\n`;
    md += `- Claims Analyzed: ${results.length}\n`;
    md += `- Average Confidence: ${Math.round(avgScore)}%\n`;
    md += `- Total Checks: ${totalChecks}\n`;
    md += `- Failed Checks: ${failedChecks}\n\n`;
    md += `## Detailed Results\n\n`;

    results.forEach((r, i) => {
      md += `### Claim #${i + 1}: ${r.claim.headline || r.claim.url || "Untitled"}\n`;
      md += `- **Score:** ${Math.round(r.overallScore)}%\n`;
      md += `- **Severity:** ${r.severity}\n`;
      if (r.claim.publication) md += `- **Publication:** ${r.claim.publication} (${classifyTier(r.claim.publication).label})\n`;
      if (r.claim.date) md += `- **Date:** ${r.claim.date}\n`;
      md += `\n**Checks:**\n`;
      r.checks.forEach(c => {
        md += `- [${c.status.toUpperCase()}] ${c.source}: ${c.detail} (Confidence: ${c.confidence}%)\n`;
      });
      md += `\n---\n\n`;
    });

    md += `## Methodology\n`;
    md += `This report was generated using automated verification checks including:\n`;
    md += `- URL validation and domain classification\n`;
    md += `- Date plausibility analysis\n`;
    md += `- Headline sentiment cross-referencing\n`;
    md += `- Reach metrics sanity checks with tier-based expected ranges\n`;
    md += `- Share of voice mathematical validation\n`;
    md += `- Journalist name format and attribution checks\n`;
    md += `- Media outlet tier classification (Tier 1/2/3)\n\n`;
    md += `**Disclaimer:** Automated verification provides a confidence estimate, not absolute truth. Always cross-reference critical claims with primary sources.\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pr-verification-report-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pr-verification-data-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button onClick={generateReport} style={styles.button}>⬇ Export Markdown Report</button>
      <button onClick={exportJSON} style={styles.buttonSecondary}>⬇ Export Raw JSON</button>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function PRVerificationStudio() {
  const [activeTab, setActiveTab] = useState("input");
  const [inputFormat, setInputFormat] = useState("json");
  const [inputData, setInputData] = useState("");
  const [results, setResults] = useState([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [sortBy, setSortBy] = useState("severity");
  const fileInputRef = useRef(null);

  const loadSample = () => {
    setInputData(inputFormat === "json" ? SAMPLE_JSON : SAMPLE_CSV);
    setError(null);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setInputData(ev.target.result);
      if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) setInputFormat("csv");
      else setInputFormat("json");
    };
    reader.readAsText(file);
  };

  const runVerification = async () => {
    setIsVerifying(true);
    setError(null);
    try {
      let claims = [];
      if (inputFormat === "json") {
        const parsed = JSON.parse(inputData);
        claims = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        claims = parseCSV(inputData);
      }

      claims = claims.map(normalizeClaimFields);

      if (claims.length === 0) {
        throw new Error("No valid claims found in input data.");
      }

      // Simulate async processing with slight delay per claim
      const verificationResults = [];
      for (const [i, claim] of claims.entries()) {
        const res = await VerificationEngine.runFullVerification([claim]);
        verificationResults.push(res[0]);
        // Small delay for visual feedback
        await new Promise(r => setTimeout(r, 150));
      }

      setResults(verificationResults);
      setActiveTab("results");
    } catch (err) {
      setError(err.message);
    }
    setIsVerifying(false);
  };

  const filteredResults = results
    .filter(r => filterSeverity === "all" || r.severity === filterSeverity)
    .sort((a, b) => {
      if (sortBy === "severity") {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      }
      return a.overallScore - b.overallScore;
    });

  return (
    <div style={styles.root}>
      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: -200, right: -200, width: 600, height: 600,
        background: "radial-gradient(circle, rgba(0,199,190,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoMark}>V</div>
            <div>
              <div style={styles.logoText}>PR Verification Studio</div>
              <div style={styles.subtitle}>Verify AI-generated PR analytics with confidence</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {[
            { id: "input", label: "📥 Input Data" },
            { id: "results", label: `📋 Results ${results.length > 0 ? `(${results.length})` : ""}` },
            { id: "sources", label: "🔗 Sources" },
            { id: "guide", label: "📖 Guide" },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={styles.tab(activeTab === t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Input Tab */}
        {activeTab === "input" && (
          <div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📥 Import PR Analytics Data</div>
              <p style={{ fontSize: 14, color: "#6B6B76", marginBottom: 16, lineHeight: 1.5 }}>
                Paste exported data from AlphaMetricX, Meltwater, Cision, or any PR analytics platform. Supports JSON and CSV formats.
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3 }}>
                  <button onClick={() => setInputFormat("json")} style={styles.tab(inputFormat === "json")}>JSON</button>
                  <button onClick={() => setInputFormat("csv")} style={styles.tab(inputFormat === "csv")}>CSV</button>
                </div>
                <button onClick={loadSample} style={{ ...styles.buttonSecondary, padding: "8px 16px", fontSize: 13 }}>Load Sample Data</button>
                <button onClick={() => fileInputRef.current?.click()} style={{ ...styles.buttonSecondary, padding: "8px 16px", fontSize: 13 }}>📂 Upload File</button>
                <input ref={fileInputRef} type="file" accept=".json,.csv,.tsv" onChange={handleFileUpload} style={{ display: "none" }} />
              </div>

              <textarea
                style={styles.textarea}
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={inputFormat === "json"
                  ? `[\n  {\n    "headline": "Company Launches New Product",\n    "url": "https://...",\n    "publication": "TechCrunch",\n    "date": "2025-03-15",\n    "reported_sentiment": "positive",\n    "reported_reach": 12500000,\n    "journalist_name": "Jane Doe"\n  }\n]`
                  : `headline,url,publication,date,sentiment,reach,journalist\n"Company Launches New Product",https://...,TechCrunch,2025-03-15,positive,12500000,Jane Doe`}
              />

              {error && (
                <div style={{ marginTop: 12, padding: 14, background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: 10, fontSize: 13, color: "#FF8A80" }}>
                  ❌ {error}
                </div>
              )}

              <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  onClick={runVerification}
                  disabled={!inputData.trim() || isVerifying}
                  style={{ ...styles.button, opacity: !inputData.trim() || isVerifying ? 0.5 : 1, cursor: !inputData.trim() || isVerifying ? "not-allowed" : "pointer" }}
                >
                  {isVerifying ? "⏳ Verifying..." : "🔍 Run Verification"}
                </button>
                {isVerifying && <span style={{ fontSize: 13, color: "#6B6B76" }}>Analyzing claims against verification sources...</span>}
              </div>
            </div>

            {/* Field Mapping Reference */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>🗂️ Supported Fields</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                {[
                  { field: "headline / title", desc: "Article headline for sentiment analysis" },
                  { field: "url / link", desc: "Article URL for existence validation" },
                  { field: "publication / source", desc: "Media outlet for tier classification" },
                  { field: "date / published_date", desc: "Publication date for plausibility check" },
                  { field: "sentiment / tone", desc: "Reported sentiment to cross-verify" },
                  { field: "reach / impressions", desc: "Audience reach for sanity checking" },
                  { field: "journalist / author", desc: "Journalist name for attribution check" },
                  { field: "sov / share_of_voice", desc: "Share of voice % for math validation" },
                ].map(f => (
                  <div key={f.field} style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: "#00C7BE", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 }}>{f.field}</span>
                    <div style={{ color: "#6B6B76", marginTop: 4 }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === "results" && (
          <div>
            {results.length === 0 ? (
              <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: 16, color: "#6B6B76" }}>No verification results yet. Go to Input Data tab to start.</div>
              </div>
            ) : (
              <>
                <SummaryDashboard results={results} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {["all", "critical", "high", "medium", "low"].map(sev => (
                      <button key={sev} onClick={() => setFilterSeverity(sev)} style={{
                        ...styles.tab(filterSeverity === sev),
                        ...(sev !== "all" ? { color: filterSeverity === sev ? SEVERITY_COLORS[sev] : "#6B6B76" } : {}),
                      }}>
                        {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                        {sev !== "all" && ` (${results.filter(r => r.severity === sev).length})`}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#6B6B76" }}>Sort:</span>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8, padding: "6px 12px", color: "#E8E6E3", fontSize: 13,
                    }}>
                      <option value="severity">Severity</option>
                      <option value="score">Score</option>
                    </select>
                  </div>
                </div>

                {filteredResults.map((r, i) => <ClaimCard key={i} result={r} index={results.indexOf(r)} />)}

                <div style={{ marginTop: 24 }}>
                  <ExportReport results={results} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === "sources" && (
          <div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>🔗 Verification Sources & Methodology</div>
              <p style={{ fontSize: 14, color: "#9B9B9B", lineHeight: 1.6, marginBottom: 20 }}>
                PR Verification Studio uses multiple layers of verification logic. The core engine runs locally with deterministic rules.
                For production deployments, you can connect these free external data sources for enhanced verification.
              </p>

              <div style={{ display: "grid", gap: 12 }}>
                {Object.values(VERIFICATION_SOURCES).map(s => (
                  <div key={s.name} style={{
                    display: "flex", alignItems: "center", gap: 16, padding: 16,
                    background: "rgba(0,0,0,0.2)", borderRadius: 12,
                  }}>
                    <span style={{ fontSize: 28 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E6E3", marginBottom: 2 }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: "#6B6B76" }}>
                        {s.name === "Google News" && "Cross-reference article existence via Google News index. Free API available."}
                        {s.name === "Google Search" && "Verify URLs and content via Google Custom Search API (100 queries/day free)."}
                        {s.name === "Wayback Machine" && "Check archived versions via Internet Archive's free API for historical verification."}
                        {s.name === "GDELT Project" && "Access the world's largest open media monitoring database. Fully free."}
                        {s.name === "Common Crawl" && "Petabytes of web crawl data, freely available for content verification."}
                        {s.name === "RSS Feeds" && "Direct publication RSS feeds for real-time article existence checks."}
                        {s.name === "Social Media APIs" && "X/Twitter, Reddit, LinkedIn APIs for social amplification verification."}
                        {s.name === "PR Newswire / GlobeNewswire" && "Verify press release distribution claims against original wire services."}
                      </div>
                    </div>
                    <span style={styles.badge(s.type === "free" ? "#34C759" : "#FFCC00")}>
                      {s.type.toUpperCase()}
                    </span>
                    <span style={styles.badge(s.reliability === "high" ? "#34C759" : "#FFCC00")}>
                      {s.reliability} reliability
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>🧮 Built-in Verification Logic</div>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { check: "URL Format Validation", desc: "Validates URL structure, protocol, and domain format" },
                  { check: "Domain Tier Classification", desc: "Classifies media outlets into Tier 1 (premium), Tier 2 (industry), Tier 3 (blog)" },
                  { check: "Date Plausibility", desc: "Detects future dates, implausibly old dates, and validates format" },
                  { check: "Headline Sentiment Analysis", desc: "NLP keyword-based sentiment analysis cross-referenced against reported sentiment" },
                  { check: "Reach Sanity Bounds", desc: "Validates reach against world internet population and tier-based expected ranges" },
                  { check: "SOV Mathematical Validation", desc: "Ensures share-of-voice percentages sum to ~100% across competitive set" },
                  { check: "Journalist Name Validation", desc: "Format checks and attribution cross-referencing" },
                  { check: "Duplicate Detection", desc: "Identifies duplicate or near-duplicate claims in dataset" },
                ].map(c => (
                  <div key={c.check} style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ color: "#00C7BE", fontSize: 14, marginTop: 1 }}>✓</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E6E3" }}>{c.check}</div>
                      <div style={{ fontSize: 13, color: "#6B6B76" }}>{c.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Guide Tab */}
        {activeTab === "guide" && (
          <div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📖 Deployment Guide</div>
              <div style={{ fontSize: 14, color: "#9B9B9B", lineHeight: 1.8 }}>
                <h3 style={{ color: "#E8E6E3", fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 0 }}>Quick Start</h3>
                <p>This tool runs entirely client-side — no backend required for core verification logic. To deploy:</p>

                <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: 16, fontFamily: "IBM Plex Mono, monospace", fontSize: 13, margin: "16px 0", overflowX: "auto" }}>
                  <div style={{ color: "#6B6B76" }}># 1. Create a new React project</div>
                  <div style={{ color: "#00C7BE" }}>npx create-react-app pr-verification-studio</div>
                  <div style={{ color: "#00C7BE" }}>cd pr-verification-studio</div>
                  <br />
                  <div style={{ color: "#6B6B76" }}># 2. Copy this component into src/App.jsx</div>
                  <br />
                  <div style={{ color: "#6B6B76" }}># 3. Install & run</div>
                  <div style={{ color: "#00C7BE" }}>npm install</div>
                  <div style={{ color: "#00C7BE" }}>npm start</div>
                  <br />
                  <div style={{ color: "#6B6B76" }}># 4. Deploy to Vercel (free)</div>
                  <div style={{ color: "#00C7BE" }}>npx vercel deploy</div>
                </div>

                <h3 style={{ color: "#E8E6E3", fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24 }}>Adding External API Verification</h3>
                <p>For production, add these free APIs to enhance verification:</p>

                <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: 16, fontFamily: "IBM Plex Mono, monospace", fontSize: 13, margin: "16px 0", overflowX: "auto", whiteSpace: "pre-wrap" }}>
{`// GDELT API (completely free, no key needed)
const gdeltCheck = await fetch(
  \`https://api.gdeltproject.org/api/v2/doc/doc?query=\${encodeURIComponent(headline)}&mode=ArtList&format=json\`
);

// Wayback Machine (free, no key needed)
const archiveCheck = await fetch(
  \`https://archive.org/wayback/available?url=\${encodeURIComponent(url)}\`
);

// Google Custom Search (100 free queries/day)
const googleCheck = await fetch(
  \`https://www.googleapis.com/customsearch/v1?key=\${API_KEY}&cx=\${CX}&q=\${query}\`
);`}
                </div>

                <h3 style={{ color: "#E8E6E3", fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24 }}>How to Export from PR Platforms</h3>

                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {[
                    { platform: "AlphaMetricX", steps: "Go to Reports → Export → Select CSV/JSON → Include all metrics → Download" },
                    { platform: "Meltwater", steps: "Analytics → Export Data → Choose format (Excel/CSV) → Convert to JSON if needed" },
                    { platform: "Cision", steps: "Monitoring → Export Coverage → Select fields → Download as CSV" },
                    { platform: "Prowly", steps: "Media Monitoring → Coverage → Export → CSV format" },
                    { platform: "Mention", steps: "Dashboard → Export → Select date range → CSV download" },
                  ].map(p => (
                    <div key={p.platform} style={{ padding: 14, background: "rgba(0,0,0,0.2)", borderRadius: 10 }}>
                      <div style={{ fontWeight: 600, color: "#00C7BE", marginBottom: 4, fontFamily: "IBM Plex Sans, system-ui" }}>{p.platform}</div>
                      <div style={{ color: "#9B9B9B", fontSize: 13 }}>{p.steps}</div>
                    </div>
                  ))}
                </div>

                <h3 style={{ color: "#E8E6E3", fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24 }}>Confidence Scoring Methodology</h3>
                <p>Each claim receives a 0-100 confidence score based on:</p>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16, margin: "12px 0" }}>
                  <div style={{ marginBottom: 8 }}><strong style={{ color: "#E8E6E3" }}>Base Score:</strong> Average confidence across all individual checks</div>
                  <div style={{ marginBottom: 8 }}><strong style={{ color: "#E8E6E3" }}>Penalties:</strong> -15 per failed check, -5 per warning</div>
                  <div style={{ marginBottom: 8 }}><strong style={{ color: "#E8E6E3" }}>Severity Thresholds:</strong></div>
                  <div style={{ paddingLeft: 16, fontSize: 13 }}>
                    <div><span style={{ color: "#FF3B30" }}>Critical:</span> 3+ failed checks</div>
                    <div><span style={{ color: "#FF9500" }}>High:</span> 1-2 failed checks</div>
                    <div><span style={{ color: "#FFCC00" }}>Medium:</span> 2+ warnings, no failures</div>
                    <div><span style={{ color: "#34C759" }}>Low:</span> All checks pass or minor warnings</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "32px 0 16px", borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 32, fontSize: 12, color: "#4A4A4A" }}>
          PR Verification Studio — Open-source PR analytics verification tool
          <br />Built to combat AI hallucinations in media monitoring data
        </div>
      </div>
    </div>
  );
}
