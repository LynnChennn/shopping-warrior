// 購物戰士 — 畫面與互動（由 prototype.html 拆出）
import { SYM, PRESETS, presetById } from './config.js';
import { round, parseCustom, compute, sortedPrices, bestPrice } from './calc.js';
import { $, $$, esc, uid, fmtCur, fmtTWD, pad, fmtDate, fmtDateTime, storeLabel, mapUrl, primaryPrice, isGoogleMapsUrl } from './format.js';
import { state } from './state.js';
import { icon, hydrateIcons } from './icons.js';
import { saveItem, removeItem, saveCoupon, removeCoupon, saveImage, saveSettings, setErrorHandler, exportRaw, replaceAll } from './db.js';
import { buildBackup, parseBackup, summarize, backupToRaw, backupFileName } from './backup.js';
import { fetchRates, AUTO_RATES_MIN_GAP } from './rates.js';

const persistSettings = () => saveSettings({ currency: settings.currency, rates, ratesUpdated: settings.ratesUpdated, autoRates: settings.autoRates, budget: settings.budget, powerCur: settings.powerCur, lastBackupAt: settings.lastBackupAt });

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
function PriceForm(root, { itemId = null, budgetLine = false } = {}) {
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
      <div class="after-buy" data-r="after" hidden></div>
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

    // 買下後預算還剩多少（只在計算頁、有設定預算時顯示）
    const after = R('after'), left = budgetLine && r ? budgetLeftAfter(r, c) : null;
    after.hidden = left === null;
    if (left !== null) {
      const pc = settings.powerCur === 'JPY' ? 'JPY' : 'TWD';
      after.textContent = left >= 0 ? `買下後還剩 ${fmtCur(left, pc)}` : `買下後會超出預算 ${fmtCur(-left, pc)}`;
      after.classList.toggle('over', left < 0);
    }

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
  if (v === 'calc') { calcForm.render(); renderPowerMini(); }
  $('#title').textContent = v === 'item' ? '商品詳情' : TITLES[v];
  $('#main').scrollTop = 0;
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
$('#back').addEventListener('click', () => go('list'));

/* ---------- 購物清單 ---------- */
const thumbHTML = (it, cls = 'thumb') => it.img ? `<img class="${cls}" src="${it.img}" alt="">` : `<span class="${cls} ph" aria-hidden="true">${icon('bag')}</span>`;
function rerender() { if (view === 'list') renderList(); if (view === 'item') renderItem(); }

// 回到清單並標示某個商品（新增後使用）：必要時清除搜尋、切換篩選，讓它一定看得到
let flashId = null;
function showInList(it) {
  if (listQuery && !it.name.toLowerCase().includes(listQuery.trim().toLowerCase())) { listQuery = ''; $('#list-q').value = ''; }
  if (it.proxy) listFilter = 'proxy';
  else if (listFilter === 'proxy' || (listFilter !== 'all' && listFilter !== it.status)) listFilter = 'all';
  flashId = it.id;
  go('list');
  flashId = null;
  $(`[data-row="${it.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function rowHTML(i) {
  const b = bestPrice(i), done = i.status === 'done';
  return `<li class="item-row${done ? ' is-done' : ''}${i.id === flashId ? ' flash' : ''}" data-row="${i.id}">
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
  // 已購買分頁一律顯示目前戰鬥力（清單是空的也可以先設定預算）
  // 代購商品只出現在「代購」分頁；其他分頁只列自己的商品
  const isProxyTab = listFilter === 'proxy';
  const pool = items.filter(i => !!i.proxy === isProxyTab);
  if (!pool.length) {
    $('#list').innerHTML = isProxyTab
      ? `<div class="empty"><div class="big">🎁</div>還沒有代購商品<br>點上方「新增商品」，勾選「這是代購」</div>`
      : (listFilter === 'done' ? powerCardHTML() : '') + `<div class="empty"><div class="big">📝</div>清單是空的<br>在「計算」按「儲存價格」，或點上方「新增商品」</div>`;
    return;
  }
  const q = listQuery.trim().toLowerCase();
  const match = i => !q || i.name.toLowerCase().includes(q);
  const pick = status => pool.filter(i => i.status === status && match(i)).sort((a, b) => b.updated - a.updated);
  const ul = list => `<ul class="list">${list.map(rowHTML).join('')}</ul>`;
  const noResult = q ? `<div class="empty">找不到「${esc(listQuery.trim())}」<br><button class="link-btn" type="button" id="clear-q">清除搜尋</button></div>` : '';
  if (listFilter === 'all' || isProxyTab) {
    const todo = pick('todo'), done = pick('done');
    if (!todo.length && !done.length) { $('#list').innerHTML = noResult; return; }
    const sec = (title, color, list, emptyText) => `<section class="zone ${color}"><h2 class="zone-h">${title}（${list.length}）</h2>`
      + (list.length ? ul(list) : `<div class="hint">${emptyText}</div>`) + '</section>';
    $('#list').innerHTML = '<div class="list-zones">' + sec('待買', 'z-white', todo, q ? '沒有符合的商品' : '都買齊了 🎉')
      + sec('已購買', 'z-mint', done, q ? '沒有符合的商品' : '勾選商品前面的方框，就會移到這裡') + '</div>';
  } else {
    const list = pick(listFilter);
    $('#list').innerHTML = (listFilter === 'done' ? powerCardHTML() : '')
      + (list.length ? `<section class="zone ${listFilter === 'todo' ? 'z-white' : 'z-mint'}">${ul(list)}</section>`
      : (noResult || `<div class="empty">${listFilter === 'todo' ? '都買齊了 🎉' : '還沒有已購買的商品<br>勾選商品前面的方框，就會移到這裡'}</div>`));
  }
}

// 已購買分頁頂部：目前戰鬥力（已購物 vs. 預算；可切換台幣／日幣顯示，預算以台幣保存）
function powerTotals(cur) {
  const budgetTWD = settings.budget;
  if (cur === 'TWD') return { spent: spendOf(ownPurchases()).twd, budget: budgetTWD };
  // 日幣：日幣購買用實付日幣，其他幣別依目前匯率換算
  let spent = 0;
  ownPurchases().forEach(({ it, pu }) => {
    const info = purchaseInfo(it, pu); if (!info) return;
    spent += info.currency === 'JPY' ? info.amount : info.twd / rates.JPY;
  });
  return { spent: Math.round(spent), budget: budgetTWD ? Math.round(budgetTWD / rates.JPY) : null };
}
// 預算扣掉已購物與這次的價格後還剩多少（依目前戰鬥力的顯示幣別）；沒設定預算回傳 null
function budgetLeftAfter(r, c) {
  if (!settings.budget) return null;
  const cur = settings.powerCur === 'JPY' ? 'JPY' : 'TWD';
  const { spent, budget } = powerTotals(cur);
  const cost = cur === 'TWD' ? r.twd : (c === 'JPY' ? r.net : r.twd / rates.JPY);
  return Math.round(budget - spent - cost);
}
// 計算頁頂部的精簡戰鬥力列；點一下到「已購買」看完整卡片
function renderPowerMini() {
  const el = $('#power-mini');
  if (!settings.budget) { el.hidden = true; return; }
  const cur = settings.powerCur === 'JPY' ? 'JPY' : 'TWD';
  const { spent, budget } = powerTotals(cur);
  const pct = Math.round(spent / budget * 100), over = spent > budget;
  el.hidden = false;
  el.classList.toggle('over', over);
  el.setAttribute('aria-label', `目前戰鬥力：${over ? '超出預算 ' + fmtCur(spent - budget, cur) : '還剩 ' + fmtCur(budget - spent, cur)}，已用 ${pct}%。查看已購買`);
  el.innerHTML = `<span class="pm-row"><span class="hint">戰鬥力</span><b>${over ? '超出 ' + fmtCur(spent - budget, cur) : '還剩 ' + fmtCur(budget - spent, cur)}</b><span class="hint">已用 ${pct}%</span>${icon('chevron')}</span>
    <span class="power-bar" aria-hidden="true"><span style="width:${Math.min(pct, 100)}%"></span></span>`;
}
$('#power-mini').addEventListener('click', () => { listFilter = 'done'; go('list'); });

function powerCardHTML() {
  const cur = settings.powerCur === 'JPY' ? 'JPY' : 'TWD';
  const money = n => fmtCur(n, cur);
  const { spent, budget } = powerTotals(cur);
  const ex = items.some(i => i.proxy) ? '（不含代購）' : '';
  const toggle = `<div class="chips power-cur" role="group" aria-label="顯示幣別">
      <button class="chip sm" type="button" data-powercur="TWD" aria-pressed="${cur === 'TWD'}">台幣</button>
      <button class="chip sm" type="button" data-powercur="JPY" aria-pressed="${cur === 'JPY'}">日幣</button>
    </div>`;
  const head = `<div class="lbl-row power-h"><h2 class="zone-h">目前戰鬥力</h2>${toggle}</div>`;
  if (!budget) {
    return `<section class="zone z-white power">${head}
      <div class="power-nums"><b>${money(spent)}</b><span class="hint">已購物${ex}</span></div>
      <div class="power-foot"><span class="hint">設定總預算後，可以看到還剩多少。</span><button class="btn sm" type="button" data-act="budget">${icon('pen')}設定預算</button></div>
    </section>`;
  }
  const pct = Math.round(spent / budget * 100), over = spent > budget;
  return `<section class="zone z-white power${over ? ' over' : ''}">${head}
    <div class="power-nums"><b>${money(spent)}</b><span class="hint">／ 預算 ${money(budget)}</span></div>
    <div class="power-bar" role="progressbar" aria-label="已購物金額占預算" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.min(spent, budget)}" aria-valuetext="${pct}%">
      <span style="width:${Math.min(pct, 100)}%"></span>
    </div>
    <div class="power-foot">${over ? `<span class="over-text">超出預算 ${money(spent - budget)}</span>` : `<span>還剩 ${money(budget - spent)}</span>`}<span class="hint">已用 ${pct}%${ex}</span></div>
    <div class="power-act"><button class="btn sm" type="button" data-act="budget">${icon('pen')}編輯預算</button></div>
  </section>`;
}
// 預算對話框：台幣與日幣兩欄，輸入任一欄自動換算另一欄（依目前匯率）
const numOf = el => { const t = el.value.trim().replace(/,/g, ''); return t === '' ? null : parseFloat(t); };
function openBudget() {
  $('#d-budget-in').value = settings.budget || '';
  $('#d-budget-jpy').value = settings.budget ? Math.round(settings.budget / rates.JPY) : '';
  $('#d-budget-rate').textContent = `依目前匯率 1 JPY = ${rates.JPY} TWD（可在 ⚙️ 設定修改）`;
  $('#d-budget-err').hidden = true;
  openD('d-budget'); $('#d-budget-in').focus();
}
$('#list').addEventListener('click', e => {
  if (e.target.closest('[data-act="budget"]')) { openBudget(); return; }
  const c = e.target.closest('[data-powercur]');
  if (c) { settings.powerCur = c.dataset.powercur; persistSettings(); renderList(); }
});
$('#d-budget-in').addEventListener('input', () => {
  $('#d-budget-err').hidden = true;
  const v = numOf($('#d-budget-in'));
  $('#d-budget-jpy').value = v > 0 ? Math.round(v / rates.JPY) : '';
});
$('#d-budget-jpy').addEventListener('input', () => {
  $('#d-budget-err').hidden = true;
  const v = numOf($('#d-budget-jpy'));
  $('#d-budget-in').value = v > 0 ? Math.round(v * rates.JPY) : '';
});
$('#d-budget-ok').addEventListener('click', () => {
  const twd = numOf($('#d-budget-in')), jpy = numOf($('#d-budget-jpy'));
  const bad = v => v !== null && !(v > 0);
  if (bad(twd) || bad(jpy)) { $('#d-budget-err').hidden = false; $('#d-budget-in').focus(); return; }
  settings.budget = twd ? Math.round(twd) : null; persistSettings();
  closeD('d-budget'); renderList(); toast(twd ? `預算已設為 ${fmtTWD(twd)}（約 ¥ ${Math.round(twd / rates.JPY).toLocaleString('zh-TW')}）` : '已清除預算');
});
$$('[data-filter]').forEach(b => b.addEventListener('click', () => { listFilter = b.dataset.filter; renderList(); }));
$('#list-q').addEventListener('input', e => { listQuery = e.target.value; renderList(); });
$('#list').addEventListener('click', e => { if (e.target.id === 'clear-q') { listQuery = ''; $('#list-q').value = ''; renderList(); $('#list-q').focus(); } });
/* ---------- 花費計算 ---------- */
const purchasePrice = (it, pu) => it.prices.find(x => x.id === pu.priceId) || null;
// 購買紀錄的地點與金額：手動修改過（pu.amount）就用修改後的值；否則沿用對應的價格紀錄
function purchaseInfo(it, pu) {
  const p = purchasePrice(it, pu);
  if (pu.amount != null) {
    const rate = pu.rate ?? rates[pu.currency];
    return { store: pu.store || null, amount: pu.amount, currency: pu.currency, rate,
      twd: Math.round(pu.amount * (pu.currency === 'TWD' ? 1 : rate)), price: null };
  }
  if (!p) return null;
  return { store: p.store, amount: p.net, currency: p.currency, rate: p.rate, twd: p.twd, price: p };
}
function spendOf(list) { // list: [{ it, pu }]
  let twd = 0, missing = 0; const byCur = {};
  list.forEach(({ it, pu }) => {
    const info = purchaseInfo(it, pu);
    if (!info) { missing++; return; }
    twd += info.twd; byCur[info.currency] = (byCur[info.currency] || 0) + info.amount;
  });
  return { twd, byCur, count: list.length, missing };
}
function allPurchases() {
  return items.flatMap(it => it.purchases.map(pu => ({ it, pu }))).sort((a, b) => b.pu.at - a.pu.at);
}
// 自己的購買紀錄（目前戰鬥力不計入代購）
const ownPurchases = () => allPurchases().filter(({ it }) => !it.proxy);
function openExport() {
  const all = allPurchases();
  const body = $('#d-export-body');
  $('#d-export-ok').hidden = !all.length;
  if (!all.length) {
    body.innerHTML = '<div class="empty"><div class="big">🧾</div>還沒有購買紀錄<br>在清單勾選已購買的商品後，就能在這裡看到花費</div>';
    openD('d-export'); return;
  }
  const s = spendOf(all);
  const proxyTWD = spendOf(all.filter(({ it }) => it.proxy)).twd;
  const byStore = new Map();
  all.forEach(({ it, pu }) => { const info = purchaseInfo(it, pu); if (!info) return; const k = storeLabel(info.store); byStore.set(k, (byStore.get(k) || 0) + info.twd); });
  const stores = [...byStore.entries()].sort((a, b) => b[1] - a[1]);
  body.innerHTML = `
    <div class="result" style="margin-bottom:12px">
      <div class="lbl">總花費</div>
      <div class="twd">${fmtTWD(s.twd)}</div>
      ${proxyTWD ? `<div class="hint">自己 ${fmtTWD(s.twd - proxyTWD)}・代購 ${fmtTWD(proxyTWD)}</div>` : ''}
      <div class="hint">${s.count} 筆購買・${fmtDate(all[all.length - 1].pu.at)} – ${fmtDate(all[0].pu.at)}${s.missing ? `・${s.missing} 筆未指定店家，未計入` : ''}</div>
    </div>
    <div class="section-h" style="margin-top:0">依店家</div>
    <ul class="hist">${stores.map(([k, v]) => `<li><span>${esc(k)}</span><b>${fmtTWD(v)}</b></li>`).join('')}</ul>
    <p class="hint" style="margin-bottom:0">CSV 檔可用 Excel、Numbers 或 Google 試算表開啟，包含每筆購買的日期、商品、是否代購、店家、原價、折扣、退稅、最終價格與台幣金額。</p>`;
  openD('d-export');
}
function buildCSV() {
  const head = ['購買日期', '商品', '代購', '店家', '原價', '折扣', '退稅', '最終價格', '幣別', '匯率', '台幣'];
  const rows = allPurchases().map(({ it, pu }) => {
    const info = purchaseInfo(it, pu), p = info && info.price; // 手動修改過金額時沒有原價／折扣資訊
    return [fmtDateTime(pu.at), it.name, it.proxy ? '是' : '', info ? storeLabel(info.store) : '未指定店家',
      p ? p.listPrice : '', p ? p.discLabel : '', p ? (p.tax ? (p.tax === 0.08 ? '食品 8%' : '用品 10%') : '不退稅') : '',
      info ? info.amount : '', info ? info.currency : '', info ? info.rate : '', info ? info.twd : ''];
  });
  const s = spendOf(allPurchases());
  const proxyTWD = spendOf(allPurchases().filter(({ it }) => it.proxy)).twd;
  rows.push([], ['合計', '', '', '', '', '', '', '', '', '', s.twd]);
  if (proxyTWD) rows.push(['其中自己', '', '', '', '', '', '', '', '', '', s.twd - proxyTWD], ['其中代購', '', '', '', '', '', '', '', '', '', proxyTWD]);
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

function setBought(it, on, priceId) {
  if (on) {
    const b = priceId ? it.prices.find(p => p.id === priceId) : bestPrice(it);
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
$('#add-item').addEventListener('click', () => { itemDraftImg = null; $('#d-item-prev').hidden = true; $('#d-item-file').value = ''; $('#d-item-name').value = ''; $('#d-item-note').value = ''; $('#d-item-proxy').checked = listFilter === 'proxy'; $('#d-item-err').hidden = true; openD('d-item'); $('#d-item-name').focus(); });
$('#d-item-ok').addEventListener('click', () => {
  const name = $('#d-item-name').value.trim();
  if (!name) { $('#d-item-err').hidden = false; $('#d-item-name').focus(); return; }
  const exist = findItemByName(name);
  if (exist) { closeD('d-item'); showInList(exist); toast(`「${exist.name}」已在清單中`, '查看', () => go('item', exist.id)); return; }
  const it = { id:uid(), name, imageId:null, img:null, note:$('#d-item-note').value.trim(), proxy:$('#d-item-proxy').checked, status:'todo', updated:new Date(), prices:[], purchases:[] };
  if (itemDraftImg) { it.imageId = uid(); it.img = itemDraftImg.url; saveImage(it.imageId, itemDraftImg.blob); }
  items.push(it); saveItem(it); refreshDatalist(); closeD('d-item'); showInList(it);
  toast(`已新增「${it.name}」`, '查看', () => go('item', it.id));
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
      const pi = purchaseInfo(it, pu);
      return `<li>
        <span class="hist-main">${fmtDateTime(pu.at)}<span class="hint">${pi ? esc(storeLabel(pi.store)) : '未指定店家'}</span></span>
        <span class="hist-amt">${pi ? `<b>${fmtCur(pi.amount, pi.currency)}</b>${pi.currency !== 'TWD' ? `<span class="hint">≈ ${fmtTWD(pi.twd)}</span>` : ''}` : '<span class="hint">—</span>'}</span>
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
          <span class="badges">${it.proxy ? '<span class="badge proxy">代購</span>' : ''}<span class="badge ${done ? 'done' : ''}">${done ? '已購買' : '待買'}</span></span>
        </div>
        <input class="inp name-inp" id="item-name" value="${esc(it.name)}" autocomplete="off" enterkeyhint="done">
        <div class="err" id="item-name-err" hidden>商品名稱不能空白，已還原為原本的名稱</div>
        <label class="lbl" for="item-note" style="display:block;margin-top:10px">備註（選填）</label>
        <textarea class="inp note-inp" id="item-note" placeholder="例：幫媽媽買 2 盒">${esc(it.note || '')}</textarea>
        <label class="switch-row" style="margin-top:10px"><input type="checkbox" id="item-proxy" ${it.proxy ? 'checked' : ''}><span>這是代購<span class="hint" style="display:block">不計入目前戰鬥力；匯出花費會標示為代購</span></span></label>
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
          ${done ? '' : `<button class="btn sm" type="button" data-buy="${p.id}" aria-label="在 ${esc(storeLabel(p.store))} 購買">${icon('bag')}在此購買</button>`}
          ${p.store.mapUrl || p.store.ja || p.store.branch ? `<a class="btn sm" href="${mapUrl(p.store)}" target="_blank" rel="noopener" aria-label="在 Google 地圖開啟 ${esc(storeLabel(p.store))}">${icon('pin', 'ic pin')}地圖</a>` : ''}
          <button class="btn sm danger" type="button" data-delprice="${p.id}" aria-label="刪除 ${esc(storeLabel(p.store))} 的價格">${icon('trash')}刪除</button>
        </div>
      </li>`).join('')}</ul>`
    : `<div class="empty"><div class="big">🏷️</div>還沒有價格<br>在店裡看到時記下來，就能自動比價</div>`}
    <div style="margin-top:14px"><button class="btn primary block go" type="button" id="add-price"><span>${ps.length ? '新增其他價格' : '新增價格'}</span><span class="arr">${icon('plus')}</span></button></div>

    ${it.purchases.length ? '' : histHTML}

    <div style="margin-top:28px"><button class="btn danger-line block" type="button" id="del-item">${icon('trash')}刪除商品</button></div>`;
}
$('#v-item').addEventListener('click', e => {
  const it = items.find(i => i.id === currentItemId); if (!it) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'add-price') openPriceDialog(it);
  else if (b.dataset.editpu) openPurchaseDialog(it, b.dataset.editpu);
  else if (b.dataset.buy) setBought(it, true, b.dataset.buy);
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
  } else if (t.id === 'item-proxy') {
    it.proxy = t.checked; it.updated = new Date(); saveItem(it); renderItem();
    toast(it.proxy ? '已移到代購' : '已移回自己的清單', '復原', () => { it.proxy = !it.proxy; saveItem(it); if (view === 'item') renderItem(); });
  } else if (t.id === 'item-note') {
    const v = t.value.trim();
    if (v !== (it.note || '')) { it.note = v; it.updated = new Date(); saveItem(it); toast('已更新備註'); }
  } else if (t.id === 'item-img') {
    readImage(t.files[0], 800, im => { it.imageId = uid(); it.img = im.url; saveImage(it.imageId, im.blob); saveItem(it); renderItem(); toast('已更新照片'); });
  }
});
$('#v-item').addEventListener('keydown', e => { if (e.target.id === 'item-name' && e.key === 'Enter') e.target.blur(); });

/* ---------- 編輯購買紀錄 ---------- */
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
let puEdit = null; // { it, pu, amountTouched }
function openPurchaseDialog(it, puId) {
  const pu = it.purchases.find(x => x.id === puId); if (!pu) return;
  const info = purchaseInfo(it, pu);
  puEdit = { it, pu, amountTouched: false };
  $('#d-pu-at').value = toLocalInput(pu.at);
  // 地點：記錄過的店家（附價格）＋其他；手動輸入過的地點選「其他」並帶入
  const custom = pu.amount != null && pu.store && !it.prices.some(x => x.id === pu.priceId);
  $('#d-pu-store').innerHTML = sortedPrices(it).map(x =>
    `<option value="${x.id}" ${!custom && x.id === pu.priceId ? 'selected' : ''}>${esc(storeLabel(x.store))}・${primaryPrice(x)}</option>`).join('')
    + `<option value="other" ${custom || !it.prices.length ? 'selected' : ''}>其他地點…</option>`;
  $('#d-pu-other').value = custom ? storeLabel(pu.store) : '';
  $('#d-pu-cur').innerHTML = Object.keys(SYM).map(c => `<option value="${c}">${c} ${SYM[c]}</option>`).join('');
  $('#d-pu-cur').value = info ? info.currency : settings.currency;
  $('#d-pu-amount').value = info ? info.amount : '';
  $$('#d-pu .err').forEach(e => e.hidden = true);
  syncPurchaseDialog();
  openD('d-pu');
}
function syncPurchaseDialog() {
  const other = $('#d-pu-store').value === 'other';
  $('#d-pu-other').hidden = !other;
  const amt = parseFloat(String($('#d-pu-amount').value).replace(/,/g, '')), cur = $('#d-pu-cur').value;
  // 選記錄過的店家且幣別相同時，用當時記錄的匯率；否則用目前匯率（與儲存時的算法一致）
  const p = puEdit.it.prices.find(x => x.id === $('#d-pu-store').value);
  const useOld = p && p.currency === cur;
  $('#d-pu-twd').textContent = amt > 0 && cur !== 'TWD'
    ? `≈ ${fmtTWD(amt * (useOld ? p.rate : rates[cur]))}（依${useOld ? '記錄當時' : '目前'}匯率）` : '';
}
$('#d-pu-store').addEventListener('change', () => {
  // 選了記錄過的店家且還沒改過金額時，帶入那家店的價格
  const p = puEdit.it.prices.find(x => x.id === $('#d-pu-store').value);
  if (p && !puEdit.amountTouched) { $('#d-pu-amount').value = p.net; $('#d-pu-cur').value = p.currency; }
  $('#d-pu-store-err').hidden = true;
  syncPurchaseDialog();
  if ($('#d-pu-store').value === 'other') $('#d-pu-other').focus();
});
$('#d-pu-amount').addEventListener('input', () => { puEdit.amountTouched = true; $('#d-pu-amount-err').hidden = true; syncPurchaseDialog(); });
$('#d-pu-cur').addEventListener('change', () => { puEdit.amountTouched = true; syncPurchaseDialog(); });
$('#d-pu-other').addEventListener('input', () => { $('#d-pu-store-err').hidden = true; });
$('#d-pu-ok').addEventListener('click', () => {
  const { it, pu } = puEdit;
  const v = $('#d-pu-at').value;
  const at = v ? new Date(v) : null;
  const sel = $('#d-pu-store').value, otherName = $('#d-pu-other').value.trim();
  const amount = parseFloat(String($('#d-pu-amount').value).replace(/,/g, '')), currency = $('#d-pu-cur').value;
  $('#d-pu-err').hidden = !!(at && !isNaN(at));
  $('#d-pu-store-err').hidden = !(sel === 'other' && !otherName);
  $('#d-pu-amount-err').hidden = amount > 0;
  if (!at || isNaN(at)) { $('#d-pu-at').focus(); return; }
  if (sel === 'other' && !otherName) { $('#d-pu-other').focus(); return; }
  if (!(amount > 0)) { $('#d-pu-amount').focus(); return; }
  pu.at = at;
  const p = it.prices.find(x => x.id === sel);
  if (p && p.currency === currency && p.net === amount) {
    // 和記錄的價格相同：直接連到價格紀錄（保留原價、折扣資訊）
    pu.priceId = p.id; delete pu.amount; delete pu.currency; delete pu.rate; delete pu.store;
  } else {
    pu.priceId = p ? p.id : null;
    pu.store = p ? p.store : { chainId: null, name: otherName, ja: '', branch: '' };
    pu.amount = amount; pu.currency = currency;
    pu.rate = p && p.currency === currency ? p.rate : rates[currency];
  }
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
const calcForm = PriceForm($('#calc-form'), { budgetLine: true });
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
  $('#set-auto-rates').checked = settings.autoRates;
  renderRatesStatus();
  $('#d-set-persist').textContent = state.persisted === true ? '✓ 瀏覽器已同意長期保存資料'
    : state.persisted === false ? '瀏覽器尚未同意長期保存資料（從主畫面開啟可提高保存機會）' : '';
  renderBackupStatus();
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
  rates[c] = v; settings.ratesUpdated = Date.now(); settings.autoRates = false; persistSettings();
  $('#set-auto-rates').checked = false;
  renderRatesStatus();
  forms.forEach(f => f.render());
});
$('#set-auto-rates').addEventListener('change', async e => {
  settings.autoRates = e.target.checked; persistSettings();
  if (!settings.autoRates) { renderRatesStatus(); return; }
  $('#d-set-updated').textContent = '正在更新匯率…';
  const ok = await autoUpdateRates({ force: true });
  if (ok) RATE_CURS.forEach(c => { const i = $(`#set-rate-${c}`); if (i) { i.value = rates[c]; i.nextElementSibling.hidden = true; } });
  renderRatesStatus(ok ? null : '目前無法連線，沿用原本的匯率；下次開啟 App 時會再試一次');
});
function renderRatesStatus(extra) {
  const at = settings.ratesUpdated ? fmtDateTime(new Date(settings.ratesUpdated)) : null;
  const base = !at ? '目前使用預設匯率'
    : settings.autoRates ? `自動更新：${at}` : `上次手動修改：${at}（自動更新已關閉）`;
  $('#d-set-updated').textContent = extra ? `${base}。${extra}` : base;
}
// 開啟 App 時自動更新匯率；沒網路或失敗時安靜沿用原本的匯率。回傳是否更新成功
export async function autoUpdateRates({ force = false } = {}) {
  if (!settings.autoRates) return false;
  if (!force && settings.ratesUpdated && Date.now() - settings.ratesUpdated < AUTO_RATES_MIN_GAP) return false;
  if (navigator.onLine === false) return false;
  const next = await fetchRates(RATE_CURS);
  if (!next || !settings.autoRates) return false;
  Object.assign(rates, next); settings.ratesUpdated = Date.now(); persistSettings();
  forms.forEach(f => f.render());
  if (view === 'list') renderList();
  renderPowerMini();
  return true;
}
// 關閉時把無效的輸入還原成目前匯率
$('#d-settings').addEventListener('close', () => {
  $$('#d-set-rates [data-cur]').forEach(i => { if (!(parseFloat(i.value) > 0)) i.value = rates[i.dataset.cur]; });
});

/* ---------- 完整備份／還原 ---------- */
const BACKUP_REMIND_DAYS = 7;
function renderBackupStatus() {
  const at = settings.lastBackupAt;
  const days = at ? Math.floor((Date.now() - at) / 86400000) : null;
  $('#d-set-backup').innerHTML = at
    ? `上次備份：${fmtDateTime(new Date(at))}` + (days >= BACKUP_REMIND_DAYS ? `<span class="warnline">已經 ${days} 天沒有備份，建議現在匯出一份</span>` : '')
    : '還沒有備份過<span class="warnline">建議匯出一份，存到 Google 雲端硬碟或 iCloud</span>';
}
// 分享選單（可存到「檔案」或雲端硬碟）；不支援時直接下載。回傳 true 表示已交出檔案
async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return true; }
    catch (err) { if (err.name === 'AbortError') return false; console.warn('[backup] 分享失敗，改為下載', err); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}
let backupBusy = false;
$('#backup-export').addEventListener('click', async () => {
  if (backupBusy) return;
  backupBusy = true; $('#backup-export').disabled = true; $('#backup-export').textContent = '準備中…';
  try {
    const backup = await buildBackup(await exportRaw());
    const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' });
    if (await shareFile(file)) {
      settings.lastBackupAt = backup.exportedAt; persistSettings(); renderBackupStatus();
      toast(`已匯出備份「${file.name}」`);
    }
  } catch (err) {
    console.error('[backup] 匯出失敗', err);
    toast('無法匯出備份，請再試一次');
  } finally {
    backupBusy = false; $('#backup-export').disabled = false; $('#backup-export').textContent = '匯出備份';
  }
});
$('#backup-import').addEventListener('click', () => { $('#backup-file').value = ''; $('#backup-file').click(); });
$('#backup-file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  let b;
  try { b = parseBackup(await f.text()); }
  catch (err) {
    const msg = { 'not-backup': '這個檔案不是購物戰士的備份檔', newer: '這個備份來自較新版本的 App，請先更新 App 再還原', broken: '備份檔內容不完整，無法還原' }[err.code] || '無法讀取這個檔案';
    askConfirm({ title: '無法還原', body: msg + '。目前的資料沒有任何變動。', ok: '知道了', kind: 'info' }, () => {});
    return;
  }
  const n = summarize(b);
  askConfirm({
    title: '用這份備份取代目前的資料？',
    body: `備份時間：${n.exportedAt ? fmtDateTime(n.exportedAt) : '未知'}\n商品 ${n.items} 個、價格 ${n.prices} 筆、購買紀錄 ${n.purchases} 筆\n優惠券 ${n.coupons} 張、圖片 ${n.images} 張\n\n目前手機上的資料會被取代，無法復原。如果不確定，請先「匯出備份」保留目前的資料。`,
    ok: '取代並還原',
  }, async () => {
    try {
      const raw = backupToRaw(b);
      raw.settings = { ...(raw.settings || {}), lastBackupAt: b.exportedAt || Date.now() };
      await replaceAll(raw);
      location.reload();
    } catch (err) {
      console.error('[backup] 還原失敗', err);
      askConfirm({ title: '還原失敗', body: '備份沒有寫入，目前的資料沒有任何變動。請再試一次。', ok: '知道了', kind: 'info' }, () => {});
    }
  });
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
// kind：'danger'（預設，紅色確認＋取消）｜'info'（只有一個「知道了」）
function askConfirm({ title, body, ok, kind = 'danger' }, onOk) {
  const info = kind === 'info';
  $('#d-confirm-h').textContent = title; $('#d-confirm-body').textContent = body; $('#d-confirm-ok').textContent = ok;
  $('#d-confirm-ok').className = info ? 'btn primary' : 'btn danger-fill';
  $('#d-confirm [data-close]').hidden = info;
  $('#d-confirm-ok').onclick = () => { closeD('d-confirm'); onOk(); };
  openD('d-confirm'); (info ? $('#d-confirm-ok') : $('#d-confirm [data-close]')).focus();
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
