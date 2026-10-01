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
  const fields=[item.title,item.abstract,item.authors,item.venue].map(x=>String(x||"").toLowerCase().replace(/\s+/g," "));
  return fields.some(field=>field.includes(phrase));
}
function parseQueryHints(q){
  const raw=q.trim();
  const phraseMatch=raw.match(/"([^"]+)"/);
  const authorMatch=raw.match(/\bauthor\s*:\s*(?:"([^"]+)"|(\S+))/i);
  const journalMatch=raw.match(/\b(?:journal|venue)\s*:\s*(?:"([^"]+)"|(\S+))/i);
  let remainder=raw.replace(/"[^"]+"/g," ").replace(/\bauthor\s*:\s*(?:"[^"]+"|\S+)/ig," ").replace(/\b(?:journal|venue)\s*:\s*(?:"[^"]+"|\S+)/ig," ").replace(/\s+/g," ").trim();
  return{
    author:(authorMatch?.[1]||authorMatch?.[2]||"").trim(),
    venue:(journalMatch?.[1]||journalMatch?.[2]||"").trim(),
    phrase:phraseMatch?.[1]?.replace(/\s+/g," ").trim()||"",
    remainder
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
  const forced=modeIntent(),intent=forced||intentOf(q),hints=parseQueryHints(q);
  const semanticParts=[];
  if(hints.remainder)semanticParts.push(stripQuestion(hints.remainder));
  if(hints.phrase)semanticParts.push(hints.phrase);
  if(hints.author&&!hints.remainder&&!hints.phrase)semanticParts.push(hints.author);
  if(hints.venue&&!hints.remainder&&!hints.phrase)semanticParts.push(hints.venue);
  const semanticCore=semanticParts.filter(Boolean).join(" ").replace(/\s+/g," ").trim();
  const core=intent==="identifier"?normalizeDoi(q):(semanticCore||stripQuestion(q)||q.trim());
  let search=core;
  if(intent==="latest")search=core+" recent research";
  if(intent==="review")search=/\breview\b/i.test(core)?core:core+" review";
  if(intent==="definition")search=core+" overview";
  if(intent==="howto")search=core+" method";
  if(intent==="mechanism")search=core+" mechanism";
  if(intent==="causes")search=core+" mechanism";
  if(intent==="comparison")search=core+" comparison";
  if(intent==="access")search=core+" open access";
  return{intent,core,search,terms:tokens(core),variants:searchVariants(core),exactPhrase:hints.phrase||"",authorHint:hints.author||"",venueHint:hints.venue||""};
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

const API_CACHE_TTL=120000;
function readApiCache(url){
  try{
    const raw=sessionStorage.getItem("academicApiCache:"+url);
    if(!raw)return null;
    const item=JSON.parse(raw);
    if(!item||Date.now()-item.time>API_CACHE_TTL){sessionStorage.removeItem("academicApiCache:"+url);return null}
    return item.data;
  }catch{return null}
}
function writeApiCache(url,data){
  try{sessionStorage.setItem("academicApiCache:"+url,JSON.stringify({time:Date.now(),data}));}catch{}
}
async function request(url){
  const cached=readApiCache(url);
  if(cached)return cached;
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(url,{signal:controller.signal});
      if(response.ok){
        const data=await response.json();
        writeApiCache(url,data);
        return data;
      }
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

function mapOpenAlex(w){
  return{
    id:"oa:"+w.id,oaId:w.id,title:w.display_name||w.title||"Untitled",
    authors:(w.authorships||[]).slice(0,6).map(a=>a.author?.display_name).filter(Boolean).join(", "),
    authorIds:(w.authorships||[]).slice(0,6).map(a=>a.author?.id).filter(Boolean),
    authorObjects:(w.authorships||[]).slice(0,6).map(a=>({given:a.author?.display_name||"",family:"",orcid:a.author?.orcid||""})).filter(a=>a.given),
    venue:w.primary_location?.source?.display_name||"",venueId:w.primary_location?.source?.id||"",year:String(w.publication_year||""),
    cited:w.cited_by_count||0,doi:String(w.doi||"").replace(/^https?:\/\/doi\.org\//i,""),
    abstract:reconstructInverted(w.abstract_inverted_index),
    url:w.primary_location?.landing_page_url||w.doi||w.id,sourceUrl:w.id,
    fullTextUrl:w.open_access?.is_oa?(w.best_oa_location?.pdf_url||w.best_oa_location?.landing_page_url||""):"",
    referencedWorks:Array.isArray(w.referenced_works)?w.referenced_works.slice(0,8):[],
    openAccess:!!w.open_access?.is_oa,retracted:!!w.is_retracted,updated:false,updateTypes:[],
    topics:(w.topics||[]).map(t=>t.display_name).filter(Boolean).slice(0,4),
    topicIds:(w.topics||[]).map(t=>t.id).filter(Boolean).slice(0,6),sourceId:w.primary_location?.source?.id||"",
    sources:["OpenAlex"],sourceCount:1
  };
}
function mapCrossref(w){
  const key=w.DOI||w.URL||w.title?.[0]||"untitled";
  const external=w.URL||(w.DOI?"https://doi.org/"+w.DOI:"");
  const preferredLink=(w.link||[]).find(l=>/application\/pdf/i.test(l?.["content-type"]||""))||w.link?.find(l=>l?.URL);
  const fullTextUrl=preferredLink?.URL||"";
  const licenseUrl=w.license?.find(x=>x?.URL)?.URL||"";
  const licenseSignal=!!licenseUrl;
  const openAccess=/creativecommons\.org|publicdomain/i.test(licenseUrl);
  return{
    id:"cr:"+key,title:w.title?.[0]||"Untitled",
    authors:(w.author||[]).slice(0,6).map(a=>[a.given,a.family].filter(Boolean).join(" ")).join(", "),
    authorObjects:(w.author||[]).slice(0,6).map(a=>({given:a.given||"",family:a.family||"",orcid:a.ORCID||"unknown"})),
    venue:w["container-title"]?.[0]||"",
    year:String(((w.published?.["date-parts"]?.[0]||[])[0]||"")),
    cited:w["is-referenced-by-count"]||0,doi:w.DOI||"",abstract:clean(w.abstract||""),
    url:external,sourceUrl:external,fullTextUrl,openAccess,licenseUrl,licenseSignal,
    updated:Array.isArray(w["update-to"])&&w["update-to"].length>0,
    updateTypes:(w["update-to"]||[]).map(x=>x.type||x.label).filter(Boolean),
    retracted:Array.isArray(w["update-to"])&&w["update-to"].some(x=>String(x.type||"").toLowerCase()==="retraction"),
    pageUrl:w.DOI?"article.html?doi="+encodeURIComponent(w.DOI):"",sources:["Crossref"],sourceCount:1
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
      return{type:"author",items:(data.results||[]).map(a=>({name:a.display_name||"Unknown author",works:a.works_count||0,citations:a.cited_by_count||0,institution:(a.last_known_institutions||[]).map(x=>x.display_name).filter(Boolean).join(", "),orcid:a.orcid||"",href:"author.html?id="+encodeURIComponent((a.id||"").split("/").pop())+"&name="+encodeURIComponent(a.display_name||"")}))};
    }
    if(plan.intent==="venue"){
      const data=await request("https://api.openalex.org/sources?"+new URLSearchParams({search:plan.core,per_page:"5"}));
      return{type:"venue",items:(data.results||[]).map(s=>({name:s.display_name||"Unknown venue",works:s.works_count||0,publisher:s.host_organization_name||s.host_organization?.display_name||"",issn:s.issn_l||"",href:"journal.html?id="+encodeURIComponent((s.id||"").split("/").pop())+"&name="+encodeURIComponent(s.display_name||"")}))};
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
  merged.licenseSignal=!!old.licenseSignal||!!item.licenseSignal;
  merged.retracted=!!old.retracted||!!item.retracted;
  merged.updated=!!old.updated||!!item.updated;
  merged.updateTypes=[...new Set([...(old.updateTypes||[]),...(item.updateTypes||[])])];
  merged.topics=[...new Set([...(old.topics||[]),...(item.topics||[])])].slice(0,6);
  merged.authorObjects=old.authorObjects?.length?old.authorObjects:(item.authorObjects||[]);
  merged.authorIds=[...new Set([...(old.authorIds||[]),...(item.authorIds||[])])].slice(0,8);
  merged.referencedWorks=old.referencedWorks?.length?old.referencedWorks:(item.referencedWorks||[]);
  merged.topicIds=[...new Set([...(old.topicIds||[]),...(item.topicIds||[])])].slice(0,8);
  merged.sources=[...new Set([...(old.sources||[]),...(item.sources||[])])];
  merged.sourceCount=merged.sources.length||1;
  if(item.oaId)merged.oaId=item.oaId;
  if(item.venueId)merged.venueId=item.venueId;
  if(item.fullTextUrl)merged.fullTextUrl=item.fullTextUrl;
  if(item.licenseUrl)merged.licenseUrl=item.licenseUrl;
  if(item.licenseSignal)merged.licenseSignal=true;
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

function normalizeMatchText(value){
  return String(value||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[‐‑‒–—−]/g,"-").replace(/[^a-z0-9-]+/g," ").replace(/-/g," ").replace(/\s+/g," ").trim();
}
function tokenForms(term){
  const base=normalizeMatchText(term);
  if(!base)return[];
  const forms=[base];
  if(base.endsWith("ies")&&base.length>4)forms.push(base.slice(0,-3)+"y");
  else if(base.endsWith("es")&&base.length>4)forms.push(base.slice(0,-2));
  else if(base.endsWith("s")&&base.length>3)forms.push(base.slice(0,-1));
  return [...new Set(forms)];
}
function fieldHitCount(value,terms){
  const words=new Set(normalizeMatchText(value).split(" ").filter(Boolean));
  return (terms||[]).reduce((n,t)=>{
    const forms=tokenForms(t);
    return n+(forms.some(f=>f.split(" ").length>1?normalizeMatchText(value).includes(f):words.has(f))?1:0);
  },0);
}
function phraseWindowScore(value,terms){
  const words=normalizeMatchText(value).split(" ").filter(Boolean);
  if(!words.length||!(terms||[]).length)return 0;
  const wanted=new Set((terms||[]).flatMap(tokenForms).filter(f=>!f.includes(" ")));
  const positions=[];
  words.forEach((w,i)=>{if(wanted.has(w))positions.push(i)});
  if(positions.length<2)return positions.length?1:0;
  let best=99;
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<Math.min(positions.length,i+8);j++)best=Math.min(best,positions[j]-positions[i]);
  return best<=3?3:best<=6?2:1;
}
function rankingSignals(item,plan){
  const titleHits=fieldHitCount(item.title,plan.terms);
  const abstractHits=fieldHitCount(item.abstract,plan.terms);
  const authorHits=fieldHitCount(item.authors,plan.terms);
  const venueHits=fieldHitCount(item.venue,plan.terms);
  const total=Math.max(plan.terms?.length||0,1);
  const titleCoverage=titleHits/total;
  const abstractCoverage=abstractHits/total;
  const combinedCoverage=Math.max(titleCoverage,abstractCoverage);
  return{titleHits,abstractHits,authorHits,venueHits,titleCoverage,abstractCoverage,combinedCoverage};
}
function relevanceScore(item,plan){
  const text=normalizeMatchText([item.title,item.abstract,item.authors,item.venue].filter(Boolean).join(" "));
  const s=rankingSignals(item,plan),terms=plan.terms||[];
  let score=0;
  if(plan.exactPhrase&&hasExactPhrase(item,plan.exactPhrase))score+=52;
  else if(plan.exactPhrase&&normalizeMatchText(item.title).includes(normalizeMatchText(plan.exactPhrase)))score+=46;
  if(plan.core&&normalizeMatchText(item.title)===normalizeMatchText(plan.core))score+=30;
  score+=s.titleHits*9+s.abstractHits*3+s.authorHits*1.5+s.venueHits*1.5;
  score+=Math.round(s.titleCoverage*12)+Math.round(s.combinedCoverage*5);
  if(s.titleHits===terms.length&&terms.length)score+=12;
  if(s.abstractHits===terms.length&&terms.length)score+=5;
  score+=phraseWindowScore(item.title,terms)*3;
  if(s.titleHits===0&&s.abstractHits===0)score-=12;
  if(plan.authorHint){
    const q=normalizeMatchText(plan.authorHint);
    score+=normalizeMatchText(item.authors).includes(q)?26:-8;
  }
  if(plan.venueHint){
    const q=normalizeMatchText(plan.venueHint);
    score+=normalizeMatchText(item.venue).includes(q)?26:-7;
  }
  const intentRegex={
    review:/review|survey|meta analysis|systematic review/,
    definition:/overview|fundament|introduction|tutorial/,
    howto:/method|protocol|procedure|workflow/,
    mechanism:/mechanism|pathway|process|kinetic/,
    causes:/cause|driver|mechanism|factor|determin/,
    comparison:/compar|versus|vs |trade off|benchmark/,
    access:/open access|full text|preprint/
  };
  if(intentRegex[plan.intent]?.test(text))score+=plan.intent==="review"?10:7;
  if(plan.intent==="access"&&item.openAccess)score+=9;
  if(item.abstract)score+=2;
  if(item.fullTextUrl)score+=2;
  if(item.sourceCount>1)score+=4;
  if(item.retracted)score-=40;
  score+=Math.min(6,Math.log10((Number(item.cited)||0)+1));
  if(item.year){
    const age=Math.max(0,new Date().getFullYear()-Number(item.year));
    const freshness=plan.intent==="latest"?Math.max(0,8-age*.35):Math.max(0,3-age*.12);
    score+=freshness;
  }
  return score;
}
function evidenceExcerpt(value,terms){
  const text=clean(value);if(!text)return"";
  const sentences=text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let best=sentences[0]||text,bestScore=-1;
  for(const sentence of sentences){
    const low=sentence.toLowerCase();
    const score=(terms||[]).reduce((n,t)=>n+(low.includes(t)?1:0),0);
    if(score>bestScore){bestScore=score;best=sentence}
  }
  return best.slice(0,420);
}
function buildAnswer(plan,data,failed,entityResult){
  if(!answerEl)return;
  const evidence=data.filter(x=>x.abstract).slice(0,3);
  const oa=data.filter(x=>x.openAccess).length,doi=data.filter(x=>x.doi).length,abstracts=data.filter(x=>x.abstract).length;
  const next=({
    latest:"Use Newest sorting to emphasize publication date.",
    review:"Start with review or survey records, then follow their references and related work.",
    definition:"Use an overview or review as the starting point, then inspect the primary studies.",
    howto:"Look for methods and protocols, then verify the procedure in the original source.",
    comparison:"Compare multiple papers or systematic reviews; search relevance alone cannot establish a universal best choice.",
    access:"Use records marked Open Access and verify the license or full-text source before relying on it.",
    mechanism:"Compare several abstracts because mechanisms can depend on the system and study design.",
    causes:"Compare several studies and reviews before treating a proposed cause as established.",
    author:"The author cards below are entity matches; use the works to inspect the person's research directly.",
    venue:"The venue cards below are entity matches; use them to browse the publication's recent work.",
    identifier:"This is an exact identifier lookup; verify the DOI record before formal citation.",
    literature:"Open the closest matches, compare abstracts, then follow authors, venues and related work."
  })[plan.intent]||"Open the closest matches, compare abstracts, then follow authors, venues and related work.";
  const entityHtml=entityResult?.items?.length?'<div class="answer-entities"><div class="evidence-label">'+esc(entityResult.type==="author"?"PEOPLE":"PUBLICATION VENUES")+'</div>'+entityResult.items.slice(0,3).map(e=>'<a class="entity-card" href="'+safeHref(e.href)+'"><strong>'+esc(e.name)+'</strong><span>'+esc(entityResult.type==="author"?(e.works||0)+" works · "+(e.citations||0)+" citations":(e.works||0)+" works indexed")+'</span>'+(e.institution?'<span>'+esc(e.institution)+'</span>':"")+(e.publisher?'<span>'+esc(e.publisher)+(e.issn?" · ISSN "+esc(e.issn):"")+'</span>':"")+'</a>').join("")+'</div>':"";
  const evidenceHtml=evidence.length?'<div class="evidence-grid">'+evidence.map(x=>'<article><div class="evidence-label">EVIDENCE FROM RECORD</div><h3 class="evidence-title">'+esc(x.title)+'</h3><p>'+esc(evidenceExcerpt(x.abstract,plan.terms))+(x.abstract.length>420?"…":"")+'</p><a href="'+safeHref(x.oaId?"article.html?id="+encodeURIComponent(x.oaId):x.pageUrl||x.url||"#")+'">Read the record →</a></article>').join("")+'</div>':'<div class="note">No abstracts were returned for the leading matches. Open the records or broaden the search for more context.</div>';
  answerEl.innerHTML='<div class="answer-head"><div><span class="section-label">SEARCH INTERPRETATION</span><h2>'+esc(intentLabel(plan.intent))+'</h2></div><span class="answer-query">'+esc(plan.search)+'</span></div><p class="answer-summary">I interpreted your query as <strong>'+esc(plan.core)+'</strong>. The answer area uses traceable metadata and excerpts from returned scholarly records rather than inventing a conclusion.</p><div class="answer-stats"><span>'+data.length+' records</span><span>'+abstracts+' abstracts</span><span>'+doi+' DOI</span><span>'+oa+' OA signals</span></div>'+evidenceHtml+'<p class="answer-next"><strong>Next step:</strong> '+esc(next)+(failed?' One scholarly index was unavailable.':"")+'</p>'+entityHtml;
  const queries=relatedQueries(plan);
  if(suggestionsEl)suggestionsEl.innerHTML=queries.map(q=>'<a href="?q='+encodeURIComponent(q)+'">'+esc(q)+'</a>').join("");
  const pathLinks=[["Reviews","review"],["Latest","latest"],["Methods","howto"],["Open access","access"]].map(([label,mode])=>'<a class="research-path" href="search.html?q='+encodeURIComponent(plan.core)+'&mode='+encodeURIComponent(mode)+'">'+esc(label)+'</a>').join("");
  const paths=document.createElement("div");paths.className="research-paths";paths.innerHTML='<span class="path-label">Research paths</span>'+pathLinks;
  answerEl.querySelector(".answer-next")?.before(paths);
}
function matchSummary(item,plan){
  const terms=plan.terms||[],s=rankingSignals(item,plan),flags=[];
  if(plan.exactPhrase&&hasExactPhrase(item,plan.exactPhrase))flags.push("exact phrase");
  if(terms.length&&s.titleHits===terms.length)flags.push("all terms in title");
  else if(s.titleHits)flags.push("title "+s.titleHits+"/"+Math.max(terms.length,1));
  if(s.abstractHits===terms.length&&terms.length)flags.push("all terms in abstract");
  else if(s.abstractHits)flags.push("abstract "+s.abstractHits);
  if(item.sourceCount>1)flags.push("both indexes");
  if(item.openAccess)flags.push("OA");
  if(item.fullTextUrl)flags.push("full text");
  return flags.slice(0,4).join(" · ")||"low-signal match";
}
function resultCard(item){
  const saved=getSaved().some(x=>x.id===item.id);
  const compared=getCompared().some(x=>x.id===item.id);
  const href=safeHref(item.oaId?"article.html?id="+encodeURIComponent(item.oaId):item.pageUrl||item.url||"#");
  const badges=(item.retracted?'<span class="result-badge result-warning">Retraction signal</span>':"")+(item.updated&&!item.retracted?'<span class="result-badge result-update">Updated record</span>':"")+(item.openAccess?'<span class="result-badge result-oa">Open access</span>':(item.licenseSignal?'<span class="result-badge">License signal</span>':""))+(item.fullTextUrl?'<span class="result-badge">Full text</span>':"")+(item.abstract?'<span class="result-badge">Abstract</span>':"")+(item.sourceCount>1?'<span class="result-badge">Both indexes</span>':"");
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
