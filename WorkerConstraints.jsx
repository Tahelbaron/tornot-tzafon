import { useState, useEffect } from "react";
import { api } from "./api.js";
import { WORKERS, SHIFTS, MONTHS_HE, senColor, senLabel } from "./constants.js";

const TYPE_OPTS = [
  { value:"unavailable", label:"🚫 לא זמין (חופשה/מחלה)" },
  { value:"wfh",         label:"🏠 עבודה מהבית" },
  { value:"shift_off",   label:"⛔ לא יכול לתורנות מסוימת" },
];

export default function WorkerConstraints() {
  const today = new Date();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;

  const [selectedWorker, setSelectedWorker] = useState("");
  const [constraints, setConstraints] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nc, setNc] = useState({ type:"unavailable", day:"", shiftId:"" });
  const [status, setStatus] = useState(null);
  const [view, setView] = useState("worker"); // worker | all

  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();

  useEffect(() => {
    loadConstraints();
  }, []);

  const loadConstraints = async () => {
    setLoading(true);
    const res = await api.getConstraints(monthKey);
    if (res.ok) setConstraints(res.constraints || {});
    setLoading(false);
  };

  const addConstraint = async () => {
    if (!selectedWorker) return;
    const w = WORKERS.find(x => x.id === Number(selectedWorker));
    if (!w) return;
    setSaving(true);
    const data = {
      workerName: w.name,
      month: monthKey,
      type: nc.type,
      day: nc.type !== "shift_off" ? Number(nc.day) : null,
      shiftLabel: nc.type === "shift_off" ? SHIFTS.find(s=>s.id===nc.shiftId)?.label : null,
    };
    const res = await api.saveConstraint(data);
    if (res.ok) {
      setStatus("✅ נשמר!");
      await loadConstraints();
      setNc({ type:"unavailable", day:"", shiftId:"" });
    } else {
      setStatus("❌ שגיאה: " + res.error);
    }
    setSaving(false);
    setTimeout(() => setStatus(null), 3000);
  };

  const removeConstraint = async (id) => {
    await api.deleteConstraint({ id });
    await loadConstraints();
  };

  const myConstraints = selectedWorker
    ? (constraints[WORKERS.find(w=>w.id===Number(selectedWorker))?.name] || [])
    : [];

  const totalAll = Object.values(constraints).reduce((a,b)=>a+b.length,0);

  return (
    <div style={{minHeight:"100vh",background:"#080F1A",fontFamily:"'Heebo',sans-serif",direction:"rtl",color:"#E2E8F0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",padding:"18px 24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#3B82F6,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📋</div>
          <div>
            <div style={{fontWeight:900,fontSize:18}}>אילוצי תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>
              {MONTHS_HE[today.getMonth()]} {today.getFullYear()} · צפון מטכל ועורף
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px"}}>

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

        {/* ENTER CONSTRAINT */}
        {view==="worker" && (
          <div>
            <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:20,marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:16,marginBottom:16}}>מי אתה?</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
                {WORKERS.map(w=>(
                  <button key={w.id} onClick={()=>setSelectedWorker(String(w.id))} style={{
                    padding:"10px 6px",borderRadius:10,border:"none",cursor:"pointer",
                    fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:13,
                    background:selectedWorker===String(w.id)?`${senColor(w.seniority)}33`:"#0F172A",
                    color:selectedWorker===String(w.id)?senColor(w.seniority):"#64748B",
                    border:`2px solid ${selectedWorker===String(w.id)?senColor(w.seniority):"transparent"}`,
                  }}>{w.name}</button>
                ))}
              </div>
            </div>

            {selectedWorker && (
              <>
                <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:20,marginBottom:16}}>
                  <div style={{fontWeight:800,fontSize:16,marginBottom:16}}>➕ הוסף אילוץ</div>

                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:12,color:"#64748B",marginBottom:6}}>סוג</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {TYPE_OPTS.map(opt=>(
                        <label key={opt.value} style={{display:"flex",alignItems:"center",gap:10,
                          background:nc.type===opt.value?"#1E3A5F":"#0F172A",
                          borderRadius:10,padding:"10px 14px",cursor:"pointer",
                          border:`1px solid ${nc.type===opt.value?"#3B82F6":"#1E293B"}`}}>
                          <input type="radio" name="type" value={opt.value}
                            checked={nc.type===opt.value}
                            onChange={()=>setNc(n=>({...n,type:opt.value}))}
                            style={{accentColor:"#3B82F6"}}/>
                          <span style={{fontSize:13,fontWeight:600}}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {nc.type !== "shift_off" ? (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:12,color:"#64748B",marginBottom:6}}>יום בחודש</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>(
                          <button key={d} onClick={()=>setNc(n=>({...n,day:String(d)}))} style={{
                            width:36,height:36,borderRadius:8,border:"none",cursor:"pointer",
                            fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:12,
                            background:nc.day===String(d)?"#3B82F6":"#0F172A",
                            color:nc.day===String(d)?"#fff":"#64748B",
                          }}>{d}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:12,color:"#64748B",marginBottom:6}}>תורנות</div>
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {SHIFTS.map(s=>(
                          <button key={s.id} onClick={()=>setNc(n=>({...n,shiftId:s.id}))} style={{
                            padding:"8px 14px",borderRadius:9,border:"none",cursor:"pointer",
                            textAlign:"right",fontFamily:"'Heebo',sans-serif",fontWeight:600,fontSize:13,
                            background:nc.shiftId===s.id?s.bg:"#0F172A",
                            color:nc.shiftId===s.id?s.dark:"#64748B",
                            border:`1px solid ${nc.shiftId===s.id?s.color+"60":"transparent"}`,
                          }}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={addConstraint} disabled={saving||(!nc.day&&nc.type!=="shift_off")||(!nc.shiftId&&nc.type==="shift_off")}
                    style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",cursor:"pointer",
                      fontFamily:"'Heebo',sans-serif",fontWeight:800,fontSize:14,
                      background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",
                      boxShadow:"0 4px 14px rgba(99,102,241,0.4)",
                      opacity:(saving||(!nc.day&&nc.type!=="shift_off")||(!nc.shiftId&&nc.type==="shift_off"))?0.5:1}}>
                    {saving?"⏳ שומר...":"✅ שמור אילוץ"}
                  </button>

                  {status && (
                    <div style={{marginTop:10,textAlign:"center",fontSize:14,fontWeight:700,
                      color:status.startsWith("✅")?"#10B981":"#EF4444"}}>{status}</div>
                  )}
                </div>

                {/* My constraints */}
                {myConstraints.length > 0 && (
                  <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:16,padding:20}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>האילוצים שלי החודש</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {myConstraints.map(c=>{
                        const icon=c.type==="unavailable"?"🚫":c.type==="wfh"?"🏠":"⛔";
                        const label=c.type==="shift_off"?c.shiftLabel:`יום ${c.day}`;
                        return (
                          <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            background:"#0F172A",borderRadius:8,padding:"9px 12px"}}>
                            <span style={{fontSize:13}}>{icon} {label}</span>
                            <button onClick={()=>removeConstraint(c.id)} style={{background:"none",border:"none",
                              cursor:"pointer",color:"#EF4444",fontSize:18,lineHeight:1}}>×</button>
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

        {/* ALL CONSTRAINTS (manager view) */}
        {view==="all" && (
          <div>
            {loading ? (
              <div style={{textAlign:"center",padding:40,color:"#64748B"}}>⏳ טוען...</div>
            ) : totalAll === 0 ? (
              <div style={{background:"#1E293B",borderRadius:16,padding:40,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{color:"#64748B"}}>אין אילוצים החודש</div>
              </div>
            ) : (
              WORKERS.map(w => {
                const wcs = constraints[w.name] || [];
                if (!wcs.length) return null;
                return (
                  <div key={w.id} style={{background:"#1E293B",border:"1px solid #334155",
                    borderRadius:14,padding:16,marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:senColor(w.seniority)}}/>
                      {w.name}
                      <span style={{fontSize:11,color:"#64748B"}}>{senLabel(w.seniority)}</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {wcs.map(c=>{
                        const icon=c.type==="unavailable"?"🚫":c.type==="wfh"?"🏠":"⛔";
                        const label=c.type==="shift_off"?c.shiftLabel:`יום ${c.day}`;
                        return (
                          <div key={c.id} style={{background:"#0F172A",borderRadius:7,
                            padding:"4px 10px",fontSize:12,display:"flex",alignItems:"center",gap:5}}>
                            {icon} {label}
                            <button onClick={()=>removeConstraint(c.id)} style={{background:"none",border:"none",
                              cursor:"pointer",color:"#475569",fontSize:14,lineHeight:1}}>×</button>
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
