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
async function request(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error("Request failed");return await response.json()}finally{clearTimeout(timer)}}
async function related(work){
  const ids=Array.isArray(work.related_works)?work.related_works:[];
  if(ids.length)return Promise.all(ids.slice(0,8).map(id=>request("https://api.openalex.org/works/"+encodeURIComponent(String(id).split("/").pop())).catch(()=>null))).then(x=>x.filter(Boolean));
  const query=work.display_name||work.title||"";
  if(!query)return[];
  const data=await request("https://api.openalex.org/works?"+new URLSearchParams({search:query,per_page:"8"}));
  return data.results||[];
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
    const doi=doiParam.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"").trim();
    const data=await request("https://api.crossref.org/v1/works/"+encodeURIComponent(doi));
    const authors=(data.message?.author||[]).map(a=>({author:{display_name:[a.given,a.family].filter(Boolean).join(" ")}}));
    const work={id:"https://doi.org/"+doi,display_name:data.message?.title?.[0]||"Untitled",title:data.message?.title?.[0]||"Untitled",authorships:authors,abstract:data.message?.abstract||"",publication_date:data.message?.published?.["date-parts"]?.[0]?.join("-")||"",publication_year:data.message?.published?.["date-parts"]?.[0]?.[0]||"",cited_by_count:data.message?.["is-referenced-by-count"]||0,type:data.message?.type||"journal-article",doi:"https://doi.org/"+doi,primary_location:{source:{display_name:data.message?.["container-title"]?.[0]||"Unknown venue"}},related_works:[]};
    return {source:"Crossref",recordId:"cr:"+doi,work};
  }
  return null;
}
async function run(){
  const loaded=await loadWork();
  if(!loaded){root.innerHTML='<div class="note">No article identifier was provided. <a href="search.html">Return to search.</a></div>';return}
  const w=loaded.work,title=w.display_name||w.title||"Untitled",authors=(w.authorships||[]).filter(a=>a.author?.display_name),abstract=clean(w.abstract_inverted_index?reconstruct(w.abstract_inverted_index):w.abstract||""),doi=(w.doi||"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,""),venue=w.primary_location?.source?.display_name||"Unknown venue",year=w.publication_year||"";
  document.title=title+" — Academic Library";
  const meta=document.querySelector('meta[name="description"]');if(meta)meta.setAttribute("content",(abstract||"Academic article record with authors, publication details and related research.").slice(0,155));
  let rel=[];try{rel=(await related(w)).filter(x=>x.id!==w.id).slice(0,6)}catch{}
  const authorNames=authors.map(a=>a.author.display_name);
  localHistory(loaded.recordId,title,authorNames,venue,year);
  const topics=(w.topics||[]).map(x=>x.display_name).filter(Boolean).slice(0,6);
  const concepts=topics.length?topics:(w.concepts||[]).filter(x=>x.score>.25).map(x=>x.display_name).slice(0,6);
  const sourceHref=safeHref(loaded.source==="OpenAlex"&&/^https:\/\/openalex\.org\//.test(w.id)?w.id:(doi?"https://doi.org/"+encodeURIComponent(doi):w.id));
  root.innerHTML=
    '<div id="lead"><div class="kicker">RESEARCH RECORD · '+esc(loaded.source.toUpperCase())+'</div><h1 class="article-title">'+esc(title)+'</h1><p class="lead">'+esc(authorNames.slice(0,5).join(", ")||"Unknown authors")+'</p></div>'+
    '<div class="article-layout"><div class="article-body"><div class="note">Live scholarly metadata retrieved at page load. '+esc(w.publication_date||"")+'</div>'+
    '<h2 id="abstract">Abstract</h2><p>'+esc(abstract||"No abstract is available in the indexed metadata.")+'</p>'+
    '<h2 id="authors">Authors</h2><div class="author-list">'+(authors.map(authorLink).join("")||"No author metadata available.")+'</div>'+
    '<h2 id="details">Publication details</h2><p>Published in <a href="journal.html?name='+encodeURIComponent(venue)+'">'+esc(venue)+'</a> in <strong>'+esc(year||"n.d.")+'</strong>. The record reports <strong>'+esc(w.cited_by_count||0)+'</strong> citations.</p>'+
    '<h2 id="topics">Topics</h2><div class="author-list">'+(concepts.map(x=>'<a href="search.html?q='+encodeURIComponent(x)+'">'+esc(x)+'</a>').join("")||"No topic metadata available.")+'</div>'+
    '<h2 id="related">Related research</h2><div class="related">'+(rel.length?rel.map(x=>'<a href="article.html?id='+encodeURIComponent(x.id)+'">'+esc(x.display_name||x.title||"Untitled")+'</a>').join(""):'<span class="meta">No related records were returned. You can continue with the author, venue or topic links above.</span>')+'</div></div>'+
    '<aside class="infobox"><h3>Article details</h3><dl><dt>Type</dt><dd>'+esc(w.type||"work")+'</dd><dt>Date</dt><dd>'+esc(w.publication_date||"n.d.")+'</dd><dt>Venue</dt><dd><a href="journal.html?name='+encodeURIComponent(venue)+'">'+esc(venue)+'</a></dd><dt>Citations</dt><dd>'+esc(w.cited_by_count||0)+'</dd><dt>Source</dt><dd><a href="'+esc(sourceHref)+'" target="_blank" rel="noopener">Record ↗</a></dd>'+(doi?'<dt>DOI</dt><dd><a href="https://doi.org/'+encodeURIComponent(doi)+'" target="_blank" rel="noopener">'+esc(doi)+'</a></dd>':"")+'</dl><p><button id="saveArticle" class="plain-btn">'+(saved(loaded.recordId)?"Saved":"Save to library")+'</button></p><div class="cite-box">'+esc(title+". "+authorNames.slice(0,3).join(", ")+". "+venue+", "+(year||"n.d.")+".")+'</div></aside></div>';
  document.querySelector("#saveArticle").addEventListener("click",()=>addSave({id:loaded.recordId,title,url:location.href,pageUrl:location.href,authors:authorNames,venue,year}));
}
run().catch(()=>root.innerHTML='<div class="note">The scholarly record could not be loaded. Please try again, or <a href="search.html">return to search</a>.</div>');