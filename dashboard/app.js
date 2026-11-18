// Token Radar dashboard: renders window.RADAR from data.js, no fetch and no network.
//
// Views: the ranked board (search, category and chain filters, watchlist
// toggle, five sort orders, a detail view with the farm plan), the live
// tokens the board sets aside, and the model with its category multiples
// and a sandbox that re-ranks the board under the reader's own constants.
// Deep links live in the hash: #tab=live, #category=Lending,
// #watchlist=1, #sort=growth, #detail=<slug>.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.body.insertAdjacentHTML('beforeend', '<p>Token Radar could not load its data.</p>');
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows');
  var detailEl = $('detail');

  /** $1,234,567,890 as $1.23B, $45.6M as $45.60M, and so on. */
  function money(n) {
    if (n === null || n === undefined) return '–';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n === null || n === undefined) return '–';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return s;
  }

  function pctClass(n) {
    if (n === null || n === undefined) return '';
    return n > 0 ? 'up' : n < 0 ? 'down' : '';
  }

  function ageText(days) {
    if (days === null || days === undefined) return '–';
    if (days >= 365) {
      var y = Math.floor(days / 365);
      var m = Math.floor((days % 365) / 30);
      return m > 0 ? y + 'y ' + m + 'm' : y + 'y';
    }
    return days + 'd';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- header and footer -------------------------------------------------
  $('stat-rows').textContent = R.board_size;
  $('stat-watch').textContent = R.watchlist_size;
  $('stat-live').textContent = R.live_size;
  $('stat-asof').textContent = R.as_of;
  $('foot-source').textContent = R.source;

  // ---- filter controls ---------------------------------------------------
  var cats = [];
  var chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  var catSel = $('category');
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });
  var chainSel = $('chain');
  chains.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    chainSel.appendChild(o);
  });

  // ---- model sandbox -----------------------------------------------------
  var gw = R.model.growth_weight;
  var mf = R.model.maturity_floor;
  var custom = false;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /** The row's implied value under the sandbox constants, or the published one. */
  function implied(r) {
    if (!custom) return r.implied_value_usd;
    var growth = clamp(r.change_7d === null ? 0 : r.change_7d, R.model.growth_floor, R.model.growth_cap);
    var gMult = 1 + (growth / 100) * gw;
    var age = r.age_days === null ? R.model.unknown_age_days : r.age_days;
    var mMult = mf + (Math.min(Math.max(age, 0), R.model.maturity_days) / R.model.maturity_days) * (1 - mf);
    return Math.max(1, Math.round(r.tvl_usd * r.category_multiple * gMult * mMult));
  }

  // ---- board -------------------------------------------------------------
  var selected = null;

  function visibleRows() {
    var q = $('q').value.trim().toLowerCase();
    var cat = catSel.value;
    var chain = chainSel.value;
    var watchOnly = $('watchonly').checked;
    var list = R.rows.filter(function (r) {
      if (watchOnly && !r.on_watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (chain && (r.chains || []).indexOf(chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var sort = $('sort').value;
    var withValue = list.map(function (r) { return { r: r, v: implied(r) }; });
    withValue.sort(function (a, b) {
      if (sort === 'tvl') return b.r.tvl_usd - a.r.tvl_usd;
      if (sort === 'growth') return (b.r.change_7d === null ? -Infinity : b.r.change_7d) - (a.r.change_7d === null ? -Infinity : a.r.change_7d);
      if (sort === 'age') return (b.r.age_days === null ? -1 : b.r.age_days) - (a.r.age_days === null ? -1 : a.r.age_days);
      if (sort === 'readiness') return b.r.readiness_score - a.r.readiness_score;
      return b.v - a.v;
    });
    return withValue;
  }

  function renderBoard() {
    var list = visibleRows();
    $('count').textContent = list.length + ' of ' + R.rows.length + ' protocols' + (custom ? ' · sandbox model' : '');
    var html = '';
    list.forEach(function (item, i) {
      var r = item.r;
      html += '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="selected"' : '') + '>'
        + '<td class="num">' + (i + 1) + '</td>'
        + '<td><span class="name">' + esc(r.name) + '</span>' + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '<br><span class="sub">' + esc(r.slug) + '</span></td>'
        + '<td>' + esc(r.category || '–') + '</td>'
        + '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '–') + '</td>'
        + '<td class="num">' + money(r.tvl_usd) + '</td>'
        + '<td class="num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>'
        + '<td class="num">' + ageText(r.age_days) + '</td>'
        + '<td class="num"><strong>' + money(item.v) + '</strong></td>'
        + '<td class="num">' + r.readiness_score + '</td></tr>';
    });
    rowsEl.innerHTML = html || '<tr><td colspan="9">No protocol matches these filters.</td></tr>';
  }

  function openDetail(slug) {
    var found = null;
    R.rows.forEach(function (r) { if (r.slug === slug) found = r; });
    if (!found) { detailEl.hidden = true; selected = null; renderBoard(); return; }
    selected = slug;
    var r = found;
    var steps = (r.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      if (at < 0) return '<li>' + esc(s) + '</li>';
      return '<li>' + esc(s.slice(0, at)) + ' <span class="cost">' + esc(s.slice(at + 1)) + '</span></li>';
    }).join('');
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>'
      + '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</p>'
      + '<dl class="kv">'
      + '<div><dt>Implied value</dt><dd>' + money(implied(r)) + '</dd></div>'
      + '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>'
      + '<div><dt>7-day growth</dt><dd class="' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</dd></div>'
      + '<div><dt>Age</dt><dd>' + ageText(r.age_days) + '</dd></div>'
      + '<div><dt>Category multiple</dt><dd>' + r.category_multiple.toFixed(2) + '×</dd></div>'
      + '<div><dt>Readiness</dt><dd>' + r.readiness_score + ' / 100</dd></div>'
      + '</dl>'
      + '<p class="lede">Valued at ' + money(r.tvl_usd) + ' of deposits × a ' + r.category_multiple.toFixed(2)
      + '× ' + esc(r.category || 'market') + ' multiple × ' + r.growth_multiplier.toFixed(2)
      + ' growth × ' + r.maturity_multiplier.toFixed(2) + ' maturity. The multiple is the median '
      + 'market-cap-to-TVL ratio of the tokenised protocols in this category; the readiness score is '
      + 'display only and never moves the rank.</p>'
      + '<h3>Farm plan</h3><ol class="steps">' + steps + '</ol>'
      + '<p class="note">Farm only what you can afford to lose. A launch is never guaranteed, and a real claim never asks for a fee.</p>';
    detailEl.hidden = false;
    renderBoard();
  }

  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    writeHash({ detail: tr.getAttribute('data-slug') });
    openDetail(tr.getAttribute('data-slug'));
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  ['q', 'category', 'chain', 'sort', 'watchonly'].forEach(function (id) {
    $(id).addEventListener('input', function () { renderBoard(); });
    $(id).addEventListener('change', function () { renderBoard(); });
  });

  // ---- live view ---------------------------------------------------------
  var liveHtml = '';
  R.live.forEach(function (p) {
    liveHtml += '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="sub">' + esc(p.slug) + '</span></td>'
      + '<td>' + esc(p.category || '–') + '</td>'
      + '<td>' + esc((p.chains || []).slice(0, 2).join(', ') || '–') + '</td>'
      + '<td class="num">' + money(p.tvl_usd) + '</td>'
      + '<td class="num"><strong>' + money(p.mcap_usd) + '</strong></td>'
      + '<td class="num ' + pctClass(p.change_7d) + '">' + pct(p.change_7d) + '</td></tr>';
  });
  $('liverows').innerHTML = liveHtml;

  // ---- model view --------------------------------------------------------
  var multHtml = '';
  Object.keys(R.category_multiples).sort().forEach(function (cat) {
    var m = R.category_multiples[cat];
    multHtml += '<tr><td>' + esc(cat) + '</td><td class="num">' + m.multiple.toFixed(2) + '×</td><td class="num">' + m.comps + '</td><td>' + (m.source === 'category' ? 'Category median' : 'Global fallback') + '</td></tr>';
  });
  multHtml += '<tr><td><strong>All protocols</strong></td><td class="num"><strong>' + R.global_multiple.toFixed(2) + '×</strong></td><td class="num">–</td><td>Global median</td></tr>';
  $('multrows').innerHTML = multHtml;

  function syncSandbox() {
    gw = parseFloat($('gw').value);
    mf = parseFloat($('mf').value);
    $('gw-out').textContent = gw.toFixed(2);
    $('mf-out').textContent = mf.toFixed(2);
    custom = gw !== R.model.growth_weight || mf !== R.model.maturity_floor;
    $('sandbox-note').textContent = custom
      ? 'Showing a sandbox re-rank: growth weight ' + gw.toFixed(2) + ', maturity floor ' + mf.toFixed(2) + '. The published model is growth weight ' + R.model.growth_weight.toFixed(2) + ', maturity floor ' + R.model.maturity_floor.toFixed(2) + '.'
      : 'Showing the published model.';
    renderBoard();
  }
  $('gw').addEventListener('input', syncSandbox);
  $('mf').addEventListener('input', syncSandbox);
  $('reset-model').addEventListener('click', function () {
    $('gw').value = R.model.growth_weight;
    $('mf').value = R.model.maturity_floor;
    syncSandbox();
  });

  // ---- tabs and hash -----------------------------------------------------
  function showTab(name) {
    ['board', 'live', 'model'].forEach(function (t) {
      $('view-' + t).hidden = t !== name;
      $('tab-' + t).classList.toggle('active', t === name);
    });
  }
  ['board', 'live', 'model'].forEach(function (t) {
    $('tab-' + t).addEventListener('click', function () {
      writeHash({ tab: t });
      showTab(t);
    });
  });

  function readHash() {
    var out = {};
    location.hash.slice(1).split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }

  function writeHash(patch) {
    var h = readHash();
    Object.keys(patch).forEach(function (k) { h[k] = patch[k]; });
    var s = Object.keys(h).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(h[k]); }).join('&');
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  var h = readHash();
  if (h.category) catSel.value = h.category;
  if (h.chain) chainSel.value = h.chain;
  if (h.sort) $('sort').value = h.sort;
  if (h.watchlist === '1') $('watchonly').checked = true;
  if (h.q) $('q').value = h.q;
  showTab(h.tab === 'live' || h.tab === 'model' ? h.tab : 'board');
  renderBoard();
  if (h.detail) openDetail(h.detail);
})();
