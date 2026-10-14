// 購物戰士 — 畫面與互動（由 prototype.html 拆出）
import { SYM, PRESETS, presetById } from './config.js';
import { round, parseCustom, compute, sortedPrices, bestPrice } from './calc.js';
import { $, $$, esc, uid, fmtCur, fmtTWD, pad, fmtDate, fmtDateTime, storeLabel, mapUrl, primaryPrice, isGoogleMapsUrl } from './format.js';
import { state } from './state.js';
import { icon, hydrateIcons } from './icons.js';
import { saveItem, removeItem, saveCoupon, removeCoupon, saveImage, saveSettings, setErrorHandler } from './db.js';

const persistSettings = () => saveSettings({ currency: settings.currency, rates, ratesUpdated: settings.ratesUpdated });

const { items, coupons, rates, settings } = state;

/* ---------- 圖片 ---------- */
// 壓縮：長邊最多 max px，輸出 JPEG Blob；cb({ blob, url })
function readImage(file, max, cb) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(blob => {
        if (!blob) { toast('無法開啟這個檔案，請改選 JPG 或 PNG 圖片'); return; }
        cb({ blob, url: URL.createObjectURL(blob) });
      }, 'image/jpeg', 0.88);
    };
    img.onerror = () => toast('無法開啟這個檔案，請改選 JPG 或 PNG 圖片');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
