import { useState, useEffect } from "react";
import { api } from "./api.js";
import { WORKERS, SHIFTS, MONTHS_HE, DAYS_HE } from "./constants.js";

export default function WorkerConstraints() {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const monthKey = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}`;

  const [selectedWorker, setSelectedWorker] = useState("");
  const [constraints, setConstraints]       = useState({});
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [status, setStatus]                 = useState(null);
  const [view, setView]                     = useState("worker");

  const [type, setType]             = useState("unavailable");
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [otherNote, setOtherNote]   = useState("");

  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();

  useEffect(() => { loadConstraints(); }, [monthKey]);

  const loadConstraints = async () => {
    setLoading(true);
    const res = await api.getConstraints(monthKey);
    if (res.ok) setConstraints(res.constraints || {});
    setLoading(false);
  };

  const toggleDay = (d) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  };

  const submitConstraint = async () => {
    if (!selectedWorker || selectedDays.size === 0) return;
    if (type === "other" && !otherNote.trim()) return;
    const w = WORKERS.find(x => x.id === Number(selectedWorker));
    if (!w) return;

    setSaving(true);
    for (const d of selectedDays) {
      await api.saveConstraint({
        workerName: w.name,
        month: monthKey,
        type,
        day: d,
        shiftLabel: type === "other" ? otherNote.trim() : null,
      });
    }
    setStatus("✅ נשמר!");
    setSelectedDays(new Set());
    setOtherNote("");
    await loadConstraints();
    setSaving(false);
    setTimeout(() => setStatus(null), 3000);
  };

  const removeConstraint = async (id) => {
    await api.deleteConstraint({ id });
    await loadConstraints();
  };

  const myConstraints = selectedWorker
    ? (constraints[WORKERS.find(w => w.id === Number(selectedWorker))?.name] || [])
        .filter(c => c.month === monthKey)
    : [];

  const totalAll = Object.values(constraints).reduce((a,b) => a+b.length, 0);
  const canSubmit = selectedWorker && selectedDays.size > 0 && (type !== "other" || otherNote.trim());

  const prevMonth = () => {
    if (viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}
    else setViewMonth(m=>m-1);
    setSelectedDays(new Set());
  };
  const nextMonth = () => {
    if (viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}
    else setViewMonth(m=>m+1);
    setSelectedDays(new Set());
  };

  return (
    <div style={{minHeight:"100vh",background:"#080F1A",fontFamily:"'Heebo',sans-serif",direction:"rtl",color:"#E2E8F0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",padding:"16px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📋</div>
          <div>
            <div style={{fontWeight:900,fontSize:17}}>אילוצי תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>צפון מטכל ועורף</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:560,margin:"0 auto",padding:"20px 16px"}}>

        {/* View toggle */}
        <div style={{display:"flex",gap:4,background:"#0F172A",borderRadius:10,padding:4,marginBottom:20,border:"1px solid #1E293B"}}>
          {[["worker","הזן אילוץ"],["all","כל האילוצים"]].map(([id,label])=>(
            <button key={id} onClick={()=>setView(id)} style={{
              flex:1,padding:"8px 0",borderRadius:7,border:"none",cursor:"pointer",
              fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:13,
              background:view===id?"linear-gradient(135deg,#3B82F6,#6366F1)":"transparent",
              color:view===id?"#fff":"#64748B",
            }}>{label}{id==="all"&&totalAll>0?` (${totalAll})`:""}</button>
          ))}
        </div>

        {view==="worker" && (
          <div>
            {/* בחירת עובד */}
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>מי אתה?</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:7}}>
                {WORKERS.map(w=>(
                  <button key={w.id} onClick={()=>setSelectedWorker(String(w.id))} style={{
                    padding:"9px 6px",borderRadius:10,border:`2px solid ${selectedWorker===String(w.id)?"#3B82F6":"transparent"}`,
                    cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:13,
                    background:selectedWorker===String(w.id)?"#3B82F6":"#0F172A",
                    color:selectedWorker===String(w.id)?"#fff":"#94A3B8",
                  }}>{w.name}</button>
                ))}
              </div>
            </div>

            {selectedWorker && (
              <>
                {/* סוג אילוץ */}
                <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
                  <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>סוג האילוץ</div>
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {[
                      ["unavailable","🚫","לא זמין (חופשה / מחלה)"],
                      ["wfh","🏠","עבודה מהבית"],
                      ["other","✏️","אחר — פרט"],
                    ].map(([val,icon,label])=>(
                      <label key={val} style={{
                        display:"flex",alignItems:"center",gap:10,
                        background:type===val?"#1E3A5F":"#0F172A",
                        borderRadius:10,padding:"10px 14px",cursor:"pointer",
                        border:`1px solid ${type===val?"#3B82F6":"#1E293B"}`,
                      }}>
                        <input type="radio" name="type" value={val}
                          checked={type===val} onChange={()=>{setType(val);setSelectedDays(new Set());}}
                          style={{accentColor:"#3B82F6"}}/>
                        <span style={{fontSize:14}}>{icon}</span>
                        <span style={{fontSize:13,fontWeight:600}}>{label}</span>
                      </label>
                    ))}
                  </div>

                  {/* שדה טקסט לאחר */}
                  {type==="other" && (
                    <textarea value={otherNote} onChange={e=>setOtherNote(e.target.value)}
                      placeholder="תאר את האילוץ שלך..."
                      rows={2} style={{
                        marginTop:10,width:"100%",boxSizing:"border-box",
                        padding:"10px 12px",borderRadius:10,border:"1px solid #334155",
                        background:"#0F172A",color:"#E2E8F0",
                        fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none",resize:"vertical",
                      }}/>
                  )}
                </div>

                {/* לוח שנה */}
                <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <button onClick={prevMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"4px 10px",fontSize:16}}>‹</button>
                    <div style={{fontWeight:800,fontSize:15}}>{MONTHS_HE[viewMonth]} {viewYear}</div>
                    <button onClick={nextMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"4px 10px",fontSize:16}}>›</button>
                  </div>

                  {/* כותרות ימי שבוע — ללא שישי */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",marginBottom:4}}>
                    {["א׳","ב׳","ג׳","ד׳","ה׳","ש׳"].map(d=>(
                      <div key={d} style={{textAlign:"center",fontSize:10,color:"#475569",fontWeight:700,padding:"2px 0"}}>{d}</div>
                    ))}
                  </div>

                  {/* ימים — בלי שישי */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3}}>
                    {(() => {
                      const cells = [];
                      // מחשב offset תוך הסרת שישי
                      // firstDay: 0=ראשון, 5=שישי, 6=שבת
                      // בגריד ללא שישי: ראשון=0, שני=1, שלישי=2, רביעי=3, חמישי=4, שבת=5
                      const adjustedFirstDay = firstDay <= 4 ? firstDay : firstDay === 6 ? 5 : null;
                      
                      // תאי ריקים
                      if (adjustedFirstDay !== null) {
                        for (let i=0; i<adjustedFirstDay; i++) {
                          cells.push(<div key={`e${i}`}/>);
                        }
                      }

                      for (let d=1; d<=daysInMonth; d++) {
                        const dow = new Date(viewYear,viewMonth,d).getDay();
                        if (dow === 5) continue; // דלג על שישי
                        const isSelected = selectedDays.has(d);
                        const isSat = dow === 6;
                        cells.push(
                          <button key={d} onClick={()=>toggleDay(d)} style={{
                            aspectRatio:"1",borderRadius:8,border:"none",cursor:"pointer",
                            fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:11,
                            background:isSelected?"#3B82F6":isSat?"#1E293B":"#0F172A",
                            color:isSelected?"#fff":isSat?"#6D28D9":"#94A3B8",
                            display:"flex",flexDirection:"column",alignItems:"center",
                            justifyContent:"center",gap:1,padding:"3px 1px",
                          }}>
                            <span>{d}</span>
                            <span style={{fontSize:8,opacity:0.7}}>{DAYS_HE[dow]}</span>
                          </button>
                        );
                      }
                      return cells;
                    })()}
                  </div>

                  {selectedDays.size > 0 && (
                    <div style={{marginTop:10,fontSize:12,color:"#3B82F6",fontWeight:600}}>
                      נבחרו {selectedDays.size} ימים: {[...selectedDays].sort((a,b)=>a-b).join(", ")}
                    </div>
                  )}
                </div>

                {/* כפתור שליחה */}
                <button onClick={submitConstraint} disabled={saving||!canSubmit} style={{
                  width:"100%",padding:"13px 0",borderRadius:11,border:"none",cursor:"pointer",
                  fontFamily:"'Heebo',sans-serif",fontWeight:800,fontSize:15,
                  background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",
                  boxShadow:"0 4px 14px rgba(99,102,241,0.4)",
                  opacity:(saving||!canSubmit)?0.5:1,marginBottom:14,
                }}>
                  {saving?"⏳ שומר...":"✅ שלח אילוץ"}
                </button>

                {status && (
                  <div style={{textAlign:"center",fontSize:14,fontWeight:700,color:"#10B981",marginBottom:10}}>{status}</div>
                )}

                {/* האילוצים שלי */}
                {myConstraints.length > 0 && (
                  <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>האילוצים שלי — {MONTHS_HE[viewMonth]}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {myConstraints.sort((a,b)=>(a.day||0)-(b.day||0)).map(c=>{
                        const icon = c.type==="unavailable"?"🚫":c.type==="wfh"?"🏠":"✏️";
                        const dow = new Date(viewYear,viewMonth,c.day).getDay();
                        const dayStr = `${DAYS_HE[dow]} ${c.day}.${viewMonth+1}`;
                        const label = c.type==="other" ? `${dayStr} — ${c.shiftLabel}` : dayStr;
                        return (
                          <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0F172A",borderRadius:8,padding:"8px 12px"}}>
                            <span style={{fontSize:13}}>{icon} {label}</span>
                            <button onClick={()=>removeConstraint(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#EF4444",fontSize:18,lineHeight:1}}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ALL CONSTRAINTS */}
        {view==="all" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <button onClick={prevMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"5px 12px",fontSize:16}}>‹</button>
              <div style={{fontWeight:800,fontSize:15}}>{MONTHS_HE[viewMonth]} {viewYear}</div>
              <button onClick={nextMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"5px 12px",fontSize:16}}>›</button>
            </div>

            {loading ? (
              <div style={{textAlign:"center",padding:40,color:"#64748B"}}>⏳ טוען...</div>
            ) : totalAll===0 ? (
              <div style={{background:"#1E293B",borderRadius:16,padding:40,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{color:"#64748B"}}>אין אילוצים ב-{MONTHS_HE[viewMonth]}</div>
              </div>
            ) : (
              WORKERS.map(w => {
                const wcs = (constraints[w.name]||[]).filter(c=>c.month===monthKey);
                if (!wcs.length) return null;
                return (
                  <div key={w.id} style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:16,marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>{w.name}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {wcs.sort((a,b)=>(a.day||0)-(b.day||0)).map(c=>{
                        const icon = c.type==="unavailable"?"🚫":c.type==="wfh"?"🏠":"✏️";
                        const dow = new Date(viewYear,viewMonth,c.day).getDay();
                        const dayStr = `${DAYS_HE[dow]} ${c.day}.${viewMonth+1}`;
                        const label = c.type==="other" ? `${dayStr} — ${c.shiftLabel}` : dayStr;
                        return (
                          <div key={c.id} style={{background:"#0F172A",borderRadius:7,padding:"4px 10px",fontSize:12,display:"flex",alignItems:"center",gap:5}}>
                            {icon} {label}
                            <button onClick={()=>removeConstraint(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#475569",fontSize:14,lineHeight:1}}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
