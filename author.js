const root=document.querySelector("#author");
const params=new URLSearchParams(location.search);
const name=params.get("name")||"";
const authorId=params.get("id")||"";
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
function message(html){root.innerHTML='<div class="note">'+html+'</div>'}
async function run(){
  if(!name&&!authorId){message('No author was specified. <a href="search.html">Return to search.</a>');return}
  let author;
  if(authorId){
    author=await request("https://api.openalex.org/authors/"+encodeURIComponent(authorId));
  }else{
    const data=await request("https://api.openalex.org/authors?"+new URLSearchParams({search:name,per_page:"5"}));
    author=data.results?.[0];
  }
  if(!author){message('No matching author record was found. <a href="search.html?q='+encodeURIComponent(name)+'">Search this name in the literature.</a>');return}
  document.title=author.display_name+" — Academic Library";
  const authorKey=(author.id||"").split("/").pop();
  const works=await request("https://api.openalex.org/works?"+new URLSearchParams({filter:"author.id:"+authorKey,sort:"publication_date:desc",per_page:"12"}));
  const institution=(author.last_known_institutions||[]).map(x=>x.display_name).filter(Boolean).join(", ");
  const items=(works.results||[]);
  root.innerHTML=
    '<div class="kicker">AUTHOR · OPENALEX</div>'+
    '<h1>'+esc(author.display_name||"Unknown author")+'</h1>'+
    '<p class="lead">'+esc(institution||"Scholarly author record")+'</p>'+
    '<div class="article-layout">'+
      '<div><h2>Recent works</h2>'+
        (items.length?
          '<div class="results">'+items.map(w=>'<article class="result"><h2><a href="article.html?id='+encodeURIComponent(w.id)+'">'+esc(w.display_name||w.title||"Untitled")+'</a></h2><div class="meta">'+esc(w.publication_year||"n.d.")+' · '+esc(w.cited_by_count||0)+' citations</div></article>').join("")+'</div>':
          '<div class="note">No recent indexed works were returned for this author. <a href="search.html?q='+encodeURIComponent(author.display_name||name)+'">Search by author name →</a></div>')+
      '</div>'+
      '<aside class="infobox"><h3>Author details</h3><dl>'+
        '<dt>Works</dt><dd>'+esc(author.works_count||0)+'</dd>'+
        '<dt>Citations</dt><dd>'+esc(author.cited_by_count||0)+'</dd>'+
        '<dt>h-index</dt><dd>'+esc(author.summary_stats?.h_index??"n/a")+'</dd>'+
      '</dl></aside>'+
    '</div>';
}
run().catch(()=>message('The author index is temporarily unavailable. <a href="search.html">Return to search.</a>'));