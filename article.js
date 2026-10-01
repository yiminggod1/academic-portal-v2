const root=document.querySelector("#article");
const params=new URLSearchParams(location.search);
const rawId=params.get("id")||"";
const doiParam=(params.get("doi")||"").trim();
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const clean=s=>String(s??"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim();function safeHref(value){const v=String(value||"").trim();if(/^https?:\/\//i.test(v)||/^(?:article|author|journal|search|saved|history)\.html(?:[?#].*)?$/i.test(v))return v;return"#"}
function reconstruct(idx){if(!idx)return"";const words=[];Object.entries(idx).forEach(([word,positions])=>positions.forEach(p=>words[p]=word));return words.join(" ")}
function readSaved(){try{return JSON.parse(localStorage.getItem("academicSaved")||"[]")}catch{return[]}}
function saved(id){return readSaved().some(x=>x.id===id)}
function addSave(x){let list=readSaved();list=[x,...list.filter(y=>y.id!==x.id)].slice(0,100);localStorage.setItem("academicSaved",JSON.stringify(list));const button=document.querySelector("#saveArticle");if(button)button.textContent="Saved"}
function readNotes(id){try{const all=JSON.parse(localStorage.getItem("academicNotes")||"{}");return String(all[id]||"")}catch{return""}}
function writeNotes(id,value){try{const all=JSON.parse(localStorage.getItem("academicNotes")||"{}");all[id]=value;localStorage.setItem("academicNotes",JSON.stringify(all));return true}catch{return false}}
async function request(url){
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(url,{signal:controller.signal});
      if(response.ok)return await response.json();
      lastError=new Error("HTTP "+response.status);
      if(![429,500,502,503,504].includes(response.status))throw lastError;
    }catch(error){
      lastError=error;
      if(attempt===2)throw error;
    }finally{clearTimeout(timer)}
    await new Promise(resolve=>setTimeout(resolve,450*(attempt+1)));
  }
  throw lastError||new Error("Request failed");
}
async function related(work){
  const ids=Array.isArray(work.related_works)?work.related_works:[];
  if(ids.length){
    return Promise.all(ids.slice(0,8).map(id=>request("https://api.openalex.org/works/"+encodeURIComponent(String(id).split("/").pop())).catch(()=>null))).then(x=>x.filter(Boolean));
  }
  const query=work.display_name||work.title||"";
  if(!query)return[];
  const data=await request("https://api.openalex.org/works?"+new URLSearchParams({search:query,per_page:"8"}));
  return data.results||[];
}async function references(work){
  const ids=Array.isArray(work.referenced_works)?work.referenced_works:[];
  if(!ids.length)return[];
  return Promise.all(ids.slice(0,6).map(id=>request("https://api.openalex.org/works/"+encodeURIComponent(String(id).split("/").pop())).catch(()=>null))).then(x=>x.filter(Boolean));
}
async function citedBy(work){
  const id=String(work.id||"").split("/").pop();
  if(!/^W\d+$/i.test(id))return[];
  try{
    const data=await request("https://api.openalex.org/works?"+new URLSearchParams({filter:"cites:"+id,per_page:"6",sort:"cited_by_count:desc"}));
    return data.results||[];
  }catch{return[]}
}
function norm(value){return String(value||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function relationReasons(item,work,kind){
  const reasons=[];
  if(kind==="references"){reasons.push("Referenced by this paper");return reasons}
  const aIds=new Set((work.authorships||[]).map(x=>x.author?.id).filter(Boolean));
  const bIds=new Set((item.authorships||[]).map(x=>x.author?.id).filter(Boolean));
  const aNames=new Set((work.authorships||[]).map(x=>norm(x.author?.display_name)).filter(Boolean));
  const bNames=(item.authorships||[]).map(x=>norm(x.author?.display_name)).filter(Boolean);
  if((aIds.size&&[...bIds].some(id=>aIds.has(id)))||(!aIds.size&&bNames.some(name=>aNames.has(name))))reasons.push("shared author");
  const va=norm(work.primary_location?.source?.id||work.primary_location?.source?.display_name||"");
  const vb=norm(item.primary_location?.source?.id||item.primary_location?.source?.display_name||"");
  if(va&&vb&&va===vb)reasons.push("same venue");
  const taIds=new Set((work.topics||[]).map(x=>x.id).filter(Boolean)),tbIds=(item.topics||[]).map(x=>x.id).filter(Boolean);
  const topicIdsOverlap=taIds.size&&tbIds.some(id=>taIds.has(id));
  const topicNamesA=new Set((work.topics||[]).map(x=>norm(x.display_name)).filter(Boolean));
  const topicNamesB=(item.topics||[]).map(x=>norm(x.display_name)).filter(Boolean);
  if(topicIdsOverlap||topicNamesB.some(x=>topicNamesA.has(x)))reasons.push("shared topic");
  const ra=new Set((work.referenced_works||[]).map(String)),rb=(item.referenced_works||[]).map(String);
  if(rb.some(x=>ra.has(x)))reasons.push("shared references");
  return reasons.slice(0,3);
}
function relationScore(item,work,kind,index=0){
  const reasons=relationReasons(item,work,kind);
  let score=0;
  if(kind==="references")return 60-index;
  if(reasons.includes("shared author"))score+=24;
  if(reasons.includes("shared topic"))score+=18;
  if(reasons.includes("shared references"))score+=14;
  if(reasons.includes("same venue"))score+=5;
  if(kind==="citing")score+=16;
  score+=Math.min(8,Math.log10((Number(item.cited_by_count)||0)+1));
  if(item.publication_year){
    const age=Math.max(0,new Date().getFullYear()-Number(item.publication_year));
    score+=Math.max(0,4-age*.15);
  }
  return score+(8-index*.5);
}
function sortRelated(items,work,kind){
  return items.map((x,i)=>({...x,_relationIndex:i,_relationReasons:relationReasons(x,work,kind),_relationScore:relationScore(x,work,kind,i)}))
    .sort((a,b)=>b._relationScore-a._relationScore)
    .slice(0,6);
}

function authorLink(a){const name=a.author?.display_name||"Unknown author",id=a.author?.id?.split("/").pop()||"";return '<a href="author.html?'+(id?"id="+encodeURIComponent(id)+"&":"")+"name="+encodeURIComponent(name)+'">'+esc(name)+'</a>'}
function localHistory(id,title,authors,venue,year){
  localStorage.setItem("academicLastViewed",JSON.stringify({id,title,url:location.href,authors,venue,year}));
  let list=[];try{list=JSON.parse(localStorage.getItem("academicHistory")||"[]")}catch{}
  const item={id,title,url:location.href,authors,venue,year};
  list=[item,...list.filter(x=>x.id!==id)].slice(0,30);
  localStorage.setItem("academicHistory",JSON.stringify(list));
}
async function loadWork(){
  if(rawId){
    const id=rawId.replace(/^https:\/\/openalex.org\//,"");
    return {source:"OpenAlex",recordId:"oa:"+rawId,work:await request("https://api.openalex.org/works/"+encodeURIComponent(id))};
  }
  if(doiParam){
    const doi=doiParam.replace(/^doi:\s*/i,"").replace(/^doi\s+/i,"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"").replace(/^doi\.org\//i,"").replace(/[.,;)>]+$/,"").trim();
    const data=await request("https://api.crossref.org/v1/works/"+encodeURIComponent(doi));
    const authors=(data.message?.author||[]).map(a=>({author:{display_name:[a.given,a.family].filter(Boolean).join(" ")}}));
    const link=(data.message?.link||[]).find(l=>/application\/pdf/i.test(l?.["content-type"]||""))||data.message?.link?.find(l=>l?.URL);
    const updates=data.message?.["update-to"]||[];
    const work={id:"https://doi.org/"+doi,display_name:data.message?.title?.[0]||"Untitled",title:data.message?.title?.[0]||"Untitled",authorships:authors,abstract:data.message?.abstract||"",publication_date:data.message?.published?.["date-parts"]?.[0]?.join("-")||"",publication_year:data.message?.published?.["date-parts"]?.[0]?.[0]||"",cited_by_count:data.message?.["is-referenced-by-count"]||0,type:data.message?.type||"journal-article",doi:"https://doi.org/"+doi,primary_location:{source:{display_name:data.message?.["container-title"]?.[0]||"Unknown venue"}},fullTextUrl:link?.URL||"",related_works:[],update_to:updates};
    return {source:"Crossref",recordId:"cr:"+doi,work};
  }
  return null;
}
async function run(){
  const loaded=await loadWork();
  if(!loaded){root.innerHTML='<div class="note">No article identifier was provided. <a href="search.html">Return to search.</a></div>';return}
  let w=loaded.work;
  if(loaded.source==="Crossref"&&doiParam){
    try{
      const oaData=await request("https://api.openalex.org/works?"+new URLSearchParams({search:loaded.work.doi||doiParam,per_page:"3"}));
      const oaMatch=(oaData.results||[]).find(x=>String(x.doi||"").toLowerCase().replace(/^https?:\/\/doi\.org\//i,"")===String(loaded.work.doi||doiParam).toLowerCase().replace(/^https?:\/\/doi\.org\//i,""));
      if(oaMatch)w={...loaded.work,...oaMatch,abstract_inverted_index:oaMatch.abstract_inverted_index||undefined};
    }catch{}
  }
  const networkWork=w;
  const title=w.display_name||w.title||"Untitled",updates=w.update_to||w["update-to"]||[],hasRetraction=Array.isArray(updates)&&updates.some(x=>String(x.type||"").toLowerCase()==="retraction"),fullTextUrl=w.fullTextUrl||((w.open_access?.is_oa)?(w.best_oa_location?.pdf_url||w.best_oa_location?.landing_page_url||""):""),authors=(w.authorships||[]).filter(a=>a.author?.display_name),abstract=clean(w.abstract_inverted_index?reconstruct(w.abstract_inverted_index):w.abstract||""),doi=(w.doi||"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,""),venue=w.primary_location?.source?.display_name||"Unknown venue",year=w.publication_year||"";
  document.title=title+" — Academic Library";
  const meta=document.querySelector('meta[name="description"]');if(meta)meta.setAttribute("content",(abstract||"Academic article record with authors, publication details and related research.").slice(0,155));
  let rel=[],refs=[],citing=[];try{
    [rel,refs,citing]=await Promise.all([related(networkWork).catch(()=>[]),references(networkWork).catch(()=>[]),citedBy(networkWork)]);
    rel=sortRelated(rel.filter(x=>x.id!==networkWork.id),networkWork,"related");
    refs=sortRelated(refs.filter(x=>x.id!==networkWork.id),networkWork,"references");
    citing=sortRelated(citing.filter(x=>x.id!==networkWork.id),networkWork,"citing");
  }catch{}
  const authorNames=authors.map(a=>a.author.display_name);
  localHistory(loaded.recordId,title,authorNames,venue,year);
  const topics=(w.topics||[]).map(x=>x.display_name).filter(Boolean).slice(0,6);
  const concepts=topics.length?topics:(w.concepts||[]).filter(x=>x.score>.25).map(x=>x.display_name).slice(0,6);
  const primaryTopic=concepts[0]||"";
  const yearValue=Number(year)||0;
  const researchPaths=[
    primaryTopic?{label:"Same topic",note:"Explore other work in this topic",href:"search.html?q="+encodeURIComponent(primaryTopic)}:null,
    yearValue?{label:"Recent developments",note:"Find newer work around this paper",href:"search.html?q="+encodeURIComponent(title)+"&mode=latest"}:null,
    {label:"Method trail",note:"Look for methods and protocols around this subject",href:"search.html?q="+encodeURIComponent(title)+"&mode=howto"}
  ].filter(Boolean);
  const sourceHref=safeHref(loaded.source==="OpenAlex"&&/^https:\/\/openalex\.org\//.test(w.id)?w.id:(doi?"https://doi.org/"+encodeURIComponent(doi):w.id));
  root.innerHTML=
    '<div id="lead"><div class="kicker">RESEARCH RECORD · '+esc(loaded.source.toUpperCase())+'</div><h1 class="article-title">'+esc(title)+'</h1><p class="lead">'+esc(authorNames.slice(0,5).join(", ")||"Unknown authors")+'</p></div>'+
    '<div class="article-layout"><div class="article-body"><div class="note">Live scholarly metadata retrieved at page load. '+esc(w.publication_date||"")+'</div>'+
    '<h2 id="abstract">Abstract</h2><p>'+esc(abstract||"No abstract is available in the indexed metadata.")+'</p>'+
    '<h2 id="authors">Authors</h2><div class="author-list">'+(authors.map(authorLink).join("")||"No author metadata available.")+'</div>'+
    '<h2 id="details">Publication details</h2><p>Published in <a href="journal.html?'+(w.primary_location?.source?.id?"id="+encodeURIComponent(String(w.primary_location.source.id).split("/").pop())+"&":"")+'name='+encodeURIComponent(venue)+'">'+esc(venue)+'</a> in <strong>'+esc(year||"n.d.")+'</strong>. The record reports <strong>'+esc(w.cited_by_count||0)+'</strong> citations.</p>'+
    '<h2 id="topics">Topics</h2><div class="author-list">'+(concepts.map(x=>'<a href="search.html?q='+encodeURIComponent(x)+'">'+esc(x)+'</a>').join("")||"No topic metadata available.")+'</div>'+
    '<h2 id="map">Research map</h2><div class="research-map"><div class="map-core"><span class="map-type">THIS PAPER</span><strong>'+esc(title)+'</strong><div class="connection-summary">'+esc(rel.length)+' related · '+esc(refs.length)+' references · '+esc(citing.length)+' papers citing this record</div></div><div class="map-branches"><div class="map-branch"><span class="map-type">AUTHORS</span><div class="map-links">'+(authors.length?authors.slice(0,5).map(a=>'<a href="author.html?id='+encodeURIComponent((a.author?.id||"").split("/").pop())+'&name='+encodeURIComponent(a.author.display_name)+'">'+esc(a.author.display_name)+'</a>').join(""):'<span class="meta">Not indexed</span>')+'</div></div><div class="map-branch"><span class="map-type">VENUE</span><div class="map-links"><a href="journal.html?'+(w.primary_location?.source?.id?"id="+encodeURIComponent(String(w.primary_location.source.id).split("/").pop())+"&":"")+'name='+encodeURIComponent(venue)+'">'+esc(venue)+'</a></div></div><div class="map-branch"><span class="map-type">TOPICS</span><div class="map-links">'+(concepts.length?concepts.map(x=>'<a href="search.html?q='+encodeURIComponent(x)+'">'+esc(x)+'</a>').join(""):'<span class="meta">Not indexed</span>')+'</div></div><div class="map-branch"><span class="map-type">RELATED</span><div class="map-links">'+(rel.length?rel.slice(0,5).map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'" title="'+esc((x._reasons||[]).join(" · "))+'">'+esc(x.display_name||x.title||"Untitled")+'</a>').join(""):'<span class="meta">No records</span>')+'</div></div><div class="map-branch"><span class="map-type">CITED BY</span><div class="map-links">'+(citing.length?citing.slice(0,5).map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'" title="Cites this paper">'+esc(x.display_name||x.title||"Untitled")+'</a>').join(""):'<span class="meta">No records</span>')+'</div></div><div class="map-branch"><span class="map-type">REFERENCES</span><div class="map-links">'+(refs.length?refs.slice(0,5).map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'">'+esc(x.display_name||x.title||"Untitled")+'</a>').join(""):'<span class="meta">No records</span>')+'</div></div></div></div>'+
    '<h2 id="paths">Research paths</h2><div class="research-path-list">'+researchPaths.map(p=>'<a href="'+safeHref(p.href)+'"><strong>'+esc(p.label)+'</strong><span>'+esc(p.note)+'</span></a>').join("")+'</div>'+
    '<h2 id="related">Related research</h2><div class="related">'+(rel.length?rel.map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'">'+esc(x.display_name||x.title||"Untitled")+'<span class="relation-meta">'+esc((x._reasons||[]).join(" · ")||"related work")+'</span></a>').join(""):'<span class="meta">No related records were returned. You can continue with the author, venue or topic links above.</span>')+'</div>'+
    '<h2 id="references">Reference trail</h2><div class="related">'+(refs.length?refs.map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'">'+esc(x.display_name||x.title||"Untitled")+'<span class="relation-meta">'+esc((x._reasons||[]).join(" · "))+'</span></a>').join(""):'<span class="meta">No reference records were returned in the indexed metadata.</span>')+'</div>'+
    '<h2>Citing this paper</h2><div class="related">'+(citing.length?citing.map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'">'+esc(x.display_name||x.title||"Untitled")+'<span class="relation-meta">Cites this paper</span></a>').join(""):'<span class="meta">No citing records were returned for this OpenAlex record.</span>')+'</div></div>'+
    '<aside class="infobox"><h3>Article details</h3><dl><dt>Type</dt><dd>'+esc(w.type||"work")+'</dd><dt>Date</dt><dd>'+esc(w.publication_date||"n.d.")+'</dd><dt>Venue</dt><dd><a href="journal.html?'+(w.primary_location?.source?.id?"id="+encodeURIComponent(String(w.primary_location.source.id).split("/").pop())+"&":"")+'name='+encodeURIComponent(venue)+'">'+esc(venue)+'</a></dd><dt>Citations</dt><dd>'+esc(w.cited_by_count||0)+'</dd>'+(fullTextUrl?'<dt>Full text</dt><dd><a href="'+safeHref(fullTextUrl)+'" target="_blank" rel="noopener">Available link ↗</a></dd>':"")+'<dt>Source</dt><dd><a href="'+esc(sourceHref)+'" target="_blank" rel="noopener">Record ↗</a></dd>'+(doi?'<dt>DOI</dt><dd><a href="https://doi.org/'+encodeURIComponent(doi)+'" target="_blank" rel="noopener">'+esc(doi)+'</a></dd>':"")+'</dl>'+(hasRetraction?'<div class="integrity-warning"><strong>Post-publication update: retraction signal</strong><p>Crossref reports a retraction-related update for this record. Verify the publisher record before citing.</p></div>':(updates.length?'<div class="integrity-note"><strong>Post-publication update recorded</strong><p>This record has a Crossref update relationship. Check the original source for details.</p></div>':""))+'<p><button id="saveArticle" class="plain-btn">'+(saved(loaded.recordId)?"Saved":"Save to library")+'</button></p><div id="notes" class="article-note"><label for="paperNote"><strong>Personal note</strong></label><textarea id="paperNote" placeholder="Why is this paper useful? Record a method, finding, question or follow-up.">'+esc(readNotes(loaded.recordId))+'</textarea><button id="savePaperNote" class="plain-btn" type="button">Save note</button><span id="paperNoteStatus" class="meta" aria-live="polite"></span></div><div class="cite-box">'+esc(title+". "+authorNames.slice(0,3).join(", ")+". "+venue+", "+(year||"n.d.")+".")+'</div></aside></div>';
  document.querySelector("#saveArticle").addEventListener("click",()=>addSave({id:loaded.recordId,title,url:location.href,pageUrl:location.href,authors:authorNames,venue,year}));
  document.querySelector("#savePaperNote")?.addEventListener("click",()=>{const ok=writeNotes(loaded.recordId,document.querySelector("#paperNote")?.value||"");document.querySelector("#paperNoteStatus").textContent=ok?"Saved locally.":"Unable to save in this browser."});
}
run().catch(()=>root.innerHTML='<div class="note">The scholarly record could not be loaded. Please try again, or <a href="search.html">return to search</a>.</div>');