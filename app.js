const $=s=>document.querySelector(s);
const form=$("#searchForm"),queryInput=$("#query"),results=$("#results"),statusEl=$("#status");
const answerEl=$("#answerLayer"),suggestionsEl=$("#querySuggestions"),resultFilter=$("#filterResults");

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const clean=s=>String(s??"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim();
const safeHref=value=>{const v=String(value||"").trim();return (/^https?:\/\//i.test(v)||/^(?:article|author|journal|search|saved|history)\.html(?:[?#].*)?$/i.test(v))?v:"#"};
const normalizeDoi=q=>q.trim().replace(/^doi:\s*/i,"").replace(/^doi\s+/i,"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"").replace(/^doi\.org\//i,"").replace(/[.,;)>]+$/,"").trim();

function loadJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||"");return v??fallback}catch{return fallback}}
function getSaved(){return loadJson("academicSaved",[])}
function getCompared(){return loadJson("academicCompare",[])}
function setCompared(list){localStorage.setItem("academicCompare",JSON.stringify(list.slice(0,4)))}
function renderCompareBar(message=""){const bar=$("#compareBar"),count=$("#compareCount"),hint=$("#compareHint");if(!bar)return;const n=getCompared().length;bar.hidden=n===0;if(count)count.textContent=n;if(hint)hint.textContent=message||"Compare papers side by side."}
function syncCompareControls(){const ids=new Set(getCompared().map(x=>x.id));document.querySelectorAll("[data-compare]").forEach(input=>{input.checked=ids.has(input.dataset.compare)});renderCompareBar()}
function saveRecord(item){if(!item)return;const next=[item,...getSaved().filter(x=>x.id!==item.id)].slice(0,100);localStorage.setItem("academicSaved",JSON.stringify(next))}
function removeSaved(id){localStorage.setItem("academicSaved",JSON.stringify(getSaved().filter(x=>x.id!==id)))}
function addHistory(item){if(!item)return;const next=[item,...loadJson("academicHistory",[]).filter(x=>x.id!==item.id)].slice(0,30);localStorage.setItem("academicHistory",JSON.stringify(next))}

function reconstructInverted(index){
  if(!index)return"";
  const words=[];
  Object.entries(index).forEach(([word,positions])=>(positions||[]).forEach(p=>{words[p]=word}));
  return words.join(" ").replace(/\s+/g," ").trim();
}

const STOP=new Set("a an and are as at be by can could did do does for from how i in is it me my of on or our research the this to what when where which why with would you your".split(" "));
function tokens(q){return q.toLowerCase().replace(/[^a-z0-9\s-]/g," ").split(/\s+/).filter(Boolean).filter(x=>x.length>1&&!STOP.has(x))}
const SEARCH_ALIASES=[
  [/\bli[- ]?ion\b/gi,"lithium-ion"],
  [/\blfp\b/gi,"lithium iron phosphate"],
  [/\bnmc\b/gi,"nickel manganese cobalt"],
  [/\bco2\b/gi,"carbon dioxide"],
  [/\bcrispr[- ]?cas9\b/gi,"CRISPR Cas9"],
  [/\bpeg\b/gi,"polyethylene glycol"]
];
function searchVariants(core){
  const base=core.trim(),variants=[base];
  for(const [pattern,replacement] of SEARCH_ALIASES){
    if(pattern.test(base)&&pattern.source){
      pattern.lastIndex=0;
      const v=base.replace(pattern,replacement).replace(/\s+/g," ").trim();
      if(v.toLowerCase()!==base.toLowerCase()&&!variants.some(x=>x.toLowerCase()===v.toLowerCase()))variants.push(v);
      if(variants.length>=3)break;
    }
    pattern.lastIndex=0;
  }
  return variants;
}
function hasExactPhrase(item,core){
  const phrase=core.trim().toLowerCase().replace(/\s+/g," ");
  if(!phrase)return false;
  return String(item.title||"").toLowerCase().replace(/\s+/g," ").includes(phrase);
}
function parseQueryHints(q){
  const raw=q.trim();
  const authorMatch=raw.match(/^author\s*:\s*(.+)$/i);
  const journalMatch=raw.match(/^(?:journal|venue)\s*:\s*(.+)$/i);
  const phraseMatch=raw.match(/"([^"]+)"/);
  return{
    author:authorMatch?.[1]?.trim()||"",
    venue:journalMatch?.[1]?.trim()||"",
    phrase:phraseMatch?.[1]?.replace(/\s+/g," ").trim()||""
  };
}
function intentOf(q){
  const x=q.trim().toLowerCase(),doi=normalizeDoi(q),hints=parseQueryHints(q);
  if(hints.author)return"author";
  if(hints.venue)return"venue";
  if(/(^|\s)10\.\d{4,9}\/\S+/i.test(doi))return"identifier";
  if(/^https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/\S+$/i.test(x)||/^doi:\s*10\.\d{4,9}\/\S+$/i.test(x))return"identifier";
  if(/\b(open access|free paper|free papers|full text|pdf)\b/.test(x))return"access";
  if(/\b(latest|recent|newest|this year)\b/.test(x))return"latest";
  if(/\b(review|systematic review|survey|literature review)\b/.test(x))return"review";
  if(/\b(compare|comparison|versus|vs\.)\b/.test(x))return"comparison";
  if(/\b(who is|author|authors|researcher|scientist)\b/.test(x))return"author";
  if(/\b(journal|venue|published in)\b/.test(x))return"venue";
  if(/\b(how to)\b/.test(x))return"howto";
  if(/\b(why does|why do|why is|what causes|what cause|causes?)\b/.test(x))return"causes";
  if(/\b(how does|how do|how can|mechanism|process)\b/.test(x))return"mechanism";
  if(/\b(what is|what are|define|definition|tell me about)\b/.test(x))return"definition";
  return"literature";
}
function stripQuestion(q){
  return q.replace(/\b(what is|what are|define|definition of|how does|how do|how can|how to|why does|why do|why is|what causes|what cause|who is|who are|tell me about|which|latest research on|recent research on|literature review on|review of)\b/gi," ").replace(/[?]+/g," ").replace(/\s+/g," ").trim();
}
function modeIntent(){
  const mode=$("#mode")?.value||"auto";
  return mode==="auto"?"":mode;
}
function planQuery(q){
  const forced=modeIntent(),intent=forced||intentOf(q),hints=parseQueryHints(q),operatorCore=hints.author||hints.venue||hints.phrase,core=intent==="identifier"?normalizeDoi(q):(operatorCore||stripQuestion(q)||q.trim());
  let search=core;
  if(intent==="latest")search=core+" recent research";
  if(intent==="review")search=/\breview\b/i.test(core)?core:core+" review";
  if(intent==="definition")search=core+" overview";
  if(intent==="howto")search=core+" method";
  if(intent==="mechanism")search=core+" mechanism";
  if(intent==="causes")search=core+" mechanism";
  if(intent==="comparison")search=core+" comparison";
  if(intent==="access")search=core+" open access";
  return{intent,core,search,terms:tokens(core),variants:searchVariants(core),exactPhrase:hints.phrase||""};
}
function relatedQueries(plan){
  const q=plan.core,out=[];
  if(plan.intent==="definition")out.push(q+" fundamentals",q+" review",q+" introduction");
  else if(plan.intent==="mechanism"||plan.intent==="causes")out.push(q+" mechanism",q+" review",q+" experimental study");
  else if(plan.intent==="howto")out.push(q+" method",q+" protocol",q+" guide");
  else if(plan.intent==="latest")out.push(q+" recent research",q+" "+new Date().getFullYear(),q+" review");
  else if(plan.intent==="review")out.push(q+" systematic review",q+" meta-analysis",q+" review");
  else if(plan.intent==="author")out.push(q+" researcher",q+" authors");
  else if(plan.intent==="venue")out.push(q+" journal",q+" publications");
  else if(plan.intent==="access")out.push(q+" open access",q+" full text",q+" preprint");
  else if(plan.intent==="comparison")out.push(q+" comparison",q+" review",q+" evidence");
  else out.push(q+" review",q+" recent research",q+" applications");
  const seen=new Set();
  return out.filter(x=>x.trim()&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase())).slice(0,3);
}
function intentLabel(intent){
  return({identifier:"Identifier lookup",author:"Author-focused search",venue:"Publication venue search",latest:"Recent research",review:"Review / literature survey",definition:"Concept / definition",howto:"How-to / methods",mechanism:"How it works / mechanism",causes:"Causes / explanation",comparison:"Comparison / evidence",access:"Full-text / access-focused search",literature:"Literature discovery"})[intent]||"Literature discovery";
}

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
      if(error?.name==="AbortError"&&attempt===2)throw error;
      if(error?.name!=="AbortError"&&attempt===2)throw error;
    }finally{clearTimeout(timer)}
    await new Promise(resolve=>setTimeout(resolve,450*(attempt+1)));
  }
  throw lastError||new Error("Request failed");
}

