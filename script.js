import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

(() => {
const $ = id => document.getElementById(id);
const KEY = "memoryMindMapsV1";
const DELETED_KEY = "memoryDeletedMapIdsV1";
const firebaseConfig = {
  apiKey: "AIzaSyAxRMVVWNh6ZM8c_MjkPzoIZLb27scjpd8",
  authDomain: "memory-fe91e.firebaseapp.com",
  projectId: "memory-fe91e",
  storageBucket: "memory-fe91e.firebasestorage.app",
  messagingSenderId: "152990671744",
  appId: "1:152990671744:web:e46b8b58a7d1d19cd25765",
  measurementId: "G-R0HJLGMQDG"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
let cloudUser = null, cloudBusy = false, cloudTimer = null;
let hadLocalMaps = !!localStorage.getItem(KEY);
let maps=[], activeId=null, selectedId=null, zoom=1, panX=0, panY=0, drag=null, panning=null, mode="add", target=null, moveMode=false;
const uid=()=>Math.random().toString(36).slice(2,10);
const makeNode=(text,parent=null,definition="")=>({id:uid(),text,definition,parent,children:[],collapsed:false,x:0,y:0});
function makeMap(title="Untitled map",rootText="Your big idea"){const r=makeNode(rootText);return{id:uid(),title,root:r.id,nodes:{[r.id]:r},updated:Date.now()};}
function current(){return maps.find(m=>m.id===activeId);}
function get(id){return current()?.nodes[id];}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");if(s&&Array.isArray(s.maps)){maps=s.maps;activeId=s.activeId;}}catch(e){}if(!maps.length){const m=makeMap();maps=[m];activeId=m.id;}if(!current())activeId=maps[0].id;selectedId=current().root;}
function save(){current().updated=Date.now();try{localStorage.setItem(KEY,JSON.stringify({maps,activeId}));hadLocalMaps=true;$("saveStatus").textContent="● All changes saved";}catch(e){$("saveStatus").textContent="Storage full — export a backup";}renderLists();scheduleCloudSync();}

function setCloudStatus(message){const el=$("cloudStatus");if(el)el.textContent=message;}
function updateAccountUI(user){
 const login=$("googleSignInBtn"),logout=$("signOutBtn"),name=$("accountName"),dot=$("profileDot");
 if(login)login.hidden=!!user;if(logout)logout.hidden=!user;
 if(name)name.textContent=user?(user.displayName||user.email||"Google account"):"My workspace";
 if(dot)dot.textContent=user?(user.displayName||user.email||"M").charAt(0).toUpperCase():"M";
 setCloudStatus(user?"Signed in · cloud sync enabled":"Saved on this device");
}
function scheduleCloudSync(){
 if(!cloudUser||cloudBusy)return;
 clearTimeout(cloudTimer);
 cloudTimer=setTimeout(()=>syncCloud(),900);
}
async function syncCloud(){
 if(!cloudUser||cloudBusy)return;
 cloudBusy=true;setCloudStatus("Syncing maps…");
 try{
  const userId=cloudUser.uid, mapsRef=collection(db,"users",userId,"maps");
  const deleted=JSON.parse(localStorage.getItem(DELETED_KEY)||"[]");
  for(const id of deleted){await deleteDoc(doc(db,"users",userId,"maps",id));}
  const snap=await getDocs(mapsRef);
  const merged=new Map();
  if(hadLocalMaps){maps.forEach(m=>{if(m&&m.id&&m.nodes&&m.root)merged.set(m.id,m);});}
  snap.forEach(item=>{
   const remote=item.data();if(!remote||!remote.id||!remote.nodes||!remote.root||deleted.includes(item.id))return;
   const local=merged.get(remote.id);
   if(!local||(Number(remote.updated)||0)>(Number(local.updated)||0))merged.set(remote.id,remote);
  });
  maps=Array.from(merged.values());
  if(!maps.length){const fresh=makeMap();maps=[fresh];}
  if(!maps.some(m=>m.id===activeId))activeId=maps[0].id;
  if(!current())activeId=maps[0].id;
  selectedId=current().root;
  for(const m of maps){await setDoc(doc(db,"users",userId,"maps",m.id),m);}
  localStorage.setItem(KEY,JSON.stringify({maps,activeId}));
  localStorage.removeItem(DELETED_KEY);hadLocalMaps=true;
  renderLists();if(!$("editor").hidden)render();
  setCloudStatus("Synced to cloud");
 }catch(error){
  console.error("Memory cloud sync failed:",error);
  setCloudStatus("Cloud sync issue · local maps are safe");
 }finally{cloudBusy=false;}
}
function allDesc(id){const n=get(id);return n?n.children.flatMap(c=>[c,...allDesc(c)]):[];}
function depth(id){let d=0,n=get(id);while(n&&n.parent){d++;n=get(n.parent);}return d;}
function visible(){const out=[],m=current();function walk(id){const n=m.nodes[id];if(!n)return;out.push(id);if(!n.collapsed)n.children.forEach(walk);}walk(m.root);return out;}
function arrange(){const m=current();let row=0;function place(id,d){const n=m.nodes[id];n.depth=d;if(n.collapsed||!n.children.length){n.y=90+row*92;row++;}else{const start=row;n.children.forEach(c=>place(c,d+1));n.y=90+(start+row-1)*46;}n.x=150+d*290;}place(m.root,0);const ids=visible();$("mapCanvas").style.width=Math.max(1800,600+Math.max(0,...ids.map(id=>m.nodes[id].x)))+"px";$("mapCanvas").style.height=Math.max(900,250+Math.max(0,...ids.map(id=>m.nodes[id].y)))+"px";}
function transform(){$("mapCanvas").style.transform="translate("+panX+"px,"+panY+"px) scale("+zoom+")";$("zoomLabel").textContent=Math.round(zoom*100)+"%";}
function zoomAt(nextZoom,clientX,clientY){const wrap=$("canvasWrap"),rect=wrap.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top,worldX=(x-panX)/zoom,worldY=(y-panY)/zoom;zoom=Math.max(.2,Math.min(3.5,nextZoom));panX=x-worldX*zoom;panY=y-worldY*zoom;transform();}
function zoomFromCenter(factor){const r=$("canvasWrap").getBoundingClientRect();zoomAt(zoom*factor,r.left+r.width/2,r.top+r.height/2);}
function render(){const m=current();if(!m)return;closeMoveMenu();arrange();const layer=$("nodesLayer"),svg=$("connectors"),ids=visible();layer.innerHTML="";svg.innerHTML="";svg.setAttribute("viewBox","0 0 "+$("mapCanvas").offsetWidth+" "+$("mapCanvas").offsetHeight);
ids.forEach(id=>{const n=m.nodes[id];if(n.parent&&ids.includes(n.parent)){const p=m.nodes[n.parent],path=document.createElementNS("http://www.w3.org/2000/svg","path");const x1=p.x+170,y1=p.y+22,x2=n.x,y2=n.y+22,mid=(x1+x2)/2;path.setAttribute("d","M "+x1+" "+y1+" C "+mid+" "+y1+", "+mid+" "+y2+", "+x2+" "+y2);path.setAttribute("class","connector");svg.appendChild(path);}
const el=document.createElement("div");el.className="node"+(id===m.root?" root":" child-"+((Math.max(1,n.depth)-1)%4+1))+(id===selectedId?" selected":"");el.style.left=n.x+"px";el.style.top=n.y+"px";el.dataset.id=id;
const label=document.createElement("span");label.className="node-text";label.textContent=n.text;el.appendChild(label);const info=document.createElement("button");info.type="button";info.className="node-info"+(n.definition?"":" empty");info.textContent="i";info.title=n.definition?"View or edit definition":"Add a definition";info.setAttribute("aria-label","View or edit definition for "+n.text);info.addEventListener("pointerdown",e=>e.stopPropagation());info.onclick=e=>{e.stopPropagation();const node=get(id);if(node?.definition)showDefinitionCard(id);else openDefinition(id);};el.appendChild(info);if(id===selectedId&&moveMode){const move=document.createElement("span");move.className="node-move active";move.textContent="MOVE MODE";el.appendChild(move);}
if(n.children.length){const toggle=document.createElement("button");toggle.className="node-toggle";toggle.textContent=n.collapsed?"+":"−";toggle.title=n.collapsed?"Expand branches":"Collapse branches";toggle.addEventListener("pointerdown",e=>e.stopPropagation());toggle.onclick=e=>{e.stopPropagation();n.collapsed=!n.collapsed;render();save();};el.appendChild(toggle);}
el.onclick=()=>{if(drag?.moved)return;selectedId=id;render();};el.ondblclick=e=>{e.stopPropagation();selectedId=id;openDialog("rename",id);};el.addEventListener("contextmenu",e=>{e.preventDefault();showMoveMenu(id,e.clientX,e.clientY);});el.addEventListener("pointerdown",e=>beginDrag(e,id,el));layer.appendChild(el);});
$("nodeCount").textContent=Object.keys(m.nodes).length+" topics";$("mapTitle").value=m.title;$("crumbTitle").textContent=m.title;transform();renderLists();}
let longPressTimer=null,longPressPointer=null;
function closeMoveMenu(){const menu=$("moveContextMenu");if(menu)menu.remove();}
document.addEventListener("pointerdown",e=>{const menu=$("moveContextMenu");if(menu&&!menu.contains(e.target))closeMoveMenu();},true);
document.addEventListener("click",e=>{const menu=$("moveContextMenu");if(menu&&!menu.contains(e.target))closeMoveMenu();},true);
function showMoveMenu(id,x,y){selectedId=id;closeMoveMenu();const menu=document.createElement("div");menu.id="moveContextMenu";menu.className="move-context-menu";const btn=document.createElement("button");btn.type="button";btn.textContent="↕  Move topic";btn.onclick=()=>{moveMode=true;closeMoveMenu();render();};menu.appendChild(btn);document.body.appendChild(menu);menu.style.left=Math.max(8,Math.min(x,window.innerWidth-155))+"px";menu.style.top=Math.max(8,Math.min(y,window.innerHeight-55))+"px";}
function beginDrag(e,id,el){
 if(e.button!==0)return;
 if(!moveMode){
  if(e.pointerType==="touch"){
   clearTimeout(longPressTimer);longPressPointer=e.pointerId;
   longPressTimer=setTimeout(()=>{longPressTimer=null;longPressPointer=null;showMoveMenu(id,e.clientX,e.clientY);},2000);
   const clear=ev=>{if(ev.pointerId===longPressPointer||longPressPointer===null){clearTimeout(longPressTimer);longPressTimer=null;longPressPointer=null;el.removeEventListener("pointerup",clear);el.removeEventListener("pointercancel",clear);el.removeEventListener("pointermove",cancel);}};
   const cancel=ev=>{if(Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)>10){clearTimeout(longPressTimer);longPressTimer=null;longPressPointer=null;el.removeEventListener("pointerup",clear);el.removeEventListener("pointercancel",clear);el.removeEventListener("pointermove",cancel);}};
   el.addEventListener("pointerup",clear);el.addEventListener("pointercancel",clear);el.addEventListener("pointermove",cancel);
  }
  return;
 }
 if(id!==selectedId)return;
 e.preventDefault();drag={id,x:e.clientX,y:e.clientY,moved:false};el.setPointerCapture(e.pointerId);
 el.onpointermove=ev=>{if(drag&&drag.id===id&&Math.hypot(ev.clientX-drag.x,ev.clientY-drag.y)>7)drag.moved=true;};
 el.onpointerup=ev=>{
  if(!drag||drag.id!==id)return;const state=drag;drag=null;
  if(!state.moved){render();return;}
  const moving=get(id),parent=moving&&get(moving.parent);
  if(parent){
   const candidates=[...$("nodesLayer").querySelectorAll(".node")].filter(node=>node.dataset.id!==id&&get(node.dataset.id)?.parent===moving.parent);
   const targetEl=candidates.find(node=>{const r=node.getBoundingClientRect();return ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;});
   if(targetEl){const targetNode=get(targetEl.dataset.id),siblings=parent.children,from=siblings.indexOf(id),to=siblings.indexOf(targetNode.id);if(from!==-1&&to!==-1){siblings.splice(from,1);const targetIndex=siblings.indexOf(targetNode.id),r=targetEl.getBoundingClientRect(),after=ev.clientY>r.top+r.height/2;siblings.splice(targetIndex+(after?1:0),0,id);}}
  }
  moveMode=false;render();save();
 };
 el.onpointercancel=()=>{drag=null;render();};
}
function renderLists(){const list=$("mapList"),cards=$("mapCards");if(!list||!cards)return;list.innerHTML="";cards.innerHTML="";$("mapCount").textContent=maps.length;maps.slice().sort((a,b)=>b.updated-a.updated).forEach(m=>{const b=document.createElement("button");b.textContent="◌  "+m.title;b.className=m.id===activeId?"selected":"";b.onclick=()=>openMap(m.id);list.appendChild(b);const card=document.createElement("button");card.className="map-card";const icon=document.createElement("span");icon.className="card-icon";icon.textContent="✳";const info=document.createElement("span"),title=document.createElement("strong"),meta=document.createElement("small");title.textContent=m.title;meta.textContent=Object.keys(m.nodes).length+" topics · "+new Date(m.updated).toLocaleDateString();info.append(title,meta);card.append(icon,info);card.onclick=()=>openMap(m.id);cards.appendChild(card);});if(!maps.length)cards.innerHTML='<div class="empty-state">No maps yet. Create your first one.</div>';}
function dashboard(){$("dashboard").hidden=false;$("editor").hidden=true;$("welcomeStrip").hidden=false;renderLists();}
function editor(){ $("dashboard").hidden=true;$("welcomeStrip").hidden=true;$("editor").hidden=false;render();}
function openMap(id){activeId=id;selectedId=current().root;zoom=1;panX=25;panY=20;editor();save();}
function createMap(title="Untitled map",root="Your big idea"){const m=makeMap(title,root);maps.unshift(m);activeId=m.id;selectedId=m.root;zoom=1;panX=25;panY=20;save();editor();}
let definitionTarget=null;
function openDefinition(id){const n=get(id);if(!n)return;definitionTarget=id;$("definitionTitle").textContent=n.text;$("definitionText").value=n.definition||"";$("definitionDialog").showModal();}
function closeDefinitionCard(){const card=$("definitionCard");if(card)card.remove();}
function showDefinitionCard(id){const n=get(id);if(!n?.definition)return;closeDefinitionCard();const card=document.createElement("section");card.id="definitionCard";card.className="definition-float";card.setAttribute("role","dialog");card.setAttribute("aria-label","Definition for "+n.text);const head=document.createElement("div");head.className="definition-float-head";const title=document.createElement("strong");title.textContent=n.text;const edit=document.createElement("button");edit.type="button";edit.className="definition-float-edit";edit.textContent="✎";edit.title="Edit definition";edit.setAttribute("aria-label","Edit definition");edit.onclick=()=>{closeDefinitionCard();openDefinition(id);};head.append(title,edit);const body=document.createElement("p");body.className="definition-float-text";body.textContent=n.definition;card.append(head,body);document.body.appendChild(card);}
document.addEventListener("pointerdown",e=>{const card=$("definitionCard");if(card&&!card.contains(e.target)&&!e.target.closest(".node-info"))closeDefinitionCard();},true);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDefinitionCard();});

