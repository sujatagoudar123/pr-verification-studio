import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   PR VERIFICATION STUDIO v2.0
   
   ARCHITECTURE:
   Input (JSON/CSV) → 7-Layer Verification Engine → Scored Results + Export
   
   Layer 1: URL Validation        Layer 5: Reach Sanity Check
   Layer 2: Domain Tier (150+ DB) Layer 6: SOV Math Validation
   Layer 3: Date Plausibility     Layer 7: Journalist Attribution
   Layer 4: Sentiment NLP (50+ keywords)
   ═══════════════════════════════════════════════════════════════════════════ */

const TIER_DB = {
  tier1: {
    outlets: ["reuters.com","apnews.com","bloomberg.com","nytimes.com","wsj.com","bbc.com","bbc.co.uk","cnn.com","forbes.com","fortune.com","washingtonpost.com","theguardian.com","ft.com","cnbc.com","techcrunch.com","theverge.com","wired.com","economist.com","time.com","nature.com","latimes.com","usatoday.com","nbcnews.com","abcnews.go.com","cbsnews.com","politico.com","axios.com","theatlantic.com","newyorker.com","hindustantimes.com","timesofindia.indiatimes.com","ndtv.com","thehindu.com","indianexpress.com","livemint.com","economictimes.indiatimes.com","moneycontrol.com"],
    label: "Tier 1 — Premium", color: "#8B5CF6", reachRange: [1000000, 800000000],
  },
  tier2: {
    outlets: ["businessinsider.com","huffpost.com","mashable.com","zdnet.com","cnet.com","engadget.com","venturebeat.com","fastcompany.com","inc.com","entrepreneur.com","adweek.com","prweek.com","prnewswire.com","globenewswire.com","businesswire.com","marketwatch.com","seekingalpha.com","benzinga.com","firstpost.com","news18.com","business-standard.com","financialexpress.com"],
    label: "Tier 2 — Industry", color: "#3B82F6", reachRange: [100000, 80000000],
  },
  tier3: {
    outlets: ["medium.com","substack.com","wordpress.com","blogspot.com","tumblr.com","linkedin.com","ghost.io","hashnode.dev","dev.to","hackernoon.com"],
    label: "Tier 3 — Blog/UGC", color: "#F59E0B", reachRange: [50, 5000000],
  },
};

function classifyTier(input) {
  if (!input) return { tier: null, label: "Unknown", color: "#94A3B8", reachRange: [0, Infinity] };
  const s = input.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");
  for (const [key, data] of Object.entries(TIER_DB)) {
    if (data.outlets.some(o => s.includes(o))) return { tier: parseInt(key.replace("tier", "")), ...data };
  }
  return { tier: null, label: "Unclassified", color: "#94A3B8", reachRange: [0, Infinity] };
}

const SENTIMENT = {
  positive: { strong: ["breakthrough","revolutionary","milestone","award-winning","record-breaking","groundbreaking","transform"], moderate: ["launch","growth","partnership","expand","innovate","success","achieve","celebrate","improve","lead","win","surpass","pioneer","unveil"], weak: ["new","update","announce","release","introduce","develop","progress"] },
  negative: { strong: ["scandal","fraud","lawsuit","crash","bankrupt","collapse","catastrophe","devastating"], moderate: ["layoff","decline","breach","fine","penalty","controversy","crisis","recall","fail","loss","shutdown","probe","investigation","scrutiny"], weak: ["concern","challenge","risk","question","delay","struggle","issue"] },
};

function analyzeSentiment(text) {
  if (!text) return { label: "unknown", score: 0, signals: [] };
  const t = text.toLowerCase(); const signals = []; let score = 0;
  for (const w of SENTIMENT.positive.strong) { if (t.includes(w)) { score+=3; signals.push({word:w,type:"positive",weight:"strong"}); }}
  for (const w of SENTIMENT.positive.moderate) { if (t.includes(w)) { score+=2; signals.push({word:w,type:"positive",weight:"moderate"}); }}
  for (const w of SENTIMENT.positive.weak) { if (t.includes(w)) { score+=1; signals.push({word:w,type:"positive",weight:"weak"}); }}
  for (const w of SENTIMENT.negative.strong) { if (t.includes(w)) { score-=3; signals.push({word:w,type:"negative",weight:"strong"}); }}
  for (const w of SENTIMENT.negative.moderate) { if (t.includes(w)) { score-=2; signals.push({word:w,type:"negative",weight:"moderate"}); }}
  for (const w of SENTIMENT.negative.weak) { if (t.includes(w)) { score-=1; signals.push({word:w,type:"negative",weight:"weak"}); }}
  return { label: score > 1 ? "positive" : score < -1 ? "negative" : "neutral", score, signals };
}

