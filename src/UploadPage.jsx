
import { useState, useRef } from "react";
import { MONTHS_HE } from "./constants.js";
 
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
        // שמור ב-localStorage לשימוש ב-manager
        localStorage.setItem(
          `activeShifts_${today.getFullYear()}_${today.getMonth()}`,
          JSON.stringify(data.activeShiftsByDay)
        );
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
 
      <div style={{maxWidth:700,margin:"0 auto",padding:"28px 16px"}}>
        <div style={{background:"#1E293B",border:"1px solid #334155",borderRadius:18,padding:24,marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>העלה את קבצי האקסל של החודש</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
            <FileBox label="אולם" icon="🏛️" color="#6366F1" file={alon} setFile={setAlon}/>
            <FileBox label="כתיבה / עריקים" icon="✍️" color="#EF4444" file={erkim} setFile={setErkim}/>
            <FileBox label="שער" icon="🚪" color="#0EA5E9" file={shaar} setFile={setShaar}/>
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
 
        {error && (
          <div style={{background:"#450a0a",border:"1px solid #EF4444",borderRadius:12,padding:16,color:"#EF4444",marginBottom:16}}>
            ❌ שגיאה: {error}
          </div>
        )}
 
        {result && (
          <div style={{background:"#1E293B",border:"1px solid #10B981",borderRadius:18,padding:24}}>
            <div style={{fontWeight:800,fontSize:16,color:"#10B981",marginBottom:4}}>✅ עובד בהצלחה!</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:16}}>
              {result.totalDays} ימים פעילים · {result.totalShifts} תורנויות ורודות זוהו
            </div>
 
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
              {Object.entries(result.activeShiftsByDay)
                .sort(([a],[b])=>Number(a)-Number(b))
                .map(([day,shifts])=>(
                  <div key={day} style={{background:"#0F172A",borderRadius:8,padding:"4px 10px",fontSize:11}}>
                    <b style={{color:"#E2E8F0"}}>יום {day}</b>
                    <span style={{color:"#475569"}}> · {shifts.length} תורנויות</span>
                  </div>
                ))
              }
            </div>
 
            <div style={{background:"#0F172A",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#10B981",border:"1px solid #10B98133"}}>
              ✅ הנתונים נשמרו! עכשיו עבור ל-
              <a href="/manager" style={{color:"#3B82F6",fontWeight:700}}> /manager </a>
              ולחץ ⚡ צור תורנות
            </div>
          </div>
        )}
 
        <div style={{marginTop:20,background:"#0B111E",border:"1px dashed #1E3A5F",borderRadius:12,padding:16,fontSize:12,color:"#4B5563",lineHeight:1.8}}>
          <b style={{color:"#94A3B8"}}>איך זה עובד?</b><br/>
          המערכת קוראת את הצבע הוורוד מכל תא — תאים ורודים = תורנויות שלנו (צפון מטכל ועורף).<br/>
          הנתונים נשמרים ומשמשים לייצור התורנות האוטומטי.
        </div>
      </div>
    </div>
  );
}