/* ---------- 價格表單（試算頁與新增價格共用） ---------- */
const forms = new Set();
function PriceForm(root, { itemId = null } = {}) {
  const id = 'pf' + uid();
  const st = { price:'', currency:settings.currency, disc:null, custom:'', tax:0, storeChoice:null, otherName:'', branch:'', mapLink:'', linkTouched:false };
  root.innerHTML = `
  <div class="stack calc-stack">
    <div class="fld zone z-white">
      <label class="lbl" for="${id}-price">原價（含稅標價）</label>
      <div class="row">
        <input class="inp big-in" id="${id}-price" data-k="price" inputmode="decimal" autocomplete="off" placeholder="0">
        <button class="cur-tag" type="button" data-act="currency" data-r="curTag"></button>
      </div>
      <div class="err" data-r="priceErr" hidden>請輸入原價</div>
      <div class="rate-line" data-r="rateLine"><span>匯率 1 <span data-r="rateCur"></span> =</span><input class="inp" data-k="rate" inputmode="decimal" aria-label="匯率（台幣）"><span>TWD</span></div>
    </div>
    <div class="fld zone z-white">
      <div class="lbl-row"><span class="lbl" id="${id}-dl">折扣</span><span class="hint">再按一次可取消</span></div>
      <div class="chips" role="group" aria-labelledby="${id}-dl">
        <button class="chip" type="button" data-disc="0.9" aria-pressed="false">9 折</button>
        <button class="chip" type="button" data-disc="0.8" aria-pressed="false">8 折</button>
        <button class="chip" type="button" data-disc="0.7" aria-pressed="false">7 折</button>
        <button class="chip" type="button" data-disc="custom" aria-pressed="false">自訂</button>
      </div>
      <div class="custom" data-r="customBox" hidden>
        <span>打</span><input class="inp" data-k="custom" inputmode="decimal" aria-label="自訂折數" placeholder="85"><span>折</span>
        <span class="hint" data-r="customHint">輸入 85 或 8.5 都代表付 85%</span>
      </div>
    </div>
    <div class="fld zone z-white" data-r="taxBox">
      <div class="lbl-row">
        <span class="lbl" id="${id}-tl">退稅</span>
        <span class="tip-wrap">
          <button class="tip-btn" type="button" aria-label="退稅說明" aria-expanded="false" aria-describedby="${id}-tip">i</button>
          <span class="tip" role="tooltip" id="${id}-tip">藥妝、化妝品、電器、衣服 10%；食品、非酒精飲料 8%。</span>
        </span>
      </div>
      <div class="chips" role="group" aria-labelledby="${id}-tl">
        <button class="chip" type="button" data-tax="0" aria-pressed="true">不退稅</button>
        <button class="chip" type="button" data-tax="0.1" aria-pressed="false">用品 10%</button>
        <button class="chip" type="button" data-tax="0.08" aria-pressed="false">食品 8%</button>
      </div>
    </div>
    <div class="result" aria-live="polite">
      <div class="res-orig">原價 <span data-r="orig">—</span></div>
      <div class="lbl" style="margin-top:6px">最終價格</div>
      <div class="twd" data-r="final">—</div>
      <div class="res-foot"><span data-r="finalTwd"></span><span class="save" data-r="save"></span></div>
      <div class="cmp" data-r="cmp" hidden></div>
    </div>
    <div class="fld zone z-white">
      <div class="lbl-row" style="justify-content:space-between">
        <span class="lbl" id="${id}-sl">店家</span>
        <a class="map-link" data-r="map" target="_blank" rel="noopener" hidden>在 Google 地圖開啟 ↗</a>
      </div>
      <div class="chips" role="group" aria-labelledby="${id}-sl" data-r="storeChips"></div>
      <input class="inp" data-k="otherName" placeholder="輸入店名" aria-label="其他店名" data-r="otherIn" hidden>
      <input class="inp" data-k="branch" placeholder="分店／地點（選填），例：心齋橋店" aria-label="分店或地點" data-r="branchIn" hidden>
      <div class="err" data-r="storeErr" hidden>請選擇或輸入店家</div>
      <div class="fld" data-r="linkBox" hidden>
        <label class="lbl" for="${id}-link">Google 地圖連結（選填）</label>
        <input class="inp" id="${id}-link" data-k="mapLink" type="url" inputmode="url" autocomplete="off" placeholder="https://maps.app.goo.gl/…">
        <span class="hint" data-r="linkHint">在 Google 地圖 App 按「分享」→「複製連結」後貼上</span>
        <div class="err" data-r="linkErr" hidden>請貼上 Google 地圖的連結，例如 https://maps.app.goo.gl/…</div>
      </div>
    </div>
  </div>`;
  const R = k => root.querySelector(`[data-r="${k}"]`);

  const linkValue = () => st.mapLink.trim();
  const linkInvalid = () => !!linkValue() && !isGoogleMapsUrl(linkValue());
  function currentStore() {
    let s = null;
    if (st.storeChoice === 'other') s = st.otherName.trim() ? { chainId:null, name:st.otherName.trim(), ja:'', branch:st.branch.trim() } : null;
    else { const p = presetById(st.storeChoice); if (p) s = { chainId:p.id, name:p.name, ja:p.ja, branch:st.branch.trim() }; }
    if (s && linkValue() && !linkInvalid()) s.mapUrl = linkValue();
    return s;
  }
  // 選同一家店（含分店）時，自動帶入上次存過的地圖連結
  function prefillLink() {
    if (st.linkTouched) return;
    const s = currentStore();
    const saved = s ? savedMapLink(s) : '';
    st.mapLink = saved;
    root.querySelector('[data-k="mapLink"]').value = saved;
    R('linkHint').textContent = saved ? '已帶入上次儲存的連結，可直接修改' : '在 Google 地圖 App 按「分享」→「複製連結」後貼上';
  }
  function refreshStore() {
    const chips = [];
    PRESETS.forEach(p => chips.push([p.id, p.name]));
    chips.push(['other', '其他']);
    R('storeChips').innerHTML = chips.map(([v, t]) => `<button class="chip sm" type="button" data-store="${v}" aria-pressed="${st.storeChoice === v}">${v === 'other' ? icon('pen') : ''}${esc(t)}</button>`).join('');
    R('otherIn').hidden = st.storeChoice !== 'other';
    R('branchIn').hidden = !st.storeChoice;
    R('linkBox').hidden = !st.storeChoice;
    R('linkErr').hidden = !linkInvalid();
    const s = currentStore();
    R('map').hidden = !s;
    if (s) R('map').href = mapUrl(s);
    if (s) R('storeErr').hidden = true;
  }
  function render() {
    st.currency = settings.currency; // 幣別在設定中切換
    const c = st.currency;
    const tag = R('curTag');
    tag.innerHTML = `${c} ${esc(SYM[c])}${icon('settings')}`;
    tag.setAttribute('aria-label', `幣別：${c}，到設定切換`);
    R('rateLine').hidden = c === 'TWD';
    R('rateCur').textContent = c;
    const rateIn = root.querySelector('[data-k="rate"]');
    if (document.activeElement !== rateIn) rateIn.value = rates[c];
    R('taxBox').hidden = c !== 'JPY';
    $$('[data-disc]', root).forEach(b => b.setAttribute('aria-pressed', String(String(st.disc) === b.dataset.disc)));
    $$('[data-tax]', root).forEach(b => b.setAttribute('aria-pressed', String(String(st.tax) === b.dataset.tax)));
    R('customBox').hidden = st.disc !== 'custom';
    const ch = R('customHint');
    const badCustom = st.disc === 'custom' && st.custom && parseCustom(st.custom) === null;
    const isFull = [10, 100].includes(parseFloat(st.custom)); // 10 折 / 100% 都等於原價
    ch.textContent = !badCustom ? '輸入 85 或 8.5 都代表付 85%'
      : isFull ? `${parseFloat(st.custom) === 10 ? '10 折' : '付 100%'}等於原價，請輸入其他折數` : '請輸入 1–99 之間的數字';
    ch.className = badCustom ? 'warnline' : 'hint';

    const r = compute(st, rates);
    if (r) R('priceErr').hidden = true;
    R('orig').textContent = r ? fmtCur(r.listPrice, c) : '—';
    R('final').textContent = r ? fmtCur(r.net, c) : '—';
    R('finalTwd').textContent = r ? (c === 'TWD' ? '' : '≈ ' + fmtTWD(r.twd)) : '輸入原價後自動計算';
    R('save').textContent = r && r.saveTWD > 0 ? '省 ' + fmtTWD(r.saveTWD) : '';

    // 比價提示
    const cmpEl = R('cmp');
    const item = itemId ? items.find(i => i.id === itemId) : null;
    showCmp(cmpEl, r && r.twd, item);
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'currency') { openSettings(); $('#set-currency').focus(); return; }
    if (b.classList.contains('tip-btn')) {
      const w = b.parentElement, open = !w.classList.contains('open');
      w.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open));
    } else if (b.dataset.disc) {
      const v = b.dataset.disc === 'custom' ? 'custom' : parseFloat(b.dataset.disc);
      st.disc = st.disc === v ? null : v;
      render();
      if (st.disc === 'custom') root.querySelector('[data-k="custom"]').focus();
    } else if (b.dataset.tax) { st.tax = parseFloat(b.dataset.tax); render(); }
    else if (b.dataset.store) {
      st.storeChoice = st.storeChoice === b.dataset.store ? null : b.dataset.store;
      // 換店家時清空分店、其他店名與連結，避免沿用上一家的資料
      st.branch = ''; st.otherName = ''; st.linkTouched = false;
      root.querySelector('[data-k="branch"]').value = '';
      root.querySelector('[data-k="otherName"]').value = '';
      prefillLink(); refreshStore(); render();
      if (st.storeChoice === 'other') R('otherIn').focus();
    }
  });
  root.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    if (k === 'rate') { const v = parseFloat(e.target.value); if (v > 0) { rates[st.currency] = v; settings.ratesUpdated = Date.now(); persistSettings(); } }
    else st[k] = e.target.value;
    if (k === 'mapLink') st.linkTouched = !!st.mapLink.trim();
    if (k === 'otherName' || k === 'branch') prefillLink();
    if (k === 'otherName' || k === 'branch' || k === 'mapLink') refreshStore();
    render();
  });

  const api = {
    render, refreshStore,
    focus() { root.querySelector('[data-k="price"]').focus(); },
    collect() {
      st.currency = settings.currency;
      const r = compute(st, rates), s = currentStore();
      R('priceErr').hidden = !!r; R('storeErr').hidden = !!s; R('linkErr').hidden = !linkInvalid();
      if (!r) { root.querySelector('[data-k="price"]').focus(); return null; }
      if (!s) { R('storeChips').querySelector('button')?.focus(); return null; }
      if (linkInvalid()) { root.querySelector('[data-k="mapLink"]').focus(); return null; }
      return { id: uid(), store: s, at: new Date(), ...r };
    },
    resetAfterSave() {
      st.price = ''; st.disc = null; st.custom = '';
      root.querySelector('[data-k="price"]').value = '';
      root.querySelector('[data-k="custom"]').value = '';
      render();
    },
    destroy() { forms.delete(api); },
  };
  forms.add(api);
  refreshStore(); render();
  return api;
}