$("saveDefinitionBtn").onclick=()=>{const n=get(definitionTarget);if(!n)return;n.definition=$("definitionText").value.trim();$("definitionDialog").close();render();save();};
function openDialog(which,id){mode=which;target=id;$("nodeDialogTitle").textContent=which==="rename"?"Rename topic":which==="child"?"Add a branch":"Add a topic";$("nodeText").value=which==="rename"?get(id).text:"";$("nodeDialog").showModal();setTimeout(()=>$("nodeText").focus(),50);}
$("nodeForm").addEventListener("submit",e=>{if(e.submitter?.value==="cancel")return;e.preventDefault();const value=$("nodeText").value.trim();if(!value)return;if(mode==="rename")get(target).text=value;else{const parentId=mode==="child"?target:current().root,p=get(parentId),n=makeNode(value,parentId);current().nodes[n.id]=n;p.children.push(n.id);p.collapsed=false;selectedId=n.id;}$("nodeDialog").close();render();save();});
$("nodeText").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("nodeForm").requestSubmit($("nodeSaveBtn"));}});
function deleteSelected(){const m=current(),n=get(selectedId);if(!n)return;if(n.id===m.root){if(!confirm("Delete this whole mind map?"))return;const deletedIds=JSON.parse(localStorage.getItem(DELETED_KEY)||"[]");if(!deletedIds.includes(m.id))deletedIds.push(m.id);localStorage.setItem(DELETED_KEY,JSON.stringify(deletedIds));maps=maps.filter(x=>x.id!==m.id);if(!maps.length){const fresh=makeMap();maps=[fresh];activeId=fresh.id;}else activeId=maps[0].id;selectedId=current().root;dashboard();save();return;}if(!confirm("Delete this topic and all its branches?"))return;get(n.parent).children=get(n.parent).children.filter(x=>x!==n.id);[n.id,...allDesc(n.id)].forEach(id=>delete m.nodes[id]);selectedId=n.parent;render();save();}
$("newMapBtn").onclick=$("dashboardNewBtn").onclick=$("startBlankBtn").onclick=()=>createMap();
$("workspaceBtn").onclick=dashboard;$("templatesBtn").onclick=()=>{dashboard();document.querySelector(".quick-ideas").scrollIntoView({behavior:"smooth"});};
$("mapTitle").onchange=e=>{current().title=e.target.value.trim()||"Untitled map";render();save();};
$("addNodeBtn").onclick=()=>openDialog("add",selectedId);$("addChildBtn").onclick=()=>openDialog("child",selectedId||current().root);$("renameBtn").onclick=()=>selectedId&&openDialog("rename",selectedId);$("deleteBtn").onclick=deleteSelected;
$("zoomIn").onclick=()=>zoomFromCenter(1.05);$("zoomOut").onclick=()=>zoomFromCenter(1/1.05);
function fit(){zoom=1;panX=25;panY=20;transform();}$("fitBtn").onclick=$("centerBtn").onclick=fit;
$("collapseBtn").onclick=()=>{Object.values(current().nodes).forEach(n=>{if(n.children.length)n.collapsed=true;});current().nodes[current().root].collapsed=false;render();save();};
$("expandBtn").onclick=()=>{Object.values(current().nodes).forEach(n=>n.collapsed=false);render();save();};
const activePointers=new Map();let pinchStart=null;
const pointerDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
$("canvasWrap").addEventListener("pointerdown",e=>{
 if(e.target.closest(".node,.zoom-controls,.center-view"))return;
 activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});$("canvasWrap").setPointerCapture(e.pointerId);
 if(activePointers.size===2){const pts=[...activePointers.values()];pinchStart={distance:pointerDistance(pts[0],pts[1]),zoom,midX:(pts[0].x+pts[1].x)/2,midY:(pts[0].y+pts[1].y)/2,panX,panY};panning=null;}
 else if(activePointers.size===1){panning={x:e.clientX-panX,y:e.clientY-panY};$("canvasWrap").classList.add("is-panning");}
});
$("canvasWrap").addEventListener("pointermove",e=>{
 if(!activePointers.has(e.pointerId))return;activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(activePointers.size>=2&&pinchStart){const pts=[...activePointers.values()],midX=(pts[0].x+pts[1].x)/2,midY=(pts[0].y+pts[1].y)/2,ratio=pointerDistance(pts[0],pts[1])/Math.max(1,pinchStart.distance);zoom=Math.max(.2,Math.min(3.5,pinchStart.zoom*Math.pow(ratio,.72)));const rect=$("canvasWrap").getBoundingClientRect(),startX=pinchStart.midX-rect.left,startY=pinchStart.midY-rect.top,worldX=(startX-pinchStart.panX)/pinchStart.zoom,worldY=(startY-pinchStart.panY)/pinchStart.zoom;panX=(midX-rect.left)-worldX*zoom;panY=(midY-rect.top)-worldY*zoom;transform();}
 else if(panning){panX=e.clientX-panning.x;panY=e.clientY-panning.y;transform();}
});
function endCanvasPointer(e){activePointers.delete(e.pointerId);if(activePointers.size<2)pinchStart=null;if(activePointers.size===1){const p=[...activePointers.values()][0];panning={x:p.x-panX,y:p.y-panY};}else panning=null;if(!activePointers.size)$("canvasWrap").classList.remove("is-panning");}
$("canvasWrap").addEventListener("pointerup",endCanvasPointer);$("canvasWrap").addEventListener("pointercancel",endCanvasPointer);
$("canvasWrap").addEventListener("wheel",e=>{e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?$("canvasWrap").clientHeight:1,delta=e.deltaY*unit,factor=Math.exp(-delta*.0015);zoomAt(zoom*factor,e.clientX,e.clientY);},{passive:false});
function download(name,data,type="application/json"){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportMap(){const m=current();download((m.title||"mind-map").toLowerCase().replace(/[^a-z0-9]+/g,"-")+".json",JSON.stringify(m,null,2));}
$("exportBtn").onclick=exportMap;$("shareBtn").onclick=()=>{exportMap();$("saveStatus").textContent="● JSON backup downloaded";};
function parseOutline(text){const lines=text.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return null;const rootText=lines[0].trim().replace(/^[-*•]\s*/,"");const m=makeMap(rootText,rootText),stack=[{indent:-1,id:m.root}];for(const raw of lines.slice(1)){const indent=(raw.match(/^\s*/)||[""])[0].replace(/\t/g,"    ").length,label=raw.trim().replace(/^[-*•]\s*/,"").replace(/^#+\s*/,"");if(!label)continue;while(stack.length>1&&stack[stack.length-1].indent>=indent)stack.pop();const parent=stack[stack.length-1].id,n=makeNode(label,parent);m.nodes[n.id]=n;m.nodes[parent].children.push(n.id);stack.push({indent,id:n.id});}return m;}
function importMap(m){m.id=uid();m.updated=Date.now();maps.unshift(m);activeId=m.id;selectedId=m.root;$("importDialog").close();editor();save();}
async function createAIMindMap(source,title="Your AI mind map"){const clean=String(source||"").trim();if(!clean){alert("Add notes or upload a PDF first.");return;}if(clean.length>3800){alert("Please keep the extracted notes under 3,800 characters for now.");return;}const btn=$("importTextBtn"),status=$("aiStatus");btn.disabled=true;btn.textContent="Gemini is creating…";if(status)status.textContent="Reading your material and building your mind map…";try{const response=await fetch("https://proud-hill-dd6fmemory-ai.kinjalsj00.workers.dev/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"organize",topic:"Create a mind map from this source. Return ONLY a nested outline. First line: a short title. Each following line must be a subtopic, using two spaces for each hierarchy level. No introduction, numbering, or conclusion.\n\n"+clean})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Gemini request failed.");const answer=String(data.answer||"").trim();const map=parseOutline(answer);if(!map||!map.nodes||!map.nodes[map.root]||!map.nodes[map.root].children.length)throw new Error("Gemini's reply wasn't a usable mind-map outline. Please try again with clearer notes.");map.title=map.nodes[map.root].text||title;importMap(map);}catch(error){alert("Couldn't create the AI mind map: "+(error.message||"Please try again."));if(status)status.textContent="";}finally{btn.disabled=false;btn.textContent="✧ Generate AI mind map";}} 
$("importTextBtn").onclick=e=>{e.preventDefault();createAIMindMap($("importText").value);};
$("pdfChooseBtn").onclick=()=>$("pdfFile").click();
$("jsonFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const m=JSON.parse(await f.text());if(!m.nodes||!m.root||!m.nodes[m.root])throw Error();importMap(m);}catch(err){alert("That file is not a valid Memory mind map JSON.");}e.target.value="";};
const presets={"Study plan":["Study plan",["Subjects","Weekly timetable","Revision","Practice questions","Goals"]],"Project planner":["Project planner",["Purpose","Research","Tasks","Timeline","Resources","Next steps"]],"Brainstorm":["Brainstorm",["Problem","Ideas","Possibilities","Questions","Next actions"]],"Weekly goals":["Weekly goals",["Personal","Study / Work","Health","Important tasks","Things to look forward to"]]};
document.querySelectorAll(".idea-card").forEach(b=>b.onclick=()=>{const [title,branches]=presets[b.dataset.template],m=makeMap(title,title);branches.forEach(t=>{const n=makeNode(t,m.root);m.nodes[n.id]=n;m.nodes[m.root].children.push(n.id);});maps.unshift(m);activeId=m.id;selectedId=m.root;editor();save();});
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");$("mapList").onclick=()=>$("sidebar").classList.remove("open");
const aiMap=document.createElement("button");aiMap.className="tool-btn";aiMap.textContent="▤ PDF/Notes";aiMap.onclick=()=>$("importDialog").showModal();$("deleteBtn").parentNode.insertBefore(aiMap,$("deleteBtn"));
$("pdfFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(!window.pdfjsLib)throw Error("PDF reader couldn't load. Please try pasting your notes instead.");pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";const doc=await pdfjsLib.getDocument(await f.arrayBuffer()).promise,parts=[];for(let i=1;i<=Math.min(doc.numPages,10);i++){const page=await doc.getPage(i),content=await page.getTextContent(),txt=content.items.map(x=>x.str).join(" ").trim();if(txt)parts.push(txt);}const source=parts.join("\n\n").slice(0,3800);if(!source)throw Error("No selectable text found in this PDF. It may be a scanned document.");$("importText").value="";$("importDialog").showModal();await createAIMindMap(source,f.name.replace(/\.pdf$/i,""));}catch(err){alert(err.message||"Could not read this PDF.");}e.target.value="";};

$("googleSignInBtn").onclick=async()=>{try{setCloudStatus("Opening Google sign-in…");await signInWithRedirect(auth,googleProvider);}catch(error){setCloudStatus("Sign-in failed · please try again");alert("Google sign-in failed: "+(error.message||"Please try again."));}};
$("signOutBtn").onclick=async()=>{try{await signOut(auth);}catch(error){alert("Couldn't sign out: "+(error.message||"Please try again."));}};
onAuthStateChanged(auth,async user=>{cloudUser=user;updateAccountUI(user);if(user)await syncCloud();});
load();renderLists();dashboard();
})();