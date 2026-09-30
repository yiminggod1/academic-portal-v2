const root=document.querySelector("#savedList");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const load=()=>{try{const v=JSON.parse(localStorage.getItem("academicSaved")||"[]");return Array.isArray(v)?v:[]}catch{return[]}};
const loadNotes=()=>{try{const v=JSON.parse(localStorage.getItem("academicNotes")||"{}");return v&&typeof v==="object"?v:{}}catch{return{}}};
const authors=x=>{
  if(Array.isArray(x?.authorObjects)&&x.authorObjects.length)return x.authorObjects.filter(a=>a?.given||a?.family);
  const a=x?.authors;
  if(Array.isArray(a))return a.filter(Boolean).map(name=>({given:String(name),family:""}));
  if(typeof a==="string")return a.split(/\s*,\s*/).filter(Boolean).map(name=>({given:name.trim(),family:""}));
  return[];
};
const displayName=a=>[a.given,a.family].filter(Boolean).join(" ").trim()||"Unknown author";
const apaAuthor=a=>a.family?[a.family,(a.given||"").split(/\s+/).filter(Boolean).map(s=>s.replace(/[^A-Za-zÀ-ÿ.'-]/g,"").replace(/^(.)/,"$1.") ).join(" ")].filter(Boolean).join(", "):displayName(a);
const citeAuthors=x=>authors(x).map(apaAuthor).join(", ")||"Unknown author";
const cite=x=>{const y=x.year||"n.d.",t=x.title||"Untitled",v=x.venue||"Academic Library",a=citeAuthors(x),doi=x.doi?String(x.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,""):"";return{apa:a+" ("+y+"). "+t+". "+v+"."+ (doi?" https://doi.org/"+doi:""),mla:(authors(x)[0]?authors(x)[0].family+", "+(authors(x)[0].given||"")+". ":"")+'"'+t+'." '+v+", "+y+"."+ (doi?" "+"https://doi.org/"+doi:""),chicago:a+'. "'+t+'". '+v+" ("+y+")."+(doi?" https://doi.org/"+doi:""),acs:citeAuthors(x)+". "+t+". "+v+" "+y+"."+(doi?" DOI: "+doi:"")}};
const escBib=v=>String(v??"").replace(/([{}\\])/g,"\\$1");
const keyBase=x=>(String(x.title||"paper").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,38)||"paper")+"_"+(x.year||"nd");
function bib(x,index,used){let key=keyBase(x),base=key,n=2;while(used.has(key)){key=base+"_"+n++;}used.add(key);const aa=authors(x).map(displayName).filter(Boolean);return "@article{"+key+",\n  title={"+escBib(x.title||"")+"},\n  author={"+escBib(aa.join(" and "))+"},\n  year={"+escBib(x.year||"")+"},\n  journal={"+escBib(x.venue||"")+"}"+(x.doi?",\n  doi={"+escBib(String(x.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,""))+"}":"")+(x.url?",\n  url={"+escBib(x.url)+"}":"")+"\n}"}
function ris(x){return "TY  - JOUR\nTI  - "+(x.title||"")+"\n"+authors(x).map(a=>"AU  - "+displayName(a)).join("\n")+"\nPY  - "+(x.year||"")+"\nJO  - "+(x.venue||"")+"\n"+(x.doi?"DO  - "+String(x.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"")+"\n":"")+(x.url?"UR  - "+x.url+"\n":"")+"ER  -"};
const compareLoad=()=>{try{const v=JSON.parse(localStorage.getItem("academicCompare")||"[]");return Array.isArray(v)?v.slice(0,4):[]}catch{return[]}};
function toggleCompare(item,checked){let list=compareLoad();if(checked){if(!list.some(x=>x.id===item.id)){if(list.length>=4)return false;list=[...list,item]}}else list=list.filter(x=>x.id!==item.id);localStorage.setItem("academicCompare",JSON.stringify(list));return true}
function update(){
  const a=load(),notes=loadNotes(),compared=new Set(compareLoad().map(x=>x.id));
  document.querySelector("#count").textContent=a.length;
  root.innerHTML=a.length?a.map((x,i)=>'<article class="result saved-card"><div class="result-tools"><label class="compare-toggle"><input type="checkbox" data-compare-saved="'+esc(x.id)+'" '+(compared.has(x.id)?"checked":"")+'> Compare</label><button class="remove plain-btn" data-i="'+i+'">Remove</button></div><h2><a href="'+esc(x.pageUrl||(x.oaId?"article.html?id="+encodeURIComponent(x.oaId):x.url)||"#")+'">'+esc(x.title)+'</a></h2><p class="meta">'+esc(authors(x).slice(0,4).map(displayName).join(", "))+(x.venue?" · "+esc(x.venue):"")+(x.year?" · "+esc(x.year):"")+'</p>'+(notes[x.id]?'<div class="saved-note"><strong>Note:</strong> '+esc(notes[x.id].slice(0,420))+(notes[x.id].length>420?"…":"")+' <a href="'+esc(x.pageUrl||(x.oaId?"article.html?id="+encodeURIComponent(x.oaId):x.url)||"#")+'#notes">Edit on record</a></div>':"")+'</article>').join(""):'<div class="empty"><h2>Your reading list is empty.</h2><a class="arrow" href="search.html">Search literature →</a></div>';
  const s=document.querySelector("#style").value,styles=a.map(x=>cite(x)[s]);document.querySelector("#bibliography").textContent=a.length?styles.map((v,i)=>(i+1)+". "+v).join("\n\n"):"Save some records to generate citations.";
  const compare=document.querySelector("#compareSaved");if(compare)compare.textContent=compareLoad().length?"Compare "+compareLoad().length+" selected":"Compare selected";
}
root.addEventListener("click",e=>{if(e.target.dataset.i===undefined)return;const a=load();a.splice(+e.target.dataset.i,1);localStorage.setItem("academicSaved",JSON.stringify(a));update()});
root.addEventListener("change",e=>{const id=e.target.dataset.compareSaved;if(!id)return;const item=load().find(x=>x.id===id);if(!item)return;if(!toggleCompare(item,e.target.checked)){e.target.checked=false;alert("Choose up to 4 papers for one comparison.");return}update()});
document.querySelector("#style").onchange=update;
document.querySelector("#copyAll").onclick=async()=>{const text=document.querySelector("#bibliography").textContent;try{await navigator.clipboard.writeText(text);document.querySelector("#copyAll").textContent="Copied";setTimeout(()=>document.querySelector("#copyAll").textContent="Copy bibliography",1400)}catch{document.querySelector("#copyAll").textContent="Copy unavailable";setTimeout(()=>document.querySelector("#copyAll").textContent="Copy bibliography",1600)}};
document.querySelector("#downloadBib").onclick=()=>{const used=new Set();download("academic-library.bib",load().map((x,i)=>bib(x,i,used)).join("\n\n"))};
document.querySelector("#downloadRis").onclick=()=>download("academic-library.ris",load().map(ris).join("\n"));
function download(n,t){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([t],{type:"text/plain"}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const notes=document.querySelector("#reviewNotes");notes.value=localStorage.getItem("academicReviewNotes")||"";document.querySelector("#saveNotes").onclick=()=>{localStorage.setItem("academicReviewNotes",notes.value);document.querySelector("#noteStatus").textContent="Saved locally."};
update();