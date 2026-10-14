'use strict';
const $=id=>document.getElementById(id);const STORE='claude-ipad-progress-v1';const DB='claude-ipad-private-v1';let db,headers=[],current=null,progress={last:null,positions:{},favs:[],highlights:{}},favesOnly=false,renderToken=0,scrollTimer,restoring=false;
try{progress={...progress,...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{}progress.positions??={};progress.favs??=[];progress.highlights??={};
function save(){try{localStorage.setItem(STORE,JSON.stringify(progress))}catch{status('Sauvegarde automatique indisponible : exporte ta progression.')}}
function status(s){$('status').textContent=s}
function openDB(){return new Promise((resolve,reject)=>{let req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{let d=req.result;d.createObjectStore('chats',{keyPath:'id'});d.createObjectStore('info',{keyPath:'key'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function get(store,key){return new Promise((res,rej)=>{let r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function all(store){return new Promise((res,rej)=>{let r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function clearAndPut(rows){return new Promise((res,rej)=>{let t=db.transaction(['chats','info'],'readwrite');let c=t.objectStore('chats');c.clear();for(let row of rows)c.put(row);t.objectStore('info').put({key:'ready',count:rows.length});t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function erase(){return new Promise((res,rej)=>{let t=db.transaction(['chats','info'],'readwrite');t.objectStore('chats').clear();t.objectStore('info').clear();t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function fmt(d){if(!d)return '';let x=new Date(d);return isNaN(x)?'':x.toLocaleDateString('fr-FR',{year:'numeric',month:'short',day:'numeric'})}
function showLibrary(){let has=headers.length>0;$('setup').classList.toggle('hide',has);$('tools').classList.toggle('hide',!has);$('resume').disabled=!progress.last||!headers.some(x=>x.id===progress.last);if(has)renderList()}
function normalize(data){if(!Array.isArray(data))throw Error('Ce JSON ne contient pas une liste de conversations Claude.');return data.map((c,i)=>({id:String(c.uuid||c.id||i),name:c.name||'(sans titre)',date:c.created_at||'',messages:(c.chat_messages||[]).map(m=>({sender:m.sender||'',date:m.created_at||'',text:typeof m.text==='string'&&m.text?m.text:Array.isArray(m.content)?m.content.filter(p=>p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n'):''}))}))}
async function importFile(file){if(!file)return;status('Importation en cours… Garde cette page ouverte.');$('importInfo').textContent='Lecture du JSON et enregistrement local…';await new Promise(r=>setTimeout(r,50));try{const data=JSON.parse(await file.text());const rows=normalize(data);if(!rows.length)throw Error('Aucune conversation trouvée.');await clearAndPut(rows);headers=rows.map(({id,name,date,messages})=>({id,name,date,count:messages.length}));$('importInfo').textContent='';current=null;progress.last=null;save();showLibrary();status(rows.length+' conversations enregistrées sur cet iPad · aucune donnée envoyée à un serveur');}catch(e){status('Import impossible : '+e.message);$('importInfo').textContent='Vérifie que le fichier est bien conversations.json et que ton iPad dispose de suffisamment d’espace.'}}
$('import').onchange=e=>importFile(e.target.files[0]);$('reimport').onchange=e=>{if(confirm('Remplacer les archives locales par ce nouveau fichier ?'))importFile(e.target.files[0])};
async function init(){try{db=await openDB();let ready=await get('info','ready');if(ready){let allChats=await all('chats');headers=allChats.map(({id,name,date,messages})=>({id,name,date,count:messages.length}));status(headers.length+' conversations disponibles hors ligne · stockage privé sur cet iPad')}else status('Prêt pour un import privé de conversations.json');showLibrary();if(headers.length&&progress.last&&headers.some(c=>c.id===progress.last))openChat(progress.last,true);}catch(e){status('Le stockage local est indisponible : '+e.message)}}
function renderList(){const q=$('search').value.trim().toLocaleLowerCase();const shown=headers.filter(c=>(!favesOnly||progress.favs.includes(c.id))&&(!q||c.name.toLocaleLowerCase().includes(q)));$('count').textContent=shown.length+' conversation(s)';const f=document.createDocumentFragment();for(let c of shown){let b=document.createElement('button');b.className=c.id===current?'selected':'';b.textContent=(progress.favs.includes(c.id)?'★ ':'')+c.name;let d=document.createElement('span');d.className='date';d.textContent=fmt(c.date)+' · '+c.count+' messages';b.append(d);b.onclick=()=>openChat(c.id);f.append(b)}$('list').replaceChildren(f)}
async function openChat(id,restore=true){let token=++renderToken;let c=await get('chats',id);if(!c||token!==renderToken)return;current=id;progress.last=id;save();document.body.classList.add('reading');$('reader').classList.remove('hide');$('empty').classList.add('hide');$('title').textContent=c.name;$('meta').textContent=fmt(c.date)+' · '+c.messages.length+' messages';updateFavorite();let frag=document.createDocumentFragment();c.messages.forEach((m,i)=>{let el=document.createElement('article');el.className='message '+(m.sender==='human'?'human':'');el.dataset.index=i;let who=document.createElement('div');who.className='who';who.textContent=m.sender==='human'?'Toi':m.sender==='assistant'?'Claude':m.sender||'Message';let body=document.createElement('div');body.className='body';body.textContent=m.text||'(aucun texte dans l’export)';el.append(who,body);if(m.sender==='assistant')paintHighlights(body,id,i);frag.append(el)});$('messages').replaceChildren(frag);renderList();requestAnimationFrame(()=>{restoring=true;let pos=restore?progress.positions[id]:null;let idx=typeof pos==='object'&&pos!==null?pos.index:(Number(pos)||0);let offset=typeof pos==='object'&&pos!==null?(Number(pos.offset)||0):0;let target=$('messages').children[idx];if(target){let main=$('main');main.scrollTop+=target.getBoundingClientRect().top-main.getBoundingClientRect().top+offset;}else $('main').scrollTop=0;requestAnimationFrame(()=>{restoring=false})})}
function updateFavorite(){$('favorite').textContent=progress.favs.includes(current)?'★ Retirer des favoris':'☆ Ajouter aux favoris'}
$('favorite').onclick=()=>{if(!current)return;progress.favs=progress.favs.includes(current)?progress.favs.filter(x=>x!==current):[...progress.favs,current];save();updateFavorite();renderList()};
$('back').onclick=()=>{capturePosition();document.body.classList.remove('reading');renderList()};$('resume').onclick=()=>progress.last&&openChat(progress.last);$('start').onclick=()=>{progress.positions[current]={index:0,offset:0};save();$('main').scrollTop=0};
function capturePosition(){if(!current||restoring||!$('messages').children.length)return;const main=$('main'),top=main.getBoundingClientRect().top,children=$('messages').children;let index=children.length-1;for(let i=0;i<children.length;i++){if(children[i].getBoundingClientRect().bottom>top+2){index=i;break}}let offset=Math.max(0,Math.round(top-children[index].getBoundingClientRect().top));progress.positions[current]={index,offset};save()}
$('main').addEventListener('scroll',()=>{if(!current||restoring)return;clearTimeout(scrollTimer);scrollTimer=setTimeout(capturePosition,200)},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clearTimeout(scrollTimer);capturePosition()}});
window.addEventListener('pagehide',()=>{clearTimeout(scrollTimer);capturePosition()});
$('onlyFaves').onclick=()=>{favesOnly=!favesOnly;$('onlyFaves').textContent=favesOnly?'★ Tous':'☆ Favoris';renderList()};
$('search').oninput=()=>{if(!$('deep').checked){renderList();return}deepSearch()};$('deep').onchange=()=>{if($('deep').checked)deepSearch();else renderList()};
let searchTimer;function deepSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{let q=$('search').value.trim().toLocaleLowerCase();if(!q){renderList();return}status('Recherche dans les messages…');let rows=await all('chats');let ids=new Set(rows.filter(c=>c.name.toLocaleLowerCase().includes(q)||c.messages.some(m=>m.text.toLocaleLowerCase().includes(q))).map(c=>c.id));let shown=headers.filter(c=>ids.has(c.id)&&(!favesOnly||progress.favs.includes(c.id)));$('count').textContent=shown.length+' conversation(s)';let f=document.createDocumentFragment();for(let c of shown){let b=document.createElement('button');b.textContent=(progress.favs.includes(c.id)?'★ ':'')+c.name;b.onclick=()=>openChat(c.id);f.append(b)}$('list').replaceChildren(f);status('Recherche terminée · archives locales')},450)}
function download(name,content){let u=URL.createObjectURL(new Blob([content],{type:'application/json'}));let a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
$('backup').onclick=()=>download('progression-archives-claude.json',JSON.stringify(progress,null,2));$('restore').onchange=async e=>{try{let v=JSON.parse(await e.target.files[0].text());if(!v||typeof v!=='object'||!Array.isArray(v.favs)||typeof v.positions!=='object')throw Error('Format invalide');progress={last:v.last||null,positions:v.positions||{},favs:v.favs,highlights:v.highlights||{}};save();showLibrary();status('Progression restaurée ❤️')}catch(e){status('Restauration impossible : '+e.message)}};
$('delete').onclick=async()=>{if(!confirm('Effacer toutes les conversations stockées sur cet iPad ? Le fichier JSON d’origine ne sera pas supprimé.'))return;await erase();headers=[];current=null;progress.last=null;save();document.body.classList.remove('reading');$('reader').classList.add('hide');$('empty').classList.remove('hide');showLibrary();status('Archives locales effacées')};

// Surlignage local : les positions sont des offsets de caractères dans le texte original.
const MARK_COLORS={rose:'#f6a8cc',violet:'#c8afff',bleu:'#a8d5ff',jaune:'#ffe38a',orange:'#ffc18a'};
let selectedRange=null;
function markKey(chat,index){return chat+'::'+index}
function paintHighlights(body,chat,index){
 const original=body.textContent;const entries=(progress.highlights?.[markKey(chat,index)]||[]).filter(h=>Number.isInteger(h.start)&&Number.isInteger(h.end)&&h.start>=0&&h.end<=original.length&&h.end>h.start);
 if(!entries.length)return;
 // Un nouveau surlignage remplace les parties qui se chevauchent.
 const bounds=new Set([0,original.length]);for(const h of entries){bounds.add(h.start);bounds.add(h.end)}
 const pts=[...bounds].sort((a,b)=>a-b),frag=document.createDocumentFragment();
 for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];if(a===b)continue;const h=[...entries].reverse().find(x=>x.start<=a&&x.end>=b);if(h){const mark=document.createElement('mark');mark.style.background=MARK_COLORS[h.color]||MARK_COLORS.jaune;mark.style.color='#25202a';mark.textContent=original.slice(a,b);frag.append(mark)}else frag.append(document.createTextNode(original.slice(a,b)))}
 body.replaceChildren(frag);
}
function offsetIn(container,node,offset){const r=document.createRange();r.selectNodeContents(container);r.setEnd(node,offset);return r.toString().length}
function selectionDetails(){const s=window.getSelection();if(!s||s.isCollapsed||!s.rangeCount||!current)return null;const r=s.getRangeAt(0),a=r.startContainer.parentElement?.closest('.message'),b=r.endContainer.parentElement?.closest('.message');if(!a||a!==b||!a.querySelector('.body')?.contains(r.commonAncestorContainer)&&r.commonAncestorContainer!==a.querySelector('.body'))return null;if(a.classList.contains('human'))return null;const body=a.querySelector('.body');if(!body.contains(r.startContainer)||!body.contains(r.endContainer))return null;const start=offsetIn(body,r.startContainer,r.startOffset),end=offsetIn(body,r.endContainer,r.endOffset);if(end<=start)return null;return {chat:current,index:Number(a.dataset.index),start,end,excerpt:r.toString()}}
function setMarkToolbar(show){$('markTools').classList.toggle('hide',!show)}
function updateSelection(){const found=selectionDetails();if(found){selectedRange=found;setMarkToolbar(true)}else if(!window.getSelection()?.toString())setMarkToolbar(false)}
document.addEventListener('selectionchange',()=>setTimeout(updateSelection,0));
$('markTools').addEventListener('click',e=>{const btn=e.target.closest('[data-mark]');if(!btn||!selectedRange)return;const {chat,index,start,end}=selectedRange,key=markKey(chat,index);progress.highlights??={};let marks=progress.highlights[key]||[];
 // Retirer les surlignages qui touchent la sélection avant d'en ajouter un nouveau.
 marks=marks.flatMap(h=>h.end<=start||h.start>=end?[h]:[...(h.start<start?[{...h,end:start}]:[]),...(h.end>end?[{...h,start:end}]:[])]);
 if(btn.dataset.mark!=='effacer')marks.push({start,end,color:btn.dataset.mark});
 progress.highlights[key]=marks;save();const body=$('messages').children[index]?.querySelector('.body');if(body){const text=body.textContent;body.textContent=text;paintHighlights(body,chat,index)}
 window.getSelection()?.removeAllRanges();selectedRange=null;setMarkToolbar(false);
});

if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
init();

// V4 — état du panneau de navigation conservé sur cet iPad.
(function(){
 const toggle=document.getElementById('toggleSidebar');
 const layout=document.querySelector('.layout');
 const storageKey='claude-ipad-sidebar-collapsed-v4';
 if(!toggle||!layout)return;
 let collapsed=false;
 try{collapsed=localStorage.getItem(storageKey)==='1'}catch(e){}
 function update(){
   layout.classList.toggle('sidebar-collapsed',collapsed);
   toggle.textContent=collapsed?'☰ Afficher le menu':'☰ Masquer le menu';
   toggle.setAttribute('aria-expanded',String(!collapsed));
   toggle.setAttribute('title',collapsed?'Afficher les conversations':'Masquer les conversations');
 }
 toggle.addEventListener('click',()=>{
   collapsed=!collapsed;
   try{localStorage.setItem(storageKey,collapsed?'1':'0')}catch(e){}
   update();
 });
 update();
})();
