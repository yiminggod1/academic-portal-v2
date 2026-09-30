const root=document.querySelector("#journal"),name=new URLSearchParams(location.search).get("name")||"";
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function request(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error();return await r.json()}finally{clearTimeout(t)}}
async function run(){
 if(!name){root.innerHTML='<div class="note">No journal was specified. <a href="search.html">Return to search.</a></div>';return}
 try{
  const src=await request("https://api.openalex.org/sources?"+new URLSearchParams({search:name,per_page:"5"}));
  const source=src.results?.[0];
  let works;
  if(source?.id){
   works=await request("https://api.openalex.org/works?"+new URLSearchParams({filter:"primary_location.source.id:"+source.id.split("/").pop(),sort:"publication_date:desc",per_page:"15"}));
  }else{
   works=await request("https://api.openalex.org/works?"+new URLSearchParams({search:name,sort:"publication_date:desc",per_page:"15"}));
  }
  document.title=name+" — Academic Library";
  const list=works.results||[];
  root.innerHTML='<div class="kicker">PUBLICATION VENUE · OPENALEX</div><h1>'+esc(name)+'</h1><p class="lead">Recent indexed research associated with this publication venue.</p><h2>Recent works</h2><div class="results">'+(list.length?list.map(w=>'<article class="result"><h2><a href="article.html?id='+encodeURIComponent(w.id)+'">'+esc(w.display_name||w.title)+'</a></h2><div class="meta">'+esc(w.publication_year||"")+' · '+esc((w.authorships||[]).slice(0,3).map(a=>a.author?.display_name).filter(Boolean).join(", "))+' · '+esc(w.cited_by_count||0)+' citations</div></article>').join(""):'<div class="note">No matching works found for this publication venue. <a href="search.html?q='+encodeURIComponent(name)+'">Search the title instead →</a></div>')+'</div>';
 }catch(e){root.innerHTML='<div class="note">The publication index is temporarily unavailable. <a href="search.html">Return to search.</a></div>'}
}
run();