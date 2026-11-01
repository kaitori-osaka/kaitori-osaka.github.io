/* 管理画面（担当者用）
   ログインは共通アカウント（メールとパスワード）。誰が操作したかは「操作する人」で切り替えて記録する。
   読み書きの権限はデータベース側（担当者として登録したアカウントだけ）で守っている。 */
(function(){
  if(!window.API) return;
  var SS = API.store('kd-admin', false), SESS = SS.get();
  function call(action, data){ return API.call(action, Object.assign({ s: SESS && SESS.s }, data || {})).catch(function(e){ if(e.code === 'auth'){ SS.set(null); setTimeout(function(){ location.reload(); }, 1500); } throw e; }); }
  var $ = function(id){ return document.getElementById(id); };
  var KIND = { shop: '店頭', visit: '出張', photo: '写真査定', takuhai: '宅配' };
  var ST = { new: '新着', contacted: '連絡済', scheduled: '日時確定', kit_sent: 'キット発送', pre_appraised: '仮査定提示', waiting: '発送待ち', shipped: 'お客様発送済', arrived: '到着', appraised: '金額提示中', accepted: '成約・同意', paid: '振込済', declined: '不成立', done: '完了', cancelled: '取消' };
  var PLAN = { matome: 'A おまとめ', kodaka: 'B 30%UP' };
  var PLAN_LONG = { matome: 'A おまとめ簡易買取（仮査定なし）', kodaka: 'B 提携先紹介 30%高価買取' };
  var STATUS_PLAN = ['new', 'pre_appraised', 'waiting', 'shipped', 'arrived', 'appraised', 'accepted', 'paid', 'declined', 'done', 'cancelled'];
  // 提携先プランの手順（管理用）。[状態, 見出し]
  function planSteps(r){
    var s = [['waiting', 'お客様の発送待ち'], ['shipped', 'お客様が発送'], ['arrived', '到着（査定する）'], ['appraised', (r.plan === 'matome' ? 'おまとめ価格' : '買取価格') + 'を提示・回答待ち'], ['accepted', '同意あり（振込する）'], ['paid', '振込済み'], ['done', '完了']];
    if(r.plan === 'kodaka' && r.pre_est) s = [['new', '写真で仮査定する'], ['pre_appraised', '仮査定を提示・回答待ち']].concat(s);
    return s;
  }
  function days(s){ return s ? Math.floor((Date.now() - new Date(s).getTime()) / 864e5) : 0; }
  // 一覧に出す「次にやること」
  function nextTodo(r){
    if(!r.plan) return '';
    if(r.status === 'waiting' && r.kit_boxes > 0 && !r.kit_tracking) return 'キット' + r.kit_boxes + '箱を発送する';
    var w = { new: '仮査定を出す', pre_appraised: '仮査定の回答待ち', waiting: 'お客様の発送待ち（' + days(r.created_at) + '日）', shipped: '到着待ち（' + days(r.shipped_at) + '日）', arrived: '査定して価格を提示', appraised: 'お客様の回答待ち（' + days(r.estimate_at) + '日）', accepted: '振込する' + (r.bank ? '' : '（振込先未登録）'), paid: '完了にする' }[r.status];
    return w || '';
  }
  var STATUS_BY_KIND = {
    shop: ['new', 'contacted', 'scheduled', 'accepted', 'declined', 'done', 'cancelled'],
    visit: ['new', 'contacted', 'scheduled', 'appraised', 'accepted', 'declined', 'done', 'cancelled'],
    photo: ['new', 'contacted', 'appraised', 'accepted', 'declined', 'done', 'cancelled'],
    takuhai: ['new', 'contacted', 'kit_sent', 'arrived', 'appraised', 'accepted', 'paid', 'declined', 'done', 'cancelled']
  };
  var CLOSED = ['done', 'cancelled', 'declined'];
  var ROWS = [], ROSTER = [], CUR = null, TAB = 'todo';

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function yen(n){ return n == null ? '' : Number(n).toLocaleString('ja-JP') + '円'; }
  function dt(s){ if(!s) return ''; var d = new Date(s); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + '日月火水木金土'[d.getDay()] + ') ' + d.toTimeString().slice(0, 5); }
  function say(t, cls){ $('appMsg').innerHTML = t ? '<p class="msg ' + (cls || 'bad') + '">' + esc(t) + '</p>' : ''; if(t && cls === 'ok') setTimeout(function(){ $('appMsg').innerHTML = ''; }, 4000); }
  function actor(){ return $('actor').value || '担当者'; }
  function tagFor(s){ return s === 'new' ? 'new' : (s === 'appraised' || s === 'pre_appraised') ? 'go' : (s === 'accepted' || s === 'done' || s === 'paid') ? 'ok' : CLOSED.indexOf(s) >= 0 ? 'end' : ''; }
  function needsAction(r){ return (r.plan && ((r.status === 'waiting' && r.kit_boxes > 0 && !r.kit_tracking) || r.status === 'arrived' || r.status === 'shipped' || (r.status === 'accepted') || r.status === 'paid' || (r.status === 'new' && r.pre_est))) || r.status === 'new' || r.unread_staff > 0 || r.id_status === 'submitted' || r.status === 'arrived' || (r.answer && r.status === 'accepted' && !r.final_amount && r.kind === 'photo'); }

  // ── ログイン ──
  $('loginForm').addEventListener('submit', async function(ev){
    ev.preventDefault(); $('loginMsg').innerHTML = '';
    try{
      SESS = await API.call('staffLogin', { id: $('lid').value.trim(), password: $('pw').value }); SS.set(SESS); $('pw').value = '';
      try{ localStorage.setItem('kd-lid', $('lid').value.trim()); if(SESS.name) localStorage.setItem('kd-actor', SESS.name); }catch(e){}
      await enter();
    }
    catch(e){ $('loginMsg').innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; }
  });
  try{ var lid0 = localStorage.getItem('kd-lid'); if(lid0) $('lid').value = lid0; }catch(e){}
  $('logout').addEventListener('click', function(){ SS.set(null); location.reload(); });

  async function enter(){
    var first = await call('staffList');
    ROWS = first.rows; ROSTER = first.roster;
    $('loginBox').hidden = true; $('app').hidden = false; $('who').hidden = false;
    var saved = ''; try{ saved = localStorage.getItem('kd-actor') || ''; }catch(e){}
    $('actor').innerHTML = ROSTER.map(function(r){ return '<option' + (r.name === saved ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('');
    $('actor').onchange = function(){ try{ localStorage.setItem('kd-actor', actor()); }catch(e){} };
    await refresh();
    var h = decodeURIComponent(location.hash.slice(1)); if(h){ var m = ROWS.filter(function(r){ return r.receipt_no === h; })[0]; if(m){ TAB = 'all'; drawList(); open(m.id); } }
    setInterval(function(){ if(!document.hidden) refresh(true); }, 60000);
  }

  // ── 一覧 ──
  async function refresh(quiet){
    try{
      var j = await call('staffList'); ROWS = j.rows; ROSTER = j.roster;
      drawList();
      // 開いているお申込みが、お客様側の操作（振込先の登録など）で変わっていたら表示し直す（入力中は待つ）
      if(CUR){
        var c = ROWS.filter(function(r){ return r.id === CUR; })[0], ae = document.activeElement;
        var typing = ae && $('detail').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName);
        if(c && (c.unread_staff > 0 || c.updated_at !== SHOWN) && !(quiet && typing)) open(CUR);
      }
    }catch(e){ say(e.message); }
  }
  function filtered(){
    var k = $('fKind').value, q = $('fq').value.trim().replace(/-/g, '');
    return ROWS.filter(function(r){
      if(TAB === 'todo' && !needsAction(r)) return false;
      if(TAB === 'open' && CLOSED.indexOf(r.status) >= 0) return false;
      if(k === 'planA' && r.plan !== 'matome') return false;
      if(k === 'planB' && r.plan !== 'kodaka') return false;
      if(k && k.indexOf('plan') !== 0 && r.kind !== k) return false;
      if(q && (r.name + r.phone + r.receipt_no.replace(/-/g, '') + (r.kana || '') + (r.email || '')).indexOf(q) < 0) return false;
      return true;
    });
  }
  function drawList(){
    var todo = ROWS.filter(needsAction).length, open_ = ROWS.filter(function(r){ return CLOSED.indexOf(r.status) < 0; }).length;
    $('cTodo').textContent = todo || ''; $('cOpen').textContent = open_ || '';
    document.title = (todo ? '(' + todo + ') ' : '') + '管理画面｜買取大吉 大阪勝山南店';
    document.querySelectorAll('.tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === TAB); });
    var L = filtered();
    $('list').innerHTML = L.length ? L.map(function(r){
      return '<button class="row' + (r.id === CUR ? ' on' : '') + '" data-id="' + r.id + '"><span class="l1"><span>' + esc(r.name) + ' 様</span><span class="tag ' + tagFor(r.status) + '">' + ST[r.status] + '</span></span>'
        + '<span class="l2"><span class="tag">' + KIND[r.kind] + '</span>' + esc(r.receipt_no) + '・' + dt(r.created_at)
        + (r.mode === 'trial' ? '<span class="tag trial">試験</span>' : '')
        + (r.ref ? '<span class="tag">紹介 ' + esc(r.ref) + '</span>' : '')
        + (r.ref && (r.kind === 'shop' || r.kind === 'visit') ? '<span class="tag go">30%上乗せ</span>' : '')
        + (r.plan ? '<span class="tag go">' + PLAN[r.plan] + (r.pre_est ? '・仮査定' : '') + '</span>' : '')
        + (nextTodo(r) && CLOSED.indexOf(r.status) < 0 ? '<span class="tag">次：' + esc(nextTodo(r)) + '</span>' : '')
        + (r.unread_staff ? '<span class="tag new">連絡 ' + r.unread_staff + '</span>' : '')
        + (r.photo_count ? '<span class="tag">写真 ' + r.photo_count + '</span>' : '')
        + (r.id_status === 'submitted' ? '<span class="tag go">身分証確認待ち</span>' : '')
        + (r.assignee ? '<span>担当 ' + esc(r.assignee) + '</span>' : '') + '</span></button>';
    }).join('') : '<p class="empty">' + (TAB === 'todo' ? '対応が必要な案件はありません。' : '該当する案件はありません。') + '</p>';
  }
  document.querySelector('.tabs').addEventListener('click', function(ev){ var b = ev.target.closest('button'); if(!b) return; TAB = b.dataset.tab; drawList(); });
  $('fKind').onchange = drawList; $('fq').oninput = drawList;
  $('reload').onclick = function(){ refresh(); };
  $('list').addEventListener('click', function(ev){ var b = ev.target.closest('.row'); if(b) open(b.dataset.id); });

  // ── 詳細 ──
  var SHOWN = null;
  async function open(id){
    CUR = id; drawList();
    var r = ROWS.filter(function(x){ return x.id === id; })[0]; if(!r) return;
    SHOWN = r.updated_at;
    try{ history.replaceState(null, '', '#' + r.receipt_no); }catch(e){}
    var d = $('detail');
    d.innerHTML = '<p class="empty">読み込んでいます…</p>';
    var msgs = [], evs = [];
    try{
      var g0 = await call('staffGet', { id: id }); msgs = g0.messages; evs = g0.events;
      if(r.unread_staff){ r.unread_staff = 0; drawList(); }
    }catch(e){ say(e.message); }
    d.innerHTML = render(r, msgs, evs);
    if(r.photo_count) loadPics('intake', r.id, d.querySelector('[data-pics=intake]'));
    if(r.kind === 'takuhai' && r.id_status !== 'none') loadPics('idcopy', r.id, d.querySelector('[data-pics=idcopy]'));
  }
  async function loadPics(bucket, folder, box){
    if(!box) return;
    try{
      box.innerHTML = '<span class="hint">写真を読み込んでいます…</span>';
      var files = await call('staffFiles', { id: folder, which: bucket });
      if(!files.length){ box.innerHTML = '<span class="hint">ありません</span>'; return; }
      box.innerHTML = '';
      files.forEach(function(f, i){ var img = document.createElement('img'); img.src = f.data; img.alt = '写真 ' + (i + 1); box.appendChild(img); });
    }catch(e){ box.innerHTML = '<span class="hint">写真を読み込めませんでした：' + esc(e.message) + '</span>'; }
  }

  // ── お品物の明細（商品番号・商品名・点数・買取価格／おまとめ／ハイブリッド）──
  var LIMGS = [], LNAMES = [];
  function lineRow(x, i){
    x = x || {};
    var im = String(x.img || ''), k = /^画像(\d)$/.exec(im), th = k && LIMGS[k[1] - 1] ? '<img src="' + LIMGS[k[1] - 1] + '" alt="">' : '';
    return '<tr><td><input type="text" data-l="no" maxlength="20" value="' + esc(x.no || String(i + 1)) + '"></td>'
      + '<td class="col-img"><input type="hidden" data-l="img" value="' + esc(im) + '">' + (im ? '<button type="button" class="limg-ref" data-act="limg-view" data-src="' + esc(im) + '" title="この画像を大きく見る">' + th + '<span>' + esc(im) + '</span></button>' : '<span class="hint">―</span>') + '</td>'
      + '<td><input type="text" data-l="name" maxlength="120" value="' + esc(x.name || '') + '" placeholder="例：ROLEX デイトジャスト 126234"></td>'
      + '<td><input type="number" data-l="qty" min="1" max="999" value="' + esc(x.qty || 1) + '"></td>'
      + '<td class="col-matome"><input type="checkbox" data-l="matome"' + (x.matome ? ' checked' : '') + ' aria-label="おまとめに含める"></td>'
      + '<td class="col-up"><input type="checkbox" data-l="up"' + (x.up === false ? '' : ' checked') + ' aria-label="30%上乗せの対象"></td>'
      + '<td class="col-price"><input type="number" data-l="price" min="0" step="1" value="' + (x.price == null ? '' : esc(x.price)) + '"></td>'
      + '<td><button type="button" class="btn ghost small" data-act="line-del" aria-label="この行を消す">×</button></td></tr>';
  }
  function linesBox(r){
    var L = Array.isArray(r.lines) ? r.lines : [], pm = r.price_mode || (r.plan === 'matome' ? 'matome' : 'item');
    LIMGS = []; LNAMES = [];
    var up = r.plan === 'kodaka' || (!!r.ref && (r.kind === 'shop' || r.kind === 'visit'));
    return '<div class="box lines-box pm-' + pm + (up ? ' has-up' : '') + '" id="linesBox" data-up="' + (up ? 1 : 0) + '"><h3>お品物の明細</h3>'
      + '<div class="aibox"><label class="btn ghost small">写真から選ぶ（複数可）<input type="file" accept="image/*" multiple data-lines-files hidden></label>'
      + '<label class="btn ghost small">カメラで撮る<input type="file" accept="image/*" capture="environment" data-lines-files hidden></label>'
      + '<span class="hint" data-lines-count>画像：0枚（6枚まで。何回かに分けて足せます）</span><div class="lthumbs" data-lines-thumbs></div>'
      + '<button class="btn ghost small" data-act="itemize">画像から商品を調べる</button>'
      + (r.photo_count ? '<button class="btn ghost small" data-act="itemize-cust">お客様の写真から調べる</button>' : '') + '</div>'
      + '<p class="hint">AIが商品名・ブランド・型番を調べて明細に入れます（下書き）。必ず確認・修正してください。金額は担当者が入れます。</p>'
      + '<div class="choices pmode"><label><input type="radio" name="pmode" value="item"' + (pm === 'item' ? ' checked' : '') + '>個別の買取価格</label>'
      + '<label><input type="radio" name="pmode" value="matome"' + (pm === 'matome' ? ' checked' : '') + '>おまとめ価格</label>'
      + '<label><input type="radio" name="pmode" value="hybrid"' + (pm === 'hybrid' ? ' checked' : '') + '>個別＋おまとめ（ハイブリッド）</label></div>'
      + '<div class="table-wrap"><table class="lines"><thead><tr><th>商品番号</th><th class="col-img">画像</th><th>商品名（ブランド・型番）</th><th>点数</th><th class="col-matome">おまとめ</th><th class="col-up">30%対象</th><th class="col-price">買取価格（円）</th><th></th></tr></thead><tbody>'
      + (L.length ? L.map(lineRow).join('') : lineRow({}, 0)) + '</tbody></table></div>'
      + '<button class="btn ghost small" data-act="line-add">＋ 行を追加</button>'
      + '<div class="matome-row"><label class="f">おまとめ価格（円）<br><input type="number" min="0" step="1" data-lm="matome" value="' + (r.matome_amount == null ? '' : esc(r.matome_amount)) + '"></label>'
      + '<p class="hint">ハイブリッドでは「おまとめ」にチェックした行をまとめて1つの価格にします。</p></div>'
      + (up ? '<p class="hint">提携先ご紹介の30%上乗せ：「30%対象」は最初はすべてチェックが入っています。<b>貴金属・商品券など上乗せの対象外のお品物は、チェックを外してください。</b>（AIが金・貴金属や金券と判断した物は、最初から外してあります）</p>' : '')
      + '<p class="lines-total" data-lines-total></p>'
      + '<div class="actions"><button class="btn blue small" data-act="lines-save">明細を保存</button><button class="btn ghost small" data-act="lines-apply">合計を買取価格の欄に入れる</button></div></div>';
  }
  function readLines(){
    var box = $('linesBox'); if(!box) return null;
    var pm = (box.querySelector('[name=pmode]:checked') || {}).value || 'item';
    var L = [].map.call(box.querySelectorAll('tbody tr'), function(tr){
      var q = function(k){ return tr.querySelector('[data-l=' + k + ']'); };
      return { no: q('no').value.trim(), img: q('img').value, name: q('name').value.trim(), qty: Number(q('qty').value) || 1, matome: pm === 'matome' ? true : pm === 'hybrid' ? q('matome').checked : false, up: box.dataset.up === '1' ? q('up').checked : true, price: q('price').value === '' ? null : Number(q('price').value) };
    }).filter(function(x){ return x.name; });
    var mv = box.querySelector('[data-lm=matome]').value, matome = pm === 'item' || mv === '' ? null : Number(mv);
    var total = L.reduce(function(t, x){ return t + (x.matome || x.price == null ? 0 : x.price); }, 0) + (matome || 0);
    // 基準値（通常の査定額）：30%対象の物は ÷1.3、対象外（チェックを外した物）はそのまま。おまとめ価格は対象として ÷1.3
    var base = box.dataset.up === '1' ? L.reduce(function(t, x){ return t + (x.matome || x.price == null ? 0 : (x.up ? Math.round(x.price / 1.3) : x.price)); }, 0) + (matome ? Math.round(matome / 1.3) : 0) : null;
    return { pm: pm, lines: L, matome: matome, total: total, base: base };
  }
  function syncLines(){
    var box = $('linesBox'); if(!box) return;
    var pm = (box.querySelector('[name=pmode]:checked') || {}).value || 'item';
    box.className = 'box lines-box pm-' + pm + (box.dataset.up === '1' ? ' has-up' : '');
    [].forEach.call(box.querySelectorAll('tbody tr'), function(tr){ var mc = tr.querySelector('[data-l=matome]'), pr = tr.querySelector('[data-l=price]'); pr.disabled = pm === 'matome' || (pm === 'hybrid' && mc.checked); });
    var R = readLines(), n = R.lines.reduce(function(t, x){ return t + x.qty; }, 0);
    box.querySelector('[data-lines-total]').textContent = '合計：' + R.lines.length + '品目・' + n + '点　買取価格の合計 ' + yen(R.total) + (R.matome != null ? '（うち おまとめ ' + yen(R.matome) + '）' : '') + (R.base != null ? '　／　基準値（通常の査定額）の合計 ' + yen(R.base) + '・上乗せ分 ' + yen(R.total - R.base) : '');
  }
  function shrink(file){
    return new Promise(function(ok, ng){
      var rd = new FileReader(); rd.onerror = ng;
      rd.onload = function(){ var im = new Image(); im.onerror = ng; im.onload = function(){
        var k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.82)); }; im.src = rd.result; };
      rd.readAsDataURL(file);
    });
  }
  function drawThumbs(over){
    var c = $('detail').querySelector('[data-lines-count]'), t = $('detail').querySelector('[data-lines-thumbs]');
    if(c) c.textContent = '画像：' + LIMGS.length + '枚' + (over ? '（6枚までです）' : LIMGS.length < 6 ? '（6枚まで。何回かに分けて足せます）' : '');
    if(t) t.innerHTML = LIMGS.map(function(u, i){ return '<figure><button type="button" class="lth" data-act="limg-view" data-src="画像' + (i + 1) + '" title="大きく見る"><img src="' + u + '" alt="画像' + (i + 1) + '"><b>画像' + (i + 1) + '</b></button><figcaption>' + esc(LNAMES[i] || '') + '</figcaption><button type="button" class="del" data-act="limg-del" data-i="' + i + '" aria-label="画像' + (i + 1) + 'を外す">×</button></figure>'; }).join('');
  }
  $('detail').addEventListener('change', async function(ev){
    if(ev.target.matches('[data-lines-files]')){
      // 選ぶたびに足していく（1枚ずつ撮っても、まとめて選んでもよい）。6枚まで
      var fs = [].slice.call(ev.target.files || []), over = false;
      for(var i = 0; i < fs.length; i++){ if(LIMGS.length >= 6){ over = true; break; } try{ LIMGS.push(await shrink(fs[i])); LNAMES.push(fs[i].name || ('撮影 ' + new Date().toTimeString().slice(0, 8))); }catch(e){} }
      ev.target.value = '';
      drawThumbs(over);
    }
    if(ev.target.closest('#linesBox')) syncLines();
  });

  function render(r, msgs, evs){
    var wish = r.wishes ? esc(r.wishes).split(' / ').map(function(w, i){ return '第' + (i + 1) + '希望 ' + w; }).join('<br>') : '';
    var tel = r.phone.replace(/[^0-9+]/g, '');
    var h = '<div class="l1" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2>' + esc(r.name) + ' 様' + (r.kana ? '<small>（' + esc(r.kana) + '）</small>' : '') + '</h2><span><span class="tag">' + KIND[r.kind] + '</span> <span class="tag ' + tagFor(r.status) + '">' + ST[r.status] + '</span>' + (r.mode === 'trial' ? ' <span class="tag trial">試験</span>' : '') + '</span></div>'
      + '<p class="hint">受付番号 ' + esc(r.receipt_no) + '・受付 ' + dt(r.created_at) + '</p>';

    h += '<div class="box grid2"><dl class="kv">'
      + '<dt>電話</dt><dd><a href="tel:' + tel + '">' + esc(r.phone) + '</a></dd>'
      + '<dt>メール</dt><dd>' + (r.email ? esc(r.email) : '（なし）') + '</dd>'
      + '<dt>連絡方法</dt><dd>' + ({ phone: '電話', email: 'メール', either: 'どちらでも', line: 'LINE' }[r.contact_pref] || '電話') + (r.line_id ? '（LINE ID：' + esc(r.line_id) + '）' : '') + '</dd>'
      + (r.address ? '<dt>住所</dt><dd>' + esc((r.postal ? '〒' + r.postal + ' ' : '') + r.address) + '</dd>' : '')
      + (r.ref ? '<dt>紹介元</dt><dd><b>' + esc(r.ref) + '</b>' + (r.kind === 'shop' || r.kind === 'visit' || r.plan === 'kodaka' ? '<br><span class="tag go">30%上乗せの対象</span>（貴金属・商品券は対象外）' : '') + '</dd>' : '')
      + (r.how_found ? '<dt>きっかけ</dt><dd>' + esc(r.how_found) + '</dd>' : '')
      + '</dl><dl class="kv">'
      + '<dt>品目</dt><dd>' + esc((r.items || []).join('、') || '（未選択）') + '</dd>'
      + (r.item_note ? '<dt>内容</dt><dd style="white-space:pre-wrap">' + esc(r.item_note) + '</dd>' : '')
      + (r.quantity ? '<dt>量</dt><dd>' + esc(r.quantity) + '</dd>' : '')
      + (r.kind === 'takuhai' && !r.plan ? '<dt>キット</dt><dd>' + (r.kit_boxes ? r.kit_boxes + '箱' : '不要') + '</dd>' : '')
      + (r.bank || r.plan ? '<dt>振込先</dt><dd>' + (r.bank ? '<b>' + esc(r.bank) + '</b>' : '<span class="tag new">未登録</span>') + '</dd>' : '')
      + (r.plan ? '<dt>プラン</dt><dd><b>' + PLAN_LONG[r.plan] + '</b>' + (r.plan === 'kodaka' ? (r.pre_est ? '（仮査定あり）' : '（仮査定なし）') : '') + '</dd>' : '')
      + (wish ? '<dt>希望日時</dt><dd>' + wish + '</dd>' : '')
      + '</dl></div>';

    // 担当・状態・メモ
    h += '<div class="box"><h3>担当と状態</h3><div class="inline">'
      + '<label class="f">担当者<br><select data-f="assignee"><option value="">（未定）</option>' + ROSTER.map(function(x){ return '<option' + (x.name === r.assignee ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>'
      + '<label class="f">状態<br><select data-f="status">' + (r.plan ? STATUS_PLAN : STATUS_BY_KIND[r.kind]).map(function(s){ return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + ST[s] + '</option>'; }).join('') + '</select></label>'
      + '<button class="btn blue small" data-act="save-state">変更を保存</button></div>'
      + '<div class="f" style="margin-top:10px"><label>店舗内メモ（お客様には見えません）</label><textarea data-f="staff_memo" style="min-height:70px">' + esc(r.staff_memo || '') + '</textarea></div>'
      + '<button class="btn ghost small" data-act="save-memo">メモを保存</button></div>';

    // 写真と鑑定補助
    if(r.photo_count || r.kind === 'photo'){
      h += '<div class="box"><h3>お客様の写真（' + r.photo_count + '枚）</h3><div class="pics" data-pics="intake"></div>';
      if(r.photo_count) h += '<div class="actions" style="margin-top:10px"><button class="btn ghost small" data-act="ai">写真鑑定の補助を' + (r.ai_note ? 'やり直す' : '使う') + '</button></div>';
      if(r.ai_note) h += aiView(r.ai_note, r.ai_at);
      h += '</div>';
    }

    // 方法ごとの操作
    if(r.kind === 'shop' || r.kind === 'visit'){
      var local = r.scheduled_at ? new Date(new Date(r.scheduled_at).getTime() + 9 * 3600e3).toISOString().slice(0, 16) : '';
      h += '<div class="box"><h3>' + (r.kind === 'visit' ? 'ご訪問' : 'ご来店') + 'の日時</h3><div class="inline"><label class="f">日時<br><input type="datetime-local" data-f="when" value="' + local + '"></label>'
        + '<button class="btn blue small" data-act="schedule">確定してお客様に知らせる</button></div>'
        + (r.email ? '' : '<p class="hint">メールアドレスがないため、お知らせは送られません。お電話でお伝えください。</p>') + '</div>';
    }
    if(r.plan){ h += planPanel(r); }
    if(r.kind === 'takuhai' && !r.plan){
      h += '<div class="box"><h3>宅配キットとご本人確認</h3><div class="inline"><label class="f">追跡番号<br><input type="text" data-f="kit_tracking" value="' + esc(r.kit_tracking || '') + '"></label>'
        + '<button class="btn blue small" data-act="kit">キット発送をお知らせ</button><button class="btn ghost small" data-act="arrived">お品物の到着を記録</button></div>'
        + '<p style="margin-top:10px">身分証：<b>' + ({ none: '未提出', submitted: '提出あり（確認待ち）', verified: '確認済み' }[r.id_status]) + '</b></p><div class="pics" data-pics="idcopy"></div>'
        + (r.id_status === 'submitted' ? '<div class="actions"><button class="btn blue small" data-act="id-ok">身分証を確認済みにする</button></div>' : '')
        + '<p class="hint">転送不要の簡易書留の到達と、同じ名義の口座への振込で本人確認を完了します。</p></div>';
    }

    h += linesBox(r);

    // 金額の提示
    var isRange = r.kind === 'photo';
    if(!r.plan) h += '<div class="box"><h3>' + (isRange ? '概算金額の提示' : '査定金額の提示') + '</h3><div class="inline">'
      + (isRange
        ? '<label class="f">下限（円）<br><input type="number" min="0" step="100" data-f="estimate_low" value="' + (r.estimate_low == null ? '' : r.estimate_low) + '"></label><label class="f">上限（円）<br><input type="number" min="0" step="100" data-f="estimate_high" value="' + (r.estimate_high == null ? '' : r.estimate_high) + '"></label>'
        : '<label class="f">金額（円）<br><input type="number" min="0" step="1" data-f="final_amount" value="' + (r.final_amount == null ? '' : r.final_amount) + '"></label>' + (r.ref && (r.kind === 'shop' || r.kind === 'visit') ? '<p class="hint" data-revout style="flex-basis:100%">提携先ご紹介（30%上乗せ）：買取価格を入れると、基準値（÷1.3）をここに表示します</p>' : ''))
      + '</div><div class="f" style="margin-top:8px"><label>お客様へのひとこと（金額の根拠など）</label><textarea data-f="estimate_note" style="min-height:70px">' + esc(r.estimate_note || '') + '</textarea></div>' + '<button class="btn ghost small" data-act="ai-draft" data-target="estimate_note" data-purpose="estimate_note" style="margin-top:6px">AIで文面を作る</button><div class="aiok" data-aiok="estimate_note" hidden><p class="hint">AIの下書きです。金額や内訳を確かめ、必要なら直してから使ってください。</p></div>'
      + '<button class="btn primary small" data-act="estimate"' + (r.email ? '' : ' disabled') + '>金額をお客様に知らせる</button>'
      + (r.email ? '' : '<p class="hint">メールアドレスがないため、金額はお電話でお伝えください。</p>')
      + (r.answer ? '<p style="margin-top:8px"><b>お客様の回答：' + (r.answer === 'accept' ? '同意' : '見送り') + '</b>（' + dt(r.answer_at) + '）</p>' : '')
      + (isRange && r.status === 'accepted' ? '<p class="hint">売り方（店頭・出張・宅配）をお客様と相談し、必要なら新しい案件として受け付けてください。</p>' : '')
      + '</div>';

    // 連絡
    h += '<div class="box"><h3>お客様との連絡</h3><div class="thread">'
      + (msgs.length ? msgs.map(function(m){ return '<div class="bubble ' + (m.sender === 'staff' ? 'customer' : m.sender === 'customer' ? 'staff' : 'system') + '">' + esc(m.body) + '<time>' + (m.sender === 'staff' ? '店舗' + (m.author ? '（' + esc(m.author) + '）' : '') : m.sender === 'customer' ? 'お客様' : '') + '・' + dt(m.created_at) + '</time></div>'; }).join('') : '<p class="hint">まだやり取りはありません。</p>')
      + '</div><div class="aibox" style="margin-top:10px"><div class="f"><label>AIへの指示（任意）</label><input type="text" data-f="aihint" maxlength="200" placeholder="例：来店日時を11月5日14時で確定したと伝える"></div>'
      + '<button class="btn ghost small" data-act="ai-draft" data-target="reply" data-purpose="reply">AIで下書きを作る</button></div>'
      + '<div class="f" style="margin-top:10px"><textarea data-f="reply" placeholder="お客様へのご連絡（メールでも届きます）"></textarea></div>'
      + '<div class="aiok" data-aiok="reply" hidden><p class="hint">AIの下書きです。内容（特に金額・日時）を確かめ、必要なら直してから送ってください。</p><label class="check"><input type="checkbox" data-f="aiok_reply"><span>内容を確認しました（承認）</span></label></div>'
      + '<button class="btn blue small" data-act="reply"' + (r.email ? '' : ' disabled') + '>確認して送る</button>'
      + '<button class="btn ghost small" data-act="done" style="margin-left:6px">完了にする</button></div>';

    h += '<div class="box"><h3>履歴</h3><div class="log">' + evs.map(function(x){ return dt(x.at) + '　' + esc(x.actor || '') + '　' + esc(x.action); }).join('<br>') + '</div></div>';
    return h;
  }

  // 提携先プランの進行管理（手順ごとにやることとボタンを出す）
  function planPanel(r){
    var steps = planSteps(r), order = steps.map(function(x){ return x[0]; }), idx = order.indexOf(r.status);
    var closed = r.status === 'declined' || r.status === 'cancelled';
    var dates = { waiting: r.created_at, shipped: r.shipped_at, arrived: r.arrived_at, appraised: r.estimate_at, accepted: r.answer === 'accept' ? r.answer_at : null, paid: r.paid_at };
    var h = '<div class="box plan-panel"><h3>進行管理：' + PLAN_LONG[r.plan] + '</h3>';
    h += closed ? '<p><b>' + ST[r.status] + '</b>のため終了しています。</p>' : '<ol class="psteps">' + steps.map(function(x, i){
      return '<li class="' + (i < idx ? 'done' : i === idx ? 'on' : '') + '">' + x[1] + (dates[x[0]] && i <= idx ? '<small>' + dt(dates[x[0]]) + '</small>' : '') + '</li>'; }).join('') + '</ol>';
    // 本人確認・振込先（いつでも見える）
    h += '<div class="grid2" style="margin-top:10px"><div><b>本人確認</b>：' + ({ none: '未提出', submitted: '提出あり（確認待ち）', verified: '確認済み' }[r.id_status])
      + (r.id_status === 'submitted' ? ' <button class="btn blue small" data-act="id-ok">確認済みにする</button>' : '') + '<div class="pics" data-pics="idcopy"></div></div>'
      + '<div><b>振込先</b><div class="f"><input type="text" data-f="bank" value="' + esc(r.bank || '') + '" placeholder="銀行 支店 普通 口座番号 名義"></div><button class="btn ghost small" data-act="save-bank">振込先を保存</button></div></div>';
    if(closed) return h + '</div>';
    var s = r.status;
    // 1. 仮査定（Bで希望あり）
    if(r.plan === 'kodaka' && r.pre_est && (s === 'new' || s === 'contacted' || s === 'pre_appraised')){
      h += '<div class="step-act"><b>仮査定の提示</b>（上乗せ後の目安を担当者が記入。貴金属・商品券は上乗せ対象外）<div class="inline">'
        + '<label class="f">下限（円）<br><input type="number" min="0" step="100" data-f="estimate_low" value="' + (r.estimate_low == null ? '' : r.estimate_low) + '"></label>'
        + '<label class="f">上限（円）<br><input type="number" min="0" step="100" data-f="estimate_high" value="' + (r.estimate_high == null ? '' : r.estimate_high) + '"></label></div>'
        + '<div class="f"><label>お客様へのひとこと</label><textarea data-f="estimate_note" style="min-height:60px">' + esc(r.estimate_note || '') + '</textarea></div>' + '<button class="btn ghost small" data-act="ai-draft" data-target="estimate_note" data-purpose="estimate_note" style="margin-top:6px">AIで文面を作る</button><div class="aiok" data-aiok="estimate_note" hidden><p class="hint">AIの下書きです。金額や内訳を確かめ、必要なら直してから使ってください。</p></div>'
        + '<button class="btn primary small" data-act="pre-estimate">仮査定をお客様に知らせる</button></div>';
    }
    // 2. 発送待ち
    if(s === 'waiting' || s === 'contacted' || s === 'kit_sent' || (s === 'new' && !r.pre_est)){
      if(r.kit_boxes > 0) h += '<div class="step-act"><b>宅配キット ' + r.kit_boxes + '箱の希望あり</b>：' + (r.kit_tracking ? '発送済み（追跡番号 ' + esc(r.kit_tracking) + '）' : '<span class="tag new">未発送</span>')
        + '<div class="inline"><label class="f">キットの追跡番号<br><input type="text" data-f="kit_tracking" value="' + esc(r.kit_tracking || '') + '"></label><button class="btn blue small" data-act="p-kit">キット発送をお知らせ</button></div></div>';
      h += '<div class="step-act"><b>お客様の発送待ち</b>（受付から ' + days(r.created_at) + ' 日）'
        + '<p class="hint">着払いで届きます。送り方の案内を送り直すこともできます。届いたら「到着を記録」を押してください。</p>'
        + '<div class="inline"><button class="btn ghost small" data-act="ship-guide">送り方の案内を送る</button><button class="btn blue small" data-act="p-arrived">到着を記録</button></div></div>';
    }
    if(s === 'shipped'){
      h += '<div class="step-act"><b>お客様が発送しました</b>（' + dt(r.shipped_at) + (r.ship_tracking ? '・追跡番号 ' + esc(r.ship_tracking) : '') + '）'
        + '<div class="inline"><button class="btn blue small" data-act="p-arrived">到着を記録</button></div></div>';
    }
    // 3. 本査定・価格提示
    if(s === 'arrived' || s === 'appraised'){
      if(r.plan === 'kodaka'){
        h += '<div class="step-act"><b>本査定（買取価格は担当者が記入）</b><div class="inline">'
          + '<label class="f">通常の査定額・基準値（円）<br><input type="number" min="0" step="1" data-f="base_amount" value="' + (r.base_amount == null ? '' : r.base_amount) + '"></label>'
          + '<label class="f">買取価格（円）<br><input type="number" min="0" step="1" data-f="final_amount" value="' + (r.final_amount == null ? '' : r.final_amount) + '"></label></div>'
          + '<p class="hint">買取価格を入れると、基準値（通常の査定額）が自動で逆算されます（買取価格 ÷ 1.3、1円未満は四捨五入）。貴金属・商品券を含む場合は、その分を除いて基準値を手で直してください。基準値はお客様にも参考として表示されます。</p><p class="hint" data-revout></p>';
      } else {
        h += '<div class="step-act"><b>本査定（おまとめ価格）</b><div class="inline">'
          + '<label class="f">おまとめ価格（円）<br><input type="number" min="0" step="1" data-f="final_amount" value="' + (r.final_amount == null ? '' : r.final_amount) + '"></label></div>';
      }
      h += '<div class="f"><label>お客様へのひとこと（内訳など）</label><textarea data-f="estimate_note" style="min-height:70px">' + esc(r.estimate_note || (r.plan === 'matome' ? '価格がつかなかったお品物も、処分費などは一切かからず、おまとめ買取として当店で処分いたします。' : '')) + '</textarea></div>' + '<button class="btn ghost small" data-act="ai-draft" data-target="estimate_note" data-purpose="estimate_note" style="margin-top:6px">AIで文面を作る</button><div class="aiok" data-aiok="estimate_note" hidden><p class="hint">AIの下書きです。金額や内訳を確かめ、必要なら直してから使ってください。</p></div>'
        + '<button class="btn primary small" data-act="p-estimate">' + (s === 'appraised' ? '金額を出し直す' : '金額をお客様に知らせる') + '</button>'
        + (s === 'appraised' ? '<p style="margin-top:8px">お客様の回答待ち（' + days(r.estimate_at) + ' 日）　<button class="btn ghost small" data-act="p-accept">電話で同意を受けた</button> <button class="btn ghost small" data-act="p-decline">電話で見送りを受けた</button></p>' : '')
        + '</div>';
    }
    // 4. 振込
    if(s === 'accepted'){
      var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      h += '<div class="step-act"><b>振込する</b>：' + yen(r.final_amount) + (r.bank ? '' : '　<span class="tag new">振込先が未登録です</span>')
        + (r.id_status !== 'verified' ? '　<span class="tag new">本人確認が未完了です</span>' : '')
        + '<div class="inline"><label class="f">振込日<br><input type="date" data-f="paid_day" value="' + today + '"></label><button class="btn primary small" data-act="p-paid">振込完了を記録してお知らせ</button></div></div>';
    }
    if(s === 'paid'){
      h += '<div class="step-act"><b>振込済み</b>（' + dt(r.paid_at) + '）<div class="inline"><button class="btn blue small" data-act="done">完了にする</button></div></div>';
    }
    return h + '</div>';
  }

  function aiView(n, at){
    var items = (n.items || []).map(function(i){
      return '<li><b>' + esc(i.name) + '</b>' + (i.brand ? '（' + esc(i.brand) + '）' : '') + (i.material ? '・' + esc(i.material) : '')
        + (i.condition ? '<br>状態：' + esc(i.condition) : '') + (i.priceHint ? '<br>目安：' + esc(i.priceHint) : '')
        + (i.checkpoints && i.checkpoints.length ? '<br>確認点：' + esc(i.checkpoints.join('／')) : '') + '</li>';
    }).join('');
    return '<div class="ai" style="margin-top:10px"><p><b>鑑定補助の所見</b>（確からしさ ' + esc(n.confidence) + '％・' + dt(at) + '）</p><p>' + esc(n.summary || '') + '</p>'
      + (items ? '<ul>' + items + '</ul>' : '') + (n.risks && n.risks.length ? '<p style="margin-top:6px">注意：' + esc(n.risks.join('／')) + '</p>' : '')
      + '<p class="hint" style="margin-top:6px">参考情報です。お客様には送られません。金額は必ず担当者が判断してください。</p></div>';
  }

  // ── 操作 ──
  $('detail').addEventListener('click', async function(ev){
    var b = ev.target.closest('[data-act]'); if(!b) return;
    var img = ev.target.closest('.pics img'); if(img){ return; }
    var r = ROWS.filter(function(x){ return x.id === CUR; })[0]; if(!r) return;
    var d = $('detail'), g = function(f){ var el = d.querySelector('[data-f=' + f + ']'); return el ? el.value : ''; };
    var who = actor(), act = b.dataset.act;
    b.disabled = true;
    // 明細の行の追加・削除・合計の反映・画像から調べる（保存以外は画面の中だけで行う）
    if(act === 'limg-del'){
      var di = Number(b.dataset.i);
      if(d.querySelector('#linesBox [data-l=img][value^="画像"]') && !confirm('画像の番号がずれます。明細の「画像」欄と合わなくなるので、外す場合は「画像から商品を調べる」をやり直してください。外しますか？')){ b.disabled = false; return; }
      LIMGS.splice(di, 1); LNAMES.splice(di, 1); drawThumbs(false); b.disabled = false; return;
    }
    if(act === 'limg-view'){
      var src = b.dataset.src, m2 = /^画像(\d)$/.exec(src), u2 = m2 && LIMGS[m2[1] - 1];
      b.disabled = false;
      if(!u2){ say(src + ' は、この画面ではまだ選ばれていません（お客様の写真は上の「写真」欄で確認してください）'); return; }
      var ov = document.createElement('div'); ov.className = 'lview'; ov.innerHTML = '<figure><img src="' + u2 + '" alt="' + esc(src) + '"><figcaption>' + esc(src) + '　' + esc(LNAMES[m2[1] - 1] || '') + '（押すと閉じます）</figcaption></figure>';
      ov.addEventListener('click', function(){ ov.remove(); }); document.body.appendChild(ov); return;
    }
    if(act === 'line-add' || act === 'line-del' || act === 'lines-apply' || act === 'itemize' || act === 'itemize-cust'){
      var tb = d.querySelector('#linesBox tbody'), lb2 = b.textContent;
      try{
        if(act === 'line-add'){ tb.insertAdjacentHTML('beforeend', lineRow({}, tb.children.length)); }
        if(act === 'line-del'){ var tr = b.closest('tr'); if(tb.children.length > 1) tr.remove(); else tr.querySelectorAll('input[type=text],input[type=number]').forEach(function(x){ x.value = x.dataset.l === 'qty' ? 1 : x.dataset.l === 'no' ? 1 : ''; }); }
        if(act === 'lines-apply'){
          var R0 = readLines(), fa = d.querySelector('[data-f=final_amount]');
          if(!fa) throw new Error('この段階では買取価格の欄がありません（本査定・金額提示の欄が出てから使ってください）');
          fa.value = R0.total; fa.dispatchEvent(new Event('input', { bubbles: true }));
          var bf0 = d.querySelector('[data-f=base_amount]'); if(bf0 && R0.base != null){ bf0.value = R0.base; delete bf0.dataset.auto; }
          var ro = d.querySelector('[data-revout]'); if(ro && R0.base != null) ro.textContent = '明細から：基準値（通常の査定額）' + yen(R0.base) + '／上乗せ分 ' + yen(R0.total - R0.base) + '（30%対象外のお品物は上乗せなし）';
          fa.focus(); say('合計 ' + yen(R0.total) + ' を買取価格の欄に入れました（まだ送っていません）', 'ok');
        }
        if(act === 'itemize' || act === 'itemize-cust'){
          if(act === 'itemize' && !LIMGS.length) throw new Error('先に「画像を選ぶ・撮る」で画像を入れてください');
          b.textContent = '画像を調べています…（30秒ほど）';
          var res = await call('staffItemize', { id: r.id, images: act === 'itemize' ? LIMGS : [], actor: who });
          var empty = [].filter.call(tb.children, function(tr){ return !tr.querySelector('[data-l=name]').value.trim(); });
          empty.forEach(function(tr){ tr.remove(); });
          res.items.forEach(function(x){
            var nm = [x.brand, x.name, x.model].filter(Boolean).join(' ') + (x.note ? '（' + String(x.note).slice(0, 40) + '）' : '');
            var noUp = /金・貴金属|貴金属|金券|商品券|ギフト|インゴット|地金/.test((x.category || '') + ' ' + (x.name || ''));
            tb.insertAdjacentHTML('beforeend', lineRow({ name: nm, qty: x.qty, up: !noUp, img: x.photo ? (act === 'itemize' ? '画像' : 'お客様写真') + x.photo : '' }, tb.children.length));
          });
          if(!tb.children.length) tb.insertAdjacentHTML('beforeend', lineRow({}, 0));
          say(res.items.length ? res.items.length + '件のお品物を明細に入れました。確認・修正して、金額を入れてから「明細を保存」を押してください' : '画像からお品物を見分けられませんでした。手で入力してください', res.items.length ? 'ok' : 'bad');
        }
        syncLines();
      }catch(e){ say(e.message); }
      b.textContent = lb2; b.disabled = false; return;
    }
    // AIで下書き：本文欄に入れるだけ（送信はしない）。担当者が確認・修正・承認してから送る
    if(act === 'ai-draft'){
      var tgt = d.querySelector('[data-f=' + b.dataset.target + ']'), lb = b.textContent;
      var extra = ['final_amount', 'estimate_low', 'estimate_high', 'base_amount'].map(function(k){ var v = g(k); return v ? ({ final_amount: '金額', estimate_low: '概算下限', estimate_high: '概算上限', base_amount: '通常の査定額' })[k] + '：' + Number(v).toLocaleString('ja-JP') + '円' : ''; }).filter(Boolean).join('／');
      try{
        var redo = b.dataset.redo === '1', prev = redo && tgt ? (tgt.value || tgt.dataset.ai || '') : '';
        b.textContent = redo ? 'AIが考え直しています…' : 'AIが下書きを作り、見直しています…';
        var dr = await call('staffDraft', { id: r.id, purpose: b.dataset.purpose, hint: g('aihint'), extra: extra, prev: prev, actor: who });
        if(tgt){ tgt.value = dr.text; tgt.dataset.ai = dr.text; tgt.focus(); }
        var ok = d.querySelector('[data-aiok=' + b.dataset.target + ']'); if(ok){ ok.hidden = false;
          if(!ok.querySelector('[data-redo]')) ok.insertAdjacentHTML('beforeend', '<button class="btn ghost small" data-act="ai-draft" data-redo="1" data-target="' + b.dataset.target + '" data-purpose="' + b.dataset.purpose + '">いまいちなので考え直す</button>'); }
        var cb = d.querySelector('[data-f=aiok_' + b.dataset.target + ']'); if(cb) cb.checked = false;
        say(redo ? '考え直した文面を入れました。確認・修正してから送ってください' : 'AIの下書きを入れました（AIが自分で見直し済み）。確認・修正してから送ってください', 'ok');
      }catch(e){ say(e.message); }
      b.textContent = lb; b.disabled = false; return;
    }
    try{
      if(act === 'lines-save'){
        var R1 = readLines();
        await call('staffUpdate', { id: r.id, patch: { lines: R1.lines, price_mode: R1.pm, matome_amount: R1.matome } });
        await log(r.id, '明細を保存', { items: R1.lines.length, total: R1.total, mode: R1.pm }); say('明細を保存しました（合計 ' + yen(R1.total) + '）', 'ok');
      }
      if(act === 'save-state'){
        await call('staffUpdate', { id: r.id, patch: { assignee: g('assignee') || null, status: g('status') } });
        await log(r.id, '担当・状態を変更', { assignee: g('assignee'), status: g('status') }); say('保存しました', 'ok');
      }
      if(act === 'save-memo'){ await call('staffUpdate', { id: r.id, patch: { staff_memo: g('staff_memo') } }); say('メモを保存しました', 'ok'); }
      if(act === 'schedule'){
        var w = g('when'); if(!w) throw new Error('日時を入れてください');
        var iso = new Date(w + ':00+09:00').toISOString();
        await call('staffUpdate', { id: r.id, patch: { scheduled_at: iso, status: 'scheduled', assignee: r.assignee || who } });
        var txt = (r.kind === 'visit' ? 'ご訪問' : 'ご来店') + 'の日時を、次のとおり承りました。\n\n' + fmtJp(iso) + '\n\n'
          + (r.kind === 'visit' ? '当日は担当者が伺います。ご本人確認のため、顔写真付きの身分証をご用意ください。' : '当日は、お品物と顔写真付きの身分証をお持ちください。')
          + '\nご都合が悪くなった場合は、お電話か「お申込み状況」の連絡欄でお知らせください。';
        await call('staffNotify', { id: r.id, kind: 'schedule', body: txt, actor: who }); say('日時を確定し、お客様に知らせました', 'ok');
      }
      if(act === 'kit'){
        var tr = g('kit_tracking').trim();
        await call('staffUpdate', { id: r.id, patch: { kit_tracking: tr || null, status: 'kit_sent', assignee: r.assignee || who } });
        await call('staffNotify', { id: r.id, kind: 'kit', actor: who, body: '宅配キットを発送しました。' + (tr ? '\n追跡番号：' + tr : '') + '\n\nキットが届いたら、同封の案内に沿ってお品物を詰めてお送りください。\nまだの方は「お申込み状況」のページから、身分証の画像をお送りください。' });
        say('キット発送をお客様に知らせました', 'ok');
      }
      if(act === 'arrived'){ await call('staffUpdate', { id: r.id, patch: { status: 'arrived' } }); await call('staffNotify', { id: r.id, kind: 'message', actor: who, body: 'お品物が届きました。これから査定いたします。結果はメールでお知らせします。' }); say('到着を記録しました', 'ok'); }
      if(act === 'id-ok'){ await call('staffUpdate', { id: r.id, patch: { id_status: 'verified' } }); await log(r.id, '身分証を確認済みにした'); say('確認済みにしました', 'ok'); }
      if(act === 'estimate'){
        var patch = { estimate_note: g('estimate_note').trim() || null, status: 'appraised', estimate_at: new Date().toISOString(), answer: null, answer_at: null, assignee: r.assignee || who };
        if(r.kind === 'photo'){
          var lo = Number(g('estimate_low')), hi = Number(g('estimate_high') || g('estimate_low'));
          if(!lo || lo < 0) throw new Error('下限の金額を入れてください'); if(hi < lo) throw new Error('上限は下限以上にしてください');
          patch.estimate_low = lo; patch.estimate_high = hi;
        } else {
          var fa = Number(g('final_amount')); if(!fa || fa < 0) throw new Error('金額を入れてください'); patch.final_amount = fa;
        }
        if(!confirm('この金額をお客様にお知らせします。よろしいですか？')) throw null;
        await call('staffUpdate', { id: r.id, patch: patch });
        await call('staffNotify', { id: r.id, kind: 'estimate', actor: who, body: (r.kind === 'photo' ? 'おおよその買取金額：' + yen(patch.estimate_low) + (patch.estimate_high !== patch.estimate_low ? ' 〜 ' + yen(patch.estimate_high) : '') : '査定金額：' + yen(patch.final_amount)) + (patch.estimate_note ? '\n\n' + patch.estimate_note : '') });
        say('金額をお客様に知らせました', 'ok');
      }
      if(act === 'save-bank'){ if(!g('bank').trim() && r.bank && !confirm('登録済みの振込先を空にします。よろしいですか？')) throw null; await call('staffUpdate', { id: r.id, patch: { bank: g('bank').trim() || null } }); await log(r.id, '振込先を保存'); say('振込先を保存しました', 'ok'); }
      if(act === 'pre-estimate'){
        var lo2 = Number(g('estimate_low')), hi2 = Number(g('estimate_high') || g('estimate_low'));
        if(!lo2 || lo2 < 0) throw new Error('下限の金額を入れてください'); if(hi2 < lo2) throw new Error('上限は下限以上にしてください');
        if(!confirm('仮査定をお客様にお知らせします。よろしいですか？')) throw null;
        await call('staffUpdate', { id: r.id, patch: { estimate_low: lo2, estimate_high: hi2, estimate_note: g('estimate_note').trim() || null, estimate_at: new Date().toISOString(), status: 'pre_appraised', assignee: r.assignee || who } });
        await call('staffNotify', { id: r.id, kind: 'pre_estimate', actor: who, body: '仮査定（目安）：' + yen(lo2) + (hi2 !== lo2 ? ' 〜 ' + yen(hi2) : '') + (g('estimate_note').trim() ? '\n\n' + g('estimate_note').trim() : '') + '\n\n写真からの目安です。お品物の到着後に本査定を行い、正式な金額をお知らせします。' });
        say('仮査定をお客様に知らせました', 'ok');
      }
      if(act === 'p-kit'){
        var tr2 = g('kit_tracking').trim();
        await call('staffUpdate', { id: r.id, patch: { kit_tracking: tr2 || null, status: 'waiting', assignee: r.assignee || who } });
        await call('staffNotify', { id: r.id, kind: 'ship', actor: who, body: '宅配キット（' + r.kit_boxes + '箱）を発送しました。' + (tr2 ? '\n追跡番号：' + tr2 : '') + '\nキットが届いたら、お品物を詰めてお送りください。' });
        say('キット発送をお客様に知らせました', 'ok');
      }
      if(act === 'ship-guide'){ await call('staffUpdate', { id: r.id, patch: { status: 'waiting', assignee: r.assignee || who } }); await call('staffNotify', { id: r.id, kind: 'ship', actor: who, body: 'お品物の送り方をご案内します。' }); say('送り方の案内を送りました', 'ok'); }
      if(act === 'p-arrived'){
        await call('staffUpdate', { id: r.id, patch: { status: 'arrived', arrived_at: new Date().toISOString(), assignee: r.assignee || who } });
        await call('staffNotify', { id: r.id, kind: 'arrived', actor: who, body: 'お品物が当店に到着しました。これから査定いたします。結果はメールでお知らせします。' + (r.id_status === 'none' ? '\n\nまだの方は「お申込み状況」のページから、身分証の画像をお送りください。' : '') });
        say('到着を記録しました', 'ok');
      }
      if(act === 'p-estimate'){
        if(r.plan === 'matome' && g('final_amount') === '') throw new Error('おまとめ価格を入れてください');
        var fa2 = Number(g('final_amount')), base = r.plan === 'kodaka' ? Number(g('base_amount')) : null;
        if(r.plan === 'kodaka' && (!base || base < 0)) throw new Error('通常の査定額を入れてください');
        if(r.plan === 'kodaka' && g('final_amount') === '') throw new Error('買取価格を入れてください');
        if(fa2 < 0) throw new Error('金額が正しくありません');
        if(!confirm((r.plan === 'matome' ? 'おまとめ価格 ' : '買取価格 ') + yen(fa2) + ' をお客様にお知らせします。よろしいですか？')) throw null;
        var note2 = g('estimate_note').trim();
        await call('staffUpdate', { id: r.id, patch: { base_amount: base, final_amount: fa2, estimate_note: note2 || null, status: 'appraised', estimate_at: new Date().toISOString(), answer: null, answer_at: null, assignee: r.assignee || who } });
        await call('staffNotify', { id: r.id, kind: 'estimate', actor: who, body: (r.plan === 'matome' ? 'おまとめ価格：' + yen(fa2) : '買取価格：' + yen(fa2) + '\n（通常の査定額 ' + yen(base) + '。貴金属・商品券は30%上乗せの対象外です）') + (note2 ? '\n\n' + note2 : '') + '\n\nご同意いただけましたら、ご登録の口座へお振込みいたします。' });
        say('金額をお客様に知らせました', 'ok');
      }
      if(act === 'p-accept' || act === 'p-decline'){
        var yes = act === 'p-accept';
        if(!confirm(yes ? 'お電話で同意を受けたことを記録します' : 'お電話で見送りを受けたことを記録します')) throw null;
        await call('staffUpdate', { id: r.id, patch: { answer: yes ? 'accept' : 'decline', answer_at: new Date().toISOString(), status: yes ? 'accepted' : 'declined' } });
        await log(r.id, yes ? '電話で同意を受けた' : '電話で見送りを受けた'); say('記録しました', 'ok');
      }
      if(act === 'p-paid'){
        var pd = g('paid_day'); if(!pd) throw new Error('振込日を入れてください');
        if(!r.bank && !confirm('振込先が未登録です。それでも振込完了にしますか？')) throw null;
        if(!confirm(yen(r.final_amount) + ' の振込完了を記録し、お客様にお知らせします。よろしいですか？')) throw null;
        var iso2 = new Date(pd + 'T12:00:00+09:00').toISOString();
        await call('staffUpdate', { id: r.id, patch: { status: 'paid', paid_at: iso2 } });
        await call('staffNotify', { id: r.id, kind: 'paid', actor: who, body: fmtJp(iso2).replace(/\s.*$/, '') + 'に、' + yen(r.final_amount) + 'をご登録の口座へお振込みいたしました。\nご確認をお願いいたします。このたびはご利用いただき、ありがとうございました。' });
        say('振込完了を記録しました', 'ok');
      }
      if(act === 'reply'){
        var body = g('reply').trim(); if(!body) throw new Error('本文を入れてください');
        var ta = d.querySelector('[data-f=reply]'), aiTxt = ta && ta.dataset.ai;
        if(aiTxt){
          var cb2 = d.querySelector('[data-f=aiok_reply]'); if(!cb2 || !cb2.checked) throw new Error('AIの下書きを使うときは、内容を確認して「内容を確認しました」にチェックしてください');
          await log(r.id, 'AIの下書きを確認・承認して送信', { edited: aiTxt.trim() !== body });
        }
        await call('staffNotify', { id: r.id, kind: 'message', body: body, actor: who });
        if(r.status === 'new') await call('staffUpdate', { id: r.id, patch: { status: 'contacted', assignee: r.assignee || who } });
        say('お客様に送りました', 'ok');
      }
      if(act === 'done'){ if(!confirm('この案件を完了にします')) throw null; await call('staffUpdate', { id: r.id, patch: { status: 'done' } }); await log(r.id, '完了にした'); say('完了にしました', 'ok'); }
      if(act === 'ai'){
        b.textContent = '写真を確認しています…（30秒ほど）';
        await call('staffAppraise', { id: r.id }); say('写真鑑定の補助が終わりました', 'ok');
      }
      await refresh(); open(r.id);
    }catch(e){ if(e) say(e.message); b.disabled = false; }
  });
  // 買取価格 → 基準値（通常の査定額）の逆算（30%上乗せ：買取価格 ÷ 1.3）
  $('detail').addEventListener('input', function(ev){
    var t = ev.target;
    if(t.closest('#linesBox')){ syncLines(); return; }
    if(t.dataset.f === 'base_amount'){ delete t.dataset.auto; return; }   // 手で直したら自動上書きしない
    if(t.dataset.f !== 'final_amount') return;
    var v = Number(t.value), base = v > 0 ? Math.round(v / 1.3) : 0;
    var bf = $('detail').querySelector('[data-f=base_amount]');
    if(bf && (bf.value === '' || bf.dataset.auto)){ bf.value = base || ''; bf.dataset.auto = '1'; }
    var out = $('detail').querySelector('[data-revout]');
    if(out && base) out.textContent = '基準値（通常の査定額）の目安：' + base.toLocaleString('ja-JP') + '円（' + v.toLocaleString('ja-JP') + '円 ÷ 1.3）／上乗せ分：' + (v - base).toLocaleString('ja-JP') + '円';
  });
  async function log(id, action, detail){ try{ await call('staffLog', { id: id, actor: actor(), action: action, detail: detail || null }); }catch(e){} }
  function fmtJp(iso){ var d = new Date(iso); return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' }) + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }); }

  // 写真の拡大
  $('detail').addEventListener('click', function(ev){ var i = ev.target.closest('.pics img'); if(!i) return; var lb = $('lb'); lb.querySelector('img').src = i.src; lb.hidden = false; });
  $('lb').addEventListener('click', function(){ this.hidden = true; });

  // 表の書き出し（いま表示している一覧）
  $('csv').onclick = function(){
    var cols = [['受付番号', 'receipt_no'], ['方法', function(r){ return KIND[r.kind]; }], ['状態', function(r){ return ST[r.status]; }], ['受付日時', function(r){ return dt(r.created_at); }], ['お名前', 'name'], ['ふりがな', 'kana'], ['電話', 'phone'], ['メール', 'email'], ['住所', function(r){ return (r.postal || '') + ' ' + (r.address || ''); }], ['品目', function(r){ return (r.items || []).join('、'); }], ['内容', 'item_note'], ['担当', 'assignee'], ['日時', function(r){ return dt(r.scheduled_at); }], ['概算下限', 'estimate_low'], ['概算上限', 'estimate_high'], ['金額', 'final_amount'], ['きっかけ', 'how_found'], ['紹介元', 'ref'], ['連絡方法', function(r){ return ({ phone: '電話', email: 'メール', either: 'どちらでも', line: 'LINE' })[r.contact_pref] || ''; }], ['LINE ID', 'line_id'], ['プラン', function(r){ return r.plan ? PLAN_LONG[r.plan] : ''; }], ['仮査定', function(r){ return r.pre_est ? 'あり' : ''; }], ['通常査定額', 'base_amount'], ['発送日', function(r){ return dt(r.shipped_at); }], ['到着日', function(r){ return dt(r.arrived_at); }], ['振込日', function(r){ return dt(r.paid_at); }]];
    var lines = [cols.map(function(c){ return c[0]; })].concat(filtered().map(function(r){ return cols.map(function(c){ return typeof c[1] === 'function' ? c[1](r) : r[c[1]]; }); }));
    var csv = '﻿' + lines.map(function(l){ return l.map(function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '申込一覧_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };

  (async function(){ if(API.configured && SESS){ try{ await enter(); }catch(e){ SS.set(null); SESS = null; } } if(!API.configured) $('loginMsg').innerHTML = '<p class="msg warn">受付システムが未接続です（config.js を設定してください）</p>'; })();
})();