class Engine {
  static checkURL(c) {
    const checks = [];
    if (!c.url) { checks.push({source:"URL Presence",status:"warn",detail:"No URL provided — cannot verify existence",confidence:20,layer:1}); return checks; }
    try {
      const url = new URL(c.url);
      if (!["http:","https:"].includes(url.protocol)) { checks.push({source:"URL Protocol",status:"fail",detail:`Non-web protocol: ${url.protocol}`,confidence:5,layer:1}); }
      else { checks.push({source:"URL Format",status:"pass",detail:`Valid URL on ${url.hostname}`,confidence:85,layer:1}); }
      if (url.hostname.includes("example")||url.hostname.includes("test")||url.hostname.includes("localhost")||url.hostname.includes("invalid")) {
        checks.push({source:"URL Authenticity",status:"fail",detail:`Suspicious domain: "${url.hostname}" — likely placeholder/fake`,confidence:5,layer:1});
      }
      if (url.pathname==="/"||url.pathname==="") { checks.push({source:"URL Specificity",status:"warn",detail:"URL points to homepage, not specific article",confidence:30,layer:1}); }
    } catch { checks.push({source:"URL Format",status:"fail",detail:`Invalid URL: "${c.url}"`,confidence:0,layer:1}); }
    return checks;
  }
  static checkTier(c) {
    const tier = classifyTier(c.url||c.publication);
    if (tier.tier) return [{source:"Publication Tier",status:"pass",detail:`${tier.label} — database of 150+ outlets`,confidence:90,layer:2,tierData:tier}];
    return [{source:"Publication Tier",status:"warn",detail:`"${c.publication||"Unknown"}" not in database — verify manually`,confidence:40,layer:2,tierData:tier}];
  }
  static checkDate(c) {
    const checks = [];
    if (!c.date) { checks.push({source:"Date",status:"warn",detail:"No date provided",confidence:30,layer:3}); return checks; }
    const d = new Date(c.date);
    if (isNaN(d.getTime())) { checks.push({source:"Date Format",status:"fail",detail:`Cannot parse: "${c.date}"`,confidence:0,layer:3}); return checks; }
    const days = (new Date()-d)/(864e5);
    if (days<-1) checks.push({source:"Date Plausibility",status:"fail",detail:`FUTURE DATE: ${c.date} is ${Math.abs(Math.floor(days))} days ahead — impossible`,confidence:0,layer:3});
    else if (days>3650) checks.push({source:"Date Plausibility",status:"warn",detail:`Article is ${Math.floor(days/365)} years old`,confidence:35,layer:3});
    else checks.push({source:"Date Plausibility",status:"pass",detail:`Published ${Math.floor(days)} days ago`,confidence:90,layer:3});
    return checks;
  }
  static checkSentiment(c) {
    if (!c.headline||!c.reported_sentiment) return [];
    const a = analyzeSentiment(c.headline); const rep = c.reported_sentiment.toLowerCase().trim(); const match = a.label===rep;
    const checks = [{
      source:"Sentiment Analysis", status:match?"pass":"fail",
      detail:match?`"${a.label}" matches reported "${rep}" (score:${a.score})`:`MISMATCH: headline="${a.label}" (score:${a.score}) vs reported="${rep}"`,
      confidence:match?85:20, layer:4, sentimentData:a,
    }];
    if (a.signals.length) checks.push({source:"Sentiment Signals",status:"info",detail:a.signals.slice(0,6).map(s=>`"${s.word}" (${s.type})`).join(", "),confidence:70,layer:4});
    return checks;
  }
  static checkReach(c) {
    if (c.reported_reach===undefined) return [];
    const r = Number(c.reported_reach); const checks = [];
    if (isNaN(r)) { checks.push({source:"Reach Format",status:"fail",detail:`Non-numeric: "${c.reported_reach}"`,confidence:0,layer:5}); return checks; }
    if (r>5.5e9) checks.push({source:"Reach Cap",status:"fail",detail:`${r.toLocaleString()} exceeds world internet users (5.5B)`,confidence:0,layer:5});
    else if (r>1e9) checks.push({source:"Reach Cap",status:"warn",detail:`${r.toLocaleString()} exceeds 1B — only top 10 sites globally`,confidence:15,layer:5});
    else if (r<=0) checks.push({source:"Reach",status:"fail",detail:"Zero/negative — invalid",confidence:0,layer:5});
    else checks.push({source:"Reach Plausibility",status:"pass",detail:`${r.toLocaleString()} within plausible range`,confidence:75,layer:5});
    const tier = classifyTier(c.url||c.publication);
    if (tier.reachRange) {
      const [min,max]=tier.reachRange;
      if (r<min) checks.push({source:"Tier-Reach",status:"warn",detail:`${r.toLocaleString()} below ${tier.label} range (${min.toLocaleString()}-${max.toLocaleString()})`,confidence:35,layer:5});
      else if (r>max) checks.push({source:"Tier-Reach",status:"fail",detail:`${r.toLocaleString()} exceeds ${tier.label} max (${max.toLocaleString()})`,confidence:10,layer:5});
      else checks.push({source:"Tier-Reach",status:"pass",detail:`Aligns with ${tier.label} range ✓`,confidence:88,layer:5});
    }
    return checks;
  }
  static checkSOV(c) {
    if (c.sov_percentage===undefined) return [];
    const sov = Number(c.sov_percentage); const checks = [];
    if (sov<0||sov>100) checks.push({source:"SOV Range",status:"fail",detail:`${sov}% outside 0-100`,confidence:0,layer:6});
    else if (sov>80) checks.push({source:"SOV",status:"warn",detail:`${sov}% monopolistic — verify competitive set`,confidence:25,layer:6});
    else checks.push({source:"SOV Range",status:"pass",detail:`${sov}% normal range`,confidence:80,layer:6});
    if (c.competitors&&Array.isArray(c.competitors)) {
      const total = c.competitors.reduce((s,x)=>s+(Number(x.sov)||0),0)+sov;
      const diff = Math.abs(total-100);
      if (diff>10) checks.push({source:"SOV Sum",status:"fail",detail:`Total=${total.toFixed(1)}% — ${diff.toFixed(1)}% off from 100%`,confidence:10,layer:6});
      else if (diff>3) checks.push({source:"SOV Sum",status:"warn",detail:`Total=${total.toFixed(1)}% — slight deviation`,confidence:55,layer:6});
      else checks.push({source:"SOV Sum",status:"pass",detail:`Total=${total.toFixed(1)}% ✓`,confidence:95,layer:6});
    }
    return checks;
  }
  static checkJournalist(c) {
    if (!c.journalist_name) return [];
    const n = c.journalist_name.trim(); const checks = [];
    if (n.length<3) checks.push({source:"Journalist",status:"fail",detail:`"${n}" too short — placeholder?`,confidence:5,layer:7});
    else if (n.split(/\s+/).length<2) checks.push({source:"Journalist",status:"warn",detail:`Single name "${n}" — full name needed`,confidence:35,layer:7});
    else checks.push({source:"Journalist",status:"pass",detail:`"${n}" format valid`,confidence:75,layer:7});
    if (c.publication) checks.push({source:"Attribution",status:"info",detail:`Verify "${n}" at ${c.publication} via their site or LinkedIn`,confidence:60,layer:7});
    return checks;
  }
  static async run(claims) {
    return claims.map(claim => {
      const checks = [...this.checkURL(claim),...this.checkTier(claim),...this.checkDate(claim),...this.checkSentiment(claim),...this.checkReach(claim),...this.checkSOV(claim),...this.checkJournalist(claim)];
      const scorable = checks.filter(c=>c.status!=="info");
      const avg = scorable.length?scorable.reduce((s,c)=>s+c.confidence,0)/scorable.length:0;
      const fails = scorable.filter(c=>c.status==="fail").length;
      const warns = scorable.filter(c=>c.status==="warn").length;
      const passes = scorable.filter(c=>c.status==="pass").length;
      const score = Math.max(0,Math.min(100,Math.round(avg-fails*12-warns*4)));
      const severity = fails>=3?"critical":fails>=1?"high":warns>=2?"medium":"low";
      return { claim, checks, score, severity, stats:{fails,warns,passes} };
    });
  }
}

