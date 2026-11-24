import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
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
document.addEventListener("click",async event=>{
 const button=event.target.closest("#googleSignInBtn");
 if(!button)return;
 try{button.disabled=true;const status=document.getElementById("cloudStatus");if(status)status.textContent="Opening Google sign-in…";const result=await signInWithPopup(auth,googleProvider);cloudUser=result.user;updateAccountUI(result.user);setCloudStatus("Google connected · loading your maps…");await syncCloud();}
 catch(error){const status=document.getElementById("cloudStatus");if(status)status.textContent="Google sign-in error · "+(error.code||error.message||"please try again");console.error("Google sign-in failed:",error);alert("Google sign-in failed: "+(error.code||error.message||"Please try again."));}
 finally{button.disabled=false;}
});
let cloudUser = null, cloudBusy = false, cloudTimer = null;
let hadLocalMaps = !!localStorage.getItem(KEY);
let currentView="dashboard";let maps=[], activeId=null, selectedId=null, zoom=1, panX=0, panY=0, drag=null, panning=null, mode="add", target=null, moveMode=false;
const uid=()=>Math.random().toString(36).slice(2,10);
const makeNode=(text,parent=null,definition="")=>({id:uid(),text,definition,parent,children:[],collapsed:false,x:0,y:0});
function makeMap(title="Untitled map",rootText="Your big idea"){const r=makeNode(rootText);return{id:uid(),title,root:r.id,nodes:{[r.id]:r},updated:Date.now()};}
function current(){return maps.find(m=>m.id===activeId);}
function get(id){return current()?.nodes[id];}
function load(){try{const raw=localStorage.getItem(KEY);const s=JSON.parse(raw||"null");if(s&&Array.isArray(s.maps)){const valid=s.maps.filter(m=>m&&m.id&&m.nodes&&m.root&&m.nodes[m.root]);if(valid.length){maps=valid;activeId=s.activeId;hadLocalMaps=true;}else if(raw){localStorage.setItem("memoryRecoveryBackupV1",raw);}}else if(raw){localStorage.setItem("memoryRecoveryBackupV1",raw);}}catch(e){try{const raw=localStorage.getItem(KEY);if(raw)localStorage.setItem("memoryRecoveryBackupV1",raw);}catch(ignore){}}if(!maps.length){const m=makeMap();maps=[m];activeId=m.id;}if(!current())activeId=maps[0].id;selectedId=current().root;}
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
  const remoteById=new Map();
  const merged=new Map();
  if(hadLocalMaps){maps.forEach(m=>{if(m&&m.id&&m.nodes&&m.root)merged.set(m.id,m);});}
  snap.forEach(item=>{
   const remote=item.data();if(!remote||!remote.id||!remote.nodes||!remote.root||deleted.includes(item.id))return;
   remoteById.set(remote.id,remote);
   const local=merged.get(remote.id);
   if(!local||(Number(remote.updated)||0)>(Number(local.updated)||0))merged.set(remote.id,remote);
  });
   if(!merged.size&&!hadLocalMaps){setCloudStatus("No saved cloud maps found · starter map not uploaded");return;}
   maps=Array.from(merged.values());
   if(!maps.length){setCloudStatus("No maps to sync · nothing was overwritten");return;}
  if(!maps.some(m=>m.id===activeId))activeId=maps[0].id;
  if(!current())activeId=maps[0].id;
  selectedId=current().root;
  for(const m of maps){const remote=remoteById.get(m.id);if(!remote||(Number(m.updated)||0)>(Number(remote.updated)||0))await setDoc(doc(db,"users",userId,"maps",m.id),m);}
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
function renameMap(id){const m=maps.find(x=>x.id===id);if(!m)return;const name=prompt("Rename mind map:",m.title);if(name===null)return;const clean=name.trim();if(!clean){alert("Please enter a map name.");return;}m.title=clean;m.updated=Date.now();save();renderLists();}function renderLists(){const list=$("mapList"),cards=$("mapCards");if(!list||!cards)return;list.innerHTML="";cards.innerHTML="";$("mapCount").textContent=maps.length;maps.slice().sort((a,b)=>b.updated-a.updated).forEach(m=>{const b=document.createElement("button");b.textContent="◌  "+m.title;b.className=m.id===activeId?"selected":"";b.onclick=()=>openMap(m.id);list.appendChild(b);const card=document.createElement("div");card.className="map-card";card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label","Open "+m.title);const icon=document.createElement("span");icon.className="card-icon";icon.textContent="✳";const info=document.createElement("span"),title=document.createElement("strong"),meta=document.createElement("small");title.textContent=m.title;meta.textContent=Object.keys(m.nodes).length+" topics · "+new Date(m.updated).toLocaleDateString();info.append(title,meta);const actions=document.createElement("div");actions.className="map-card-actions";const rename=document.createElement("button");rename.type="button";rename.className="map-card-rename";rename.textContent="✎ Rename";rename.setAttribute("aria-label","Rename "+m.title);rename.onclick=e=>{e.stopPropagation();renameMap(m.id);};actions.append(rename);card.append(icon,info,actions);card.onclick=()=>openMap(m.id);card.onkeydown=e=>{if(e.target===card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openMap(m.id);}};cards.appendChild(card);});if(!maps.length)cards.innerHTML='<div class="empty-state">No maps yet. Create your first one.</div>';}
function showView(view,push=true){if(view!==currentView&&push)history.pushState({memoryView:view},"",location.href);currentView=view;if(view==="dashboard"){$("dashboard").hidden=false;$("editor").hidden=true;$("welcomeStrip").hidden=false;renderLists();}else{$("dashboard").hidden=true;$("welcomeStrip").hidden=true;$("editor").hidden=false;render();}}
function dashboard(push=true){showView("dashboard",push);}
function editor(push=true){showView("editor",push);}
history.replaceState({memoryView:"dashboard"},"",location.href);
window.addEventListener("popstate",event=>{const sidebar=$("sidebar"),menuButton=$("mobileMenu");if(sidebar?.classList.contains("open")){sidebar.classList.remove("open");if(menuButton){menuButton.textContent="☰";menuButton.setAttribute("aria-expanded","false");menuButton.setAttribute("aria-label","Open navigation menu");}history.replaceState({memoryView:currentView},"",location.href);return;}const view=event.state?.memoryView||(currentView==="editor"?"dashboard":"dashboard");showView(view,false);});
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
function splitIntoChunks(source,maxLength=3000){
 const paragraphs=String(source||"").split(/\\n\\s*\\n/);
 const chunks=[];let current="";
 for(const paragraph of paragraphs){
  const part=paragraph.trim();if(!part)continue;
  if(part.length>maxLength){
   if(current){chunks.push(current);current="";}
   for(let i=0;i<part.length;i+=maxLength)chunks.push(part.slice(i,i+maxLength));
   continue;
  }
  if(current&&current.length+part.length+2>maxLength){chunks.push(current);current=part;}
  else current+=(current?"\\n\\n":"")+part;
 }
 if(current)chunks.push(current);
 return chunks;
}
async function requestMindMapOutline(source){
 const response=await fetch("https://proud-hill-dd6fmemory-ai.kinjalsj00.workers.dev/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"organize",topic:"Create a mind map from this source. Return ONLY a nested outline. First line: a short title. Each following line must be a subtopic, using two spaces for each hierarchy level. No introduction, numbering, or conclusion.\\n\\n"+source})});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||"Gemini request failed.");
 const map=parseOutline(String(data.answer||"").trim());
 if(!map||!map.nodes||!map.nodes[map.root]||!map.nodes[map.root].children.length)throw new Error("The AI couldn't organize one section of the PDF. Try again or use a smaller PDF.");
 return map;
}
async function createAIMindMap(source,title="Your AI mind map"){
 const clean=String(source||"").trim();if(!clean){alert("Add notes or upload a PDF first.");return;}
 const chunks=splitIntoChunks(clean),btn=$("importTextBtn"),status=$("aiStatus");
 btn.disabled=true;btn.textContent="Gemini is creating…";
 try{
  const combined=makeMap(title||"Your AI mind map",title||"Your AI mind map");
  combined.nodes[combined.root].children=[];
  for(let i=0;i<chunks.length;i++){
   if(status)status.textContent=chunks.length>1?"Creating mind map · section "+(i+1)+" of "+chunks.length+"…":"Reading your material and building your mind map…";
   const part=await requestMindMapOutline(chunks[i]),partRoot=part.nodes[part.root];
   const branch=makeNode(partRoot.text||("Section "+(i+1)),combined.root);
   combined.nodes[branch.id]=branch;combined.nodes[combined.root].children.push(branch.id);
   for(const childId of partRoot.children){
    const copyTree=(oldId,parentId)=>{
     const old=part.nodes[oldId],copy=makeNode(old.text,parentId,old.definition||"");
     combined.nodes[copy.id]=copy;combined.nodes[parentId].children.push(copy.id);
     copy.collapsed=!!old.collapsed;
     old.children.forEach(id=>copyTree(id,copy.id));
    };
    copyTree(childId,branch.id);
   }
  }
  combined.title=title||combined.nodes[combined.root].text;
  importMap(combined);
 }catch(error){alert("Couldn't create the AI mind map: "+(error.message||"Please try again."));if(status)status.textContent="";}
 finally{btn.disabled=false;btn.textContent="✧ Generate AI mind map";}
}
$("importTextBtn").onclick=e=>{e.preventDefault();createAIMindMap($("importText").value);};
$("pdfNotesBtn").onclick=()=>{const dialog=$("importDialog");if(dialog&&!dialog.open)dialog.showModal();};
$("pdfChooseBtn").onclick=()=>$("pdfFile").click();
const presets={"Study plan":["Study plan",["Subjects","Weekly timetable","Revision","Practice questions","Goals"]],"Project planner":["Project planner",["Purpose","Research","Tasks","Timeline","Resources","Next steps"]],"Brainstorm":["Brainstorm",["Problem","Ideas","Possibilities","Questions","Next actions"]],"Weekly goals":["Weekly goals",["Personal","Study / Work","Health","Important tasks","Things to look forward to"]]};
document.querySelectorAll(".idea-card").forEach(b=>b.onclick=()=>{const [title,branches]=presets[b.dataset.template],m=makeMap(title,title);branches.forEach(t=>{const n=makeNode(t,m.root);m.nodes[n.id]=n;m.nodes[m.root].children.push(n.id);});maps.unshift(m);activeId=m.id;selectedId=m.root;editor();save();});


async function loadTesseract(){if(window.Tesseract)return window.Tesseract;await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";script.onload=resolve;script.onerror=()=>reject(new Error("Handwriting reader couldn't load. Check your internet connection and try again."));document.head.appendChild(script);});if(!window.Tesseract)throw new Error("Handwriting reader did not start.");return window.Tesseract;}
async function readScannedPdf(pdfDoc){
 const Tesseract=await loadTesseract(),worker=await Tesseract.createWorker("eng",1,{logger:info=>{if(info.status==="recognizing text")$("aiStatus").textContent="Reading handwriting… "+Math.round((info.progress||0)*100)+"%";}});
 const parts=[];
 try{
  for(let i=1;i<=pdfDoc.numPages;i++){
   $("aiStatus").textContent="Reading handwritten page "+i+" of "+Math.min(pdfDoc.numPages,8)+"…";
   const page=await pdfDoc.getPage(i),viewport=page.getViewport({scale:2}),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
   canvas.width=viewport.width;canvas.height=viewport.height;
   await page.render({canvasContext:ctx,viewport}).promise;
   const result=await worker.recognize(canvas);
   const text=String(result.data.text||"").trim();if(text)parts.push(text);
   canvas.width=0;canvas.height=0;
  }
 }finally{await worker.terminate();}
 return parts.join("\n\n").trim();
}
$("pdfFile").onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 const status=$("aiStatus");status.textContent="Opening your PDF…";
 try{
  if(!window.pdfjsLib)throw new Error("PDF reader couldn't load. Refresh the page and try again.");
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdfDoc=await pdfjsLib.getDocument(await file.arrayBuffer()).promise,parts=[];
  for(let i=1;i<=pdfDoc.numPages;i++){
   status.textContent="Extracting text from page "+i+"…";
   const page=await pdfDoc.getPage(i),content=await page.getTextContent(),txt=content.items.map(x=>x.str).join(" ").trim();
   if(txt)parts.push(txt);
  }
  let source=parts.join("\n\n").trim();
  if(source.length<30){
   status.textContent="This looks like a scanned or handwritten PDF. Starting handwriting recognition…";
   source=await readScannedPdf(pdfDoc);
  }
  
  if(!source||source.length<10)throw new Error("I couldn't recognize enough writing in this PDF. Try a clearer, well-lit scan with darker handwriting.");
  $("importText").value=source;
  status.textContent="PDF text extracted. Creating your AI mind map…";
  if(!$("importDialog").open)$("importDialog").showModal();
  await createAIMindMap(source,file.name.replace(/\.pdf$/i,""));
 }catch(err){status.textContent="";alert("Couldn't read this PDF: "+(err.message||"Please try a clearer scan."));}
 e.target.value="";
};


$("signOutBtn").onclick=async()=>{try{await signOut(auth);}catch(error){alert("Couldn't sign out: "+(error.message||"Please try again."));}};
onAuthStateChanged(auth,async user=>{cloudUser=user;updateAccountUI(user);if(user){await syncCloud();}});

// Swipeable Study Mode: definition first, then only the programming sections that exist.
let studySlides=[],studyIndex=0;
function startStudyMode(){
 const m=current(),root=get(selectedId)||get(m.root);if(!m||!root)return;
 const descendants=[];
 function collect(id){const node=m.nodes[id];if(!node)return;descendants.push(node);node.children.forEach(collect);}
 root.children.forEach(collect);
 const kind=node=>{const label=String(node.text||"").trim().toLowerCase();if(/^syntax\b/.test(label))return "Syntax";if(/^code\b/.test(label))return "Code";if(/^example\b/.test(label))return "Example";return "";};
 const contentFor=node=>{
  const parts=[];if(node.definition)parts.push(node.definition);
  const addChildren=id=>{const parent=m.nodes[id];if(!parent)return;parent.children.forEach(childId=>{const child=m.nodes[childId];if(!child)return;parts.push(child.text+(child.definition?"\n"+child.definition:""));addChildren(childId);});};
  addChildren(node.id);return parts.join("\n\n").trim();
 };
 const theory=descendants.filter(node=>!kind(node));
 const definitionParts=[];if(root.definition)definitionParts.push(root.definition);
 theory.forEach(node=>{const level=(()=>{let d=0,p=node;while(p&&p.parent&&p.parent!==root.id){d++;p=m.nodes[p.parent];}return d;})();definitionParts.push((level?"• ":"")+node.text+(node.definition?"\n"+node.definition:""));});
 studySlides=[{label:"Definition",content:definitionParts.join("\n\n").trim()||"Add a definition using the ⓘ button on this topic. Theory notes from its branches will also appear here."}];
 ["Syntax","Code","Example"].forEach(label=>{const matches=descendants.filter(node=>kind(node)===label);if(matches.length){studySlides.push({label,content:matches.map(contentFor).filter(Boolean).join("\n\n")||("Add "+label.toLowerCase()+" content to this branch.")});}});
 studyIndex=0;$("studyTopicTitle").textContent=root.text+" · Study Mode";renderStudySlide();$("studyDialog").showModal();
}
function renderStudySlide(){
 const slide=studySlides[studyIndex];if(!slide)return;
 $("studySlideLabel").textContent=slide.label.toUpperCase();$("studySlideContent").textContent=slide.content;
 $("studySlide").classList.toggle("study-code",slide.label==="Code");
 $("studyCounter").textContent=(studyIndex+1)+" / "+studySlides.length;
 $("studyProgressFill").style.width=((studyIndex+1)/studySlides.length*100)+"%";
 $("studyPrevBtn").disabled=studyIndex===0;
 $("studyNextBtn").disabled=studyIndex===studySlides.length-1;
 $("studyNextBtn").textContent=studyIndex===studySlides.length-1?"Finished":"Next →";
}
function moveStudySlide(direction){const next=studyIndex+direction;if(next<0||next>=studySlides.length)return;studyIndex=next;renderStudySlide();}
$("studyModeBtn").onclick=startStudyMode;
$("closeStudyBtn").onclick=()=>$("studyDialog").close();
$("studyPrevBtn").onclick=()=>moveStudySlide(-1);
$("studyNextBtn").onclick=()=>{if(studyIndex===studySlides.length-1)$("studyDialog").close();else moveStudySlide(1);};
let studyTouchX=0;
$("studySlide").addEventListener("touchstart",e=>{studyTouchX=e.changedTouches[0].clientX;},{passive:true});
$("studySlide").addEventListener("touchend",e=>{const delta=e.changedTouches[0].clientX-studyTouchX;if(Math.abs(delta)>45)moveStudySlide(delta<0?1:-1);},{passive:true});
$("studyDialog").addEventListener("keydown",e=>{if(e.key==="ArrowRight")moveStudySlide(1);if(e.key==="ArrowLeft")moveStudySlide(-1);});

load();renderLists();dashboard();
})();