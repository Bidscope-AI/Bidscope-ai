import { useState, useRef } from "react";

const ANALYZE_PROMPT = `You are an expert construction estimator with 20+ years of experience in commercial and residential bidding.

Analyze the provided construction specification or project description. Return ONLY a JSON object with this exact structure, no markdown, no backticks:
{
  "projectSummary": "2-3 sentence overview",
  "estimatedDuration": "e.g. 6-8 weeks",
  "projectType": "e.g. Commercial TI / Residential / Civil",
  "lineItems": [
    {
      "id": "1",
      "category": "e.g. Concrete",
      "description": "e.g. Foundation slab pour",
      "unit": "e.g. CY / SF / LF / LS / EA / HR",
      "quantity": 120,
      "suggestedUnitCost": 85,
      "notes": "optional note about this line item"
    }
  ],
  "risks": ["risk1", "risk2"],
  "exclusions": ["item to exclude or clarify"],
  "bidNotes": "2-3 sentences of professional estimating advice"
}

Include 8-15 realistic line items covering all major trades visible in the specs. suggestedUnitCost should reflect current US market rates. Be specific and practical.`;

const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const CATEGORIES = ["All", "Concrete", "Framing", "MEP", "Electrical", "Plumbing", "HVAC", "Finishes", "Sitework", "Specialty", "Labor", "Equipment", "Other"];

const CAT_COLORS = {
  Concrete: "#60a5fa", Framing: "#34d399", MEP: "#a78bfa",
  Electrical: "#fbbf24", Plumbing: "#38bdf8", HVAC: "#f472b6",
  Finishes: "#fb923c", Sitework: "#4ade80", Specialty: "#e879f9",
  Labor: "#f87171", Equipment: "#94a3b8", Other: "#cbd5e1"
};

