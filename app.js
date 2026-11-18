(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const app = $("#app"), modal = $("#modal"), modalBody = $("#modalBody");
  let state;
  let currentPage = "overview";
  let modalAction = null;
  let selectedHistoryCylinderId = "";
  const today = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
  const dateText = v => v ? new Date(v + "T00:00:00").toLocaleDateString("zh-TW") : "—";
  const daysBetween = (a,b) => {
    if (!a || !b) return 0;
    const start = new Date(a + "T00:00:00");
    const end = new Date(b + "T00:00:00");
    return Math.max(0, Math.floor((end-start)/86400000));
  };
  const currentDays = c => {
    const p = c.periods?.find(x => !x.endDate);
    return p ? daysBetween(p.startDate, today()) : 0;
  };
  const totalDays = c => (c.periods || []).reduce((n,p) => n + daysBetween(p.startDate,p.endDate),0) + currentDays(c);
  const fmtDays = n => Number(n || 0).toLocaleString("zh-TW") + " 天";
  const fmtOverviewDays = n => { const days=Math.max(0,Math.floor(Number(n)||0)); const years=Math.floor(days/365); const months=Math.floor((days%365)/30); return fmtDays(days)+`（${years}年${months}個月）`; };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const getCyl = id => state.cylinders.find(c => c.id === id);
  const statusLabel = s => ({in_use:"使用中",spare_in:"備品－入料端",spare_out:"備品－出料端",spare_2f:"備品－2F儲位",repair:"維修中",inspect:"待檢查",scrapped:"報廢",inactive:"已停用"}[s] || s);
  const spareReadiness = c => c.spareReadiness || "ready";
  const readinessLabel = c => spareReadiness(c)==="needs_prep"?"需整備":"可用";
  const statusClass = s => s==="in_use"?"green":s==="repair"||s==="inspect"?"orange":s==="scrapped"?"red":"";
  const activeCylinders = () => state.cylinders.filter(c => c.active !== false);
  const addEvent = (type, c, detail, date=today()) => state.events.unshift({id:crypto.randomUUID(),date,type,code:c?.code || "—",detail});
  const save = async () => { await CYLDB.save(state); $("#storageStatus").textContent = "已儲存於本機"; updateUndoButton(); };
  const checkpoint = () => { const snapshot=JSON.parse(JSON.stringify(state)); snapshot.undoSnapshot=null; state.undoSnapshot=snapshot; };
  const updateUndoButton = () => { const b=$("#undoTop"); if(b) b.disabled=!state?.undoSnapshot; };
  async function undoLast() {
    if(!state?.undoSnapshot) return;
    if(!confirm("確定復原上一筆異動？目前資料將回到異動前的狀態。")) return;
    const previous=state.undoSnapshot; state={...previous,undoSnapshot:null};
    await save(); render(); $("#storageStatus").textContent="已復原上一筆異動";
  }
  const pageHead = (title,desc,action="") => `<div class="page-head"><div><h2>${title}</h2><div class="muted">${desc}</div></div>${action}</div>`;
  const btn = (label,action,cls="button button-primary") => `<button class="${cls}" data-action="${action}">${label}</button>`;
  const empty = text => `<div class="empty-state">${text}</div>`;
  const positionCard = (p, showYears=false) => {
    const c = getCyl(p.cylinderId);
    return `<div class="slot ${c?"":"empty"}"><div class="slot-number">位置 ${p.slot}</div><div class="slot-code">${c?esc(c.code):"未安裝"}</div><div class="slot-days">${c?(showYears?fmtOverviewDays(currentDays(c)):fmtDays(currentDays(c))):"—"}</div>${btn(c?"更換":"安裝",`position:${p.id}`,"button button-light button-small")}</div>`;
  };
  function overview() {
    const cylinders=activeCylinders(), used=cylinders.filter(c=>c.status==="in_use").length;
    const spares=cylinders.filter(c=>c.status==="spare_in"||c.status==="spare_out"||c.status==="spare_2f").length;
    const repairs=cylinders.filter(c=>c.status==="repair").length;
    const longest=cylinders.filter(c=>c.status==="in_use").sort((a,b)=>currentDays(b)-currentDays(a))[0];
    const furnace = n => {
      const areas=[`${n}號入料`,`${n}號出料`];
      return `<section class="furnace"><h3>${n}號加熱爐</h3><div class="area-grid">${areas.map(area=>`<div class="area-card"><h4>${area}端</h4><div class="slots">${state.positions.filter(p=>p.area===area).map(p=>positionCard(p,true)).join("")}</div></div>`).join("")}</div></section>`;
    };
    app.innerHTML=pageHead("設備總覽","兩座加熱爐共 16 個線上位置，位置順序由左至右為 4、3、2、1。")
      +`<div class="stats"><div class="stat"><div class="stat-label">線上使用中</div><div class="stat-value">${used}<small> / 16</small></div><div class="stat-note">目前安裝的油壓缸</div></div><div class="stat"><div class="stat-label">備品數量</div><div class="stat-value">${spares}</div><div class="stat-note">入料端、出料端與 2F 儲位</div></div><div class="stat"><div class="stat-label">維修中</div><div class="stat-value">${repairs}</div><div class="stat-note">尚未完成維修</div></div><div class="stat"><div class="stat-label">上線最久</div><div class="stat-value" style="font-size:19px">${longest?esc(longest.code):"—"}</div><div class="stat-note">${longest?fmtOverviewDays(currentDays(longest)):"目前沒有線上使用中的油壓缸"}</div></div></div>
      <div class="overview-furnaces"><div class="furnace-grid">${furnace(1)}${furnace(2)}</div></div>
      <div class="grid-two" style="margin-top:16px"><section class="panel"><h3>近期異動</h3>${eventList(state.events.slice(0,6))}</section><section class="panel"><h3>當前使用天數排行</h3>${ranking(cylinders,"current")}</section></div>`;
  }
  function eventList(events) {
    return events.length?`<div class="record-list">${events.map(e=>`<div class="record"><div class="record-main"><div class="record-title">${esc(e.code)} · ${esc(e.type)}</div><div class="record-meta">${dateText(e.date)}　${esc(e.detail)}</div></div></div>`).join("")}</div>`:empty("尚無異動紀錄");
  }
  function cylinderPositionCode(c) {
    const periods=c.periods||[];
    const p=periods.find(x=>!x.endDate)||[...periods].sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""))[0];
    if(!p||!p.area||!p.slot)return "—";
    const areaMap={"1號入料":"C#1","1號出料":"E#1","2號入料":"C#2","2號出料":"E#2"};
    const prefix=areaMap[p.area];
    return prefix?prefix+"-"+p.slot:"—";
  }
  function ranking(cylinders, mode="total") {
    const metric=mode==="current"?currentDays:totalDays;
    const candidates=mode==="current"?cylinders.filter(c=>c.status==="in_use"):[...cylinders];
    const top=[...candidates].sort((a,b)=>metric(b)-metric(a)).slice(0,5), max=Math.max(1,...top.map(metric));
    return top.length?`<div class="rank-list">${top.map((c,i)=>`<div class="rank-item"><span class="rank-number">${i+1}</span><div><b>${esc(c.code)}</b><div class="muted" style="font-size:12px;margin-top:2px">位置：${esc(cylinderPositionCode(c))}</div><div class="rank-bar"><div class="rank-fill" style="width:${metric(c)/max*100}%"></div></div></div><b>${mode==="current"?fmtOverviewDays(metric(c)):fmtDays(metric(c))}</b></div>`).join("")}</div>`:empty(mode==="current"?"目前沒有線上使用中的油壓缸":"新增油壓缸後會顯示排行");
  }
  function online() {
    const areas=["1號入料","1號出料","2號入料","2號出料"];
    app.innerHTML=pageHead("線上設備管理","查看 16 個安裝位置，安裝或更換時會自動建立使用期間紀錄。",btn("新增油壓缸","add-cylinder"))
      +`<div class="furnace-grid">${[1,2].map(n=>`<section class="furnace"><h3>${n}號加熱爐</h3><div class="area-grid">${areas.filter(a=>a.startsWith(n+"號")).map(area=>`<div class="area-card"><h4>${area}端</h4><div class="slots">${state.positions.filter(p=>p.area===area).map(positionCard).join("")}</div></div>`).join("")}</div></section>`).join("")}</div>`
      +`<section class="panel" style="margin-top:16px"><h3>目前線上油壓缸明細</h3>${cylinderTable(activeCylinders().filter(c=>c.status==="in_use"),true)}</section>`;
  }
  function spares() {
    const ins=activeCylinders().filter(c=>c.status==="spare_in"), outs=activeCylinders().filter(c=>c.status==="spare_out"), floor2=activeCylinders().filter(c=>c.status==="spare_2f");
    const table = list => list.length?`<div class="table-wrap"><table><thead><tr><th>編號</th><th>儲位</th><th>整備狀態</th><th>累積使用</th><th>操作</th></tr></thead><tbody>${list.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td><span class="pill">${statusLabel(c.status)}</span></td><td><select class="search-select spare-readiness" data-cylinder-id="${c.id}" aria-label="${esc(c.code)}整備狀態"><option value="ready" ${spareReadiness(c)==="ready"?"selected":""}>可用</option><option value="needs_prep" ${spareReadiness(c)==="needs_prep"?"selected":""}>需整備</option></select></td><td>${fmtDays(totalDays(c))}</td><td><div class="actions">${spareReadiness(c)==="ready"?btn("安裝到線上",`install:${c.id}`,"button button-primary button-small"):"<span class=\"muted\">整備完成後可安裝</span>"}${btn("送修",`repair:${c.id}`,"button button-light button-small")}${btn("調整儲位",`status:${c.id}`,"button button-light button-small")}</div></td></tr>`).join("")}</tbody></table></div>`:empty("目前沒有此類備品");
    app.innerHTML=pageHead("備品管理","備品分為入料端、出料端與 2F 儲位；可安裝、調動或送修。",btn("新增油壓缸","add-cylinder"))
      +`<div class="grid-two"><section class="panel"><h3>入料端備品（${ins.length}）</h3>${table(ins)}</section><section class="panel"><h3>出料端備品（${outs.length}）</h3>${table(outs)}</section><section class="panel"><h3>2F 儲位備品（${floor2.length}）</h3>${table(floor2)}</section></div>
      <section class="panel"><h3>維修中／待檢查</h3>${cylinderTable(activeCylinders().filter(c=>["repair","inspect"].includes(c.status)))}</section>`;
  }
  function cylinderTable(list, showInstallDate=false, databaseMode=false) {
    return list.length?`<div class="table-wrap"><table><thead><tr><th>油壓缸編號</th><th>狀態</th><th>目前位置</th>${showInstallDate?"<th>安裝日期</th>":""}<th>本次使用</th><th>累積使用</th><th>操作</th></tr></thead><tbody>${list.map(c=>{const activePeriod=(c.periods||[]).find(p=>!p.endDate);return `<tr><td><b>${esc(c.code)}</b></td><td><span class="pill ${statusClass(c.status)}">${statusLabel(c.status)}</span></td><td>${esc(c.location||"—")}</td>${showInstallDate?`<td>${c.status==="in_use"&&activePeriod?dateText(activePeriod.startDate):"—"}</td>`:""}<td>${c.status==="in_use"?fmtDays(currentDays(c)):"—"}</td><td>${fmtDays(totalDays(c))}</td><td><div class="actions">${showInstallDate?btn("狀態",`detail:${c.id}`,"button button-light button-small"):databaseMode?btn("備註",`edit:${c.id}`,"button button-light button-small"):btn("編輯",`edit:${c.id}`,"button button-light button-small")}${databaseMode?btn("歷年資訊",`history-view:${c.id}`,"button button-light button-small"):!showInstallDate?btn("狀態",`status:${c.id}`,"button button-light button-small"): ""}${!databaseMode&&!showInstallDate&&["repair","inspect"].includes(c.status)?btn("維修處理",`repair:${c.id}`,"button button-light button-small"):""}</div></td></tr>`}).join("")}</tbody></table></div>`:empty("目前沒有符合條件的油壓缸");
  }
  function database() {
    const records=state.cylinders.filter(c=>c.status!=="scrapped");
    app.innerHTML=pageHead("油壓缸資料庫","管理尚未報廢的油壓缸編號、狀態、使用時間與維修歷史。",btn("新增油壓缸","add-cylinder"))
      +`<section class="panel" style="margin-bottom:16px"><h3>累積使用天數排行</h3>${ranking(records,"total")}</section><div class="toolbar"><input id="cylSearch" class="field" placeholder="搜尋油壓缸編號"><select id="statusFilter" class="search-select"><option value="">全部狀態</option>${Object.entries({in_use:"使用中",spare_in:"備品－入料端",spare_out:"備品－出料端",spare_2f:"備品－2F儲位",repair:"維修中",inspect:"待檢查",inactive:"已停用"}).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></div><div id="cylinderResults">${cylinderTable(records,false,true)}</div>`;
  }
  function scrappedTable(list) {
    return list.length?`<div class="table-wrap"><table><thead><tr><th>油壓缸編號</th><th>狀態</th><th>最後位置</th><th>累積使用</th><th>備註</th><th>操作</th></tr></thead><tbody>${list.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td><span class="pill red">報廢</span></td><td>${esc(c.location||cylinderPositionCode(c))}</td><td>${fmtDays(totalDays(c))}</td><td>${esc(c.note||"—")}</td><td><div class="actions">${btn("備註",`edit:${c.id}`,"button button-light button-small")}${btn("歷年資訊",`history-view:${c.id}`,"button button-light button-small")}</div></td></tr>`).join("")}</tbody></table></div>`:empty("目前沒有已報廢的油壓缸");
  }
  function scrapped() {
    const records=state.cylinders.filter(c=>c.status==="scrapped");
    app.innerHTML=pageHead("報廢油壓缸","集中查看已標記為「報廢」的設備。資料仍保存在本機資料庫與備份中。")
      +`<section class="panel"><div class="stat-label">報廢數量</div><div class="stat-value">${records.length}</div><div class="toolbar" style="margin-top:14px"><input id="scrappedSearch" class="field" placeholder="搜尋報廢油壓缸編號"></div><div id="scrappedResults">${scrappedTable(records)}</div></section>`;
  }

  function historyInfo(id) {
    const c=getCyl(id); if(!c)return;
    const records=[...(c.periods||[])].sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
    const rows=records.length?`<div class="table-wrap"><table><thead><tr><th>使用位置</th><th>開始日期</th><th>結束日期</th><th>使用天數</th></tr></thead><tbody>${records.map(p=>{
      const location=p.area&&p.area!=="未記錄"?p.area+(p.slot?"－位置 "+p.slot:""):"未記錄位置";
      return `<tr><td>${esc(location)}</td><td>${dateText(p.startDate)}</td><td>${p.endDate?dateText(p.endDate):'<span class="pill green">使用中</span>'}</td><td>${fmtDays(daysBetween(p.startDate,p.endDate||today()))}</td></tr>`;
    }).join("")}</tbody></table></div>`:empty("這支油壓缸尚無歷年使用紀錄");
    openModal("歷年資訊："+c.code,`<div class="stats"><div class="stat"><div class="stat-label">累積使用時間</div><div class="stat-value">${fmtDays(totalDays(c))}</div></div><div class="stat"><div class="stat-label">使用期間筆數</div><div class="stat-value">${records.length}</div></div></div><h3>歷年使用紀錄</h3>${rows}`,async()=>{});
  }

  function usageHistory() {
    const cylinders=state.cylinders;
    if(!selectedHistoryCylinderId || !getCyl(selectedHistoryCylinderId)) selectedHistoryCylinderId=cylinders[0]?.id||"";
    const c=getCyl(selectedHistoryCylinderId);
    const selector=cylinders.length ? '<select id="usageCylinderSelect" class="search-select">'+cylinders.map(x=>'<option value="'+x.id+'" '+(x.id===c.id?'selected':'')+'>'+esc(x.code)+'</option>').join('')+'</select>' : '';
    const records=c ? [...(c.periods||[])].sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')) : [];
    const table=records.length ? '<div class="table-wrap"><table><thead><tr><th>使用位置</th><th>開始日期</th><th>結束日期</th><th>使用天數</th><th>操作</th></tr></thead><tbody>'+records.map(p=>{
      const location=p.area&&p.area!=='未記錄'?p.area+(p.slot?'－位置 '+p.slot:''):'未記錄位置';
      return '<tr><td>'+esc(location)+'</td><td>'+dateText(p.startDate)+'</td><td>'+(p.endDate?dateText(p.endDate):'<span class="pill green">使用中</span>')+'</td><td>'+fmtDays(daysBetween(p.startDate,p.endDate||today()))+'</td><td><div class="actions">'+btn('修改','period-edit:'+c.id+':'+p.id,'button button-light button-small')+(p.endDate?btn('刪除','period-delete:'+c.id+':'+p.id,'button button-danger button-small'):'')+'</div></td></tr>';
    }).join('')+'</tbody></table></div>' : empty('這支油壓缸尚無歷年使用紀錄');
    app.innerHTML=pageHead('歷年使用資料','在此補登或修改每支油壓缸過去的安裝與拆卸期間。')+
      '<section class="panel"><div class="toolbar"><b>選擇油壓缸</b>'+selector+'</div>'+
      (c?'<div class="page-head"><div><h3>'+esc(c.code)+'｜歷年使用紀錄</h3><div class="muted">累積使用時間：'+fmtDays(totalDays(c))+'</div></div>'+btn('新增歷史紀錄','period-add:'+c.id)+'</div>'+table:empty('請先到油壓缸資料庫新增油壓缸'))+'</section>';
  }
  function periodEditor(cylinderId, periodId=null) {
    const c=getCyl(cylinderId); if(!c) return;
    c.periods=c.periods||[];
    const p=periodId?c.periods.find(x=>x.id===periodId):null;
    if(periodId&&!p){alert('找不到這筆使用紀錄');return;}
    const areas=[['1號入料','1號入料端'],['1號出料','1號出料端'],['2號入料','2號入料端'],['2號出料','2號出料端'],['未記錄','未記錄／其他']];
    const slots=[['','不指定'],['1','位置 1'],['2','位置 2'],['3','位置 3'],['4','位置 4']];
    openModal(p?'修改歷年使用紀錄':'新增歷史使用紀錄',
      '<div class="hint-box">油壓缸：<b>'+esc(c.code)+'</b><br>請依照舊資料填寫安裝日期與拆卸日期。結束日期留白代表目前仍在使用中；新增歷史紀錄時必須填寫結束日期。</div><div class="form-grid" style="margin-top:14px">'+selectField('使用位置','area',areas,p?.area||'未記錄')+selectField('位置編號','slot',slots,p?.slot?String(p.slot):'')+field('開始日期','startDate',p?.startDate||today(),'date','required')+field('結束日期','endDate',p?.endDate||'','date',p?'':'required')+'</div>',
      async v=>{
        if(!v.startDate) throw Error('請填寫開始日期');
        if(!p&&!v.endDate) throw Error('新增歷史紀錄必須填寫結束日期');
        if(v.endDate&&v.endDate<v.startDate) throw Error('結束日期不可早於開始日期');
        const candidateEnd=v.endDate||'9999-12-31';
        const conflict=c.periods.some(x=>{
          if(p&&x.id===p.id)return false;
          const otherEnd=x.endDate||'9999-12-31';
          return v.startDate<otherEnd&&candidateEnd>x.startDate;
        });
        if(conflict) throw Error('這段日期與該油壓缸既有使用期間重疊，請檢查日期');
        checkpoint();
        const record={id:p?.id||crypto.randomUUID(),area:v.area||'未記錄',slot:v.slot?Number(v.slot):'',startDate:v.startDate,endDate:v.endDate||null};
        if(p) Object.assign(p,record); else c.periods.push(record);
        const detailText=(record.area==='未記錄'?'未記錄位置':record.area+(record.slot?'－位置 '+record.slot:''))+'；'+record.startDate+' 至 '+(record.endDate||'使用中');
        addEvent(p?'修改歷史使用紀錄':'補登歷史使用紀錄',c,detailText,record.endDate||record.startDate);
        await save(); currentPage='usageHistory'; selectedHistoryCylinderId=c.id; render();
      });
  }
  function deletePeriod(cylinderId,periodId) {
    const c=getCyl(cylinderId); if(!c)return;
    const p=(c.periods||[]).find(x=>x.id===periodId); if(!p)return;
    if(!p.endDate){alert('目前使用中的紀錄不可刪除。請先透過更換流程結束使用期間。');return;}
    if(!confirm('確定刪除這筆歷年使用紀錄？此操作會影響累積使用天數。'))return;
    checkpoint();c.periods=c.periods.filter(x=>x.id!==periodId);
    addEvent('刪除歷史使用紀錄',c,(p.area||'未記錄')+'；'+p.startDate+' 至 '+p.endDate,p.endDate);
    save().then(()=>{selectedHistoryCylinderId=c.id;currentPage='usageHistory';render();});
  }
  function history() {
    app.innerHTML=pageHead("異動與維修紀錄","安裝、拆卸、更換、備品調動、故障與維修完成紀錄。")
      +`<div class="toolbar"><input id="eventSearch" class="field" placeholder="搜尋編號或紀錄內容"></div><section class="panel"><div id="eventResults">${eventList(state.events)}</div></section>`;
  }
  function settings() {
    app.innerHTML=pageHead("資料備份與還原","所有設備資料保存在目前手機／瀏覽器。建議定期匯出備份。")
      +`<section class="panel"><h3>資料備份</h3><p class="muted">匯出完整 JSON 檔案，包含油壓缸資料、使用期間、維修紀錄與異動歷史。</p>${btn("匯出備份檔","export","button button-primary")}</section><section class="panel"><h3>資料還原</h3><p class="muted">選擇先前匯出的 JSON 備份。還原會以備份內容取代目前手機中的資料。</p>${btn("選擇備份檔還原","import","button button-light")}</section><section class="panel"><h3>本機資料注意事項</h3><div class="hint-box">資料不會上傳到 GitHub 或雲端。清除 Safari 網站資料、移除瀏覽器資料或更換手機可能造成資料遺失。請定期備份，並將備份檔另存到安全位置。不同手機之間不會自動同步。</div></section>`;
  }
  function render() {
    $$(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.page===currentPage));
    ({overview,online,spares,database,scrapped,usageHistory,history,settings}[currentPage] || overview)();
  }
  function field(label,name,value="",type="text",extra="") {
    return `<div class="form-field"><label for="f_${name}">${label}</label><input class="field" id="f_${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  }
  function selectField(label,name,options,value) {
    return `<div class="form-field"><label for="f_${name}">${label}</label><select id="f_${name}" name="${name}">${options.map(([v,l])=>`<option value="${v}" ${v===value?"selected":""}>${l}</option>`).join("")}</select></div>`;
  }
  function openModal(title,html,action) {
    $("#modalTitle").textContent=title; modalBody.innerHTML=html; modalAction=action; modal.showModal();
  }
  function values() { return Object.fromEntries(new FormData($("#modalForm")).entries()); }
  function addCylinder() {
    openModal("新增油壓缸",`<div class="form-grid">${field("油壓缸編號","code","","text",'required maxlength="40"')}${selectField("初始狀態","status",[["spare_in","備品－入料端"],["spare_out","備品－出料端"],["spare_2f","備品－2F儲位"],["inspect","待檢查"],["repair","維修中"]],"spare_in")}${field("備註","note")}</div><p class="help">編號需唯一。若油壓缸目前已安裝在線上，請新增後再執行安裝。</p>`,async v=>{
      const code=v.code.trim(); if(!code) throw Error("請輸入油壓缸編號");
      if(state.cylinders.some(c=>c.code.toLowerCase()===code.toLowerCase())) throw Error("此編號已存在");
      checkpoint();
      const c={id:crypto.randomUUID(),code,status:v.status,location:"",active:true,note:v.note,periods:[],repairs:[],createdAt:today()};
      state.cylinders.push(c); addEvent("新增油壓缸",c,v.note||statusLabel(v.status)); await save(); render();
    });
  }
  function positionAction(id) {
    const p=state.positions.find(x=>x.id===id); const old=getCyl(p.cylinderId);
    const options=activeCylinders().filter(c=>["spare_in","spare_out","spare_2f"].includes(c.status)&&spareReadiness(c)==="ready");
    openModal(old?"更換線上油壓缸":"安裝油壓缸",`<div class="hint-box">位置：${p.area}端／位置 ${p.slot}${old?"。目前安裝："+esc(old.code)+"，確認後會結束舊油壓缸本次使用期間，並將舊設備轉為備品。":""}</div><div class="form-grid" style="margin-top:14px">${selectField("選擇要安裝的油壓缸","cylinderId",[["","請選擇"],...options.map(c=>[c.id,c.code+"（"+statusLabel(c.status)+"）"])],"")}${field("安裝日期","date",today(),"date")}</div>`,async v=>{
      const c=getCyl(v.cylinderId); if(!c) throw Error("請選擇油壓缸");
      if(old && old.id===c.id) throw Error("不能將同一支油壓缸重新安裝在原位置");
      checkpoint();
      if(old){const period=old.periods.find(x=>!x.endDate);if(period)period.endDate=v.date;old.status=p.area.includes("入料")?"spare_in":"spare_out";old.spareReadiness="needs_prep";old.location="";addEvent("拆卸",old,p.area+"位置 "+p.slot+"；轉為"+statusLabel(old.status),v.date);}
      c.status="in_use";c.location=p.area+"－位置 "+p.slot;c.periods.push({id:crypto.randomUUID(),area:p.area,slot:p.slot,startDate:v.date,endDate:null});p.cylinderId=c.id;addEvent(old?"更換安裝":"安裝",c,c.location,v.date);await save();render();
    });
  }
  function adjustOnlinePosition(id) {
    const c=getCyl(id), current=state.positions.find(p=>p.cylinderId===id);
    if(!c||c.status!=="in_use"||!current){alert("找不到這支油壓缸目前的線上位置，請先檢查設備總覽。");return;}
    const targets=state.positions.filter(p=>!p.cylinderId&&p.id!==current.id);
    if(!targets.length){alert("目前沒有空的線上位置可供調整。");return;}
    openModal("調整線上位置",`<div class="hint-box">油壓缸：${esc(c.code)}<br>目前位置：${esc(current.area)}－位置 ${current.slot}</div><div class="form-grid" style="margin-top:14px">${selectField("新位置","positionId",targets.map(p=>[p.id,p.area+"－位置 "+p.slot]),targets[0].id)}</div><p class="help">此操作只移動線上位置，不會結束本次使用期間。</p>`,async v=>{
      const target=state.positions.find(p=>p.id===v.positionId);
      if(!target||target.cylinderId)throw Error("目標位置已被占用，請重新選擇");
      checkpoint();current.cylinderId=null;target.cylinderId=c.id;c.location=target.area+"－位置 "+target.slot;
      addEvent("線上位置調整",c,"由 "+current.area+"－位置 "+current.slot+" 移至 "+target.area+"－位置 "+target.slot);
      await save();render();
    });
  }
  function installSpare(id) {
    const c=getCyl(id);
    if(spareReadiness(c)!=="ready") { alert("此油壓缸目前標記為「需整備」，整備完成並改為「可用」後才能安裝。"); return; }
    const positions=state.positions.filter(p=>!p.cylinderId);
    openModal("安裝備品",`<div class="form-grid">${selectField("安裝位置","positionId",positions.map(p=>[p.id,p.area+"－位置 "+p.slot]),positions[0]?.id||"")}${field("安裝日期","date",today(),"date")}</div>`,async v=>{
      const p=state.positions.find(x=>x.id===v.positionId);if(!p||p.cylinderId)throw Error("該位置已被安裝，請重新選擇");
      checkpoint();c.status="in_use";c.location=p.area+"－位置 "+p.slot;c.periods.push({id:crypto.randomUUID(),area:p.area,slot:p.slot,startDate:v.date,endDate:null});p.cylinderId=c.id;addEvent("備品安裝",c,c.location,v.date);await save();render();
    });
  }
  function removeCylinder(id) {
    const c=getCyl(id),p=state.positions.find(x=>x.cylinderId===id);
    openModal("拆卸油壓缸",`<div class="form-grid">${field("拆卸日期","date",today(),"date")}${selectField("拆卸後狀態","status",[["spare_in","備品－入料端"],["spare_out","備品－出料端"],["spare_2f","備品－2F儲位"],["repair","維修中"],["inspect","待檢查"],["scrapped","報廢"]],p?.area.includes("入料")?"spare_in":"spare_out")}${field("故障原因／備註","detail")}</div>`,async v=>{
      const period=c.periods.find(x=>!x.endDate);if(period&&v.date<period.startDate)throw Error("拆卸日期不可早於安裝日期");
      checkpoint();if(period)period.endDate=v.date;
      if(p)p.cylinderId=null;c.status=v.status;c.location="";if(["spare_in","spare_out","spare_2f"].includes(v.status))c.spareReadiness="needs_prep";if(v.status==="repair")c.repairs.push({id:crypto.randomUUID(),startDate:v.date,reason:v.detail||"",content:"",endDate:null});addEvent("拆卸",c,statusLabel(v.status)+(v.detail?"；"+v.detail:""),v.date);await save();render();
    });
  }
  function repairAction(id) {
    const c=getCyl(id);
    openModal("維修處理",`<div class="form-grid">${selectField("處理狀態","status",[["repair","維修中"],["inspect","待檢查"],["spare_in","維修完成－入料端備品"],["spare_out","維修完成－出料端備品"],["spare_2f","維修完成－2F儲位"],["scrapped","報廢"]],c.status)}${field("日期","date",today(),"date")}<div class="form-field full"><label>故障原因／現象</label><textarea name="reason" rows="2">${esc(c.repairs.at(-1)?.reason||"")}</textarea></div><div class="form-field full"><label>維修內容</label><textarea name="content" rows="2">${esc(c.repairs.at(-1)?.content||"")}</textarea></div></div>`,async v=>{
      checkpoint();c.status=v.status; c.location="";
      let r=c.repairs.at(-1);if(!r||r.endDate){r={id:crypto.randomUUID(),startDate:v.date};c.repairs.push(r);}
      r.reason=v.reason;r.content=v.content;if(["spare_in","spare_out","spare_2f","scrapped"].includes(v.status))r.endDate=v.date;
      addEvent(v.status.startsWith("spare")?"維修完成":statusLabel(v.status),c,[v.reason,v.content].filter(Boolean).join("；")||"狀態更新",v.date);await save();render();
    });
  }
  function statusAction(id) {
    const c=getCyl(id);
    if(c.status==="in_use") { removeCylinder(id); return; }
    openModal("調整油壓缸狀態",`<div class="hint-box">若設備目前仍在線上，請使用「拆卸」功能，系統會同步更新線上位置與使用期間。</div><div class="form-grid">${selectField("新狀態","status",[["spare_in","備品－入料端"],["spare_out","備品－出料端"],["spare_2f","備品－2F儲位"],["repair","維修中"],["inspect","待檢查"],["scrapped","報廢"],["inactive","停用"]],c.status)}${field("異動日期","date",today(),"date")}<div class="form-field full"><label><input type="checkbox" name="confirmChange" value="yes" required> 我確認要變更這支油壓缸的狀態</label></div></div>`,async v=>{if(v.confirmChange!=="yes")throw Error("請先勾選確認");checkpoint();c.status=v.status;c.location="";addEvent("狀態調整",c,statusLabel(v.status),v.date);await save();render();});
  }
  function editCylinder(id) {
    const c=getCyl(id);
    openModal("編輯油壓缸資料",`<div class="form-grid">${field("油壓缸編號","code",c.code)}${field("備註","note",c.note||"")}</div><p class="help">如需停用，請使用狀態調整。已有歷史的油壓缸不建議直接刪除。</p>`,async v=>{
      const code=v.code.trim();if(!code)throw Error("編號不可空白");if(state.cylinders.some(x=>x.id!==id&&x.code.toLowerCase()===code.toLowerCase()))throw Error("此編號已存在");checkpoint();c.code=code;c.note=v.note;addEvent("資料修改",c,"更新編號或備註");await save();render();
    });
  }
  function detail(id) {
    const c=getCyl(id);
    const periods=(c.periods||[]).map(p=>`<div class="record"><div><div class="record-title">${esc(p.area)}－位置 ${p.slot}</div><div class="record-meta">${dateText(p.startDate)} 至 ${dateText(p.endDate)} · ${fmtDays(daysBetween(p.startDate,p.endDate||today()))}</div></div></div>`).join("");
    const repairs=(c.repairs||[]).map(r=>`<div class="record"><div><div class="record-title">維修 · ${dateText(r.startDate)}</div><div class="record-meta">${esc(r.reason||"未填原因")}；${esc(r.content||"未填維修內容")}；完成：${dateText(r.endDate)}</div></div></div>`).join("");
    openModal("油壓缸狀態："+c.code,`<div class="hint-box"><b>備註：</b>${esc(c.note||"無")}</div><div class="stats"><div class="stat"><div class="stat-label">本次使用</div><div class="stat-value">${fmtDays(currentDays(c))}</div></div><div class="stat"><div class="stat-label">累積使用</div><div class="stat-value">${fmtDays(totalDays(c))}</div></div></div><h3>安裝／拆卸期間</h3>${periods||empty("尚無使用期間")}<h3 style="margin-top:18px">維修紀錄</h3>${repairs||empty("尚無維修紀錄")}`,async()=>{});
  }
  async function updateToLatest() {
    const button=$("#updateTop");
    if(button){button.disabled=true;button.textContent="檢查更新中…";}
    let reloading=false;
    const reloadOnChange=()=>{
      reloading=true;
      $("#storageStatus").textContent="新版已啟用，正在重新載入…";
      location.reload();
    };
    if("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange",reloadOnChange,{once:true});
    try {
      if(!("serviceWorker" in navigator)) throw Error("此瀏覽器不支援離線更新，請直接重新整理網頁。");
      let registration=await navigator.serviceWorker.getRegistration();
      if(!registration) registration=await navigator.serviceWorker.register("./service-worker.js",{updateViaCache:"none"});
      await registration.update();
      const worker=registration.installing;
      if(worker) {
        await new Promise((resolve,reject)=>{
          if(worker.state==="activated"){resolve();return;}
          worker.addEventListener("statechange",()=>{
            if(worker.state==="activated") resolve();
            else if(worker.state==="redundant") reject(Error("新版安裝失敗，請稍後再試。"));
          });
        });
        if(!reloading) location.reload();
        return;
      }
      if(registration.waiting) {
        registration.waiting.postMessage({type:"SKIP_WAITING"});
        $("#storageStatus").textContent="已找到新版，正在啟用…";
        return;
      }
      $("#storageStatus").textContent="目前已是最新版本";
      if(button){button.textContent="已是最新版本";button.disabled=false;}
      setTimeout(()=>{if(button&&button.textContent==="已是最新版本")button.textContent="更新至最新";},2500);
    } catch(error) {
      alert("更新檢查失敗："+(error.message||"請確認網路連線後重試。"));
      if(button){button.disabled=false;button.textContent="更新至最新";}
    } finally {
      if(!reloading && button && button.textContent==="檢查更新中…"){button.disabled=false;button.textContent="更新至最新";}
    }
  }
  function exportData() {
    const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="CYL-油壓缸資料備份-"+today()+".json";a.click();URL.revokeObjectURL(url);
  }
  function importData(file) {
    const reader=new FileReader();reader.onload=async()=>{
      try{const data=JSON.parse(reader.result);if(!Array.isArray(data.cylinders)||!Array.isArray(data.positions)||!Array.isArray(data.events))throw Error("備份檔格式不正確");
        if(!confirm("還原會取代此手機目前的全部資料，確定繼續？"))return;
        state={version:1,cylinders:data.cylinders,positions:data.positions,events:data.events};await save();render();alert("資料還原完成");
      }catch(e){alert("還原失敗："+e.message);}
    };reader.readAsText(file);
  }
  app.addEventListener("change",async e=>{
    if(e.target.id==="usageCylinderSelect"){selectedHistoryCylinderId=e.target.value;render();return;}
    if(!e.target.matches(".spare-readiness"))return;
    const c=getCyl(e.target.dataset.cylinderId);if(!c)return;
    checkpoint();c.spareReadiness=e.target.value;
    addEvent("備品整備狀態調整",c,readinessLabel(c));
    await save();render();
  });
  app.addEventListener("click",e=>{
    const b=e.target.closest("[data-action]");if(!b)return;
    const [action,id,subId]=b.dataset.action.split(":");
    if(action==="add-cylinder")addCylinder();
    else if(action==="position")positionAction(id);
    else if(action==="install")installSpare(id);
    else if(action==="remove")removeCylinder(id);
    else if(action==="repair")repairAction(id);
    else if(action==="status")statusAction(id);
    
    else if(action==="edit")editCylinder(id);
    else if(action==="detail")detail(id);
    else if(action==="history-view")historyInfo(id);
    else if(action==="history-add"){selectedHistoryCylinderId=id;currentPage="usageHistory";render();periodEditor(id);}
    else if(action==="period-add")periodEditor(id);
    else if(action==="period-edit")periodEditor(id,subId);
    else if(action==="period-delete")deletePeriod(id,subId);
    else if(action==="export")exportData();
    else if(action==="import")$("#importFile").click();
  });
  $("#modalForm").addEventListener("submit",async e=>{
    if(e.submitter?.value==="cancel")return;
    e.preventDefault();try{if(modalAction)await modalAction(values());modal.close();}catch(err){alert(err.message||"操作失敗");}
  });
  $$(".nav-button").forEach(b=>b.addEventListener("click",()=>{currentPage=b.dataset.page;render();}));
  $("#backupTop").addEventListener("click",exportData);
  $("#updateTop").addEventListener("click",updateToLatest);
  $("#undoTop").addEventListener("click",undoLast);
  $("#importFile").addEventListener("change",e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value="";});
  app.addEventListener("input",e=>{
    if(e.target.id==="cylSearch"||e.target.id==="statusFilter"){
      const q=($("#cylSearch")?.value||"").toLowerCase(),s=$("#statusFilter")?.value||"";
      const list=state.cylinders.filter(c=>c.status!=="scrapped"&&c.code.toLowerCase().includes(q)&&(!s||c.status===s));
      $("#cylinderResults").innerHTML=cylinderTable(list,false,true);
    }
    if(e.target.id==="scrappedSearch"){
      const q=e.target.value.toLowerCase();
      const list=state.cylinders.filter(c=>c.status==="scrapped"&&c.code.toLowerCase().includes(q));
      const target=$("#scrappedResults");
      if(target) target.innerHTML=scrappedTable(list);
    }
    if(e.target.id==="eventSearch"){
      const q=e.target.value.toLowerCase();$("#eventResults").innerHTML=eventList(state.events.filter(x=>(x.code+" "+x.detail+" "+x.type).toLowerCase().includes(q)));
    }
  });
  async function init(){
    try{
      state=await CYLDB.load();
      let repaired=false; const claimed=new Set();
      for(const p of state.positions){
        if(!p.cylinderId) continue;
        const c=getCyl(p.cylinderId);
        if(!c){p.cylinderId=null;repaired=true;continue;}
        if(claimed.has(c.id)){p.cylinderId=null;repaired=true;continue;}
        claimed.add(c.id);
        const expectedLocation=p.area+"－位置 "+p.slot;
        if(c.status!=="in_use"||c.location!==expectedLocation){c.status="in_use";c.location=expectedLocation;repaired=true;}
        if(!(c.periods||[]).some(x=>!x.endDate)){
          c.periods=c.periods||[];c.periods.push({id:crypto.randomUUID(),area:p.area,slot:p.slot,startDate:today(),endDate:null});repaired=true;
        }
      }
      await CYLDB.save(state); $("#storageStatus").textContent=repaired?"已修復線上設備資料":"本機儲存正常"; render();
    }
    catch(e){app.innerHTML='<section class="panel"><h2>無法啟動本機資料庫</h2><p>'+esc(e.message)+'</p><p class="muted">請使用最新版 Safari、Chrome 或 Edge，並確認瀏覽器允許網站儲存資料。</p></section>';}
    if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js",{updateViaCache:"none"}).then(reg=>reg.update()).catch(()=>{});
  }
  init();
})();