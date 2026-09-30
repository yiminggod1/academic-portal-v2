const params=new URLSearchParams(location.search),name=params.get("name")||"",sourceId=params.get("id")||"";
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
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
async function run(){
 if(!name){root.innerHTML='<div class="note">No journal was specified. <a href="search.html">Return to search.</a></div>';return}
 try{
  let source;
  if(sourceId){
    source=await request("https://api.openalex.org/sources/"+encodeURIComponent(sourceId));
  }else{
    const src=await request("https://api.openalex.org/sources?"+new URLSearchParams({search:name,per_page:"5"}));
    const matches=(src.results||[]).filter(Boolean);
    if(!matches.length){root.innerHTML='<div class="note">No matching publication venue was found. <a href="search.html?q='+encodeURIComponent(name)+'">Search the venue title instead →</a></div>';return}
    if(matches.length>1){
      document.title=(source.display_name||name)+" — Academic Library";
    root.innerHTML='<div class="kicker">VENUE MATCHES</div><h1>Choose the publication venue.</h1><p class="lead">Several publication sources match “'+esc(name)+'”. Check the work count before opening a venue page.</p><div class="results">'+matches.map(s=>'<article class="result"><h2><a href="journal.html?id='+encodeURIComponent((s.id||"").split("/").pop())+'&name='+encodeURIComponent(s.display_name||"")+'">'+esc(s.display_name||"Unknown venue")+'</a></h2><div class="meta">'+esc(s.works_count||0)+' works indexed</div></article>').join("")+'</div>';
      return;
    }
    source=matches[0];
  }
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