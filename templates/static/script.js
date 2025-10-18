const qEl = document.getElementById("query");
const btn = document.getElementById("scanBtn");
const help = document.getElementById("inputHelp");
const result = document.getElementById("result");
const errorEl = document.getElementById("error");

const appTitle = document.getElementById("appTitle");
const threatBadge = document.getElementById("threatBadge");
const risksList = document.getElementById("risksList");
const conversation = document.getElementById("conversation");
const copyScript = document.getElementById("copyScript");
const checklist = document.getElementById("checklist");
const notesWrap = document.getElementById("notesWrap");
const notes = document.getElementById("notes");
const copySummary = document.getElementById("copySummary");
const downloadPdf = document.getElementById("downloadPdf");

function setLoading(loading){ btn.disabled=loading; btn.textContent=loading?"Scanning…":"Scan now"; }

qEl.addEventListener("input", () => {
  if (qEl.value.trim().length === 0){ btn.disabled=true; help.classList.remove("hidden"); }
  else { btn.disabled=false; help.classList.add("hidden"); }
});
btn.disabled = true; help.classList.remove("hidden");

btn.addEventListener("click", async () => {
  const query = qEl.value.trim(); if (!query) return;
  setLoading(true); errorEl.classList.add("hidden"); result.classList.add("hidden");
  try{
    const res = await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query})});
    const data = await res.json();
    if(!res.ok || data.error) throw new Error(data.message || "I couldn’t fetch a summary just now. Please try again.");
    renderResult(data);
  }catch(e){
    errorEl.textContent = e.message || "I couldn’t fetch a summary just now. Please try again.";
    errorEl.classList.remove("hidden");
  }finally{ setLoading(false); }
});

function renderResult(payload){
  const { app, result: r } = payload;
  appTitle.textContent = app;
  threatBadge.textContent = `Threat Score: ${r.threat_score}/10`;

  risksList.innerHTML = "";
  (r.risks||[]).forEach(t=>{ const li=document.createElement("li"); li.textContent=t; risksList.appendChild(li); });

  conversation.textContent = r.conversation_script || "";

  checklist.innerHTML = "";
  (r.action_checklist||[]).forEach(t=>{
    const li=document.createElement("li");
    const id="chk_"+Math.random().toString(36).slice(2,9);
    li.innerHTML=`<label class="inline-flex items-start gap-2"><input id="${id}" type="checkbox" class="mt-1"><span>${t}</span></label>`;
    checklist.appendChild(li);
  });

  if (r.notes){ notes.textContent=r.notes; notesWrap.classList.remove("hidden"); }
  else { notesWrap.classList.add("hidden"); }

  result.classList.remove("hidden");
}

copyScript.addEventListener("click", async ()=>{
  try{ await navigator.clipboard.writeText(conversation.textContent); copyScript.textContent="Copied!"; setTimeout(()=>copyScript.textContent="Copy",1200);}catch{}
});

copySummary.addEventListener("click", async ()=>{
  const risks = Array.from(risksList.querySelectorAll("li")).map(li=>"- "+li.textContent).join("\n");
  const checks = Array.from(checklist.querySelectorAll("span")).map(s=>"[ ] "+s.textContent).join("\n");
  const notesText = notesWrap.classList.contains("hidden") ? "" : `\n\nNotes:\n${notes.textContent}`;
  const summary = `${appTitle.textContent}\nThreat Score: ${threatBadge.textContent.split(": ")[1]}\n\nBiggest Hidden Risks:\n${risks}\n\nKid-Proof Conversation Script:\n${conversation.textContent}\n\nAction Checklist:\n${checks}${notesText}\n\n— FSF App Safety Scanner`;
  try{ await navigator.clipboard.writeText(summary); copySummary.textContent="Copied!"; setTimeout(()=>copySummary.textContent="Copy Summary",1200);}catch{}
});

downloadPdf.addEventListener("click", ()=>{
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"a4" });
  const margin=40, width=doc.internal.pageSize.getWidth()-margin*2; let y=margin;
  const add = (text, bold=false, size=11)=>{ doc.setFont("Helvetica", bold?"bold":"normal"); doc.setFontSize(size);
    const lines=doc.splitTextToSize(text, width); doc.text(lines, margin, y); y+=lines.length*(size+4); };
  const section=(title,content)=>{ add(title,true,13); const addLines=t=>{ const lines=doc.splitTextToSize(t,width); 
      if(y+lines.length*15>doc.internal.pageSize.getHeight()-margin){ doc.addPage(); y=margin; }
      doc.text(lines, margin, y); y+=lines.length*15; }; 
    if(Array.isArray(content)) content.forEach(i=>addLines("• "+i)); else String(content).split("\n").forEach(addLines); y+=6; };

  const appName = appTitle.textContent||"FSF Summary";
  const threat = threatBadge.textContent||"";
  const risks = Array.from(risksList.querySelectorAll("li")).map(li=>li.textContent);
  const convo = conversation.textContent||"";
  const checks = Array.from(checklist.querySelectorAll("span")).map(s=>s.textContent);
  const note = notesWrap.classList.contains("hidden")?"":notes.textContent;

  add("FSF App Safety Scanner", true, 18);
  add("Scan any app and get your Family Digital Immune Summary™ in seconds.", false, 11); add("");
  section(appName, threat); section("Biggest Hidden Risks", risks); section("Kid-Proof Conversation Script", convo); section("Action Checklist", checks); if(note) section("Notes", note);
  doc.setFontSize(9); doc.text("© Future Safe Families — Educational guidance, not legal advice.", margin, doc.internal.pageSize.getHeight()-margin);
  const safe = appName.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9\-]/g,"");
  doc.save(`fsf-${safe||"summary"}.pdf`);
});
