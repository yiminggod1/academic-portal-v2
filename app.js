const $=s=>document.querySelector(s);
const form=$("#searchForm"),results=$("#results"),statusEl=$("#status"),answerEl=$("#answerLayer"),suggestionsEl=$("#querySuggestions");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const clean=s=>String(s??"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim();
function getSaved(){try{return JSON.parse(localStorage.getItem("academicSaved")||"[]")}catch{return[]}}
function save(item){if(!item)return;const a=getSaved().filter(x=>x.id!==item.id);a.unshift(item);localStorage.setItem("academicSaved",JSON.stringify(a.slice(0,100)))}
function removeSaved(id){localStorage.setItem("academicSaved",JSON.stringify(getSaved().filter(x=>x.id!==id)))}
function historyAdd(item){if(!item)return;let a=[];try{a=JSON.parse(localStorage.getItem("academicHistory")||"[]")}catch{}a=[item,...a.filter(x=>x.id!==item.id)].slice(0,30);localStorage.setItem("academicHistory",JSON.stringify(a))}
function reconstruct(idx){if(!idx)return"";const a=[];Object.entries(idx).forEach(([w,ps])=>ps.forEach(p=>a[p]=w));return a.join(" ")}
const STOP=new Set("a an and are as at be by can could did do does for from how i in is it me my of on or our research the this to what when where which why with would you your".split(" "));
function tokens(q){return q.toLowerCase().replace(/[^a-z0-9\s-]/g," ").split(/\s+/).filter(Boolean).filter(x=>x.length>1&&!STOP.has(x))}
function normalizeDoi(q){return q.trim().replace(/^doi:\s*/i,"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"").trim()}
function intentOf(q){const x=q.trim().toLowerCase();if(/\bdoi\b/.test(x)||/^https?:\/\/(?:dx\.)?doi\.org\//i.test(x)||/^doi:\s*10\.\d{4,9}\//i.test(x)||/^10\.\d{4,9}\//.test(x))return"identifier";if(/\b(who is|author|authors|researcher|scientist)\b/.test(x))return"author";if(/\b(journal|venue|published in)\b/.test(x))return"venue";if(/\b(latest|recent|newest|202[4-9]|this year)\b/.test(x))return"latest";if(/\b(review|systematic review|survey|literature review)\b/.test(x))return"review";if(/\b(what is|what are|define|definition)\b/.test(x))return"definition";if(/\b(how to)\b/.test(x))return"howto";if(/\b(how does|how do|how can|mechanism|process)\b/.test(x))return"mechanism";if(/\b(why does|why do|why is|causes?)\b/.test(x))return"causes";if(/\b(open access|free paper|free papers|full text|pdf)\b/.test(x))return"access";if(/\b(best|which|compare|comparison|versus|vs\.)\b/.test(x))return"comparison";return"literature"}
function stripQuestion(q){return q.replace(/\b(what is|what are|define|definition of|how does|how do|how can|how to|why does|why do|why is|what causes|what cause|who is|who are|tell me about|which|latest research on|recent research on|literature review on|review of)\b/gi," ").replace(/[?]+/g," ").replace(/\s+/g," ").trim()}
function planQuery(q){const intent=intentOf(q),core=intent==="identifier"?normalizeDoi(q):(stripQuestion(q)||q.trim());let search=core;const terms=tokens(core);if((intent==="mechanism"||intent==="causes")&&terms.length)search=core+" mechanism";if(intent==="review"&&!/\breview\b/i.test(search))search=core+" review";if(intent==="howto")search=core+" method";if(intent==="comparison")search=core+" comparison";return{intent,core,search,terms}}
function relatedQueries(plan){
 const q=plan.core,out=[];
 if(plan.intent==="definition"){out.push(q+" overview",q+" fundamentals",q+" review")}
 if(plan.intent==="mechanism"||plan.intent==="causes"){out.push(q+" mechanism",q+" review",q+" experimental study")}
 if(plan.intent==="latest"){out.push(q+" recent research",q+" 2026",q+" review")}
 if(plan.intent==="review"){out.push(q+" systematic review",q+" meta-analysis",q+" review")}
 if(plan.intent==="author"){out.push(q+" researcher",q+" authors")}
 if(plan.intent==="venue"){out.push(q+" journal",""+q+" publications")}
 if(plan.intent==="access"){out.push(q+" open access",q+" full text",q+" preprint")}
 if(!out.length){out.push(q+" review",q+" recent research",q+" applications")}
 const seen=new Set();return out.filter(x=>x.trim()&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase())).slice(0,3)
}
function intentLabel(i){return({identifier:"Identifier lookup",author:"Author-focused search",venue:"Publication venue search",latest:"Recent research",review:"Review / literature survey",definition:"Concept / definition",howto:"How-to / methods",mechanism:"How it works / mechanism",causes:"Causes / explanation",comparison:"Comparison / evidence",access:"Full-text / access-focused search",literature:"Literature discovery"})[i]||"Literature discovery"}
function evidenceExcerpt(textValue,terms){const text=clean(textValue);if(!text)return"";const sentences=text.split(/(?<=[.!?])\s+/);let best=sentences[0]||text,bestScore=0;sentences.forEach(s=>{const low=s.toLowerCase();const score=terms.reduce((n,t)=>n+(low.includes(t)?1:0),0);if(score>bestScore){best=s;bestScore=score}});return best.slice(0,420)}
function buildAnswerLayer(plan,data,failed,entities=[]){
 if(!answerEl)return;
 const evidence=data.filter(x=>x.abstract).slice(0,3);
 const question=plan.core||plan.search;
 const next=plan.intent==="latest"?"Use Newest sorting to prioritize recent publication dates.":plan.intent==="review"?"Start with papers whose title or abstract indicates a review or survey, then inspect the cited references.":plan.intent==="definition"?"Open a review or overview paper first, then follow its related research.":plan.intent==="howto"?"Look for methods, protocols and review papers, then verify the procedure in the original source.":plan.intent==="comparison"?"Compare multiple papers and look for systematic reviews or comparative studies; ranking one result as universally best would require evidence beyond search relevance.":plan.intent==="access"?"Prioritize records marked Open Access, then verify the full-text license or publisher availability before relying on a copy.":plan.intent==="mechanism"||plan.intent==="causes"?"Compare several abstracts before drawing a conclusion; mechanisms often differ by system and study design.":"Open the most relevant records, compare abstracts, then follow authors, venues and related research.";
 answerEl.innerHTML='<div class="answer-head"><div><span class="section-label">SEARCH INTERPRETATION</span><h2>'+esc(intentLabel(plan.intent))+'</h2></div><span class="answer-query">'+esc(plan.search)+'</span></div><p class="answer-summary">I interpreted your search as <strong>'+esc(question)+'</strong>. The results below are scholarly records, not an automatically generated claim, so the evidence can be checked directly.</p>'+(evidence.length?'<div class="evidence-grid">'+evidence.map(x=>'<article><div class="evidence-label">EVIDENCE FROM RECORD</div><p>'+esc(evidenceExcerpt(x.abstract,plan.terms))+(x.abstract.length>420?"…":"")+'</p><a href="'+esc(x.oaId?"article.html?id="+encodeURIComponent(x.oaId):x.url||"#")+'">Read the record →</a></article>').join("")+'</div>':'<div class="note">These records do not expose abstracts in the returned metadata. Open the source record or broaden the search for more context.</div>')+'<p class="answer-next"><strong>Next step:</strong> '+esc(next)+(failed?' One scholarly index was unavailable for this search.':'')+'</p>'+(entities.length?'<div class="answer-entities"><div class="evidence-label">'+esc(plan.intent==="author"?"PEOPLE":"PUBLICATION VENUES")+'</div>'+entities.slice(0,3).map(e=>'<a class="entity-card" href="'+esc(e.href)+'"><strong>'+esc(e.name)+'</strong><span>'+esc(plan.intent==="author"?(e.works||0)+" works · "+(e.citations||0)+" citations":(e.works||0)+" works indexed")+'</span></a>').join("")+'</div>':"");
 const qs=relatedQueries(plan);
 if(suggestionsEl){suggestionsEl.innerHTML=qs.map(q=>'<a href="?q='+encodeURIComponent(q)+'">'+esc(q)+'</a>').join("")}
}
function answerScore(x,plan){
 const text=(x.title+" "+x.abstract+" "+x.authors+" "+x.venue).toLowerCase(),title=x.title.toLowerCase();
 let s=0;
 plan.terms.forEach(t=>{if(title.includes(t))s+=6;else if(text.includes(t))s+=2});
 if(plan.intent==="review"&&/review|survey|meta-analysis/i.test(text))s+=5;
 if(plan.intent==="definition"&&/overview|fundament|review|introduction/i.test(text))s+=2;
 if(plan.intent==="mechanism"&&/mechanism|pathway|process/i.test(text))s+=4;
 if(plan.intent==="causes"&&/cause|driver|mechanism/i.test(text))s+=3;
 if(plan.intent==="access"&&x.openAccess)s+=7;
 if(plan.intent==="author"&&title.includes(plan.terms.join(" ")))s+=4;
 if(x.abstract)s+=2;
 s+=Math.log10((x.cited||0)+1)*.7;
 if(x.year){const age=Math.max(0,new Date().getFullYear()-Number(x.year));s+=Math.max(0,3-age*.08)}
 return s;
}
function card(x){const saved=getSaved().some(y=>y.id===x.id),href=x.oaId?"article.html?id="+encodeURIComponent(x.oaId):x.pageUrl||x.url||"#",badges=(x.retracted?'<span class="result-badge result-warning">Retracted</span>':"")+(x.openAccess?'<span class="result-badge result-oa">Open access</span>':"")+(x.abstract?'<span class="result-badge">Abstract</span>':"")+(x.year&&Number(x.year)>=new Date().getFullYear()-1?'<span class="result-badge">Recent</span>':"");return '<article class="result" data-record-id="'+esc(x.id)+'"><button class="save" data-save="'+esc(x.id)+'">'+(saved?"Saved":"Save")+'</button><h2><a class="result-link" href="'+esc(href)+'">'+esc(x.title)+'</a></h2><div class="meta">'+esc(x.authors||"Unknown authors")+" · "+esc(x.venue||"Unknown venue")+" · "+esc(x.year||"n.d.")+(x.cited!=null?" · "+esc(x.cited)+" citations":"")+'</div>'+('<div class="result-badges">'+badges+'</div>')+(x.abstract?'<p class="abstract">'+esc(x.abstract.slice(0,650))+(x.abstract.length>650?"…":"")+'</p>':"")+'<div class="links">'+(x.doi?'<a href="https://doi.org/'+encodeURIComponent(x.doi)+'" target="_blank" rel="noopener">DOI ↗</a>':"")+'<a href="'+esc(x.sourceUrl||x.url||"#")+'" target="_blank" rel="noopener">Source record ↗</a></div></article>'}
function linkForSaved(node){return node?.querySelector(".result-link")?.href||"#"}
function historyRecord(x,href){historyAdd({id:x.id,title:x.title,url:href,authors:x.authors,venue:x.venue,year:x.year})}
async function request(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error("Request failed");return await r.json()}finally{clearTimeout(t)}}
function crossrefItem(w){
 const key=w.DOI||w.URL||w.title?.[0]||"untitled";
 const external=w.URL||(w.DOI?"https://doi.org/"+w.DOI:"");return {id:"cr:"+key,title:w.title?.[0]||"Untitled",authors:(w.author||[]).slice(0,6).map(a=>[a.given,a.family].filter(Boolean).join(" ")).join(", "),venue:w["container-title"]?.[0]||"",year:((w.published?.["date-parts"]?.[0]||[])[0]||"").toString(),cited:w["is-referenced-by-count"]||0,doi:w.DOI||"",abstract:clean(w.abstract||""),url:external,sourceUrl:external,pageUrl:w.DOI?"article.html?doi="+encodeURIComponent(w.DOI):""};
}
async function exactDoi(doi){const j=await request("https://api.crossref.org/works/"+encodeURIComponent(doi));return j.message?[crossrefItem(j.message)]:[]}
async function openalex(q,from,to,sort){const p=new URLSearchParams({search:q,per_page:"30"});if(from||to)p.set("filter","from_publication_date:"+(from||"1900")+"-01-01,to_publication_date:"+(to||"2100")+"-12-31");if(sort==="newest")p.set("sort","publication_date:desc");if(sort==="cited")p.set("sort","cited_by_count:desc");const j=await request("https://api.openalex.org/works?"+p);return(j.results||[]).map(w=>({id:"oa:"+w.id,oaId:w.id,title:w.display_name||w.title,authors:(w.authorships||[]).slice(0,6).map(a=>a.author?.display_name).filter(Boolean).join(", "),venue:w.primary_location?.source?.display_name||"",year:(w.publication_year||"").toString(),cited:w.cited_by_count||0,doi:(w.doi||"").replace("https://doi.org/",""),abstract:reconstruct(w.abstract_inverted_index),url:w.primary_location?.landing_page_url||w.doi||w.id,sourceUrl:w.id,openAccess:!!w.open_access?.is_oa,retracted:!!w.is_retracted,topics:(w.topics||[]).map(t=>t.display_name).filter(Boolean).slice(0,4)}))}
async function openalexAuthors(q){const j=await request("https://api.openalex.org/authors?"+new URLSearchParams({search:q,per_page:"5"}));return(j.results||[]).map(a=>({id:(a.id||"").split("/").pop(),name:a.display_name||"Unknown author",works:a.works_count||0,citations:a.cited_by_count||0,href:"author.html?id="+encodeURIComponent((a.id||"").split("/").pop())+"&name="+encodeURIComponent(a.display_name||"")}))}
async function openalexSources(q){const j=await request("https://api.openalex.org/sources?"+new URLSearchParams({search:q,per_page:"5"}));return(j.results||[]).map(s=>({id:(s.id||"").split("/").pop(),name:s.display_name||"Unknown venue",works:s.works_count||0,href:"journal.html?name="+encodeURIComponent(s.display_name||"")}))}
async function crossref(q,from,to){const p=new URLSearchParams({query:q,rows:"30"});if(from||to)p.set("filter","from-pub-date:"+(from||"1900")+"-01-01,until-pub-date:"+(to||"2100-12-31"));const j=await request("https://api.crossref.org/works?"+p);return(j.message?.items||[]).map(crossrefItem)}
function dedupe(a){const seen=new Map();return a.filter(x=>{const k=(x.doi||x.title).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(seen.has(k)){const old=seen.get(k);if((x.abstract||"").length>(old.abstract||"").length){Object.assign(old,x)}return false}seen.set(k,x);return true})}
function renderSuggestions(plan){if(!suggestionsEl)return;const qs=relatedQueries(plan);suggestionsEl.innerHTML=qs.map(q=>'<a href="?q='+encodeURIComponent(q)+'">'+esc(q)+'</a>').join("")}
function syncUrl(){
 const p=new URLSearchParams(location.search);
 p.set("q",$("#query").value);
 p.set("from",$("#fromYear").value);
 p.set("to",$("#toYear").value);
 p.set("source",$("#source").value);
 p.set("sort",$("#sort").value);
 if($("#openAccessOnly")?.checked)p.set("oa","1");else p.delete("oa");
 if($("#abstractOnly")?.checked)p.set("abstract","1");else p.delete("abstract");
 history.replaceState(null,"","?"+p);
}
function applyResultFilter(){
 const input=$("#filterResults"),term=(input?.value||"").trim().toLowerCase();
 const cards=[...results.querySelectorAll(".result")];
 let visible=0;
 cards.forEach(card=>{const show=!term||card.textContent.toLowerCase().includes(term);card.hidden=!show;if(show)visible++});
 if(input&&term){const total=cards.length;input.setAttribute("aria-label","Filter results");statusEl.textContent=visible+" of "+total+" results shown";}
}
let dataCache=[],searchRun=0;
async function run(rawQ){
 const runId=++searchRun,q=rawQ.trim();if(!q){statusEl.textContent="Enter a topic, title, author or DOI.";results.innerHTML="";if(answerEl)answerEl.innerHTML="";if(suggestionsEl)suggestionsEl.innerHTML="";return}
 const plan=planQuery(q);statusEl.textContent="Understanding your question…";results.innerHTML='<div class="loading">Searching scholarly metadata…</div>';if(answerEl)answerEl.innerHTML='<div class="answer-loading">Building a research path from your query…</div>';renderSuggestions(plan);
 const from=$("#fromYear").value,to=$("#toYear").value,source=$("#source").value,sort=$("#sort").value;
 if(from&&to&&Number(from)>Number(to)){statusEl.textContent="The year range is invalid.";results.innerHTML='<div class="note">The From year must be earlier than or equal to the To year.</div>';if(answerEl)answerEl.innerHTML="";return}
 const effectiveSort=plan.intent==="latest"&&sort==="relevance"?"newest":sort;
 const openAccessOnly=$("#openAccessOnly")?.checked;
 const abstractOnly=$("#abstractOnly")?.checked;
 try{
  let settled=[];
  let entityPromise=Promise.resolve([]);
  if(plan.intent==="identifier"){
    const doiResults=await exactDoi(normalizeDoi(plan.core));
    settled=[{status:"fulfilled",value:doiResults}];
  }else{
    const jobs=[];if(source==="all"||source==="openalex")jobs.push(openalex(plan.search,from,to,effectiveSort));if(source==="all"||source==="crossref")jobs.push(crossref(plan.search,from,to));
    entityPromise=plan.intent==="author"?openalexAuthors(plan.core):plan.intent==="venue"?openalexSources(plan.core):Promise.resolve([]);
    settled=await Promise.allSettled(jobs);
    let initial=dedupe(settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value));
    if(initial.length<5&&plan.search!==plan.core){
      const fallbackJobs=[];if(source==="all"||source==="openalex")fallbackJobs.push(openalex(plan.core,from,to,effectiveSort));if(source==="all"||source==="crossref")fallbackJobs.push(crossref(plan.core,from,to));
      const fallback=await Promise.allSettled(fallbackJobs);
      if(runId!==searchRun)return;
      settled=settled.concat(fallback);
    }
  }
  if(runId!==searchRun)return;
  let data=dedupe(settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value));
  if(openAccessOnly)data=data.filter(x=>x.openAccess);
  if(abstractOnly)data=data.filter(x=>!!x.abstract);
  dataCache=data;
  if(effectiveSort==="relevance")data.sort((a,b)=>answerScore(b,plan)-answerScore(a,plan));else if(effectiveSort==="newest")data.sort((a,b)=>(b.year||"").localeCompare(a.year||""));else data.sort((a,b)=>(b.cited||0)-(a.cited||0));
  const failed=settled.some(x=>x.status==="rejected");const oaCount=data.filter(x=>x.openAccess).length,abstractCount=data.filter(x=>x.abstract).length,retractedCount=data.filter(x=>x.retracted).length;statusEl.textContent=data.length+" records found"+(failed?" · one index was unavailable":"")+(data.length?(" · "+abstractCount+" abstracts · "+oaCount+" OA signals"+(retractedCount?" · "+retractedCount+" retracted":"")):"");results.innerHTML=data.map(card).join("")||'<div class="note"><strong>No close match found.</strong><br>Try one of the related searches above, remove a specific phrase, or broaden the date range.</div>';buildAnswerLayer(plan,data,failed,[]);applyResultFilter();entityPromise.then(value=>{if(runId===searchRun&&Array.isArray(value))buildAnswerLayer(plan,data,failed,value)}).catch(()=>{});
 }catch(e){if(runId!==searchRun)return;statusEl.textContent="Search could not be completed";results.innerHTML='<div class="note">The scholarly indexes did not respond. Try again in a moment.</div>';if(answerEl)answerEl.innerHTML='<div class="note">No evidence could be loaded for this search. Please retry or use a related search.</div>'}
}
form.addEventListener("submit",e=>{e.preventDefault();syncUrl();run($("#query").value)});
results.addEventListener("click",e=>{const link=e.target.closest(".result-link");if(link){const node=link.closest(".result"),id=node?.dataset.recordId,x=dataCache.find(z=>z.id===id);if(x)historyRecord(x,link.href);return}const id=e.target.dataset.save;if(!id)return;const node=[...results.querySelectorAll(".result")].find(n=>n.querySelector("[data-save='"+CSS.escape(id)+"']"));if(!node)return;const already=getSaved().some(x=>x.id===id);if(already){removeSaved(id);e.target.textContent="Save";return}const x=dataCache.find(z=>z.id===id);save(Object.assign({},x||{id,title:node.querySelector("h2")?.textContent||id,url:node.querySelector("h2 a")?.href||"#"},{pageUrl:linkForSaved(node)}));e.target.textContent="Saved"});
$("#savedBtn")?.addEventListener("click",()=>{location.href="saved.html"});
const p=new URLSearchParams(location.search),initial=p.get("q");$("#fromYear").value=p.get("from")||"";$("#toYear").value=p.get("to")||"";$("#source").value=p.get("source")||"all";$("#sort").value=p.get("sort")||"relevance";if($("#openAccessOnly"))$("#openAccessOnly").checked=p.get("oa")==="1";if($("#abstractOnly"))$("#abstractOnly").checked=p.get("abstract")==="1";if(initial){$("#query").value=initial;$("#topQ")&&($("#topQ").value=initial);run(initial)}

["source","sort","openAccessOnly","abstractOnly"].forEach(id=>{$("#"+id)?.addEventListener("change",()=>{if($("#query").value.trim()){syncUrl();run($("#query").value)}})});$("#filterResults")?.addEventListener("input",applyResultFilter);
