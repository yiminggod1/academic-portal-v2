const root=document.querySelector("#compareApp");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const load=()=>{try{const v=JSON.parse(localStorage.getItem("academicCompare")||"[]");return Array.isArray(v)?v.slice(0,4):[]}catch{return[]}};
const fmt=v=>v==null||v===""?"—":String(v);
function link(x){return x.pageUrl||((x.oaId)?"article.html?id="+encodeURIComponent(x.oaId):x.url||"#")}
function render(){
  const items=load();
  if(!items.length){root.innerHTML='<div class="empty"><h2>No papers selected.</h2><p>Return to Search and choose up to four papers with the Compare control.</p><a class="arrow" href="search.html">Back to search →</a></div>';return}
  const headings=items.map((x,i)=>'<th scope="col"><div class="compare-heading"><span>Paper '+(i+1)+'</span><button class="plain-btn compare-remove" data-i="'+i+'" type="button">Remove</button></div><a href="'+esc(link(x))+'">'+esc(fmt(x.title))+'</a></th>').join("");
  const authors=items.map(x=>'<td>'+esc(Array.isArray(x.authors)?x.authors.join(", "):fmt(x.authors))+'</td>').join("");
  const venues=items.map(x=>'<td>'+esc(fmt(x.venue))+'</td>').join("");
  const years=items.map(x=>'<td>'+esc(fmt(x.year))+'</td>').join("");
  const cited=items.map(x=>'<td><strong>'+esc(fmt(x.cited))+'</strong></td>').join("");
  const access=items.map(x=>'<td>'+esc(x.openAccess?"Yes":"—")+'</td>').join("");
  const fulltext=items.map(x=>'<td>'+esc(x.fullTextUrl?"Available":"—")+'</td>').join("");
  const dois=items.map(x=>'<td>'+esc(x.doi||"—")+'</td>').join("");
  const abstracts=items.map(x=>'<td><p class="compare-abstract">'+esc(x.abstract||"No abstract in returned metadata.")+'</p><a href="'+esc(link(x))+'">Read record →</a></td>').join("");
  root.innerHTML='<div class="compare-toolbar"><span>'+items.length+' of 4 selected</span><a class="plain-btn" href="search.html">Add more papers</a><button id="clearAllCompare" class="plain-btn" type="button">Clear all</button></div><div class="table-wrap"><table class="compare-table"><thead><tr><th>Field</th>'+headings+'</tr></thead><tbody><tr><th>Authors</th>'+authors+'</tr><tr><th>Venue</th>'+venues+'</tr><tr><th>Year</th>'+years+'</tr><tr><th>Citations</th>'+cited+'</tr><tr><th>Open access signal</th>'+access+'</tr><tr><th>Full-text link</th>'+fulltext+'</tr><tr><th>DOI</th>'+dois+'</tr><tr class="compare-evidence"><th>Abstract evidence</th>'+abstracts+'</tr></tbody></table></div><p class="meta">Comparison is a reading aid, not a claim that one study is better than another. Check each original record, methods and publisher source before drawing conclusions.</p>';
  root.querySelectorAll(".compare-remove").forEach(b=>b.onclick=()=>{const next=load();next.splice(Number(b.dataset.i),1);localStorage.setItem("academicCompare",JSON.stringify(next));render()});
  root.querySelector("#clearAllCompare").onclick=()=>{localStorage.removeItem("academicCompare");render()};
}
render();