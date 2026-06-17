import { useState, useEffect } from "react";
import { api } from "./api.js";
import { WORKERS, MONTHS_HE, DAYS_HE } from "./constants.js";

// שנה את התאריך כל חודש
const DEADLINE = new Date("2026-07-20T23:59:00");

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
  const [submitted, setSubmitted]           = useState(false);

  const [type, setType]                 = useState("military");
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [dayNotes, setDayNotes]         = useState({});

  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();

  const isPastDeadline   = today > DEADLINE;
  const daysUntilDeadline = Math.ceil((DEADLINE - today) / (1000*60*60*24));

  useEffect(() => {
    loadConstraints();
    if (selectedWorker) {
      const key = `submitted_${selectedWorker}_${monthKey}`;
      setSubmitted(!!localStorage.getItem(key));
    }
  }, [monthKey, selectedWorker]);

  const loadConstraints = async () => {
    setLoading(true);
    const res = await api.getConstraints(monthKey);
    if (res.ok) setConstraints(res.constraints || {});
    setLoading(false);
  };

  const toggleDay = (d) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) {
        next.delete(d);
        setDayNotes(n => { const nn = {...n}; delete nn[d]; return nn; });
      } else {
        next.add(d);
      }
      return next;
    });
  };

  const submitConstraint = async () => {
    if (!selectedWorker || selectedDays.size === 0) return;
    const w = WORKERS.find(x => x.id === Number(selectedWorker));
    if (!w) return;
    setSaving(true);
    for (const d of selectedDays) {
      const note = dayNotes[d] || "";
      await api.saveConstraint({
        workerName: w.name,
        month: monthKey,
        type,
        day: d,
        shiftLabel: note || null,
      });
    }
    setStatus("✅ נשמר!");
    setSelectedDays(new Set());
    setDayNotes({});
    await loadConstraints();
    setSaving(false);
    setTimeout(() => setStatus(null), 3000);
  };

  const removeConstraint = async (id) => {
    await api.deleteConstraint({ id });
    await loadConstraints();
  };

  const handleFinalSubmit = () => {
    const key = `submitted_${selectedWorker}_${monthKey}`;
    localStorage.setItem(key, "true");
    setSubmitted(true);
    setStatus("✅ הגשתך נקלטה!");
    setTimeout(() => setStatus(null), 4000);
  };

  const myName = selectedWorker ? WORKERS.find(w => w.id === Number(selectedWorker))?.name : null;
  const myConstraints = myName
    ? (constraints[myName] || []).filter(c => c.month === monthKey)
    : [];

  const totalAll = Object.values(constraints).reduce((a,b) => a+b.length, 0);
  const canSubmit = !isPastDeadline && !submitted && selectedWorker && selectedDays.size > 0;

  const prevMonth = () => {
    if (viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}
    else setViewMonth(m=>m-1);
    setSelectedDays(new Set()); setDayNotes({});
  };
  const nextMonth = () => {
    if (viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}
    else setViewMonth(m=>m+1);
    setSelectedDays(new Set()); setDayNotes({});
  };

  return (
    <div style={{minHeight:"100vh",background:"#080F1A",fontFamily:"'Heebo',sans-serif",direction:"rtl",color:"#E2E8F0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>

      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",padding:"16px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📋</div>
          <div>
            <div style={{fontWeight:900,fontSize:17}}>אילוצי תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>צפון מטכל ועורף</div>
          </div>
        </div>
        <div style={{
          borderRadius:10,padding:"10px 14px",
          background:isPastDeadline?"#450a0a":daysUntilDeadline<=3?"#78350f22":"#14532d22",
          border:`1px solid ${isPastDeadline?"#EF4444":daysUntilDeadline<=3?"#F59E0B":"#10B981"}`,
          fontSize:13,fontWeight:700,
          color:isPastDeadline?"#EF4444":daysUntilDeadline<=3?"#F59E0B":"#10B981",
        }}>
          {isPastDeadline
            ? `🔒 הגשת האילוצים נסגרה ב-${DEADLINE.toLocaleDateString("he-IL")}`
            : daysUntilDeadline<=3
            ? `⚠️ נותרו ${daysUntilDeadline} ימים — דדליין: ${DEADLINE.toLocaleDateString("he-IL")}`
            : `✅ ניתן להגיש עד ${DEADLINE.toLocaleDateString("he-IL")} — נותרו ${daysUntilDeadline} ימים`}
        </div>
      </div>

      <div style={{maxWidth:560,margin:"0 auto",padding:"20px 16px"}}>
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
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>מי אתה?</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:7}}>
                {WORKERS.map(w=>(
                  <button key={w.id} onClick={()=>setSelectedWorker(String(w.id))} style={{
                    padding:"9px 6px",borderRadius:10,
                    border:`2px solid ${selectedWorker===String(w.id)?"#3B82F6":"transparent"}`,
                    cursor:"pointer",fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:13,
                    background:selectedWorker===String(w.id)?"#3B82F6":"#0F172A",
                    color:selectedWorker===String(w.id)?"#fff":"#94A3B8",
                  }}>{w.name}</button>
                ))}
              </div>
            </div>

            {selectedWorker && (
              <>
                {submitted && !isPastDeadline && (
                  <div style={{background:"#10B98122",border:"1px solid #10B981",borderRadius:12,padding:14,marginBottom:14,textAlign:"center"}}>
                    <div style={{fontSize:20,marginBottom:4}}>✅</div>
                    <div style={{fontWeight:700,color:"#10B981",fontSize:14}}>הגשת את האילוצים שלך</div>
                    <button onClick={()=>{localStorage.removeItem(`submitted_${selectedWorker}_${monthKey}`);setSubmitted(false);}}
                      style={{marginTop:8,fontSize:11,color:"#64748B",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>
                      ערוך אילוצים
                    </button>
                  </div>
                )}

                {isPastDeadline ? (
                  <div style={{background:"#450a0a",border:"1px solid #EF4444",borderRadius:12,padding:20,textAlign:"center",marginBottom:14}}>
                    <div style={{fontSize:24,marginBottom:8}}>🔒</div>
                    <div style={{fontWeight:700,color:"#EF4444"}}>הגשת האילוצים נסגרה</div>
                  </div>
                ) : !submitted && (
                  <>
                    <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
                      <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>סוג האילוץ</div>
                      <div style={{display:"flex",flexDirection:"column",gap:7}}>
                        {[["military","🎖️","אילוץ צבאי"],["personal","👤","אילוץ אישי"]].map(([val,icon,label])=>(
                          <label key={val} style={{
                            display:"flex",alignItems:"center",gap:10,
                            background:type===val?"#1E3A5F":"#0F172A",
                            borderRadius:10,padding:"12px 14px",cursor:"pointer",
                            border:`1px solid ${type===val?"#3B82F6":"#1E293B"}`,
                          }}>
                            <input type="radio" name="type" value={val} checked={type===val}
                              onChange={()=>{setType(val);setSelectedDays(new Set());setDayNotes({});}}
                              style={{accentColor:"#3B82F6"}}/>
                            <span style={{fontSize:16}}>{icon}</span>
                            <span style={{fontSize:14,fontWeight:600}}>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <button onClick={prevMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"4px 10px",fontSize:16}}>‹</button>
                        <div style={{fontWeight:800,fontSize:15}}>{MONTHS_HE[viewMonth]} {viewYear}</div>
                        <button onClick={nextMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"4px 10px",fontSize:16}}>›</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",marginBottom:4}}>
                        {["א׳","ב׳","ג׳","ד׳","ה׳","ש׳"].map(d=>(
                          <div key={d} style={{textAlign:"center",fontSize:10,color:"#475569",fontWeight:700,padding:"2px 0"}}>{d}</div>
                        ))}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3}}>
                        {(()=>{
                          const cells=[];
                          const adj=firstDay<=4?firstDay:firstDay===6?5:null;
                          if(adj!==null) for(let i=0;i<adj;i++) cells.push(<div key={`e${i}`}/>);
                          for(let d=1;d<=daysInMonth;d++){
                            const dow=new Date(viewYear,viewMonth,d).getDay();
                            if(dow===5) continue;
                            const isSel=selectedDays.has(d);
                            const isSat=dow===6;
                            cells.push(
                              <button key={d} onClick={()=>toggleDay(d)} style={{
                                aspectRatio:"1",borderRadius:8,border:"none",cursor:"pointer",
                                fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:11,
                                background:isSel?"#3B82F6":isSat?"#1E293B":"#0F172A",
                                color:isSel?"#fff":isSat?"#6D28D9":"#94A3B8",
                                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,padding:"3px 1px",
                              }}>
                                <span>{d}</span>
                                <span style={{fontSize:8,opacity:0.7}}>{DAYS_HE[dow]}</span>
                              </button>
                            );
                          }
                          return cells;
                        })()}
                      </div>
                      {selectedDays.size>0&&(
                        <div style={{fontSize:12,color:"#3B82F6",fontWeight:600,marginTop:8}}>
                          נבחרו {selectedDays.size} ימים
                        </div>
                      )}
                    </div>

                    {selectedDays.size>0&&(
                      <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
                        <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>פירוט (אופציונלי)</div>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {[...selectedDays].sort((a,b)=>a-b).map(d=>{
                            const dow=new Date(viewYear,viewMonth,d).getDay();
                            return(
                              <div key={d}>
                                <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:600}}>
                                  {DAYS_HE[dow]} {d}.{viewMonth+1}
                                </div>
                                <input value={dayNotes[d]||""} onChange={e=>setDayNotes(n=>({...n,[d]:e.target.value}))}
                                  placeholder={type==="military"?"פרט את האילוץ הצבאי...":"הערה (אופציונלי)..."}
                                  style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",borderRadius:9,
                                    border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",
                                    fontFamily:"'Heebo',sans-serif",fontSize:13,outline:"none"}}/>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button onClick={submitConstraint} disabled={saving||!canSubmit} style={{
                      width:"100%",padding:"13px 0",borderRadius:11,border:"none",cursor:"pointer",
                      fontFamily:"'Heebo',sans-serif",fontWeight:800,fontSize:15,
                      background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",
                      boxShadow:"0 4px 14px rgba(99,102,241,0.4)",
                      opacity:(saving||!canSubmit)?0.5:1,marginBottom:10,
                    }}>
                      {saving?"⏳ שומר...":"✅ הוסף אילוץ"}
                    </button>
                  </>
                )}

                {status&&<div style={{textAlign:"center",fontSize:14,fontWeight:700,color:"#10B981",marginBottom:10}}>{status}</div>}

                {myConstraints.length>0&&(
                  <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:18,marginBottom:14}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>האילוצים שלי — {MONTHS_HE[viewMonth]}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {myConstraints.sort((a,b)=>(a.day||0)-(b.day||0)).map(c=>{
                        const icon=c.type==="military"?"🎖️":"👤";
                        const dow=new Date(viewYear,viewMonth,c.day).getDay();
                        const dayStr=`${DAYS_HE[dow]} ${c.day}.${viewMonth+1}`;
                        const label=c.shiftLabel?`${dayStr} — ${c.shiftLabel}`:dayStr;
                        return(
                          <div key={c.id} style={{background:"#0F172A",borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:13}}>{icon} {label}</span>
                            {!isPastDeadline&&!submitted&&(
                              <button onClick={()=>removeConstraint(c.id)} style={{
                                background:"none",border:"1px solid #334155",borderRadius:6,
                                cursor:"pointer",color:"#EF4444",fontSize:12,padding:"2px 8px",
                                fontFamily:"'Heebo',sans-serif",fontWeight:600,
                              }}>הסר</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isPastDeadline&&!submitted&&myConstraints.length>0&&(
                  <button onClick={handleFinalSubmit} style={{
                    width:"100%",padding:"13px 0",borderRadius:11,border:"none",cursor:"pointer",
                    fontFamily:"'Heebo',sans-serif",fontWeight:800,fontSize:15,
                    background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",
                    boxShadow:"0 4px 14px rgba(16,185,129,0.4)",
                  }}>
                    📨 שלח סופית
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {view==="all"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <button onClick={prevMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"5px 12px",fontSize:16}}>‹</button>
              <div style={{fontWeight:800,fontSize:15}}>{MONTHS_HE[viewMonth]} {viewYear}</div>
              <button onClick={nextMonth} style={{background:"none",border:"1px solid #334155",borderRadius:8,color:"#E2E8F0",cursor:"pointer",padding:"5px 12px",fontSize:16}}>›</button>
            </div>
            {loading?(
              <div style={{textAlign:"center",padding:40,color:"#64748B"}}>⏳ טוען...</div>
            ):totalAll===0?(
              <div style={{background:"#1E293B",borderRadius:16,padding:40,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{color:"#64748B"}}>אין אילוצים ב-{MONTHS_HE[viewMonth]}</div>
              </div>
            ):(
              WORKERS.map(w=>{
                const wcs=(constraints[w.name]||[]).filter(c=>c.month===monthKey);
                if(!wcs.length)return null;
                return(
                  <div key={w.id} style={{background:"#1E293B",border:"1px solid #334155",borderRadius:14,padding:16,marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>{w.name}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {wcs.sort((a,b)=>(a.day||0)-(b.day||0)).map(c=>{
                        const icon=c.type==="military"?"🎖️":"👤";
                        const dow=new Date(viewYear,viewMonth,c.day).getDay();
                        const dayStr=`${DAYS_HE[dow]} ${c.day}.${viewMonth+1}`;
                        const label=c.shiftLabel?`${dayStr} — ${c.shiftLabel}`:dayStr;
                        return(
                          <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#0F172A",borderRadius:8,padding:"8px 12px"}}>
                            <span style={{fontSize:13}}>{icon} {label}</span>
                            <button onClick={()=>removeConstraint(c.id)} style={{
                              background:"none",border:"1px solid #334155",borderRadius:6,
                              cursor:"pointer",color:"#EF4444",fontSize:12,padding:"2px 8px",
                              fontFamily:"'Heebo',sans-serif",fontWeight:600,
                            }}>הסר</button>
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
