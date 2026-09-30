const root=document.querySelector("#homeRecent"),esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));async function request(url){
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
}const end=new Date(),start=new Date(end);start.setDate(end.getDate()-30);const iso=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day};request("https://api.openalex.org/works?"+new URLSearchParams({filter:"from_publication_date:"+iso(start)+",to_publication_date:"+iso(end),sort:"publication_date:desc",per_page:"6"})).then(j=>{root.innerHTML=(j.results||[]).map(w=>'<article class="mini-result"><div><span class="tag">Research</span> '+esc(w.publication_date||w.publication_year||"")+'</div><h3><a href="article.html?id='+encodeURIComponent(w.id)+'">'+esc(w.display_name||w.title)+'</a></h3><p class="meta">'+esc((w.authorships||[]).slice(0,3).map(a=>a.author?.display_name).filter(Boolean).join(", "))+' · '+esc(w.primary_location?.source?.display_name||"")+'</p></article>').join("")||'<div class="note">No recent records returned.</div>'}).catch(()=>root.innerHTML='<div class="note">The live index is temporarily unavailable. Use Search to try again.</div>');