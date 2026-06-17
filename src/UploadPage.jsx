import { useState, useRef } from "react";
import { MONTHS_HE, SHIFTS, SHEET_COLOR } from "./constants.js";

export default function UploadPage() {
  const [alon,  setAlon]  = useState(null);
  const [erkim, setErkim] = useState(null);
  const [shaar, setShaar] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const today = new Date();
  const monthLabel = `${MONTHS_HE[today.getMonth()]} ${today.getFullYear()}`;

  const upload = async () => {
    if (!alon && !erkim && !shaar) return;
    setLoading(true); setError(null); setResult(null);
    const fd = new FormData();
    if (alon)  fd.append("alon",  alon,  alon.name);
    if (erkim) fd.append("erkim", erkim, erkim.name);
    if (shaar) fd.append("shaar", shaar, shaar.name);
    try {
      const res = await fetch("/api/upload", { method:"POST", body:fd });
      const data = await res.json();
      if (data.ok) {
        setResult(data);
        const savedKey = `activeShifts_${today.getFullYear()}_${today.getMonth()}`;
        localStorage.setItem(savedKey, JSON.stringify(data.activeShiftsByDay));
      } else {
        setError(data.error || "שגיאה לא ידועה");
      }
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const FileBox = ({label, icon, color, file, setFile}) => {
    const ref = useRef();
    return (
      <div style={{flex:1,minWidth:150,border:`1px solid ${file?"#10B981":"#334155"}`,borderRadius:12,padding:14,background:file?"#10B98111":"#0F172A"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:16}}>{icon}</span>
          <span style={{fontWeight:700,fontSize:13,color}}>{label}</span>
        </div>
        {file ? (
          <div>
            <div style={{fontSize:11,color:"#10B981",fontWeight:600,marginBottom:3}}>✅ {file.name}</div>
            <button onClick={()=>setFile(null)} style={{fontSize:10,color:"#EF4444",background:"none",border:"none",cursor:"pointer",padding:0}}>הסר ×</button>
          </div>
        ) : (
          <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:8,cursor:"pointer",background:color+"22",color,fontFamily:"'Heebo',sans-serif",fontWeight:700,fontSize:11}}>
            📤 בחר קובץ
            <input ref={ref} type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)} style={{display:"none"}}/>
          </label>
        )}
      </div>
    );
  };

  // חישוב סטטיסטיקות מהתוצאה
  const getStats = () => {
    if (!result) return null;
    const bySheet = { אולם: {days:new Set(), shifts:[]}, כתיבה: {days:new Set(), shifts:[]}, שער: {days:new Set(), shifts:[]} };
    const shiftCounts = {};

    for (const [day, shiftIds] of Object.entries(result.activeShiftsByDay)) {
      for (const sid of shiftIds) {
        const shift = SHIFTS.find(s => s.id === sid);
        if (!shift) continue;
        bySheet[shift.sheet]?.days.add(Number(day));
        bySheet[shift.sheet]?.shifts.push({sid, day: Number(day), shift});
        shiftCounts[sid] = (shiftCounts[sid] || 0) + 1;
      }
    }
    return { bySheet, shiftCounts };
  };

  const stats = getStats();

  return (
    <div style={{minHeight:"100vh",background:"#080F1A",fontFamily:"'Heebo',sans-serif",direction:"rtl",color:"#E2E8F0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>

      <div style={{background:"linear-gradient(180deg,#111827,#0D1526)",borderBottom:"1px solid #1F2937",padding:"16px 24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#7C3AED,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>📂</div>
          <div>
            <div style={{fontWeight:900,fontSize:18}}>העלאת קבצי תורנויות</div>
            <div style={{fontSize:11,color:"#4B5563"}}>{monthLabel} · צפון מטכל ועורף</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:800,margin:"0 auto",padding:"28px 16px"}}>
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:18,padding:24,marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>העלה את קבצי האקסל של החודש</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
            <FileBox label="אולם" icon="🏛️" color={SHEET_COLOR["אולם"]} file={alon} setFile={setAlon}/>
            <FileBox label="כתיבה / עריקים" icon="✍️" color={SHEET_COLOR["כתיבה"]} file={erkim} setFile={setErkim}/>
            <FileBox label="שער" icon="🚪" color={SHEET_COLOR["שער"]} file={shaar} setFile={setShaar}/>
          </div>
          <button onClick={upload} disabled={loading||(!alon&&!erkim&&!shaar)} style={{
            width:"100%",padding:"13px 0",borderRadius:11,border:"none",cursor:"pointer",
            fontFamily:"'Heebo',sans-serif",fontWeight:800,fontSize:15,
            background:"linear-gradient(135deg,#7C3AED,#6366F1)",color:"#fff",
            boxShadow:"0 4px 14px rgba(124,58,237,0.4)",
            opacity:(loading||(!alon&&!erkim&&!shaar))?0.5:1,
          }}>
            {loading?"⏳ מעבד...":"⚡ עבד קבצים"}
          </button>
        </div>

        {error&&(
          <div style={{background:"#450a0a",border:"1px solid #EF4444",borderRadius:12,padding:16,color:"#EF4444",marginBottom:16}}>
            ❌ שגיאה: {error}
          </div>
        )}

        {result&&stats&&(
          <div>
            {/* סיכום כללי */}
            <div style={{background:"#1E293B",border:"1px solid #10B981",borderRadius:18,padding:24,marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:16,color:"#10B981",marginBottom:4}}>✅ עובד בהצלחה!</div>
              <div style={{fontSize:13,color:"#64748B",marginBottom:16}}>
                {result.totalDays} ימים פעילים · {result.totalShifts} תורנויות ורודות זוהו
              </div>

              {/* פירוט לפי גליון */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:20}}>
                {["אולם","כתיבה","שער"].map(sh=>{
                  const s=stats.bySheet[sh];
                  if(!s||s.shifts.length===0)return null;
                  return(
                    <div key={sh} style={{background:"#0F172A",borderRadius:12,padding:14,border:`1px solid ${SHEET_COLOR[sh]}33`}}>
                      <div style={{fontWeight:700,fontSize:14,color:SHEET_COLOR[sh],marginBottom:8}}>
                        {sh==="אולם"?"🏛️":sh==="כתיבה"?"✍️":"🚪"} {sh}
                      </div>
                      <div style={{fontSize:12,color:"#64748B",marginBottom:4}}>{s.days.size} ימים · {s.shifts.length} תורנויות</div>
                    </div>
                  );
                })}
              </div>

              {/* פירוט לפי תורנות */}
              <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>פירוט לפי סוג תורנות:</div>
              {["אולם","כתיבה","שער"].map(sh=>{
                const shShifts=SHIFTS.filter(s=>s.sheet===sh&&stats.shiftCounts[s.id]);
                if(!shShifts.length)return null;
                return(
                  <div key={sh} style={{marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:700,color:SHEET_COLOR[sh],marginBottom:8}}>
                      {sh==="אולם"?"🏛️":sh==="כתיבה"?"✍️":"🚪"} {sh}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {shShifts.map(shift=>(
                        <div key={shift.id} style={{background:shift.bg,borderRadius:8,padding:"6px 12px",display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:12,fontWeight:700,color:shift.dark}}>{shift.label}</span>
                          <span style={{fontSize:11,color:shift.color,fontWeight:800,background:"#00000022",borderRadius:4,padding:"1px 6px"}}>
                            ×{stats.shiftCounts[shift.id]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* פירוט לפי יום */}
              <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>פירוט לפי יום:</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {Object.entries(result.activeShiftsByDay)
                  .sort(([a],[b])=>Number(a)-Number(b))
                  .map(([day,shiftIds])=>{
                    const bySheet={אולם:0,כתיבה:0,שער:0};
                    for(const sid of shiftIds){
                      const s=SHIFTS.find(x=>x.id===sid);
                      if(s)bySheet[s.sheet]++;
                    }
                    return(
                      <div key={day} style={{background:"#0F172A",borderRadius:10,padding:"8px 12px",fontSize:11,minWidth:120}}>
                        <div style={{fontWeight:800,color:"#E2E8F0",marginBottom:4}}>יום {day} — {shiftIds.length} תורנויות</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {bySheet["אולם"]>0&&<span style={{color:SHEET_COLOR["אולם"]}}>🏛️{bySheet["אולם"]}</span>}
                          {bySheet["כתיבה"]>0&&<span style={{color:SHEET_COLOR["כתיבה"]}}>✍️{bySheet["כתיבה"]}</span>}
                          {bySheet["שער"]>0&&<span style={{color:SHEET_COLOR["שער"]}}>🚪{bySheet["שער"]}</span>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div style={{background:"#0F172A",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#10B981",border:"1px solid #10B98133",textAlign:"center"}}>
              ✅ הנתונים נשמרו! עכשיו עבור ל-
              <a href="/manager" style={{color:"#3B82F6",fontWeight:700}}> /manager </a>
              ולחץ ⚡ צור תורנות
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
