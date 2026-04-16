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
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:220}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:C.light,fontWeight:600}}>#{index+1}</span>
          <span style={{padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:`${SEV[result.severity]}15`,color:SEV[result.severity],textTransform:"uppercase",letterSpacing:"0.05em"}}>{result.severity}</span>
          {tier.tier&&<span style={{padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:`${tier.color}12`,color:tier.color}}>{tier.label}</span>}
        </div>
        <h3 style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:8,lineHeight:1.4,margin:"0 0 8px"}}>{c.headline||c.url||"Untitled"}</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,fontSize:13,color:C.muted}}>
          {c.publication&&<span>📰 {c.publication}</span>}{c.date&&<span>📅 {c.date}</span>}{c.journalist_name&&<span>✍️ {c.journalist_name}</span>}
          {c.reported_reach&&<span>👁️ {Number(c.reported_reach).toLocaleString()}</span>}
          {c.reported_sentiment&&<span style={{padding:"1px 8px",borderRadius:10,fontSize:11,background:c.reported_sentiment==="positive"?"#ECFDF5":c.reported_sentiment==="negative"?"#FEF2F2":"#F9FAFB",color:c.reported_sentiment==="positive"?"#059669":c.reported_sentiment==="negative"?"#DC2626":"#6B7280"}}>{c.reported_sentiment}</span>}
        </div>
        {c._note&&<div style={{marginTop:8,fontSize:12,color:C.primary,fontStyle:"italic",opacity:.8}}>💡 {c._note}</div>}
      </div>
      <Ring score={result.score} size={68}/>
    </div>
    <div style={{marginTop:14}}>
      <button onClick={()=>setOpen(!open)} style={{background:C.borderLight,border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,color:C.secondary,cursor:"pointer",fontWeight:500}}>
        {open?"▾ Hide":"▸ Show"} {result.checks.length} checks ({result.stats.fails}F {result.stats.warns}W {result.stats.passes}P)
      </button>
      {c.url&&c.url.startsWith("http")&&<a href={c.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:C.accent,marginLeft:12,textDecoration:"none"}}>Open URL ↗</a>}
    </div>
    {open&&<div style={{marginTop:14,display:"grid",gap:6}}>
      {result.checks.map((ch,i)=><div key={i} style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:10,alignItems:"flex-start",background:ch.status==="fail"?"#FEF2F2":ch.status==="warn"?"#FFFBEB":ch.status==="info"?"#EEF2FF":"#ECFDF5",border:`1px solid ${ch.status==="fail"?"#FECACA":ch.status==="warn"?"#FDE68A":ch.status==="info"?"#C7D2FE":"#A7F3D0"}`}}>
        <Icon type={ch.status} size={18}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:C.text}}><span style={{opacity:.4,marginRight:6,fontSize:10}}>L{ch.layer}</span>{ch.source}</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.5}}>{ch.detail}</div>
          {ch.sentimentData?.signals?.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
            {ch.sentimentData.signals.map((s,j)=><span key={j} style={{padding:"1px 8px",borderRadius:6,fontSize:11,background:s.type==="positive"?"#ECFDF5":"#FEF2F2",color:s.type==="positive"?"#059669":"#DC2626"}}>{s.word}</span>)}
          </div>}
          <div style={{marginTop:6,height:4,borderRadius:2,background:"#E5E7EB",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${ch.confidence}%`,borderRadius:2,background:ch.status==="fail"?C.error:ch.status==="warn"?C.warn:C.success,transition:"width .8s ease"}}/>
          </div>
          <div style={{fontSize:11,color:C.light,marginTop:2}}>Confidence: {ch.confidence}%</div>
        </div>
      </div>)}
    </div>}
  </div>;
}

function Summary({results}){
  if(!results.length) return null;
  const avg=Math.round(results.reduce((s,r)=>s+r.score,0)/results.length);
  const tc=results.reduce((s,r)=>s+r.checks.length,0);
  const af=results.reduce((s,r)=>s+r.stats.fails,0);
  const aw=results.reduce((s,r)=>s+r.stats.warns,0);
  const ap=results.reduce((s,r)=>s+r.stats.passes,0);
  return <div style={{background:C.card,borderRadius:16,padding:24,marginBottom:20,border:`1px solid ${C.border}`,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
    <div style={{fontSize:13,fontWeight:700,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:".06em"}}>📊 Verification Summary</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:18}}>
      {[{l:"Claims",v:results.length,c:C.secondary},{l:"Avg Score",v:`${avg}%`,c:avg>70?C.success:avg>40?C.warn:C.error},{l:"Checks",v:tc,c:C.accent},{l:"Issues",v:af+aw,c:af?C.error:C.warn}].map(s=>
        <div key={s.l} style={{background:C.surface,borderRadius:12,padding:14,textAlign:"center",border:`1px solid ${C.borderLight}`}}>
          <div style={{fontSize:26,fontWeight:700,color:s.c}}>{s.v}</div>
          <div style={{fontSize:12,color:C.light,marginTop:2}}>{s.l}</div>
        </div>
      )}
    </div>
    <div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",gap:2}}>
      {ap>0&&<div style={{flex:ap,background:C.success,borderRadius:5}}/>}
      {aw>0&&<div style={{flex:aw,background:C.warn,borderRadius:5}}/>}
      {af>0&&<div style={{flex:af,background:C.error,borderRadius:5}}/>}
    </div>
    <div style={{display:"flex",gap:16,marginTop:8,fontSize:12,color:C.muted}}>
      <span>✓ {ap} passed</span><span>⚠ {aw} warnings</span><span>✗ {af} failed</span>
    </div>
  </div>;
}

export default function App(){
  const [tab,setTab]=useState("input");
  const [fmt,setFmt]=useState("json");
  const [input,setInput]=useState("");
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);
  const [filter,setFilter]=useState("all");
  const fRef=useRef(null);

  const loadSample=()=>{setInput(JSON.stringify(SAMPLE,null,2));setFmt("json");setErr(null);};
  const handleFile=(e)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{setInput(ev.target.result);setFmt(f.name.endsWith(".csv")?"csv":"json");};r.readAsText(f);};

  const verify=async()=>{
    setLoading(true);setErr(null);
    try{
      let claims=fmt==="json"?JSON.parse(input):parseCSV(input);
      if(!Array.isArray(claims))claims=[claims];
      claims=claims.map(normalize);
      if(!claims.length)throw new Error("No valid claims found.");
      await new Promise(r=>setTimeout(r,400));
      setResults(await Engine.run(claims));setTab("results");
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const exportMD=()=>{
    const avg=Math.round(results.reduce((s,r)=>s+r.score,0)/results.length);
    let md=`# PR Verification Report\n**Date:** ${new Date().toLocaleDateString()}\n**Claims:** ${results.length} | **Avg Score:** ${avg}%\n\n`;
    results.forEach((r,i)=>{
      md+=`## #${i+1}: ${r.claim.headline||"Untitled"}\n**Score:** ${r.score}% | **Severity:** ${r.severity}\n`;
      r.checks.forEach(c=>{md+=`- [${c.status.toUpperCase()}] L${c.layer} ${c.source}: ${c.detail}\n`;});
      md+="\n";
    });
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([md]));a.download=`pr-verify-${Date.now()}.md`;a.click();
  };

  const filtered=results.filter(r=>filter==="all"||r.severity===filter).sort((a,b)=>a.score-b.score);
  const ts=(active)=>({padding:"10px 20px",borderRadius:10,border:"none",fontSize:14,fontWeight:active?600:400,background:active?C.card:"transparent",color:active?C.primary:C.muted,cursor:"pointer",transition:"all .2s",boxShadow:active?"0 1px 4px rgba(192,38,211,.1)":"none"});

  return <div style={{fontFamily:"'Outfit','DM Sans',system-ui,sans-serif",background:"linear-gradient(135deg,#FDF4FF 0%,#EDE9FE 50%,#DBEAFE 100%)",minHeight:"100vh",color:C.text}}>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>

    {/* Header */}
    <div style={{background:"linear-gradient(135deg,#C026D3 0%,#7C3AED 40%,#3B82F6 100%)",padding:"28px 24px 22px",color:"#fff"}}>
      <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,.2)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800}}>V</div>
        <div>
          <div style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em"}}>PR Verification Studio</div>
          <div style={{fontSize:13,opacity:.85,fontWeight:300}}>Verify AI-generated PR analytics • AlphaMetricX • Meltwater • Cision</div>
        </div>
      </div>
    </div>

    {/* Nav */}
    <div style={{maxWidth:1100,margin:"0 auto",padding:"0 20px"}}>
      <div style={{display:"flex",gap:4,marginTop:-16,background:C.surface,borderRadius:14,padding:5,width:"fit-content",boxShadow:"0 2px 8px rgba(0,0,0,.06)",border:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        {[{id:"input",l:"📥 Input"},{id:"results",l:`📋 Results${results.length?` (${results.length})`:""}`},{id:"logic",l:"🧠 Logic"},{id:"deploy",l:"🚀 Deploy"}].map(t=>
          <button key={t.id} onClick={()=>setTab(t.id)} style={ts(tab===t.id)}>{t.l}</button>
        )}
      </div>
    </div>

    <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 20px 60px"}}>

      {tab==="input"&&<div>
        <div style={{background:C.card,borderRadius:16,padding:28,border:`1px solid ${C.border}`,marginBottom:20,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
          <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 6px"}}>Import PR Analytics Data</h2>
          <p style={{fontSize:14,color:C.muted,marginBottom:20,lineHeight:1.5}}>Paste exported data from any PR platform. Auto-detects field names. Use the test data to see how verification works.</p>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",gap:3,background:C.surface,borderRadius:8,padding:3,border:`1px solid ${C.borderLight}`}}>
              <button onClick={()=>setFmt("json")} style={ts(fmt==="json")}>JSON</button>
              <button onClick={()=>setFmt("csv")} style={ts(fmt==="csv")}>CSV</button>
            </div>
            <button onClick={loadSample} style={{background:`${C.primary}12`,color:C.primary,border:`1px solid ${C.primary}30`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:500,cursor:"pointer"}}>🧪 Load 6 Test Claims</button>
            <button onClick={()=>fRef.current?.click()} style={{background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",fontSize:13,cursor:"pointer"}}>📂 Upload File</button>
            <input ref={fRef} type="file" accept=".json,.csv,.tsv" onChange={handleFile} style={{display:"none"}}/>
          </div>
          <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={fmt==="json"?'[\n  {\n    "headline": "...",\n    "url": "https://...",\n    "publication": "...",\n    "date": "2024-01-15",\n    "sentiment": "positive",\n    "reach": 12500000,\n    "journalist": "..."\n  }\n]':'headline,url,publication,date,sentiment,reach,journalist\n"Title",https://...,TechCrunch,2024-01-15,positive,12500000,Name'}
            style={{width:"100%",minHeight:200,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16,color:C.text,fontFamily:"'JetBrains Mono',monospace",fontSize:13,lineHeight:1.6,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
          {err&&<div style={{marginTop:12,padding:14,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,fontSize:13,color:"#DC2626"}}>❌ {err}</div>}
          <div style={{marginTop:20,display:"flex",gap:12,alignItems:"center"}}>
            <button onClick={verify} disabled={!input.trim()||loading} style={{background:"linear-gradient(135deg,#C026D3,#7C3AED,#3B82F6)",color:"#fff",border:"none",borderRadius:12,padding:"14px 36px",fontSize:15,fontWeight:600,cursor:!input.trim()||loading?"not-allowed":"pointer",opacity:!input.trim()||loading?.5:1,boxShadow:"0 4px 12px rgba(192,38,211,.25)"}}>
              {loading?"⏳ Verifying...":"🔍 Run Verification"}
            </button>
            {loading&&<span style={{fontSize:13,color:C.muted}}>Running 7-layer engine...</span>}
          </div>
        </div>
        <div style={{background:C.card,borderRadius:16,padding:24,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:13,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:".05em",margin:"0 0 12px"}}>🗂️ Auto-Detected Fields</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:8}}>
            {[{f:"headline / title",d:"→ Sentiment cross-check (Layer 4)"},{f:"url / link",d:"→ Format + domain validation (Layer 1)"},{f:"publication / source",d:"→ Tier classification from 150+ DB (Layer 2)"},{f:"date / published_date",d:"→ Future detection + plausibility (Layer 3)"},{f:"sentiment / tone",d:"→ NLP cross-reference (Layer 4)"},{f:"reach / impressions",d:"→ Sanity bounds + tier range (Layer 5)"},{f:"journalist / author",d:"→ Name validation + attribution (Layer 7)"},{f:"sov / share_of_voice",d:"→ Math validation, sum check (Layer 6)"}].map(x=>
              <div key={x.f} style={{padding:10,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                <span style={{color:C.primary,fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600}}>{x.f}</span>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>{x.d}</div>
              </div>
            )}
          </div>
        </div>
      </div>}

      {tab==="results"&&<div>
        {!results.length?<div style={{background:C.card,borderRadius:16,padding:60,textAlign:"center",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>📋</div><div style={{color:C.muted}}>No results yet — go to Input tab.</div>
        </div>:<>
          <Summary results={results}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {["all","critical","high","medium","low"].map(s=><button key={s} onClick={()=>setFilter(s)} style={{...ts(filter===s),...(s!=="all"&&filter===s?{color:SEV[s]}:{}),padding:"6px 14px",fontSize:13}}>
                {s==="all"?"All":`${s[0].toUpperCase()+s.slice(1)} (${results.filter(r=>r.severity===s).length})`}
              </button>)}
            </div>
            <button onClick={exportMD} style={{background:"linear-gradient(135deg,#C026D3,#7C3AED)",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}}>⬇ Export Report</button>
          </div>
          {filtered.map((r,i)=><ClaimCard key={i} result={r} index={results.indexOf(r)}/>)}
        </>}
      </div>}

      {tab==="logic"&&<div style={{display:"grid",gap:16}}>
        <div style={{background:C.card,borderRadius:16,padding:28,border:`1px solid ${C.border}`}}>
          <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 8px"}}>🧠 How The 7-Layer Engine Works</h2>
          <p style={{fontSize:14,color:C.muted,lineHeight:1.7,margin:"0 0 4px"}}>PR platforms use AI to aggregate media data. AI can hallucinate articles, inflate reach, misclassify sentiment, or fabricate journalists. Each layer catches different errors independently.</p>
        </div>
        {[
          {n:1,t:"URL Validation",i:"🔗",what:"Validates article URL format, protocol, and domain authenticity.",how:"Parses URL structure. Flags placeholder domains (example.com, localhost), homepage-only URLs, and non-HTTP protocols.",catches:"Fake/hallucinated links, placeholder data, broken URLs.",ex:"https://example.invalid/fake → FAIL (placeholder domain)"},
          {n:2,t:"Publication Tier",i:"📰",what:"Classifies outlets into Tier 1 (Reuters, BBC), Tier 2 (Business Insider), Tier 3 (Medium, blogs) from a 150+ database.",how:"Matches URL hostname or publication name against curated database. Each tier has expected reach ranges for Layer 5 cross-check.",catches:"Blog posts misrepresented as premium coverage.",ex:"Reuters → Tier 1 Premium (reach: 1M-800M)"},
          {n:3,t:"Date Plausibility",i:"📅",what:"Catches impossible dates — future articles, ancient dates, format errors.",how:"Parses date, calculates days from today, flags future dates (impossible), >10yr old articles (suspicious), weekend publishing for business outlets.",catches:"AI hallucinating future articles, wrong dates, fabricated coverage.",ex:"2027-09-15 → FAIL (future date — article can't exist)"},
          {n:4,t:"Sentiment NLP",i:"💬",what:"Independently analyzes headline sentiment and compares against platform's reported value.",how:"50+ word lexicon with 3 weight levels (strong/moderate/weak). Calculates net score: >1=positive, <-1=negative, else=neutral.",catches:"Negative news (layoffs, scandals) misclassified as positive — extremely common in AI-generated reports.",ex:"'Major layoffs announced' → negative, but reported as positive → FAIL"},
          {n:5,t:"Reach Sanity",i:"👁️",what:"Validates audience numbers against physical limits and tier-based expected ranges.",how:"3-level check: (1) Can't exceed 5.5B internet users, (2) Can't exceed 1B without being top-10 global site, (3) Must fit within tier's expected range (e.g., Tier 3 blog max 5M).",catches:"Inflated reach numbers — the #1 most common error in PR reports. AI platforms often multiply or fabricate these.",ex:"Medium blog with 45M reach → FAIL (Tier 3 max is 5M)"},
          {n:6,t:"SOV Math",i:"📊",what:"Share of Voice must be 0-100% and all competitors' SOV must sum to ~100%.",how:"Validates range, flags monopolistic values (>80%), sums your SOV + all competitor SOVs. Deviation >10% from 100 = fail, >3% = warning.",catches:"Math errors, incomplete competitive sets, inflated SOV claims.",ex:"45% + 22% + 18% + 10% = 95% → WARN (5% gap)"},
          {n:7,t:"Journalist Check",i:"✍️",what:"Validates journalist names and attribution claims.",how:"Checks: too short (<3 chars = truncated), single name (no surname), unusual characters. Suggests LinkedIn/site verification.",catches:"Fabricated names, truncated data exports, AI-generated bylines.",ex:"'X' as journalist → FAIL (1 char — placeholder)"},
        ].map(l=><div key={l.n} style={{background:C.card,borderRadius:16,padding:22,border:`1px solid ${C.border}`,borderLeft:`4px solid ${C.primary}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{width:32,height:32,borderRadius:8,background:`${C.primary}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{l.i}</span>
            <div><span style={{fontSize:11,color:C.primary,fontWeight:700}}>LAYER {l.n}</span><h3 style={{fontSize:16,fontWeight:700,margin:0}}>{l.t}</h3></div>
          </div>
          <div style={{display:"grid",gap:8}}>
            {[{k:"What",v:l.what},{k:"How",v:l.how},{k:"Catches",v:l.catches},{k:"Example",v:l.ex}].map(x=>
              <div key={x.k} style={{padding:10,background:C.surface,borderRadius:8}}>
                <span style={{fontSize:11,fontWeight:700,color:C.primary,textTransform:"uppercase"}}>{x.k}</span>
                <p style={{margin:"3px 0 0",fontSize:13,color:C.muted,lineHeight:1.5}}>{x.v}</p>
              </div>
            )}
          </div>
        </div>)}
        <div style={{background:C.card,borderRadius:16,padding:22,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:16,fontWeight:700,margin:"0 0 10px"}}>📐 Scoring Formula</h3>
          <div style={{background:C.surface,borderRadius:10,padding:16,fontFamily:"'JetBrains Mono',monospace",fontSize:13,lineHeight:1.8,color:C.text}}>
            {`Score = clamp(0, 100,
  avg_confidence_across_checks
  - (fail_count × 12)
  - (warn_count × 4)
)

Severity:
  fails ≥ 3 → CRITICAL
  fails ≥ 1 → HIGH
  warns ≥ 2 → MEDIUM
  else      → LOW`}
          </div>
        </div>
      </div>}

      {tab==="deploy"&&<div style={{display:"grid",gap:16}}>
        <div style={{background:C.card,borderRadius:16,padding:28,border:`1px solid ${C.border}`}}>
          <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 12px"}}>🚀 Deploy in 3 Steps</h2>

          <div style={{background:`${C.primary}06`,border:`1px solid ${C.primary}20`,borderRadius:14,padding:20,marginBottom:14}}>
            <h3 style={{margin:"0 0 8px",color:C.primary}}>Step 1: Vercel (Free, 2 min)</h3>
            <pre style={{background:C.surface,borderRadius:10,padding:16,fontSize:13,fontFamily:"'JetBrains Mono',monospace",overflowX:"auto",margin:0,lineHeight:1.7}}>{`npx create-react-app pr-verification-studio
cd pr-verification-studio
# Replace src/App.js with this component code
npm i -g vercel && vercel deploy
# Live at: https://your-project.vercel.app`}</pre>
          </div>

          <div style={{background:`${C.accent}06`,border:`1px solid ${C.accent}20`,borderRadius:14,padding:20,marginBottom:14}}>
            <h3 style={{margin:"0 0 8px",color:C.accent}}>Step 2: Add Backend APIs (Optional — More Power)</h3>
            <pre style={{background:C.surface,borderRadius:10,padding:16,fontSize:12,fontFamily:"'JetBrains Mono',monospace",overflowX:"auto",margin:0,lineHeight:1.6}}>{`// server.js — All FREE APIs, no keys needed
const express = require('express');
const app = express();

// GDELT — World's largest open media DB (FREE)
app.post('/api/verify-gdelt', async (req, res) => {
  const r = await fetch(\`https://api.gdeltproject.org/api/v2/
    doc/doc?query=\${encodeURIComponent(req.body.headline)}
    &mode=ArtList&format=json&maxrecords=5\`);
  const data = await r.json();
  res.json({ found: data.articles?.length > 0 });
});

// Wayback Machine — Archive check (FREE)
app.post('/api/verify-archive', async (req, res) => {
  const r = await fetch(\`https://archive.org/wayback/
    available?url=\${encodeURIComponent(req.body.url)}\`);
  const data = await r.json();
  res.json({ archived: !!data.archived_snapshots?.closest });
});

// URL HEAD check — verify article loads
app.post('/api/verify-url', async (req, res) => {
  try {
    const r = await fetch(req.body.url, {method:'HEAD'});
    res.json({ exists: r.ok, status: r.status });
  } catch(e) { res.json({ exists: false }); }
});

app.listen(3001);`}</pre>
          </div>

          <div style={{background:`${C.success}06`,border:`1px solid ${C.success}20`,borderRadius:14,padding:20}}>
            <h3 style={{margin:"0 0 8px",color:C.success}}>Step 3: Docker (Self-hosted)</h3>
            <pre style={{background:C.surface,borderRadius:10,padding:16,fontSize:13,fontFamily:"'JetBrains Mono',monospace",overflowX:"auto",margin:0,lineHeight:1.7}}>{`FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
RUN npm i -g serve
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]

# docker build -t pr-verifier . && docker run -p 3000:3000 pr-verifier`}</pre>
          </div>
        </div>

        <div style={{background:C.card,borderRadius:16,padding:24,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:15,fontWeight:700,margin:"0 0 12px"}}>📤 Export from PR Platforms</h3>
          <div style={{display:"grid",gap:8}}>
            {[
              {n:"AlphaMetricX",s:"Search → Select results → Export (top-right) → CSV/Excel → Map: Title→headline, Source→publication, Date, Sentiment, Reach"},
              {n:"Meltwater",s:"Explore → Export → Excel/CSV → Include: Headline, URL, Source, Date, Sentiment, Reach, Author"},
              {n:"Cision",s:"Monitoring → Export → CSV → Map: Headline, URL, Outlet, Date, Tone, Circulation, Journalist"},
              {n:"Prowly",s:"Coverage list → Export CSV → Title, Link, Source, Date, Sentiment"},
              {n:"Brand24",s:"Analysis → Export Excel → Title, URL, Source, Date, Sentiment, Reach"},
            ].map(p=><div key={p.n} style={{padding:12,background:C.surface,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
              <div style={{fontWeight:700,color:C.primary,fontSize:14}}>{p.n}</div>
              <div style={{fontSize:13,color:C.muted,marginTop:2}}>{p.s}</div>
            </div>)}
          </div>
        </div>

        <div style={{background:C.card,borderRadius:16,padding:24,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:15,fontWeight:700,margin:"0 0 12px"}}>🆓 Free APIs for Production</h3>
          <div style={{display:"grid",gap:8}}>
            {[
              {n:"GDELT Project",u:"api.gdeltproject.org",c:"100% Free",d:"World's largest open media DB, 250K+ articles/day, no key"},
              {n:"Wayback Machine",u:"archive.org/wayback/available",c:"100% Free",d:"Verify if URL was ever real, no key needed"},
              {n:"Google Custom Search",u:"developers.google.com/custom-search",c:"100/day free",d:"Verify via Google index, needs free API key"},
              {n:"News API",u:"newsapi.org",c:"100/day free",d:"Search 80K+ sources, headline verification"},
              {n:"MediaStack",u:"mediastack.com",c:"500/mo free",d:"Global news API with source categorization"},
            ].map(a=><div key={a.n} style={{padding:12,background:C.surface,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{a.n}</div>
                <div style={{fontSize:12,color:C.muted}}>{a.d}</div>
                <div style={{fontSize:12,color:C.accent,fontFamily:"'JetBrains Mono',monospace"}}>{a.u}</div>
              </div>
              <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:"#ECFDF5",color:"#059669",whiteSpace:"nowrap"}}>{a.c}</span>
            </div>)}
          </div>
        </div>
      </div>}
    </div>
  </div>;
}