/* ---------- 比價提示（新增價格、儲存價格對話框共用） ---------- */
function showCmp(el, twd, item) {
  const best = item && bestPrice(item);
  if (twd == null || !best) { el.hidden = true; return; }
  const d = twd - best.twd, bp = primaryPrice(best);
  el.hidden = false;
  el.className = 'cmp' + (d < 0 ? ' good' : '');
  el.textContent = d < 0 ? `🏆 比 ${storeLabel(best.store)} ${bp} 還便宜`
    : d === 0 ? `和 ${storeLabel(best.store)} 一樣價格`
    : `💡 ${storeLabel(best.store)} 記過 ${bp}，那裡便宜 ${fmtTWD(d)}`;
}

/* ---------- 資料工具 ---------- */
const findItemByName = n => { n = (n || '').trim().toLowerCase(); return n ? items.find(i => i.name.toLowerCase() === n) : null; };
function refreshDatalist() { $('#items-dl').innerHTML = items.map(i => `<option value="${esc(i.name)}"></option>`).join(''); }

/* ---------- 導覽 ---------- */
let view = 'calc', currentItemId = null, listFilter = 'all', listQuery = '';
const TITLES = { list:'購物清單', calc:'計算', coupons:'優惠券' };
function go(v, itemId) {
  view = v; currentItemId = itemId ?? null;
  $$('#main > section').forEach(s => s.hidden = true);
  $('#v-' + v).hidden = false;
  $('#back').hidden = v !== 'item';
  $('.topbar').classList.toggle('sub', v === 'item');
  $('#export-btn').hidden = v !== 'list';
  $('#settings-btn').hidden = v !== 'calc';
  const tab = v === 'item' ? 'list' : v;
  $$('.tabbar button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (v === 'list') renderList();
  if (v === 'item') renderItem();
  if (v === 'coupons') renderCoupons();
  if (v === 'calc') calcForm.render();
  $('#title').textContent = v === 'item' ? '商品詳情' : TITLES[v];
  $('#main').scrollTop = 0;
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
$('#back').addEventListener('click', () => go('list'));

/* ---------- 購物清單 ---------- */
const thumbHTML = (it, cls = 'thumb') => it.img ? `<img class="${cls}" src="${it.img}" alt="">` : `<span class="${cls} ph" aria-hidden="true">${icon('bag')}</span>`;
function rerender() { if (view === 'list') renderList(); if (view === 'item') renderItem(); }

function rowHTML(i) {
  const b = bestPrice(i), done = i.status === 'done';
  return `<li class="item-row${done ? ' is-done' : ''}">
    <label class="check"><input type="checkbox" data-check="${i.id}" ${done ? 'checked' : ''} aria-label="${done ? '移回待買' : '標記為已購買'}：${esc(i.name)}"></label>
    <button class="item-btn" type="button" data-open="${i.id}">
      ${thumbHTML(i)}
      <span class="main">
        <span class="name">${esc(i.name)}</span>
        <span class="sub">${b ? icon('pin') + esc(storeLabel(b.store)) : '尚無價格'}</span>
      </span>
      ${b ? `<span class="price-col"><span class="price">${primaryPrice(b)}</span>${b.currency !== 'TWD' ? `<span class="sub">≈ ${fmtTWD(b.twd)}</span>` : ''}</span>` : ''}
    </button>
  </li>`;
}
function renderList() {
  $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === listFilter)));
  if (!items.length) { $('#list').innerHTML = `<div class="empty"><div class="big">📝</div>清單是空的<br>在「計算」按「儲存價格」，或點下方「新增商品」</div>`; return; }
  const q = listQuery.trim().toLowerCase();
  const match = i => !q || i.name.toLowerCase().includes(q);
  const pick = status => items.filter(i => i.status === status && match(i)).sort((a, b) => b.updated - a.updated);
  const ul = list => `<ul class="list">${list.map(rowHTML).join('')}</ul>`;
  const noResult = q ? `<div class="empty">找不到「${esc(listQuery.trim())}」<br><button class="link-btn" type="button" id="clear-q">清除搜尋</button></div>` : '';
  if (listFilter === 'all') {
    const todo = pick('todo'), done = pick('done');
    if (!todo.length && !done.length) { $('#list').innerHTML = noResult; return; }
    const sec = (title, color, list, emptyText) => `<section class="zone ${color}"><h2 class="zone-h">${title}（${list.length}）</h2>`
      + (list.length ? ul(list) : `<div class="hint">${emptyText}</div>`) + '</section>';
    $('#list').innerHTML = '<div class="list-zones">' + sec('待買', 'z-white', todo, q ? '沒有符合的商品' : '都買齊了 🎉')
      + sec('已購買', 'z-mint', done, q ? '沒有符合的商品' : '勾選商品前面的方框，就會移到這裡') + '</div>';
  } else {
    const list = pick(listFilter);
    $('#list').innerHTML = list.length ? `<section class="zone ${listFilter === 'todo' ? 'z-white' : 'z-mint'}">${ul(list)}</section>`
      : (noResult || `<div class="empty">${listFilter === 'todo' ? '都買齊了 🎉' : '還沒有已購買的商品<br>勾選商品前面的方框，就會移到這裡'}</div>`);
  }
}
$$('[data-filter]').forEach(b => b.addEventListener('click', () => { listFilter = b.dataset.filter; renderList(); }));
$('#list-q').addEventListener('input', e => { listQuery = e.target.value; renderList(); });
$('#list').addEventListener('click', e => { if (e.target.id === 'clear-q') { listQuery = ''; $('#list-q').value = ''; renderList(); $('#list-q').focus(); } });
/* ---------- 花費計算 ---------- */
const purchasePrice = (it, pu) => it.prices.find(x => x.id === pu.priceId) || null;
function spendOf(list) { // list: [{ it, pu }]
  let twd = 0, missing = 0; const byCur = {};
  list.forEach(({ it, pu }) => {
    const p = purchasePrice(it, pu);
    if (!p) { missing++; return; }
    twd += p.twd; byCur[p.currency] = (byCur[p.currency] || 0) + p.net;
  });
  return { twd, byCur, count: list.length, missing };
}
function allPurchases() {
  return items.flatMap(it => it.purchases.map(pu => ({ it, pu }))).sort((a, b) => b.pu.at - a.pu.at);
}
function openExport() {
  const all = allPurchases();
  const body = $('#d-export-body');
  $('#d-export-ok').hidden = !all.length;
  if (!all.length) {
    body.innerHTML = '<div class="empty"><div class="big">🧾</div>還沒有購買紀錄<br>在清單勾選已購買的商品後，就能在這裡看到花費</div>';
    openD('d-export'); return;
  }
  const s = spendOf(all);
  const byStore = new Map();
  all.forEach(({ it, pu }) => { const p = purchasePrice(it, pu); if (!p) return; const k = storeLabel(p.store); byStore.set(k, (byStore.get(k) || 0) + p.twd); });
  const stores = [...byStore.entries()].sort((a, b) => b[1] - a[1]);
  body.innerHTML = `
    <div class="result" style="margin-bottom:12px">
      <div class="lbl">總花費</div>
      <div class="twd">${fmtTWD(s.twd)}</div>
      <div class="hint">${s.count} 筆購買・${fmtDate(all[all.length - 1].pu.at)} – ${fmtDate(all[0].pu.at)}${s.missing ? `・${s.missing} 筆未指定店家，未計入` : ''}</div>
    </div>
    <div class="section-h" style="margin-top:0">依店家</div>
    <ul class="hist">${stores.map(([k, v]) => `<li><span>${esc(k)}</span><b>${fmtTWD(v)}</b></li>`).join('')}</ul>
    <p class="hint" style="margin-bottom:0">CSV 檔可用 Excel、Numbers 或 Google 試算表開啟，包含每筆購買的日期、商品、店家、原價、折扣、退稅、最終價格與台幣金額。</p>`;
  openD('d-export');
}
function buildCSV() {
  const head = ['購買日期', '商品', '店家', '原價', '折扣', '退稅', '最終價格', '幣別', '匯率', '台幣'];
  const rows = allPurchases().map(({ it, pu }) => {
    const p = purchasePrice(it, pu);
    return [fmtDateTime(pu.at), it.name, p ? storeLabel(p.store) : '未指定店家',
      p ? p.listPrice : '', p ? p.discLabel : '', p ? (p.tax ? (p.tax === 0.08 ? '食品 8%' : '用品 10%') : '不退稅') : '',
      p ? p.net : '', p ? p.currency : '', p ? p.rate : '', p ? p.twd : ''];
  });
  const s = spendOf(allPurchases());
  rows.push([], ['合計', '', '', '', '', '', '', '', '', s.twd]);
  const csv = '﻿' + [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const d = new Date();
  const name = `購物戰士花費-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
  return { name, blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }) };
}

// iPhone 優先開啟分享選單（可存到「檔案」、用 Numbers 開啟、AirDrop…）；不支援時直接下載
async function exportCSV() {
  const { name, blob } = buildCSV();
  const file = new File([blob], name, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      toast(`已匯出「${name}」`);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // 使用者關閉分享選單
      console.warn('[export] 分享失敗，改為下載', err);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`已下載「${name}」`);
}
$('#export-btn').addEventListener('click', openExport);
$('#d-export-ok').addEventListener('click', exportCSV);

function setBought(it, on) {
  if (on) {
    const b = bestPrice(it);
    it.purchases.push({ id:uid(), at:new Date(), priceId:b ? b.id : null });
    it.status = 'done';
    toast(`「${it.name}」已移到已購買`, '復原', () => setBought(it, false));
  } else {
    const last = it.purchases.pop();
    it.status = 'todo';
    toast(`「${it.name}」已移回待買`, '復原', () => { if (last) it.purchases.push(last); it.status = 'done'; saveItem(it); rerender(); });
  }
  it.updated = new Date(); saveItem(it); rerender();
}
$('#list').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) go('item', b.dataset.open); });
$('#list').addEventListener('change', e => { const id = e.target.dataset.check; if (id) setBought(items.find(i => i.id === id), e.target.checked); });

let itemDraftImg = null;
$('#d-item-file').addEventListener('change', e => readImage(e.target.files[0], 800, im => { itemDraftImg = im; $('#d-item-prev').src = im.url; $('#d-item-prev').hidden = false; }));
$('#add-item').addEventListener('click', () => { itemDraftImg = null; $('#d-item-prev').hidden = true; $('#d-item-file').value = ''; $('#d-item-name').value = ''; $('#d-item-note').value = ''; $('#d-item-err').hidden = true; openD('d-item'); $('#d-item-name').focus(); });
$('#d-item-ok').addEventListener('click', () => {
  const name = $('#d-item-name').value.trim();
  if (!name) { $('#d-item-err').hidden = false; $('#d-item-name').focus(); return; }
  const exist = findItemByName(name);
  if (exist) { closeD('d-item'); go('item', exist.id); toast(`「${name}」已在清單中`); return; }
  const it = { id:uid(), name, imageId:null, img:null, note:$('#d-item-note').value.trim(), status:'todo', updated:new Date(), prices:[], purchases:[] };
  if (itemDraftImg) { it.imageId = uid(); it.img = itemDraftImg.url; saveImage(it.imageId, itemDraftImg.blob); }
  items.push(it); saveItem(it); refreshDatalist(); closeD('d-item'); go('item', it.id); toast('已新增商品');
});

/* ---------- 商品詳情 ---------- */
function renderItem() {
  const it = items.find(i => i.id === currentItemId);
  const el = $('#v-item');
  if (!it) { el.innerHTML = '<div class="empty">找不到這個商品</div>'; return; }
  const ps = sortedPrices(it), best = ps[0];
  const done = it.status === 'done';
  // 有購買紀錄時排在價格上方；沒有時放在下方只顯示說明
  const histHTML = `
    <div class="section-h">購買紀錄</div>
    <div class="zone z-white">
    ${it.purchases.length ? `<ul class="hist">${[...it.purchases].sort((a, b) => b.at - a.at).map(pu => {
      const pp = it.prices.find(x => x.id === pu.priceId);
      return `<li>
        <span class="hist-main">${fmtDateTime(pu.at)}<span class="hint">${pp ? esc(storeLabel(pp.store)) : '未指定店家'}</span></span>
        <span class="hist-amt">${pp ? `<b>${primaryPrice(pp)}</b>${pp.currency !== 'TWD' ? `<span class="hint">≈ ${fmtTWD(pp.twd)}</span>` : ''}` : '<span class="hint">—</span>'}</span>
        <button class="btn sm" type="button" data-editpu="${pu.id}" aria-label="編輯 ${fmtDateTime(pu.at)} 的購買紀錄">${icon('pen')}編輯</button>
      </li>`;
    }).join('')}</ul>`
    : '<div class="hint">在購物清單勾選這個商品，就會記錄購買時間。</div>'}
    </div>
`;
  el.innerHTML = `
    <div class="item-hero">
      <label class="hero-img" title="更換照片">
        ${thumbHTML(it, 'sq')}
        <span class="cam">${icon('camera')}${it.img ? '更換' : '新增照片'}</span>
        <input type="file" accept="image/*" id="item-img" class="vh" aria-label="${it.img ? '更換' : '新增'}商品照片">
      </label>
      <div class="fld zone z-white name-card">
        <div class="lbl-row" style="justify-content:space-between">
          <label class="lbl" for="item-name">商品名稱</label>
          <span class="badge ${done ? 'done' : ''}">${done ? '已購買' : '待買'}</span>
        </div>
        <input class="inp name-inp" id="item-name" value="${esc(it.name)}" autocomplete="off" enterkeyhint="done">
        <div class="err" id="item-name-err" hidden>商品名稱不能空白，已還原為原本的名稱</div>
        ${it.note ? `<div class="hint">${esc(it.note)}</div>` : ''}
      </div>
    </div>

    ${it.purchases.length ? histHTML : ''}
    <div class="section-h">價格</div>
    ${ps.length ? `<ul class="list">${ps.map((p, idx) => `
      <li class="pcard ${idx === 0 ? 'best' : ''}">
        <div class="pc-top">
          <span class="store">${idx === 0 ? icon('trophy') : ''}${esc(storeLabel(p.store))}</span>
          <b class="pc-price">${primaryPrice(p)}</b>
        </div>
        <div class="pc-sub">
          <span>${esc(p.label)}・${fmtDate(p.at)}${idx > 0 ? ` <span class="pill">貴 ${fmtTWD(p.twd - best.twd)}</span>` : ''}</span>
          <span>${p.currency !== 'TWD' ? '≈ ' + fmtTWD(p.twd) : ''}</span>
        </div>
        <div class="pc-acts">
          ${p.store.mapUrl || p.store.ja || p.store.branch ? `<a class="btn sm" href="${mapUrl(p.store)}" target="_blank" rel="noopener" aria-label="在 Google 地圖開啟 ${esc(storeLabel(p.store))}">${icon('pin', 'ic pin')}地圖</a>` : ''}
          <button class="btn sm danger" type="button" data-delprice="${p.id}" aria-label="刪除 ${esc(storeLabel(p.store))} 的價格">${icon('trash')}刪除</button>
        </div>
      </li>`).join('')}</ul>`
    : `<div class="empty"><div class="big">🏷️</div>還沒有價格<br>在店裡看到時記下來，就能自動比價</div>`}
    <div style="margin-top:14px"><button class="btn primary block go" type="button" id="add-price"><span>${ps.length ? '＋ 新增其他價格' : '＋ 新增價格'}</span><span class="arr">${icon('arrow')}</span></button></div>

    ${it.purchases.length ? '' : histHTML}

    <div style="margin-top:28px"><button class="btn danger-line block" type="button" id="del-item">${icon('trash')}刪除商品</button></div>`;
}
$('#v-item').addEventListener('click', e => {
  const it = items.find(i => i.id === currentItemId); if (!it) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'add-price') openPriceDialog(it);
  else if (b.dataset.editpu) openPurchaseDialog(it, b.dataset.editpu);
  else if (b.dataset.delprice) {
    const idx = it.prices.findIndex(x => x.id === b.dataset.delprice);
    const [removed] = it.prices.splice(idx, 1); saveItem(it); renderItem();
    toast('已刪除一筆價格', '復原', () => { it.prices.push(removed); saveItem(it); if (view === 'item') renderItem(); });
  } else if (b.id === 'del-item') {
    askConfirm({ title:`刪除「${it.name}」？`, body:`這個商品的 ${it.prices.length} 筆價格和購買紀錄也會一起刪除。`, ok:'刪除商品' }, () => {
      const idx = items.indexOf(it); items.splice(idx, 1); removeItem(it); refreshDatalist(); go('list');
      toast('已刪除商品', '復原', () => { items.splice(idx, 0, it); saveItem(it); refreshDatalist(); if (view === 'list') renderList(); });
    });
  }
});
$('#v-item').addEventListener('change', e => {
  const it = items.find(i => i.id === currentItemId); if (!it) return;
  const t = e.target;
  if (t.id === 'item-name') {
    const v = t.value.trim();
    if (!v) { t.value = it.name; $('#item-name-err').hidden = false; return; }
    $('#item-name-err').hidden = true;
    if (v !== it.name) { it.name = v; it.updated = new Date(); saveItem(it); refreshDatalist(); toast('已更新名稱'); }
  } else if (t.id === 'item-img') {
    readImage(t.files[0], 800, im => { it.imageId = uid(); it.img = im.url; saveImage(it.imageId, im.blob); saveItem(it); renderItem(); toast('已更新照片'); });
  }
});
$('#v-item').addEventListener('keydown', e => { if (e.target.id === 'item-name' && e.key === 'Enter') e.target.blur(); });

/* ---------- 編輯購買紀錄 ---------- */
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
let puEdit = null; // { it, pu }
function openPurchaseDialog(it, puId) {
  const pu = it.purchases.find(x => x.id === puId); if (!pu) return;
  puEdit = { it, pu };
  $('#d-pu-at').value = toLocalInput(pu.at);
  $('#d-pu-err').hidden = true;
  $('#d-pu-store').innerHTML = '<option value="">未指定店家</option>' + sortedPrices(it).map(x =>
    `<option value="${x.id}" ${x.id === pu.priceId ? 'selected' : ''}>${esc(storeLabel(x.store))}・${primaryPrice(x)}</option>`).join('');
  openD('d-pu');
}
$('#d-pu-ok').addEventListener('click', () => {
  const { it, pu } = puEdit;
  const v = $('#d-pu-at').value;
  const at = v ? new Date(v) : null;
  if (!at || isNaN(at)) { $('#d-pu-err').hidden = false; $('#d-pu-at').focus(); return; }
  pu.at = at; pu.priceId = $('#d-pu-store').value || null;
  saveItem(it); closeD('d-pu'); renderItem(); toast('已更新購買紀錄');
});
$('#d-pu-del').addEventListener('click', () => {
  const { it, pu } = puEdit;
  const idx = it.purchases.indexOf(pu);
  it.purchases.splice(idx, 1); saveItem(it); closeD('d-pu'); renderItem();
  toast('已刪除一筆購買紀錄', '復原', () => { it.purchases.splice(idx, 0, pu); saveItem(it); if (view === 'item') renderItem(); });
});

let priceDialogForm = null, priceDialogItem = null;
function openPriceDialog(it) {
  priceDialogForm?.destroy();
  priceDialogItem = it;
  $('#d-price-h').textContent = '新增價格：' + it.name;
  priceDialogForm = PriceForm($('#d-price-form'), { itemId: it.id });
  openD('d-price'); priceDialogForm.focus();
}
$('#d-price-ok').addEventListener('click', () => {
  const p = priceDialogForm.collect(); if (!p) return;
  const it = priceDialogItem;
  const wasBest = !it.prices.length || p.twd < bestPrice(it).twd;
  it.prices.push(p); it.updated = new Date(); saveItem(it);
  closeD('d-price'); renderItem();
  toast(wasBest ? '🏆 已儲存，目前最便宜' : '已儲存價格');
});

/* ---------- 試算 → 儲存價格 ---------- */
const calcForm = PriceForm($('#calc-form'));
let pendingPrice = null;
$('#save-price').addEventListener('click', () => {
  const p = calcForm.collect(); if (!p) return;
  pendingPrice = p;
  $('#d-save-sum').innerHTML = `<b style="font-size:20px">${primaryPrice(p)}</b>${p.currency !== 'TWD' ? ` <span class="hint">≈ ${fmtTWD(p.twd)}</span>` : ''}<div class="hint">${esc(p.label)}・${esc(storeLabel(p.store))}</div>`;
  $('#d-save-name').value = '';
  $('#d-save-err').hidden = true;
  showCmp($('#d-save-cmp'), null, null);
  const recent = [...items].sort((a, b) => b.updated - a.updated).slice(0, 6);
  $('#d-save-recent-wrap').hidden = !recent.length;
  $('#d-save-recent').innerHTML = recent.map(i => `<button class="chip sm" type="button" data-pick="${esc(i.name)}">${esc(i.name)}</button>`).join('');
  openD('d-save');
  $('#d-save-name').focus();
});
$('#d-save-recent').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { $('#d-save-name').value = b.dataset.pick; $('#d-save-err').hidden = true; updateSaveCmp(); } });
$('#d-save-name').addEventListener('input', () => { $('#d-save-err').hidden = true; updateSaveCmp(); });
function updateSaveCmp() { showCmp($('#d-save-cmp'), pendingPrice && pendingPrice.twd, findItemByName($('#d-save-name').value)); }
$('#d-save-ok').addEventListener('click', () => {
  const name = $('#d-save-name').value.trim();
  if (!name) { $('#d-save-err').hidden = false; $('#d-save-name').focus(); return; }
  let it = findItemByName(name), created = false;
  if (!it) { it = { id:uid(), name, imageId:null, img:null, note:'', status:'todo', updated:new Date(), prices:[], purchases:[] }; items.push(it); created = true; }
  const wasBest = !it.prices.length || pendingPrice.twd < bestPrice(it).twd;
  it.prices.push(pendingPrice); it.updated = new Date(); saveItem(it);
  refreshDatalist(); closeD('d-save'); calcForm.resetAfterSave();
  const id = it.id;
  toast(`${created ? '已新增' : '已存入'}「${name}」${wasBest ? '・目前最便宜 🏆' : ''}`, '查看', () => go('item', id));
});

/* ---------- 優惠券 ---------- */
function renderCoupons() {
  const el = $('#coupons');
  const groups = new Map();
  coupons.forEach(c => { const k = c.store.chainId || 'x:' + c.store.name; if (!groups.has(k)) groups.set(k, { store:c.store, list:[] }); groups.get(k).list.push(c); });
  const ordered = [...groups.entries()];
  let html = '';
  if (!coupons.length) html += `<div class="empty"><div class="big">${icon('ticket')}</div>還沒有優惠券<br>把 App 裡的優惠券截圖存進來，結帳時一點就能出示</div>`;
  html += '<div class="coupon-zones">' + ordered.map(([, g]) => `
    <section class="zone z-white"><h2 class="zone-h">${esc(g.store.name)}（${g.list.length}）</h2>
      <ul class="list">${g.list.map(c => `<li><button class="coupon-btn" type="button" data-view="${c.id}">
        <img src="${c.img}" alt="">
        <span style="flex:1;min-width:0"><b>${esc(c.store.name)}</b><span class="note" style="display:block">${esc(c.note) || '（無備註）'}</span></span>
        ${icon('chevron')}
      </button></li>`).join('')}</ul></section>`).join('') + '</div>';
  el.innerHTML = html;
}
let viewingId = null;
$('#coupons').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  const c = coupons.find(x => x.id === b.dataset.view); viewingId = c.id;
  $('#d-view-img').src = c.img; $('#d-view-img').alt = `${c.store.name} 優惠券截圖`;
  $('#d-view-store').textContent = c.store.name; $('#d-view-note').textContent = c.note;
  openD('d-view');
});
$('#d-view-del').addEventListener('click', () => {
  const c = coupons.find(x => x.id === viewingId); if (!c) return;
  askConfirm({ title:'刪除這張優惠券？', body:`「${c.store.name}」的優惠券截圖會從 App 移除，手機相簿中的原圖不受影響。`, ok:'刪除優惠券' }, () => {
    const idx = coupons.indexOf(c); coupons.splice(idx, 1); removeCoupon(c); closeD('d-view'); renderCoupons();
    toast('已刪除優惠券', '復原', () => { coupons.splice(idx, 0, c); saveCoupon(c); if (view === 'coupons') renderCoupons(); });
  });
});

let couponDraft = { img:null, storeChoice:null };
function renderCouponStores() {
  const chips = PRESETS.map(p => [p.id, p.name]).concat([['other', '✏️ 其他']]);
  $('#d-coupon-stores').innerHTML = chips.map(([v, t]) => `<button class="chip sm" type="button" data-cstore="${v}" aria-pressed="${couponDraft.storeChoice === v}">${esc(t)}</button>`).join('');
  $('#d-coupon-other').hidden = couponDraft.storeChoice !== 'other';
}
$('#add-coupon').addEventListener('click', () => {
  couponDraft = { img:null, storeChoice: null };
  $('#d-coupon-file').value = ''; $('#d-coupon-prev').hidden = true; $('#d-coupon-pick').hidden = false; $('#d-coupon-repick').hidden = true;
  $('#d-coupon-other').value = ''; $('#d-coupon-note').value = '';
  $$('#d-coupon .err').forEach(e => e.hidden = true);
  renderCouponStores(); openD('d-coupon');
});
$('#d-coupon-stores').addEventListener('click', e => {
  const b = e.target.closest('[data-cstore]'); if (!b) return;
  couponDraft.storeChoice = couponDraft.storeChoice === b.dataset.cstore ? null : b.dataset.cstore;
  $('#d-coupon-store-err').hidden = true; renderCouponStores();
  if (couponDraft.storeChoice === 'other') $('#d-coupon-other').focus();
});
$('#d-coupon-repick').addEventListener('click', () => $('#d-coupon-file').click());
$('#d-coupon-file').addEventListener('change', e => readImage(e.target.files[0], 1600, im => {
  couponDraft.img = im;
  $('#d-coupon-prev').src = im.url; $('#d-coupon-prev').hidden = false;
  $('#d-coupon-pick').hidden = true; $('#d-coupon-repick').hidden = false; $('#d-coupon-img-err').hidden = true;
}));
$('#d-coupon-ok').addEventListener('click', () => {
  let store = null;
  if (couponDraft.storeChoice === 'other') { const n = $('#d-coupon-other').value.trim(); if (n) store = { chainId:null, name:n, ja:'' }; }
  else { const p = presetById(couponDraft.storeChoice); if (p) store = { chainId:p.id, name:p.name, ja:p.ja }; }
  $('#d-coupon-img-err').hidden = !!couponDraft.img; $('#d-coupon-store-err').hidden = !!store;
  if (!couponDraft.img || !store) return;
  const c = { id:uid(), store, note:$('#d-coupon-note').value.trim(), imageId:uid(), img:couponDraft.img.url, created:new Date() };
  saveImage(c.imageId, couponDraft.img.blob); saveCoupon(c);
  coupons.unshift(c);
  closeD('d-coupon'); renderCoupons(); toast('已新增優惠券');
});

/* ---------- 設定 ---------- */
const RATE_CURS = ['JPY', 'USD', 'KRW'];
function openSettings() {
  $('#set-currency').innerHTML = Object.keys(SYM).map(c => `<option value="${c}" ${c === settings.currency ? 'selected' : ''}>${c} ${SYM[c]}</option>`).join('');
  $('#d-set-rates').innerHTML = RATE_CURS.map(c => `
    <div class="fld">
      <label class="lbl" for="set-rate-${c}">1 ${c}（${SYM[c]}）＝ ? TWD</label>
      <input class="inp" id="set-rate-${c}" data-cur="${c}" inputmode="decimal" autocomplete="off" value="${rates[c]}">
      <div class="err" hidden>請輸入大於 0 的匯率</div>
    </div>`).join('');
  $('#d-set-updated').textContent = settings.ratesUpdated ? '上次修改：' + fmtDateTime(new Date(settings.ratesUpdated)) : '目前使用預設匯率';
  $('#d-set-persist').textContent = state.persisted === true ? '✓ 瀏覽器已同意長期保存資料'
    : state.persisted === false ? '瀏覽器尚未同意長期保存資料（從主畫面開啟可提高保存機會）' : '';
  openD('d-settings');
}
$('#settings-btn').addEventListener('click', openSettings);
$('#set-currency').addEventListener('change', e => {
  settings.currency = e.target.value; persistSettings();
  forms.forEach(f => f.render());
});
$('#d-set-rates').addEventListener('input', e => {
  const c = e.target.dataset.cur; if (!c) return;
  const v = parseFloat(e.target.value);
  const err = e.target.nextElementSibling;
  err.hidden = v > 0;
  if (!(v > 0)) return;
  rates[c] = v; settings.ratesUpdated = Date.now(); persistSettings();
  $('#d-set-updated').textContent = '上次修改：' + fmtDateTime(new Date(settings.ratesUpdated));
  forms.forEach(f => f.render());
});
// 關閉時把無效的輸入還原成目前匯率
$('#d-settings').addEventListener('close', () => {
  $$('#d-set-rates [data-cur]').forEach(i => { if (!(parseFloat(i.value) > 0)) i.value = rates[i.dataset.cur]; });
});

/* ---------- 地圖連結 ---------- */
// 找出同一家店（同連鎖或同名、同分店）最近一次儲存的地圖連結
function savedMapLink(s) {
  let best = null;
  for (const it of items) for (const p of it.prices) {
    const ps = p.store;
    if (!ps?.mapUrl) continue;
    const same = (s.chainId ? ps.chainId === s.chainId : ps.name === s.name) && (ps.branch || '') === (s.branch || '');
    if (same && (!best || p.at > best.at)) best = p;
  }
  return best ? best.store.mapUrl : '';
}

/* ---------- 共用：dialog / toast ---------- */
function askConfirm({ title, body, ok }, onOk) {
  $('#d-confirm-h').textContent = title; $('#d-confirm-body').textContent = body; $('#d-confirm-ok').textContent = ok;
  $('#d-confirm-ok').onclick = () => { closeD('d-confirm'); onOk(); };
  openD('d-confirm'); $('#d-confirm [data-close]').focus();
}
function openD(id) { const d = $('#' + id); if (!d.open) d.showModal(); }
function closeD(id) { const d = $('#' + id); if (d.open) d.close(); }
$$('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
});
let toastTimer;
// duration：毫秒；0 = 不自動消失（例如版本更新提示），會多一個「稍後」按鈕
export function toast(msg, actionLabel, action, duration = 5000) {
  const t = $('#toast');
  t.innerHTML = `<span style="flex:1">${esc(msg)}</span>`
    + (duration === 0 ? '<button type="button" class="later">稍後</button>' : '')
    + (actionLabel ? `<button type="button" class="act">${esc(actionLabel)}</button>` : '');
  t.hidden = false;
  if (actionLabel) t.querySelector('.act').onclick = () => { t.hidden = true; action(); };
  const later = t.querySelector('.later'); if (later) later.onclick = () => { t.hidden = true; };
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => t.hidden = true, duration);
}

// 退稅說明：點其他地方或按 Esc 收起
document.addEventListener('click', e => $$('.tip-wrap.open').forEach(w => { if (!w.contains(e.target)) { w.classList.remove('open'); w.querySelector('.tip-btn').setAttribute('aria-expanded', 'false'); } }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.tip-wrap.open').forEach(w => { w.classList.remove('open'); w.querySelector('.tip-btn').setAttribute('aria-expanded', 'false'); }); });

let saveErrorShown = false;
setErrorHandler(() => {
  if (saveErrorShown) return;
  saveErrorShown = true;
  toast('無法儲存資料，關閉 App 後變更可能會遺失。請確認不是在私密瀏覽模式。');
});

export function init() {
  hydrateIcons();
  refreshDatalist();
  go('calc');
}