export default function BidScope() {
  const [step, setStep] = useState("input"); // input | settings | results
  const [mode, setMode] = useState("text");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [items, setItems] = useState([]);
  const [overhead, setOverhead] = useState(15);
  const [profit, setProfit] = useState(10);
  const [filterCat, setFilterCat] = useState("All");
  const [companyName, setCompanyName] = useState("");
  const fileRef = useRef();

  const toBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("failed"));
    r.readAsDataURL(f);
  });

  const analyze = async () => {
    setError(""); setLoading(true);
    try {
      let messages;
      if (mode === "upload" && file) {
        const base64Data = await toBase64(file);
        messages = [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
          { type: "text", text: "Analyze this construction specification document." }
        ]}];
      } else {
        messages = [{ role: "user", content: text }];
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: ANALYZE_PROMPT, messages }),
      });
      const data = await res.json();
      const raw = data.content.map(i => i.text || "").join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAnalysis(parsed);
      setItems(parsed.lineItems.map(li => ({ ...li, unitCost: li.suggestedUnitCost })));
      setStep("results");
    } catch (e) {
      setError("Analysis failed. Try pasting project details as text instead.");
    } finally { setLoading(false); }
  };

  const updateItem = (id, field, val) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: parseFloat(val) || 0 } : i));
  };

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitCost), 0);
  const overheadAmt = subtotal * (overhead / 100);
  const profitAmt = (subtotal + overheadAmt) * (profit / 100);
  const total = subtotal + overheadAmt + profitAmt;

  const filtered = filterCat === "All" ? items : items.filter(i => i.category === filterCat);

  const printBid = () => window.print();

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", color: "#e2e8f0", fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0d1117; } ::-webkit-scrollbar-thumb { background: #f59e0b; }
        input, textarea, select { outline: none; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:none;} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2030", padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#060910", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#f59e0b", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏗</div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, lineHeight: 1 }}>BIDSCOPE <span style={{ color: "#f59e0b" }}>AI</span></div>
            <div style={{ fontSize: 9, color: "#334155", letterSpacing: 2 }}>CONSTRUCTION ESTIMATING PLATFORM</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }} className="no-print">
          {step === "results" && (
            <>
              <button onClick={() => { setStep("input"); setAnalysis(null); setItems([]); }} style={{ padding: "7px 16px", background: "transparent", border: "1px solid #1e2d40", color: "#64748b", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "inherit" }}>← NEW BID</button>
              <button onClick={printBid} style={{ padding: "7px 16px", background: "transparent", border: "1px solid #1e2d40", color: "#64748b", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "'Bebas Neue',sans-serif" }}>PRINT / EXPORT</button>
            </>
          )}
          <a href="https://buy.stripe.com/cNi00ccWr1QY1DQbxgdby00" target="_blank" rel="noopener noreferrer" style={{ padding: "7px 20px", background: "#f59e0b", border: "none", color: "#000", cursor: "pointer", fontSize: 12, letterSpacing: 1, fontFamily: "'Bebas Neue',sans-serif", textDecoration: "none", display: "flex", alignItems: "center" }}>
            SUBSCRIBE $99/MO
          </a>
        </div>
      </div>

      {/* INPUT STEP */}
      {step === "input" && (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px", animation: "fadeUp 0.4s ease" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 4, lineHeight: 1, marginBottom: 8 }}>
              ANALYZE SPECS.<br /><span style={{ color: "#f59e0b" }}>CALCULATE BID.</span>
            </div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>Upload a PDF spec sheet or paste project details — AI builds your estimate in seconds.</div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 10, letterSpacing: 2, color: "#475569", display: "block", marginBottom: 8 }}>COMPANY NAME (optional)</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Rodriguez General Contractors" style={{ width: "100%", background: "#0d1117", border: "1px solid #1e2d40", color: "#e2e8f0", padding: "10px 14px", fontSize: 13, fontFamily: "inherit" }} />
          </div>

          {/* Mode Toggle */}
          <div style={{ display: "flex", border: "1px solid #1e2d40", marginBottom: 20 }}>
            {["text", "upload"].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "10px", background: mode === m ? "#f59e0b" : "transparent", color: mode === m ? "#000" : "#475569", border: "none", cursor: "pointer", fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2, transition: "all 0.15s" }}>
                {m === "text" ? "✏ PASTE DETAILS" : "📄 UPLOAD PDF"}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder={"Describe the project scope...\n\nExample: 12,000 SF commercial tenant improvement, 2nd floor. Demo existing partitions, new steel stud framing and drywall, drop ceiling, polished concrete floors. Full MEP rough-in and trim-out. Owner-furnished storefront. Downtown Denver, union labor."}
              style={{ width: "100%", minHeight: 200, background: "#0d1117", border: "1px solid #1e2d40", color: "#cbd5e1", padding: 16, fontSize: 12, lineHeight: 1.8, resize: "vertical", fontFamily: "inherit", marginBottom: 20 }} />
          ) : (
            <div onClick={() => fileRef.current.click()} style={{ border: `2px dashed ${file ? "#f59e0b" : "#1e2d40"}`, padding: "48px 24px", textAlign: "center", cursor: "pointer", marginBottom: 20, background: file ? "rgba(245,158,11,0.03)" : "transparent", transition: "all 0.2s" }}>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
              <div style={{ fontSize: 28, marginBottom: 10 }}>{file ? "✅" : "📁"}</div>
              <div style={{ color: file ? "#f59e0b" : "#334155", fontSize: 12 }}>{file ? file.name : "Click to upload spec PDF"}</div>
            </div>
          )}

          {error && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid #450a0a", padding: 12, color: "#fca5a5", fontSize: 11, marginBottom: 16 }}>⚠ {error}</div>}

          <button onClick={analyze} disabled={loading || (mode === "text" ? !text.trim() : !file)}
            style={{ width: "100%", padding: 16, background: loading ? "#1e2d40" : "#f59e0b", color: loading ? "#475569" : "#000", border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 4, transition: "all 0.2s" }}>
            {loading ? <span style={{ animation: "pulse 1.2s infinite", display: "inline-block" }}>⚙ ANALYZING SPECS...</span> : "BUILD MY ESTIMATE →"}
          </button>
        </div>
      )}

      {/* RESULTS STEP */}
      {step === "results" && analysis && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", animation: "fadeUp 0.4s ease" }}>

          {/* Project Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, marginBottom: 28, background: "#0d1117", border: "1px solid #1e2d40", padding: "20px 24px" }}>
            <div>
              {companyName && <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 2, marginBottom: 4 }}>{companyName.toUpperCase()}</div>}
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, lineHeight: 1.1, marginBottom: 8 }}>{analysis.projectType}</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7, maxWidth: 600 }}>{analysis.projectSummary}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: 2, marginBottom: 4 }}>TOTAL BID</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, color: "#f59e0b", lineHeight: 1 }}>{fmt(total)}</div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>EST. DURATION: {analysis.estimatedDuration}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
            {/* Line Items */}
            <div>
              {/* Filter */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }} className="no-print">
                {CATEGORIES.filter(c => c === "All" || items.some(i => i.category === c)).map(c => (
                  <button key={c} onClick={() => setFilterCat(c)} style={{ padding: "4px 12px", background: filterCat === c ? (CAT_COLORS[c] || "#f59e0b") : "transparent", border: `1px solid ${filterCat === c ? (CAT_COLORS[c] || "#f59e0b") : "#1e2d40"}`, color: filterCat === c ? "#000" : "#475569", cursor: "pointer", fontSize: 10, letterSpacing: 1, fontFamily: "inherit", transition: "all 0.15s" }}>{c}</button>
                ))}
              </div>

              {/* Table Header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 100px 100px", gap: 8, padding: "8px 12px", background: "#0d1117", borderBottom: "1px solid #1e2d40", fontSize: 9, letterSpacing: 2, color: "#334155" }}>
                <div>DESCRIPTION</div><div>CATEGORY</div><div style={{ textAlign: "right" }}>QTY / UNIT</div><div style={{ textAlign: "right" }}>UNIT COST</div><div style={{ textAlign: "right" }}>TOTAL</div>
              </div>

              {filtered.map((item, idx) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 100px 100px", gap: 8, padding: "10px 12px", borderBottom: "1px solid #0f1923", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#cbd5e1" }}>{item.description}</div>
                    {item.notes && <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{item.notes}</div>}
                  </div>
                  <div>
                    <span style={{ fontSize: 10, padding: "2px 8px", background: `${CAT_COLORS[item.category] || "#64748b"}22`, color: CAT_COLORS[item.category] || "#64748b", borderLeft: `2px solid ${CAT_COLORS[item.category] || "#64748b"}` }}>{item.category}</span>
                  </div>
                  <div style={{ textAlign: "right" }} className="no-print">
                    <input type="number" value={item.quantity} onChange={e => updateItem(item.id, "quantity", e.target.value)}
                      style={{ width: 60, background: "#0d1117", border: "1px solid #1e2d40", color: "#e2e8f0", padding: "3px 6px", fontSize: 11, textAlign: "right", fontFamily: "inherit" }} />
                    <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{item.unit}</div>
                  </div>
                  <div style={{ textAlign: "right", display: "none" }} className="print-qty">
                    <div style={{ fontSize: 12 }}>{item.quantity} {item.unit}</div>
                  </div>
                  <div style={{ textAlign: "right" }} className="no-print">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      <span style={{ fontSize: 10, color: "#475569" }}>$</span>
                      <input type="number" value={item.unitCost} onChange={e => updateItem(item.id, "unitCost", e.target.value)}
                        style={{ width: 70, background: "#0d1117", border: "1px solid #1e2d40", color: "#e2e8f0", padding: "3px 6px", fontSize: 11, textAlign: "right", fontFamily: "inherit" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{fmt(item.quantity * item.unitCost)}</div>
                </div>
              ))}

              {filterCat !== "All" && (
                <div style={{ padding: "10px 12px", borderTop: "1px solid #1e2d40", textAlign: "right", fontSize: 12, color: "#64748b" }}>
                  Subtotal ({filterCat}): <span style={{ color: "#e2e8f0" }}>{fmt(filtered.reduce((s, i) => s + i.quantity * i.unitCost, 0))}</span>
                </div>
              )}
            </div>

            {/* Right Panel */}
            <div>
              {/* Cost Summary */}
              <div style={{ background: "#0d1117", border: "1px solid #1e2d40", padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#475569", marginBottom: 16 }}>COST SUMMARY</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>Direct Costs</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                <div style={{ borderTop: "1px solid #1e2d40", paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#475569", marginBottom: 12 }}>MARKUP SETTINGS</div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "#64748b" }}>Overhead</span>
                      <span style={{ color: "#f59e0b" }}>{overhead}% — {fmt(overheadAmt)}</span>
                    </div>
                    <input type="range" min={0} max={40} value={overhead} onChange={e => setOverhead(+e.target.value)}
                      style={{ width: "100%", accentColor: "#f59e0b" }} className="no-print" />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "#64748b" }}>Profit</span>
                      <span style={{ color: "#34d399" }}>{profit}% — {fmt(profitAmt)}</span>
                    </div>
                    <input type="range" min={0} max={30} value={profit} onChange={e => setProfit(+e.target.value)}
                      style={{ width: "100%", accentColor: "#34d399" }} className="no-print" />
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #1e2d40", paddingTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <span style={{ fontSize: 10, letterSpacing: 2, color: "#475569" }}>TOTAL BID</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#f59e0b" }}>{fmt(total)}</span>
                  </div>
                </div>
              </div>

              {/* Risks */}
              {analysis.risks?.length > 0 && (
                <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid #450a0a", padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#f87171", marginBottom: 10 }}>⚠ RISK FLAGS</div>
                  {analysis.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, paddingLeft: 10, borderLeft: "2px solid #7f1d1d", lineHeight: 1.5 }}>{r}</div>
                  ))}
                </div>
              )}

              {/* Exclusions */}
              {analysis.exclusions?.length > 0 && (
                <div style={{ background: "#0d1117", border: "1px solid #1e2d40", padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#fb923c", marginBottom: 10 }}>EXCLUSIONS / CLARIFICATIONS</div>
                  {analysis.exclusions.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#64748b", marginBottom: 5, paddingLeft: 10, borderLeft: "2px solid #1e2d40" }}>{e}</div>
                  ))}
                </div>
              )}

              {/* Bid Notes */}
              {analysis.bidNotes && (
                <div style={{ background: "#0d1117", border: "1px solid #1e2d40", borderLeft: "3px solid #f59e0b", padding: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#f59e0b", marginBottom: 8 }}>ESTIMATOR NOTES</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>{analysis.bidNotes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