function mapOpenAlex(w){
  return{
    id:"oa:"+w.id,oaId:w.id,title:w.display_name||w.title||"Untitled",
    authors:(w.authorships||[]).slice(0,6).map(a=>a.author?.display_name).filter(Boolean).join(", "),
    authorObjects:(w.authorships||[]).slice(0,6).map(a=>({given:a.author?.display_name||"",family:"",orcid:a.author?.orcid||""})).filter(a=>a.given),
    venue:w.primary_location?.source?.display_name||"",venueId:w.primary_location?.source?.id||"",year:String(w.publication_year||""),
    cited:w.cited_by_count||0,doi:String(w.doi||"").replace(/^https?:\/\/doi\.org\//i,""),
    abstract:reconstructInverted(w.abstract_inverted_index),
    url:w.primary_location?.landing_page_url||w.doi||w.id,sourceUrl:w.id,
    fullTextUrl:w.open_access?.is_oa?(w.best_oa_location?.pdf_url||w.best_oa_location?.landing_page_url||""):"",
    referencedWorks:Array.isArray(w.referenced_works)?w.referenced_works.slice(0,8):[],
    openAccess:!!w.open_access?.is_oa,retracted:!!w.is_retracted,updated:false,updateTypes:[],
    topics:(w.topics||[]).map(t=>t.display_name).filter(Boolean).slice(0,4)
  };
}
function mapCrossref(w){
  const key=w.DOI||w.URL||w.title?.[0]||"untitled";
  const external=w.URL||(w.DOI?"https://doi.org/"+w.DOI:"");
  const preferredLink=(w.link||[]).find(l=>/application\/pdf/i.test(l?.["content-type"]||""))||w.link?.find(l=>l?.URL);
  const fullTextUrl=preferredLink?.URL||"";
  const openAccess=Array.isArray(w.license)&&w.license.length>0;
  const licenseUrl=w.license?.find(x=>x?.URL)?.URL||"";
  return{
    id:"cr:"+key,title:w.title?.[0]||"Untitled",
    authors:(w.author||[]).slice(0,6).map(a=>[a.given,a.family].filter(Boolean).join(" ")).join(", "),
    authorObjects:(w.author||[]).slice(0,6).map(a=>({given:a.given||"",family:a.family||"",orcid:a.ORCID||""})),
    venue:w["container-title"]?.[0]||"",
    year:String(((w.published?.["date-parts"]?.[0]||[])[0]||"")),
    cited:w["is-referenced-by-count"]||0,doi:w.DOI||"",abstract:clean(w.abstract||""),
    url:external,sourceUrl:external,fullTextUrl,openAccess,licenseUrl,
    updated:Array.isArray(w["update-to"])&&w["update-to"].length>0,
    updateTypes:(w["update-to"]||[]).map(x=>x.type||x.label).filter(Boolean),
    retracted:Array.isArray(w["update-to"])&&w["update-to"].some(x=>String(x.type||"").toLowerCase()==="retraction"),
    pageUrl:w.DOI?"article.html?doi="+encodeURIComponent(w.DOI):""
  };
}
async function searchOpenAlex(q,from,to,sort,page=1){
  const p=new URLSearchParams({search:q,per_page:"50",page:String(page)});
  if(from||to)p.set("filter","from_publication_date:"+(from||"1900")+"-01-01,to_publication_date:"+(to||"2100")+"-12-31");
  if(sort==="newest")p.set("sort","publication_date:desc");
  if(sort==="cited")p.set("sort","cited_by_count:desc");
  const data=await request("https://api.openalex.org/works?"+p);
  return{items:(data.results||[]).map(mapOpenAlex),nextPage:(data.results?.length===50)?page+1:null};
}
async function searchCrossref(q,from,to,cursor="*"){
  const p=new URLSearchParams({query:q,rows:"50",cursor});
  if(from||to)p.set("filter","from-pub-date:"+(from||"1900")+"-01-01,until-pub-date:"+(to||"2100-12-31"));
  const data=await request("https://api.crossref.org/v1/works?"+p);
  return{items:(data.message?.items||[]).map(mapCrossref),nextCursor:data.message?.["next-cursor"]||""};
}
async function exactDoi(doi){
  try{
    const data=await request("https://api.crossref.org/v1/works/"+encodeURIComponent(doi));
    if(data.message)return[mapCrossref(data.message)];
  }catch{}
  try{
    const data=await request("https://api.openalex.org/works?"+new URLSearchParams({search:doi,per_page:"5"}));
    return(data.results||[]).filter(w=>String(w.doi||"").toLowerCase().replace(/^https?:\/\/doi\.org\//i,"")===doi.toLowerCase()).slice(0,1).map(mapOpenAlex);
  }catch{return[]}
}
async function searchEntities(plan){
  try{
    if(plan.intent==="author"){
      const data=await request("https://api.openalex.org/authors?"+new URLSearchParams({search:plan.core,per_page:"5"}));
      return{type:"author",items:(data.results||[]).map(a=>({name:a.display_name||"Unknown author",works:a.works_count||0,citations:a.cited_by_count||0,href:"author.html?id="+encodeURIComponent((a.id||"").split("/").pop())+"&name="+encodeURIComponent(a.display_name||"")}))};
    }
    if(plan.intent==="venue"){
      const data=await request("https://api.openalex.org/sources?"+new URLSearchParams({search:plan.core,per_page:"5"}));
      return{type:"venue",items:(data.results||[]).map(s=>({name:s.display_name||"Unknown venue",works:s.works_count||0,href:"journal.html?name="+encodeURIComponent(s.display_name||"")}))};
    }
  }catch{}
  return{type:"",items:[]};
}

function mergeRecords(old,item){
  const merged={...old};
  for(const key of ["title","authors","venue","year","doi","url","sourceUrl","fullTextUrl","licenseUrl","pageUrl","oaId","venueId"])if(!merged[key]&&item[key])merged[key]=item[key];
  if((item.abstract||"").length>(merged.abstract||"").length)merged.abstract=item.abstract;
  merged.cited=Math.max(Number(old.cited)||0,Number(item.cited)||0);
  merged.openAccess=!!old.openAccess||!!item.openAccess;
  merged.retracted=!!old.retracted||!!item.retracted;
  merged.updated=!!old.updated||!!item.updated;
  merged.updateTypes=[...new Set([...(old.updateTypes||[]),...(item.updateTypes||[])])];
  merged.topics=[...new Set([...(old.topics||[]),...(item.topics||[])])].slice(0,6);
  merged.authorObjects=old.authorObjects?.length?old.authorObjects:(item.authorObjects||[]);
  merged.referencedWorks=old.referencedWorks?.length?old.referencedWorks:(item.referencedWorks||[]);
  if(item.oaId)merged.oaId=item.oaId;
  if(item.venueId)merged.venueId=item.venueId;
  if(item.fullTextUrl)merged.fullTextUrl=item.fullTextUrl;
  if(item.licenseUrl)merged.licenseUrl=item.licenseUrl;
  if(item.sourceUrl&&String(item.sourceUrl).includes("openalex.org"))merged.sourceUrl=item.sourceUrl;
  if(item.pageUrl)merged.pageUrl=item.pageUrl;
  if(item.retracted)merged.retracted=true;
  return merged;
}
function dedupe(records){
  const seen=new Map(),out=[];
  for(const item of records){
    const key=String(item.doi||item.title||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    if(!key)continue;
    if(seen.has(key)){
      const old=seen.get(key);
      Object.assign(old,mergeRecords(old,item));
      continue;
    }
    seen.set(key,{...item});out.push(seen.get(key));
  }
  return out;
}

function matchSummary(item,plan){
  const terms=plan.terms;
  const titleHits=terms.filter(t=>(item.title||"").toLowerCase().includes(t)).length;
  const bodyHits=terms.filter(t=>(item.abstract||"").toLowerCase().includes(t)).length;
  const flags=[];
  if(plan.exactPhrase&&hasExactPhrase(item,plan.exactPhrase))flags.push("exact phrase");
  if(titleHits)flags.push("title "+titleHits+"/"+Math.max(terms.length,1));
  if(bodyHits)flags.push("abstract "+bodyHits);
  if(item.openAccess)flags.push("OA");
  if(item.fullTextUrl)flags.push("full text");
  if(plan.intent==="review"&&/review|survey|meta-analysis/i.test(item.title+" "+item.abstract))flags.push("review signal");
  if(plan.intent==="comparison"&&/compar|versus|vs\.|benchmark/i.test(item.title+" "+item.abstract))flags.push("comparison signal");
  return flags.slice(0,4).join(" · ")||"keyword match";
}
function resultCard(item){
  const saved=getSaved().some(x=>x.id===item.id);
  const compared=getCompared().some(x=>x.id===item.id);
  const href=safeHref(item.oaId?"article.html?id="+encodeURIComponent(item.oaId):item.pageUrl||item.url||"#");
  const badges=(item.retracted?'<span class="result-badge result-warning">Retraction signal</span>':"")+(item.updated&&!item.retracted?'<span class="result-badge result-update">Updated record</span>':"")+(item.openAccess?'<span class="result-badge result-oa">Open access</span>':"")+(item.fullTextUrl?'<span class="result-badge">Full text</span>':"")+(item.abstract?'<span class="result-badge">Abstract</span>':"");
  const links=(item.fullTextUrl?'<a href="'+safeHref(item.fullTextUrl)+'" target="_blank" rel="noopener">Full text ↗</a>':"")+(item.doi?'<a href="https://doi.org/'+encodeURIComponent(item.doi)+'" target="_blank" rel="noopener">DOI ↗</a>':"")+(item.sourceUrl?'<a href="'+safeHref(item.sourceUrl)+'" target="_blank" rel="noopener">Source record ↗</a>':"");
  const why=matchSummary(item,currentPlan||{terms:[],intent:"literature"});
  return '<article class="result" data-record-id="'+esc(item.id)+'"><div class="result-tools"><span class="match-summary" title="Signals used in result ordering">Why this result: '+esc(why)+'</span><label class="compare-toggle"><input type="checkbox" data-compare="'+esc(item.id)+'" '+(compared?"checked":"")+'> Compare</label><button class="save" data-save="'+esc(item.id)+'">'+(saved?"Saved":"Save")+'</button></div><h2><a class="result-link" href="'+href+'">'+esc(item.title)+'</a></h2><div class="meta">'+esc(item.authors||"Unknown authors")+" · "+esc(item.venue||"Unknown venue")+" · "+esc(item.year||"n.d.")+(item.cited!=null?" · "+esc(item.cited)+" citations":"")+'</div><div class="result-badges">'+badges+'</div>'+(item.abstract?'<p class="abstract">'+esc(item.abstract.slice(0,650))+(item.abstract.length>650?"…":"")+'</p>':"")+'<div class="links">'+links+'</div></article>';
}
function syncUrl(){
  const p=new URLSearchParams(location.search);
  p.set("q",queryInput.value.trim());p.set("from",$("#fromYear").value);p.set("to",$("#toYear").value);p.set("source",$("#source").value);p.set("sort",$("#sort").value);
  const mode=$("#mode")?.value||"auto";if(mode==="auto")p.delete("mode");else p.set("mode",mode);
  if($("#openAccessOnly")?.checked)p.set("oa","1");else p.delete("oa");
  if($("#abstractOnly")?.checked)p.set("abstract","1");else p.delete("abstract");
  if($("#doiOnly")?.checked)p.set("doi","1");else p.delete("doi");
  history.replaceState(null,"","?"+p);
}
let dataCache=[],searchRun=0,baseStatus="",currentPlan=null;
function applyResultFilter(){
  const term=(resultFilter?.value||"").trim().toLowerCase();
  const cards=[...results.querySelectorAll(".result")];
  let shown=0;
  cards.forEach(card=>{const visible=!term||card.textContent.toLowerCase().includes(term);card.hidden=!visible;if(visible)shown++});
  if(term)statusEl.textContent=shown+" of "+cards.length+" results shown";else if(baseStatus)statusEl.textContent=baseStatus;
}
async function run(raw){
  const runId=++searchRun,q=String(raw||"").trim();
  if(!q){baseStatus="";statusEl.textContent="Enter a topic, title, author or DOI.";results.innerHTML="";if(answerEl)answerEl.innerHTML="";if(suggestionsEl)suggestionsEl.innerHTML="";return}
  const plan=planQuery(q);
  currentPlan=plan;
  document.querySelector(".more-results")?.remove();
  statusEl.textContent="Understanding your question…";
  results.setAttribute("aria-busy","true");
  results.innerHTML='<div class="loading">Searching scholarly metadata…</div>';
  if(answerEl)answerEl.innerHTML='<div class="answer-loading">Finding evidence and research paths…</div>';
  const from=$("#fromYear").value,to=$("#toYear").value,source=$("#source").value,sort=$("#sort").value;
  if(from&&to&&Number(from)>Number(to)){baseStatus="";statusEl.textContent="The year range is invalid.";results.innerHTML='<div class="note">The From year must be earlier than or equal to the To year.</div>';results.removeAttribute("aria-busy");if(answerEl)answerEl.innerHTML="";return}
  const oaOnly=$("#openAccessOnly")?.checked,abstractOnly=$("#abstractOnly")?.checked,doiOnly=$("#doiOnly")?.checked;
  const entityPromise=searchEntities(plan);
  try{
    let settled=[];
    if(plan.intent==="identifier"){
      const exact=await exactDoi(plan.core);
      settled=[{status:"fulfilled",value:{items:exact,nextPage:null,nextCursor:""}}];
    }else{
      const jobs=[];
      const variants=[plan.search,...plan.variants.filter(v=>v!==plan.core&&v!==plan.search)].slice(0,3);
      for(const variant of variants){
        if(source==="all"||source==="openalex")jobs.push(searchOpenAlex(variant,from,to,sort,1));
        if(source==="all"||source==="crossref")jobs.push(searchCrossref(variant,from,to,"*"));
      }
      settled=await Promise.allSettled(jobs);
      let initial=dedupe(settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value.items||[]));
      if(initial.length<5&&plan.search!==plan.core){
        const fallbackJobs=[];
        if(source==="all"||source==="openalex")fallbackJobs.push(searchOpenAlex(plan.core,from,to,sort,2));
        if(source==="all"||source==="crossref")fallbackJobs.push(searchCrossref(plan.core,from,to,"*"));
        const fallback=await Promise.allSettled(fallbackJobs);
        if(runId!==searchRun)return;
        settled=settled.concat(fallback);
      }
    }
    if(runId!==searchRun)return;
    let data=dedupe(settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value.items||[]));
    window.__academicPaging={
      openalex:Math.max(0,...settled.filter(x=>x.status==="fulfilled").map(x=>x.value.nextPage||0)),
      crossref:settled.filter(x=>x.status==="fulfilled").map(x=>x.value.nextCursor||"").find(Boolean)||""
    };
    if(oaOnly)data=data.filter(x=>!!x.openAccess);
    if(abstractOnly)data=data.filter(x=>!!x.abstract);
    if(doiOnly)data=data.filter(x=>!!x.doi);
    if(sort==="relevance"||plan.intent!=="identifier")data.sort((a,b)=>relevanceScore(b,plan)-relevanceScore(a,plan));
    if(sort==="newest")data.sort((a,b)=>(b.year||"").localeCompare(a.year||""));
    if(sort==="cited")data.sort((a,b)=>(b.cited||0)-(a.cited||0));
    dataCache=data;
    const failed=settled.some(x=>x.status==="rejected"),oaCount=data.filter(x=>x.openAccess).length,abstractCount=data.filter(x=>x.abstract).length,doiCount=data.filter(x=>x.doi).length;
    baseStatus=data.length+" records found"+(failed?" · one index was unavailable":"")+(data.length?(" · "+abstractCount+" abstracts · "+doiCount+" DOI"+(oaCount?" · "+oaCount+" OA signals":"")):"");
    statusEl.textContent=baseStatus;
    results.innerHTML=data.map(resultCard).join("")||'<div class="note"><strong>No close match found.</strong><br>Try a related search, remove a phrase, or broaden the date range.</div>';
    if(data.length)results.insertAdjacentHTML("afterend",'<div class="more-results"><button id="loadMore" class="plain-btn" type="button">Load more results</button><span id="loadMoreStatus" class="meta"></span></div>');
    results.removeAttribute("aria-busy");
    applyResultFilter();
    syncCompareControls();
    buildAnswer(plan,data,failed,{type:"",items:[]});
    entityPromise.then(entityResult=>{if(runId===searchRun&&entityResult?.items?.length)buildAnswer(plan,data,failed,entityResult)}).catch(()=>{});
  }catch(error){
    if(runId!==searchRun)return;
    results.removeAttribute("aria-busy");
    if(plan.intent==="identifier"){baseStatus="";statusEl.textContent="DOI record not found";results.innerHTML='<div class="note">No scholarly record was found for this DOI. Check the identifier and try again.</div>';if(answerEl)answerEl.innerHTML="";return}
    baseStatus="";statusEl.textContent="Search could not be completed";results.innerHTML='<div class="note">The scholarly indexes did not respond. Try again in a moment.</div>';if(answerEl)answerEl.innerHTML='<div class="note">No evidence could be loaded for this search. Please retry or use a related search.</div>';
  }
}

form?.addEventListener("submit",e=>{e.preventDefault();syncUrl();run(queryInput.value)});
results?.addEventListener("click",e=>{
  const link=e.target.closest(".result-link");
  if(link){
    const node=link.closest(".result"),item=dataCache.find(x=>x.id===node?.dataset.recordId);
    if(item)addHistory({id:item.id,title:item.title,url:link.href,authors:item.authors,venue:item.venue,year:item.year});
    return;
  }
  const compareInput=e.target.closest("[data-compare]");
  if(compareInput){
    const id=compareInput.dataset.compare,item=dataCache.find(x=>x.id===id),current=getCompared();
    if(!item)return;
    if(compareInput.checked){
      if(current.some(x=>x.id===id))return;
      if(current.length>=4){compareInput.checked=false;renderCompareBar("Choose up to 4 papers for one comparison.");return}
      setCompared([...current,item]);
    }else setCompared(current.filter(x=>x.id!==id));
    renderCompareBar();
    return;
  }
  const saveButton=e.target.closest("[data-save]");
  if(!saveButton)return;
  const id=saveButton.dataset.save,item=dataCache.find(x=>x.id===id);
  if(!item)return;
  if(getSaved().some(x=>x.id===id)){removeSaved(id);saveButton.textContent="Save"}else{saveRecord({...item,pageUrl:saveButton.closest(".result")?.querySelector(".result-link")?.href||"#"});saveButton.textContent="Saved"}
});
$("#savedBtn")?.addEventListener("click",()=>location.href="saved.html");
resultFilter?.addEventListener("input",applyResultFilter);
$("#clearCompare")?.addEventListener("click",()=>{setCompared([]);syncCompareControls();});
results?.parentElement?.addEventListener("click",async e=>{
  const button=e.target.closest("#loadMore");
  if(!button)return;
  button.disabled=true;
  const status=document.querySelector("#loadMoreStatus");
  try{
    const plan=currentPlan;if(!plan)return;
    const from=$("#fromYear").value,to=$("#toYear").value,source=$("#source").value,sort=$("#sort").value;
    const page=window.__academicPaging?.openalex||0,cursor=window.__academicPaging?.crossref||"";
    const jobs=[];
    if((source==="all"||source==="openalex")&&page>0)jobs.push(searchOpenAlex(plan.search,from,to,sort,page));
    if((source==="all"||source==="crossref")&&cursor)jobs.push(searchCrossref(plan.search,from,to,cursor));
    const more=await Promise.allSettled(jobs);
    const extra=dedupe(more.filter(x=>x.status==="fulfilled").flatMap(x=>x.value.items||[])).filter(x=>!dataCache.some(y=>y.id===x.id));
    dataCache=dedupe([...dataCache,...extra]);
    const merged=[...dataCache];
    if(sort==="relevance"||plan.intent!=="identifier")merged.sort((a,b)=>relevanceScore(b,plan)-relevanceScore(a,plan));
    if(sort==="newest")merged.sort((a,b)=>(b.year||"").localeCompare(a.year||""));
    if(sort==="cited")merged.sort((a,b)=>(b.cited||0)-(a.cited||0));
    results.innerHTML=merged.map(resultCard).join("");
    syncCompareControls();
    applyResultFilter();
    window.__academicPaging.openalex=more.filter(x=>x.status==="fulfilled").map(x=>x.value.nextPage||null).find(Boolean)||null;
    window.__academicPaging.crossref=more.filter(x=>x.status==="fulfilled").map(x=>x.value.nextCursor||"").find(Boolean)||"";
    if(status)status.textContent=extra.length?extra.length+" more results loaded.":"No additional results available.";
    if(!window.__academicPaging.openalex&&!window.__academicPaging.crossref)button.hidden=true;
  }catch{if(status)status.textContent="Could not load more results. Try again."}
  finally{if(!button.hidden)button.disabled=false;}
});
$("#source")?.addEventListener("change",()=>{if(queryInput.value.trim()){syncUrl();run(queryInput.value)}});
$("#sort")?.addEventListener("change",()=>{if(queryInput.value.trim()){syncUrl();run(queryInput.value)}});
["openAccessOnly","abstractOnly","doiOnly","mode"].forEach(id=>$("#"+id)?.addEventListener("change",()=>{if(queryInput.value.trim()){syncUrl();run(queryInput.value)}}));
document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){e.preventDefault();queryInput?.focus()}});
const params=new URLSearchParams(location.search),initial=params.get("q")||"";
$("#fromYear").value=params.get("from")||"";
$("#toYear").value=params.get("to")||"";
$("#source").value=params.get("source")||"all";
$("#sort").value=params.get("sort")||"relevance";
if($("#mode"))$("#mode").value=params.get("mode")||"auto";
if($("#openAccessOnly"))$("#openAccessOnly").checked=params.get("oa")==="1";
if($("#abstractOnly"))$("#abstractOnly").checked=params.get("abstract")==="1";
if($("#doiOnly"))$("#doiOnly").checked=params.get("doi")==="1";
if(initial){queryInput.value=initial;$("#topQ")&&($("#topQ").value=initial);run(initial)}