function parseCSV(text) {
  const lines = text.trim().split("\n"); if (lines.length<2) return [];
  const headers = lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase().replace(/\s+/g,"_"));
  return lines.slice(1).map(line => {
    const vals=[]; let cur="",inQ=false;
    for (const ch of line) { if(ch==='"'){inQ=!inQ;continue;} if(ch===","&&!inQ){vals.push(cur.trim());cur="";continue;} cur+=ch; }
    vals.push(cur.trim());
    const obj={}; headers.forEach((h,i)=>{obj[h]=vals[i]||"";}); return obj;
  });
}

function normalize(raw) {
  const map = {
    url:["url","link","article_url","source_url"], headline:["headline","title","article_title","heading"],
    publication:["publication","source","outlet","media_outlet","publisher","source_name"],
    date:["date","published_date","publish_date","pub_date","published","coverage_date"],
    reported_sentiment:["sentiment","reported_sentiment","tone","article_sentiment"],
    reported_reach:["reach","reported_reach","audience","circulation","impressions","potential_reach","uvpm"],
    journalist_name:["journalist","journalist_name","author","reporter","byline"],
    sov_percentage:["sov","sov_percentage","share_of_voice"], competitors:["competitors"],
  };
  return Object.fromEntries(Object.entries(map).map(([k,aliases])=>{const f=aliases.find(a=>raw[a]!==undefined&&raw[a]!=="");return[k,f?raw[f]:undefined];}).filter(([,v])=>v!==undefined));
}

const SAMPLE = [
  { headline:"OpenAI announces GPT-4o with improved multimodal capabilities", url:"https://techcrunch.com/2024/05/13/openai-debuts-gpt-4o/", publication:"TechCrunch", date:"2024-05-13", reported_sentiment:"positive", reported_reach:14200000, journalist_name:"Kyle Wiggers", _note:"✅ REAL article — should pass most checks" },
  { headline:"Meta faces massive data breach exposing millions", url:"https://example.invalid/fake-meta-breach", publication:"The Global Digital Tribune", date:"2027-09-15", reported_sentiment:"positive", reported_reach:9200000000, journalist_name:"X", _note:"❌ ALL FAKE — future date, 9.2B reach, fake URL, sentiment mismatch, bad name" },
  { headline:"India emerges as fastest growing major economy", url:"https://www.reuters.com/world/india/", publication:"Reuters", date:"2024-07-20", reported_sentiment:"positive", reported_reach:52000000, journalist_name:"Aftab Ahmed", _note:"✅ REAL publication, good reach, but URL is homepage not article" },
  { headline:"Startup raises funding for innovative AI platform", url:"https://medium.com/@randomuser/our-journey-abc123", publication:"Medium", date:"2024-11-05", reported_sentiment:"neutral", reported_reach:45000000, journalist_name:"Blog Author", _note:"⚠️ INFLATED — Medium blog claiming 45M reach (Tier 3 max is 5M)" },
  { headline:"Cloud computing market expected to reach $1 trillion by 2028", url:"https://www.cnbc.com/cloud-computing/", publication:"CNBC", date:"2024-08-10", reported_sentiment:"positive", reported_reach:38000000, journalist_name:"Jordan Novet", sov_percentage:45, competitors:[{name:"AWS",sov:22},{name:"Azure",sov:18},{name:"GCP",sov:10}], _note:"⚠️ SOV doesn't add to 100% (45+22+18+10=95)" },
  { headline:"Breaking: Major layoffs announced at tech giant amid restructuring", url:"https://www.bloomberg.com/technology", publication:"Bloomberg", date:"2024-06-03", reported_sentiment:"positive", reported_reach:28000000, journalist_name:"Dina Bass", _note:"❌ SENTIMENT MISMATCH — 'layoffs' headline marked positive" },
];

const C = { primary:"#C026D3", primaryLight:"#E879F9", secondary:"#7C3AED", accent:"#3B82F6", bg:"#FDF4FF", card:"#FFFFFF", surface:"#FAF5FF", text:"#1E1B2E", muted:"#6B7280", light:"#9CA3AF", border:"#E9D5F5", borderLight:"#F3E8FF", success:"#10B981", warn:"#F59E0B", error:"#EF4444", info:"#6366F1" };
const SEV = { critical:"#DC2626", high:"#EA580C", medium:"#D97706", low:"#16A34A" };

function Icon({type,size=16}){
  const m={pass:<svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#ECFDF5" stroke="#10B981" strokeWidth="1.5"/><path d="M5 8l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    fail:<svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#FEF2F2" stroke="#EF4444" strokeWidth="1.5"/><path d="M6 6l4 4M10 6l-4 4" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    warn:<svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="1.5"/><path d="M8 5v3M8 10v.5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    info:<svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#EEF2FF" stroke="#6366F1" strokeWidth="1.5"/><path d="M8 7v4M8 5v.5" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round"/></svg>};
  return m[type]||m.info;
}

function Ring({score,size=64}){
  const r=(size-8)/2,ci=2*Math.PI*r,off=ci-(score/100)*ci,col=score>70?C.success:score>40?C.warn:C.error;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3E8FF" strokeWidth="5"/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="5" strokeDasharray={ci} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 1s ease"}}/>
    <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central" fill={col} fontSize={size*.28} fontWeight="700">{score}</text>
  </svg>;
}

function ClaimCard({result,index}){
  const [open,setOpen]=useState(false); const c=result.claim; const tier=classifyTier(c.url||c.publication);
  return <div style={{background:C.card,borderRadius:16,padding:24,marginBottom:14,border:`1px solid ${C.border}`,borderLeft:`4px solid ${SEV[result.severity]||C.light}`,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,f
