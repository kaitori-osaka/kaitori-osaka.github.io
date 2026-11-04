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
  // お知らせ：成功は4秒、エラーは20秒で消える。×でもすぐ消せる
  var SAYT = null;
  function say(t, cls){
    clearTimeout(SAYT);
    $('appMsg').innerHTML = t ? '<p class="msg ' + (cls || 'bad') + '">' + esc(t) + '<button type="button" class="msg-x" aria-label="閉じる">×</button></p>' : '';
    if(t) SAYT = setTimeout(function(){ $('appMsg').innerHTML = ''; }, cls === 'ok' ? 4000 : 20000);
  }
  $('appMsg').addEventListener('click', function(ev){ if(ev.target.closest('.msg-x')){ clearTimeout(SAYT); $('appMsg').innerHTML = ''; } });
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
      var rb = $('reload'); if(!quiet && rb) rb.disabled = true;
      var j = await call('staffList'); ROWS = j.rows; ROSTER = j.roster;
      drawList();
      if($('reloadAt')) $('reloadAt').textContent = new Date().toTimeString().slice(0, 5) + ' 時点';
      if(rb) rb.disabled = false;
      // 開いているお申込みが、お客様側の操作（振込先の登録など）で変わっていたら表示し直す（入力中は待つ）
      if(CUR){
        var c = ROWS.filter(function(r){ return r.id === CUR; })[0], ae = document.activeElement;
        var typing = ae && $('detail').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName);
        if(c && (c.unread_staff > 0 || c.updated_at !== SHOWN) && !(quiet && typing)) open(CUR);
      }
    }catch(e){ say(e.message); if($('reload')) $('reload').disabled = false; }
  }
  function filtered(){
    var k = $('fKind').value, q = $('fq').value.trim().replace(/-/g, '');
    return ROWS.filter(function(r){
      if(TAB === 'todo' && !needsAction(r)) return false;
      if(TAB === 'open' && CLOSED.indexOf(r.status) >= 0) return false;
      if(k === 'planA' && r.plan !== 'matome') return false;
      if(k === 'planB' && r.plan !== 'kodaka') return false;
      if(k && k.indexOf('plan') !== 0 && r.kind !== k) return false;
      if(q && (r.name + r.phone + r.receipt_no.replace(/-/g, '') + (r.kana || '') + (r.email || '') + (Array.isArray(r.lines) ? r.lines.map(function(x){ return x.name; }).join('') : '')).indexOf(q) < 0) return false;
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
        + (Array.isArray(r.lines) && r.lines.length ? '<span class="tag go">明細 ' + r.lines.length + '件</span>' : '')
        + (r.photo_count ? '<span class="tag">写真 ' + r.photo_count + '</span>' : '')
        + (r.id_status === 'submitted' ? '<span class="tag go">身分証確認待ち</span>' : '')
        + (r.assignee ? '<span>担当 ' + esc(r.assignee) + '</span>' : '') + '</span></button>';
    }).join('') : '<p class="empty">' + (TAB === 'todo' ? '対応が必要な案件はありません。' : '該当する案件はありません。') + '</p>';
  }
  document.querySelector('.tabs').addEventListener('click', function(ev){ var b = ev.target.closest('button'); if(!b) return; TAB = b.dataset.tab; drawList(); });
  $('fKind').onchange = drawList; $('fq').oninput = drawList;
  $('reload').onclick = async function(){ await refresh(); if(VIEW !== 'cases'){ try{ await loadBooks(); drawBook(); }catch(e){ say(e.message); } } };
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
    loadShots(r);
  }
  // 店舗で撮った明細の写真（保存済み）を読み込み、明細・買取したお品物の表に写真を出す
  async function loadShots(r){
    var id = r.id, files = [];
    try{ files = await call('staffFiles', { id: id, which: 'shots' }); }catch(e){ return; }
    if(CUR !== id || !files.length) return;
    files.slice(-LMAX).forEach(function(f){ if(LFILES.indexOf(f.name) < 0){ LIMGS.push(f.data); LNAMES.push('保存済み ' + f.name.replace(/\.[a-z]+$/, '')); LFILES.push(f.name); } });
    drawThumbs(false); relabel();
    var map = {}; files.forEach(function(f){ map[f.name] = f.data; });
    [].forEach.call($('detail').querySelectorAll('[data-shot]'), function(el){ var u = map[el.dataset.shot]; if(u) el.innerHTML = '<img src="' + u + '" alt="">'; });
  }
  // 明細の「画像」欄を、保存済みの写真の並びに合わせて付け直す
  function relabel(){
    [].forEach.call($('detail').querySelectorAll('#linesBox tbody tr'), function(tr){
      var fl = tr.querySelector('[data-l=file]').value, ip = tr.querySelector('[data-l=img]'); if(!fl) return;
      var i = LFILES.indexOf(fl), cell = ip.parentNode;
      ip.value = i >= 0 ? '画像' + (i + 1) : '';
      var btn = cell.querySelector('.limg-ref'), hint = cell.querySelector('.hint');
      if(i < 0){ if(btn) btn.remove(); if(!hint) cell.insertAdjacentHTML('beforeend', '<span class="hint">―</span>'); return; }
      if(hint) hint.remove();
      var html = '<img src="' + LIMGS[i] + '" alt=""><span>画像' + (i + 1) + '</span>';
      if(btn){ btn.dataset.src = '画像' + (i + 1); btn.innerHTML = html; }
      else cell.insertAdjacentHTML('beforeend', '<button type="button" class="limg-ref" data-act="limg-view" data-src="画像' + (i + 1) + '" title="この画像を大きく見る">' + html + '</button>');
    });
  }
  // ── 写真の保存・LINEで送る（鑑定部へ）。スマホやパソコンの「共有」からLINEを選ぶ。共有できない端末では保存する ──
  var PICS = {};
  function toFile(d, name){ var m = /^data:([^;]+);base64,(.*)$/.exec(d), bin = atob(m[2]), a = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new File([a], name, { type: m[1] }); }
  function picName(r, f, i){ var ext = (/^data:image\/(\w+)/.exec(f.data) || [])[1] || 'jpg'; return r.receipt_no + '_' + String(f.name || ('写真' + (i + 1))).replace(/\.[a-z]+$/, '') + '.' + ext.replace('jpeg', 'jpg'); }
  function dlPics(r, list){ list.forEach(function(f, i){ setTimeout(function(){ var nm = picName(r, f, i), u = URL.createObjectURL(toFile(f.data, nm)), a = document.createElement('a'); a.href = u; a.download = nm; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 5000); }, i * 300); }); }
  async function linePics(r, list){
    var text = '【鑑定依頼】' + r.receipt_no + '　' + r.name + ' 様\n' + KIND[r.kind] + (r.items && r.items.length ? '／' + r.items.join('、') : '') + (r.item_note ? '\n' + String(r.item_note).slice(0, 300) : '') + '\n写真 ' + list.length + '枚';
    try{ await navigator.clipboard.writeText(text); }catch(e){}
    var files = list.map(function(f, i){ return toFile(f.data, picName(r, f, i)); });
    if(navigator.canShare && navigator.canShare({ files: files })){
      try{ await navigator.share({ files: files, text: text, title: '鑑定依頼 ' + r.receipt_no }); say('共有の画面でLINEを選び、鑑定部に送ってください（説明文はコピー済みです。LINEで貼り付けできます）', 'ok'); }
      catch(e){ if(e && e.name !== 'AbortError') say('送れませんでした：' + e.message); }
    } else {
      dlPics(r, list);
      say('この端末ではLINEへ直接送れないため、写真を保存しました。LINEで鑑定部に送ってください（説明文はコピー済みです）', 'ok');
    }
  }
  $('detail').addEventListener('click', function(ev){
    var b = ev.target.closest('[data-pa]'); if(!b) return;
    ev.stopPropagation();
    var r = ROWS.filter(function(x){ return x.id === CUR; })[0]; if(!r) return;
    var src = b.dataset.b === 'shots' ? LIMGS.map(function(u, i){ return { name: LNAMES[i] || ('画像' + (i + 1)), data: u }; }) : (PICS[b.dataset.b] || []);
    var one = b.dataset.i != null ? [src[Number(b.dataset.i)]] : src;
    if(!one.length || !one[0]) return;
    if(/^dl/.test(b.dataset.pa)) dlPics(r, one); else linePics(r, one);
  }, true);
  async function loadPics(bucket, folder, box){
    if(!box) return;
    try{
      box.innerHTML = '<span class="hint">写真を読み込んでいます…</span>';
      var files = await call('staffFiles', { id: folder, which: bucket });
      if(!files.length){ box.innerHTML = '<span class="hint">ありません</span>'; return; }
      PICS[bucket] = files;
      var line = bucket !== 'idcopy';   // 身分証はLINEには送らない（保存だけ）
      box.innerHTML = '<div class="pic-bar"><button type="button" class="btn ghost small" data-pa="dl-all" data-b="' + bucket + '">全部保存（' + files.length + '枚）</button>'
        + (line ? '<button type="button" class="btn line small" data-pa="line-all" data-b="' + bucket + '">全部をLINEで送る</button>' : '') + '</div>'
        + files.map(function(f, i){ return '<figure class="pic"><img src="' + f.data + '" alt="写真 ' + (i + 1) + '"><figcaption>' + esc(f.name.replace(/\.[a-z]+$/, '')) + '</figcaption><div class="pic-act"><button type="button" data-pa="dl" data-b="' + bucket + '" data-i="' + i + '">保存</button>' + (line ? '<button type="button" class="ln" data-pa="line" data-b="' + bucket + '" data-i="' + i + '">LINE</button>' : '') + '</div></figure>'; }).join('');
    }catch(e){ box.innerHTML = '<span class="hint">写真を読み込めませんでした：' + esc(e.message) + '</span>'; }
  }

  // ── お品物の明細（商品番号・商品名・点数・買取価格／おまとめ／ハイブリッド）──
  var LIMGS = [], LNAMES = [], LFILES = [], LMAX = 10;   // LFILES：保存済みの写真（ドライブの「店舗撮影」）のファイル名
  function lineRow(x, i){
    x = x || {};
    var im = String(x.img || ''), fl = String(x.file || '');
    if(fl && LFILES.indexOf(fl) >= 0) im = '画像' + (LFILES.indexOf(fl) + 1);
    var k = /^画像(\d+)$/.exec(im), th = k && LIMGS[k[1] - 1] ? '<img src="' + LIMGS[k[1] - 1] + '" alt="">' : '';
    return '<tr><td><input type="text" data-l="no" maxlength="20" value="' + esc(x.no || String(i + 1)) + '"></td>'
      + '<td class="col-img"><input type="hidden" data-l="img" value="' + esc(im) + '"><input type="hidden" data-l="file" value="' + esc(fl) + '">' + (im ? '<button type="button" class="limg-ref" data-act="limg-view" data-src="' + esc(im) + '" title="この画像を大きく見る">' + th + '<span>' + esc(im) + '</span></button>' : '<span class="hint">―</span>') + '</td>'
      + '<td><input type="text" data-l="name" maxlength="120" value="' + esc(x.name || '') + '" placeholder="例：ROLEX デイトジャスト 126234"></td>'
      + '<td><input type="number" data-l="qty" min="1" max="999" value="' + esc(x.qty || 1) + '"></td>'
      + '<td class="col-matome"><input type="checkbox" data-l="matome"' + (x.matome ? ' checked' : '') + ' aria-label="おまとめに含める"></td>'
      + '<td class="col-up"><input type="checkbox" data-l="up"' + (x.up === false ? '' : ' checked') + ' aria-label="30%上乗せの対象"></td>'
      + '<td class="col-price"><input type="number" data-l="price" min="0" step="1" value="' + (x.price == null ? '' : esc(x.price)) + '"></td>'
      + '<td><button type="button" class="btn ghost small" data-act="line-del" aria-label="この行を消す">×</button></td></tr>';
  }
  // 買取したお品物（保存済みの明細を、いつでも見られるように上に表示）
  function boughtBox(r){
    var L = Array.isArray(r.lines) ? r.lines : []; if(!L.length) return '';
    var pm = r.price_mode || 'item', sum = 0, n = 0;
    var rows = L.map(function(x){
      n += Number(x.qty) || 1; if(!x.matome && x.price != null) sum += Number(x.price);
      return '<tr><td>' + esc(x.no || '') + '</td><td class="bt-img">' + (x.file ? '<span class="bt-ph" data-shot="' + esc(x.file) + '"></span>' : '') + '</td><td>' + esc(x.name) + (x.up === false ? ' <span class="tag">30%対象外</span>' : '') + '</td><td>' + (x.qty || 1) + '</td><td class="num">' + (x.matome ? 'おまとめ' : x.price == null ? '―' : yen(x.price)) + '</td></tr>';
    }).join('');
    var total = sum + (r.matome_amount ? Number(r.matome_amount) : 0);
    return '<div class="box bought"><h3>買取したお品物（' + L.length + '件・' + n + '点）</h3><div class="table-wrap"><table class="lines-view"><thead><tr><th>番号</th><th>写真</th><th>お品物</th><th>点数</th><th>買取価格</th></tr></thead><tbody>' + rows
      + (r.matome_amount ? '<tr><td></td><td></td><td>おまとめ価格</td><td></td><td class="num">' + yen(r.matome_amount) + '</td></tr>' : '')
      + '<tr class="sum"><td></td><td></td><td>合計</td><td>' + n + '</td><td class="num">' + yen(total) + '</td></tr></tbody></table></div>'
      + (r.final_amount != null && Number(r.final_amount) !== total ? '<p class="hint">お客様に知らせた買取価格：' + yen(r.final_amount) + '（明細の合計と違います）</p>' : '')
      + '<p class="hint">写真や内容を直すときは、下の「お品物の明細」で直して「明細を保存」を押してください。</p></div>';
  }
  function linesBox(r){
    var L = Array.isArray(r.lines) ? r.lines : [], pm = r.price_mode || (r.plan === 'matome' ? 'matome' : 'item');
    LIMGS = []; LNAMES = []; LFILES = [];
    var up = r.plan === 'kodaka' || (!!r.ref && (r.kind === 'shop' || r.kind === 'visit'));
    return '<div class="box lines-box pm-' + pm + (up ? ' has-up' : '') + '" id="linesBox" data-up="' + (up ? 1 : 0) + '"><h3>' + (r.kind === 'takuhai' ? '到着後の査定：画像を取り込んで、買取見込みのお品物の一覧を作る' : '査定：画像を取り込んで、買取見込みのお品物の一覧を作る') + '</h3><p class="hint">一覧と合計は、金額のお知らせ（メール・お申込み状況のページ）と買取契約書にそのまま載ります。</p>'
      + '<div class="aibox"><label class="btn ghost small">写真から選ぶ（複数可）<input type="file" accept="image/*" multiple data-lines-files hidden></label>'
      + '<label class="btn ghost small">カメラで撮る<input type="file" accept="image/*" capture="environment" data-lines-files hidden></label>'
      + '<span class="hint" data-lines-count>画像：0枚（10枚まで。何回かに分けて足せます）</span><div class="lthumbs" data-lines-thumbs></div><div class="pic-bar" data-shot-bar hidden><button type="button" class="btn ghost small" data-pa="dl-all" data-b="shots">この画像を全部保存</button><button type="button" class="btn line small" data-pa="line-all" data-b="shots">この画像を全部LINEで送る</button></div>'
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
  // 明細を保存する（まだ保存していない写真はドライブに保存し、各行に写真を結びつける）。金額の通知の前にも自動で呼ぶ
  async function saveLines(r, who, b){
    var d = $('detail');
    if(!$('linesBox')) return null;
    var need = LIMGS.map(function(u, i){ return LFILES[i] ? '' : u; });
    if(need.some(Boolean)){
      if(b) b.textContent = '写真を保存しています…';
      var sv = await call('staffShots', { id: r.id, images: need, actor: who });
      sv.forEach(function(nm, i){ if(nm) LFILES[i] = nm; });
    }
    [].forEach.call(d.querySelectorAll('#linesBox tbody tr'), function(tr){
      var k2 = /^画像(\d+)$/.exec(tr.querySelector('[data-l=img]').value);
      if(k2 && LFILES[k2[1] - 1]) tr.querySelector('[data-l=file]').value = LFILES[k2[1] - 1];
    });
    var R1 = readLines();
    await call('staffUpdate', { id: r.id, patch: { lines: R1.lines, price_mode: R1.pm, matome_amount: R1.matome } });
    await log(r.id, '明細を保存', { items: R1.lines.length, total: R1.total, mode: R1.pm });
    return R1;
  }
  // 金額を知らせる前：明細があれば保存し、金額欄が空なら明細の合計を入れる
  async function linesBeforeEstimate(r, who, b){
    var R = readLines(); if(!R || !R.lines.length) return;
    var fa = $('detail').querySelector('[data-f=final_amount]');
    if(fa && fa.value === '' && R.total > 0){ fa.value = R.total; fa.dispatchEvent(new Event('input', { bubbles: true })); }
    await saveLines(r, who, b);
  }
  function readLines(){
    var box = $('linesBox'); if(!box) return null;
    var pm = (box.querySelector('[name=pmode]:checked') || {}).value || 'item';
    var L = [].map.call(box.querySelectorAll('tbody tr'), function(tr){
      var q = function(k){ return tr.querySelector('[data-l=' + k + ']'); };
      return { no: q('no').value.trim(), img: q('img').value, file: q('file').value, name: q('name').value.trim(), qty: Number(q('qty').value) || 1, matome: pm === 'matome' ? true : pm === 'hybrid' ? q('matome').checked : false, up: box.dataset.up === '1' ? q('up').checked : true, price: q('price').value === '' ? null : Number(q('price').value) };
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
    var tb = $('detail').querySelector('[data-shot-bar]'); if(tb) tb.hidden = !LIMGS.length;
    if(c) c.textContent = '画像：' + LIMGS.length + '枚' + (over ? '（' + LMAX + '枚までです）' : LIMGS.length < LMAX ? '（' + LMAX + '枚まで。何回かに分けて足せます）' : '') + (LFILES.filter(Boolean).length ? '　うち保存済み ' + LFILES.filter(Boolean).length + '枚' : '');
    if(t) t.innerHTML = LIMGS.map(function(u, i){ return '<figure><button type="button" class="lth" data-act="limg-view" data-src="画像' + (i + 1) + '" title="大きく見る"><img src="' + u + '" alt="画像' + (i + 1) + '"><b>画像' + (i + 1) + '</b></button><figcaption>' + esc(LNAMES[i] || '') + '</figcaption><button type="button" class="del" data-act="limg-del" data-i="' + i + '" aria-label="画像' + (i + 1) + 'を外す">×</button></figure>'; }).join('');
  }
  $('detail').addEventListener('change', async function(ev){
    if(ev.target.matches('[data-lines-files]')){
      // 選ぶたびに足していく（1枚ずつ撮っても、まとめて選んでもよい）
      var fs = [].slice.call(ev.target.files || []), over = false;
      for(var i = 0; i < fs.length; i++){ if(LIMGS.length >= LMAX){ over = true; break; } try{ LIMGS.push(await shrink(fs[i])); LFILES.push(''); LNAMES.push(fs[i].name || ('撮影 ' + new Date().toTimeString().slice(0, 8))); }catch(e){} }
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
      + '</dl></div>' + boughtBox(r);

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

    if(!r.plan){
      if(r.kind !== 'takuhai' || ['arrived', 'appraised', 'accepted', 'paid', 'done'].indexOf(r.status) >= 0) h += linesBox(r);
      else h += '<div class="box"><h3>到着後の査定</h3><p class="hint">お品物が届いて「到着を記録」すると、ここで画像を取り込んで査定できます。</p></div>';
      if(r.kind === 'takuhai' && r.answer === 'accept') h += '<div class="box">' + contractInfo(r) + '</div>';
    }

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
  // 電子契約の状態（宅配買取：同意の後に、お客様が契約書を確認・記入・押印・承認）
  function contractInfo(r){
    if(r.contract_at) return '<b>電子契約：締結済み</b>（' + dt(r.contract_at) + (r.contract && r.contract.code ? '・確認番号 ' + esc(r.contract.code) : '') + '）'
      + (r.contract ? '<p class="hint">売主：' + esc(r.contract.signer || '') + '　生年月日 ' + esc(r.contract.birth || '') + '　職業 ' + esc(r.contract.job || '') + '<br>住所：' + esc(r.contract.address || '') + '</p>' : '')
      + '<div class="inline"><button class="btn ghost small" data-act="c-pdf">契約書（PDF）を見る</button></div>';
    return '<b>電子契約：お客様の押印・承認待ち</b>' + (r.bank ? '' : '<span class="tag new">振込先が未登録（先に登録が必要）</span>')
      + '<p class="hint">お客様が「お申込み状況」のページで契約書を確認し、記入・押印・承認すると成立します。成立するとメールでお知らせが届き、契約書（PDF）がドライブの「契約書」フォルダに保存されます。</p>'
      + '<div class="inline"><button class="btn ghost small" data-act="c-remind">契約書の案内をメールで送る</button></div>';
  }
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
      h += linesBox(r);
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
    if(s === 'accepted') h += '<div class="step-act">' + contractInfo(r) + '</div>';
    if(s === 'accepted'){
      var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      h += '<div class="step-act"><b>振込する</b>：' + yen(r.final_amount) + (r.bank ? '' : '　<span class="tag new">振込先が未登録です</span>')
        + (r.id_status !== 'verified' ? '　<span class="tag new">本人確認が未完了です</span>' : '')
        + (r.contract_at ? '' : '　<span class="tag new">電子契約が未締結です</span>')
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
      if([].some.call(d.querySelectorAll('#linesBox tbody tr'), function(tr){ return /^画像/.test(tr.querySelector('[data-l=img]').value) && !tr.querySelector('[data-l=file]').value; }) && !confirm('画像の番号がずれます。明細の「画像」欄と合わなくなるので、外す場合は「画像から商品を調べる」をやり直してください。外しますか？')){ b.disabled = false; return; }
      LIMGS.splice(di, 1); LNAMES.splice(di, 1); LFILES.splice(di, 1); drawThumbs(false); relabel(); b.disabled = false; return;
    }
    if(act === 'limg-view'){
      var src = b.dataset.src, m2 = /^画像(\d+)$/.exec(src), u2 = m2 && LIMGS[m2[1] - 1];
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
          var res = await call('staffItemize', { id: r.id, images: act === 'itemize' ? LIMGS.map(function(u, i){ return LFILES[i] ? '' : u; }) : [], saved: act === 'itemize' ? LFILES : [], actor: who });
          if(act === 'itemize' && Array.isArray(res.shots)) res.shots.forEach(function(nm, i){ if(nm) LFILES[i] = nm; });
          drawThumbs(false);
          var empty = [].filter.call(tb.children, function(tr){ return !tr.querySelector('[data-l=name]').value.trim(); });
          empty.forEach(function(tr){ tr.remove(); });
          res.items.forEach(function(x){
            var nm = [x.brand, x.name, x.model].filter(Boolean).join(' ') + (x.note ? '（' + String(x.note).slice(0, 40) + '）' : '');
            var noUp = /金・貴金属|貴金属|金券|商品券|ギフト|インゴット|地金/.test((x.category || '') + ' ' + (x.name || ''));
            tb.insertAdjacentHTML('beforeend', lineRow({ name: nm, qty: x.qty, up: !noUp, img: x.photo ? (act === 'itemize' ? '画像' : 'お客様写真') + x.photo : '', file: act === 'itemize' && x.photo ? (LFILES[x.photo - 1] || '') : '' }, tb.children.length));
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
        var R1 = await saveLines(r, who, b);
        say('明細を保存しました（合計 ' + yen(R1.total) + '）', 'ok');
      }
      if(act === 'c-remind'){ await call('staffContractRemind', { id: r.id, actor: who }); say('契約書のご案内をメールで送りました', 'ok'); }
      if(act === 'c-pdf'){
        var pf = await call('staffContractPdf', { id: r.id });
        var bin = atob(pf.data.split(',')[1]), arr = new Uint8Array(bin.length); for(var bi = 0; bi < bin.length; bi++) arr[bi] = bin.charCodeAt(bi);
        window.open(URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })), '_blank');
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
        await linesBeforeEstimate(r, who, b);
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
        await linesBeforeEstimate(r, who, b);
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
        if(r.kind === 'takuhai' && !r.contract_at && !confirm('電子契約がまだ成立していません。それでも振込完了にしますか？')) throw null;
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
    var cols = [['受付番号', 'receipt_no'], ['方法', function(r){ return KIND[r.kind]; }], ['状態', function(r){ return ST[r.status]; }], ['受付日時', function(r){ return dt(r.created_at); }], ['お名前', 'name'], ['ふりがな', 'kana'], ['電話', 'phone'], ['メール', 'email'], ['住所', function(r){ return (r.postal || '') + ' ' + (r.address || ''); }], ['品目', function(r){ return (r.items || []).join('、'); }], ['内容', 'item_note'], ['担当', 'assignee'], ['日時', function(r){ return dt(r.scheduled_at); }], ['概算下限', 'estimate_low'], ['概算上限', 'estimate_high'], ['金額', 'final_amount'], ['買取したお品物', function(r){ return (Array.isArray(r.lines) ? r.lines : []).map(function(x){ return (x.no ? x.no + ' ' : '') + x.name + ' ×' + (x.qty || 1) + (x.matome ? '（おまとめ）' : x.price != null ? ' ' + x.price + '円' : ''); }).join(' / ') + (r.matome_amount ? ' / おまとめ価格 ' + r.matome_amount + '円' : ''); }], ['きっかけ', 'how_found'], ['紹介元', 'ref'], ['連絡方法', function(r){ return ({ phone: '電話', email: 'メール', either: 'どちらでも', line: 'LINE' })[r.contact_pref] || ''; }], ['LINE ID', 'line_id'], ['プラン', function(r){ return r.plan ? PLAN_LONG[r.plan] : ''; }], ['仮査定', function(r){ return r.pre_est ? 'あり' : ''; }], ['通常査定額', 'base_amount'], ['発送日', function(r){ return dt(r.shipped_at); }], ['到着日', function(r){ return dt(r.arrived_at); }], ['振込日', function(r){ return dt(r.paid_at); }]];
    var lines = [cols.map(function(c){ return c[0]; })].concat(filtered().map(function(r){ return cols.map(function(c){ return typeof c[1] === 'function' ? c[1](r) : r[c[1]]; }); }));
    var csv = '﻿' + lines.map(function(l){ return l.map(function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '申込一覧_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };

  // ───────────────────────── 台帳（顧客管理・商品管理表・卸先管理帳・売上台帳）─────────────────────────
  var VIEW = 'cases', BK = null, BSEL = {}, BOPEN = null, BF = { pst: 'stock', pq: '', cq: '', month: '' };
  var DEAL = ['accepted', 'paid', 'done'];
  function ckey(r){ var t = String(r.phone || '').replace(/[^0-9]/g, ''); return t ? 'tel:' + t : 'mail:' + String(r.email || r.name || '').toLowerCase(); }
  function ymd(s){ if(!s) return ''; var d = new Date(new Date(s).getTime() + 9 * 3600e3); return d.toISOString().slice(0, 10); }
  function ym(s){ return ymd(s).slice(0, 7); }
  // 買取金額：お知らせした金額。なければ明細の合計（おまとめ価格を含む）
  function dealAmt(r){
    if(r.final_amount != null) return Number(r.final_amount);
    var L = Array.isArray(r.lines) ? r.lines : []; if(!L.length) return null;
    return L.reduce(function(t, x){ return t + (x.matome || x.price == null ? 0 : Number(x.price)); }, 0) + Number(r.matome_amount || 0);
  }
  // 買取（仕入）：受付からの成約と、日報で登録した店頭の成約品
  function allBuys(){
    return ROWS.filter(isDeal).map(function(r){ return { id: r.id, d: dealDate(r), no: r.receipt_no, who: r.name, how: KIND[r.kind], st: ST[r.status], ct: r.kind === 'takuhai' ? (r.contract_at ? '電子契約済' : '<span class="tag new">未</span>') : '店頭・対面', amt: dealAmt(r) }; })
      .concat(rpBuys());
  }
  // 日報で登録した店頭の成約品は、お客様（受付番号）ごとに1行にまとめる
  function rpBuys(){
    var G = {}, K = [];
    ((BK && BK.products) || []).forEach(function(p){
      var m = /^日報:(\d{4}-\d{2}-\d{2}):([^:]+):/.exec(p.source || ''); if(!m) return;
      var no = prodNo(p), k = no ? no.slice(0, 8) : m[1] + ':' + m[2];
      if(!G[k]){ G[k] = { d: m[1], no: no ? no.slice(0, 8) : '', who: String(p.seller || '').replace(/^店頭（日報\s*(.*)）$/, '$1'), items: [], how: '店頭', st: '成約', ct: '', amt: 0 }; K.push(k); }
      G[k].items.push(p.name); G[k].amt += Number(p.cost || 0);
    });
    return K.map(function(k){ return G[k]; });
  }
  function isDeal(r){ return DEAL.indexOf(r.status) >= 0 && dealAmt(r) != null; }
  function dealDate(r){ return r.paid_at || r.answer_at || r.estimate_at || r.created_at; }
  function csvDl(name, head, rows){
    var csv = '﻿' + [head].concat(rows).map(function(l){ return l.map(function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name + '_' + ymd(new Date()) + '.csv'; a.click();
  }
  async function loadBooks(){ BK = await call('staffBooks'); }
  async function showView(v){
    VIEW = v;
    document.querySelectorAll('#views button').forEach(function(b){ b.classList.toggle('on', b.dataset.view === v); });
    $('vCases').hidden = v !== 'cases'; $('vBook').hidden = v === 'cases';
    if(v === 'cases') return;
    $('vBook').innerHTML = '<p class="empty">読み込んでいます…</p>';
    try{ await loadBooks(); drawBook(); }catch(e){ say(e.message); }
  }
  $('views').addEventListener('click', function(ev){ var b = ev.target.closest('[data-view]'); if(b) showView(b.dataset.view); });
  function isAdm(){ return !!(SESS && SESS.admin); }
  var DUP = null, DSEL = {};
  function admBadge(){ return isAdm() ? '<span class="tag ok adm-badge">管理者：' + esc(SESS.name) + '（修正・取り消しができます）</span>' : '<span class="adm-note">登録した日報・金額を直せるのは管理者（中嶋）だけです</span>'; }
  function drawBook(){
    if(!BK) return;
    var f = { customers: customersView, products: productsView, buyers: buyersView, ledger: ledgerView, report: reportView }[VIEW];
    if(f) $('vBook').innerHTML = f();
    if(VIEW === 'customers' && BOPEN) { var el = $('vBook').querySelector('[data-cust-detail]'); if(el) el.scrollIntoView({ block: 'nearest' }); }
  }

  // ── 顧客管理（受付の記録から自動でまとめる。区分とメモは担当者が書ける）──
  function customers(){
    var M = {};
    ROWS.forEach(function(r){
      var k = ckey(r), c = M[k] || (M[k] = { key: k, name: r.name, kana: r.kana, phone: r.phone, email: r.email, address: r.address, n: 0, deals: 0, total: 0, last: '', first: r.created_at, refs: {}, kinds: {}, apps: [] });
      c.n++; c.apps.push(r); c.kinds[KIND[r.kind]] = 1; if(r.ref) c.refs[r.ref] = 1;
      if(r.created_at > c.last){ c.last = r.created_at; c.name = r.name; c.kana = r.kana || c.kana; c.address = r.address || c.address; c.email = r.email || c.email; }
      if(r.created_at < c.first) c.first = r.created_at;
      if(isDeal(r)){ c.deals++; c.total += dealAmt(r); }
    });
    // 日報のお客様（店頭）も載せる。受付番号（受付番号）＝年月日6桁＋その日のナンバー（その日の①のお客様が01。例 26110301）
    var maxNo = {};
    (BK.reports || []).forEach(function(r){ (r.deals || []).forEach(function(d, i){
      var n = dealNo(d, i), day = String(r.date).replace(/-/g, '').slice(2), t = (/^(\d{1,2}):(\d{2})/.exec(d.time || '') || [0, '00', '00']);
      var at = r.date + 'T' + ('0' + t[1]).slice(-2) + ':' + t[2] + ':00+09:00', its = d.items || [];
      maxNo[day] = Math.max(maxNo[day] || 0, n);
      var k = 'rp:' + r.date + ':' + n;
      M[k] = { key: k, no: day + ('0' + n).slice(-2), name: '店頭のお客様', kana: '', phone: '', email: '', address: '', n: 1, deals: d.status === '成約' ? 1 : 0,
        total: d.status === '成約' ? sumOf(its, 'cost') : 0, first: at, last: at, refs: {}, kinds: { '店頭（日報）': 1 }, apps: [], rp: { date: r.date, d: d }, summary: its.map(function(x){ return x.name; }).filter(Boolean).join('、') };
    }); });
    // 申込のお客様：最初の申込の受付番号が顧客管理番号
    Object.keys(M).forEach(function(k){ var c = M[k]; if(c.rp) return; var f = c.apps.slice().sort(function(a, b){ return a.created_at < b.created_at ? -1 : 1; })[0]; c.no = f ? String(f.receipt_no || '') : ''; });
    var notes = {}; (BK.notes || []).forEach(function(x){ notes[x.key] = x; });
    return Object.keys(M).map(function(k){ var c = M[k]; c.note = (notes[k] || {}).note || ''; c.rank = (notes[k] || {}).rank || ''; return c; })
      .sort(function(a, b){ var x = new Date(b.first) - new Date(a.first); return x || (a.no < b.no ? 1 : -1); });
  }
  // 日報の①②…をその日のナンバーに（①＝1）。番号がなければ並び順
  function dealNo(d, i){ var c = String(d.no || '').charCodeAt(0); if(c >= 0x2460 && c <= 0x2473) return c - 0x2460 + 1; if(c >= 0x3251 && c <= 0x325F) return c - 0x3251 + 21; var m = /\d+/.exec(d.no || ''); return m ? +m[0] : i + 1; }
  function ymdKey(iso){ var d = new Date(iso); if(isNaN(d)) return '00000000'; var j = new Date(d.getTime() + 9 * 3600000); return j.toISOString().slice(0, 10).replace(/-/g, ''); }
  // 商品番号＝受付番号＋その方の何点目2桁（26110301 の1点目＝2611030101、③の2点目＝2611030302）
  function itemNoOf(date, d, i, j){ return custNoOf(date, d, i) + ('0' + (j + 1)).slice(-2); }
  function prodNo(p){
    var m = /^日報:(\d{4}-\d{2}-\d{2}):([^:]+):(\d+)$/.exec(p.source || '');
    if(!m) return '';
    var R = (BK.reports || []).filter(function(r){ return r.date === m[1]; })[0], D = R ? R.deals || [] : [], di = -1;
    D.forEach(function(d, i){ if(di < 0 && (String(d.no || '') === m[2] || String(i + 1) === m[2])) di = i; });
    var n = di >= 0 ? dealNo(D[di], di) : dealNo({ no: m[2] }, (+m[2] || 1) - 1);
    return m[1].replace(/-/g, '').slice(2) + ('0' + n).slice(-2) + ('0' + m[3]).slice(-2);
  }
  function custNoOf(date, d, i){ return String(date).replace(/-/g, '').slice(2) + ('0' + dealNo(d, i)).slice(-2); }
  function customersView(){
    var C = customers(), q = BF.cq.replace(/[-\s]/g, '');
    var L = C.filter(function(c){ return !q || (c.no + c.name + (c.kana || '') + c.phone + (c.email || '') + c.note + c.rank + (c.summary || '')).replace(/[-\s]/g, '').indexOf(q) >= 0; });
    var sumT = C.reduce(function(t, c){ return t + c.total; }, 0), rep = C.filter(function(c){ return c.deals >= 2; }).length;
    var h = '<div class="bk-head"><h2>顧客管理</h2><div class="bk-tools"><input type="search" data-bf="cq" value="' + esc(BF.cq) + '" placeholder="番号・名前・電話・メモで探す"><button class="btn ghost small" data-bk="cust-csv">表を書き出す</button></div></div>'
      + '<div class="kpis"><div><small>お客様</small><b>' + C.length + '人</b></div><div><small>2回以上ご成約</small><b>' + rep + '人</b></div><div><small>買取の合計</small><b>' + yen(sumT) + '</b></div></div>'
      + '<p class="hint">受付の記録（電話番号ごと）と、日報の店頭のお客様をまとめています。顧客管理番号は受付番号と同じで「年月日6桁＋その日のナンバー」（例 26110301＝2026年11月3日の①のお客様）。サイト・電話の申込にも同じ形の受付番号が付きます（その日の番号の続き）。区分とメモはお客様を選んで書けます。</p>'
      + '<div class="table-wrap"><table class="bk-table"><thead><tr><th>受付番号<br><small>（顧客管理番号）</small></th><th>お名前</th><th>電話</th><th>区分</th><th class="num">お申込み</th><th class="num">成約</th><th class="num">買取合計</th><th>最終</th></tr></thead><tbody>'
      + (L.length ? L.map(function(c){ return '<tr class="click' + (BOPEN === c.key ? ' on' : '') + '" data-bk="cust-open" data-key="' + esc(c.key) + '"><td class="nowrap"><b>' + esc(c.no || '') + '</b></td><td><b>' + esc(c.name) + '</b>' + (c.kana ? '<br><small>' + esc(c.kana) + '</small>' : '') + (c.rp ? '<br><small>' + esc((c.rp.d.status || '') + '：' + (c.summary || '')).slice(0, 60) + '</small>' : '') + '</td><td>' + esc(c.phone) + '</td><td>' + (c.rank ? '<span class="tag go">' + esc(c.rank) + '</span>' : '') + '</td><td class="num">' + c.n + '</td><td class="num">' + c.deals + '</td><td class="num">' + yen(c.total) + '</td><td>' + ymd(c.last) + '</td></tr>'
        + (BOPEN === c.key ? '<tr><td colspan="8">' + (c.rp ? custDetailRp(c) : custDetail(c)) + '</td></tr>' : ''); }).join('') : '<tr><td colspan="8" class="empty">見つかりません</td></tr>')
      + '</tbody></table></div>';
    return h;
  }
  // 日報のお客様（店頭）の詳細
  function custDetailRp(c){
    var d = c.rp.d, its = d.items || [], co = sumOf(its, 'cost'), pr = sumOf(its, 'price');
    return '<div class="cust" data-cust-detail><div class="grid2"><dl class="kv"><dt>受付番号（顧客管理番号）</dt><dd>' + esc(c.no) + '</dd><dt>来店日</dt><dd>' + esc(c.rp.date) + '（日報 ' + esc(d.no || '') + '）</dd><dt>時間</dt><dd>' + esc(d.time || '') + '</dd><dt>結果</dt><dd>' + esc(d.status || '') + '</dd>'
      + '<dt>買取額</dt><dd>' + yen(co) + '</dd><dt>予定卸値</dt><dd>' + yen(pr) + '</dd>' + (d.note ? '<dt>メモ</dt><dd>' + esc(d.note) + '</dd>' : '') + '</dl>'
      + '<div><label class="f">区分<br><select data-cf="rank">' + ['', '一般', '常連', '優良', '紹介', '要注意'].map(function(x){ return '<option' + (x === c.rank ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>'
      + '<div class="f"><label>メモ（お客様には見えません）</label><textarea data-cf="note" style="min-height:80px">' + esc(c.note) + '</textarea></div><button class="btn blue small" data-bk="cust-save" data-key="' + esc(c.key) + '">保存</button></div></div>'
      + '<h3 style="margin-top:12px">商品詳細</h3><table class="bk-table"><thead><tr><th>商品番号</th><th>品目</th><th class="num">買取価格</th><th class="num">予定卸値</th><th>備考</th></tr></thead><tbody>'
      + its.map(function(x, j){ return '<tr><td class="nowrap">' + esc(c.no + ('0' + (j + 1)).slice(-2)) + '</td><td>' + esc(x.name || '') + '</td><td class="num">' + (x.cost == null ? '－' : yen(x.cost)) + '</td><td class="num">' + (x.price == null ? '－' : yen(x.price)) + '</td><td>' + esc(x.note || '') + '</td></tr>'; }).join('')
      + '</tbody></table></div>';
  }
  function custDetail(c){
    var P = (BK.products || []).filter(function(p){ return c.apps.some(function(a){ return a.id === p.app_id; }); });
    return '<div class="cust" data-cust-detail><div class="grid2"><dl class="kv"><dt>お名前</dt><dd>' + esc(c.name) + (c.kana ? '（' + esc(c.kana) + '）' : '') + '</dd><dt>電話</dt><dd><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a></dd>'
      + (c.email ? '<dt>メール</dt><dd>' + esc(c.email) + '</dd>' : '') + (c.address ? '<dt>住所</dt><dd>' + esc(c.address) + '</dd>' : '')
      + '<dt>受付番号（顧客管理番号）</dt><dd>' + esc(c.no || '') + '</dd><dt>初回</dt><dd>' + ymd(c.first) + '</dd><dt>利用方法</dt><dd>' + esc(Object.keys(c.kinds).join('・')) + '</dd>' + (Object.keys(c.refs).length ? '<dt>紹介元</dt><dd>' + esc(Object.keys(c.refs).join('、')) + '</dd>' : '') + '</dl>'
      + '<div><label class="f">区分<br><select data-cf="rank">' + ['', '一般', '常連', '優良', '紹介', '要注意'].map(function(x){ return '<option' + (x === c.rank ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>'
      + '<div class="f"><label>メモ（お客様には見えません）</label><textarea data-cf="note" style="min-height:80px">' + esc(c.note) + '</textarea></div><button class="btn blue small" data-bk="cust-save" data-key="' + esc(c.key) + '" data-name="' + esc(c.name) + '">区分・メモを保存</button></div></div>'
      + '<h3 style="margin-top:12px">お申込みの履歴</h3><table class="bk-table"><thead><tr><th>受付日</th><th>受付番号</th><th>方法</th><th>状態</th><th class="num">金額</th><th></th></tr></thead><tbody>'
      + c.apps.map(function(a){ return '<tr><td>' + ymd(a.created_at) + '</td><td>' + esc(a.receipt_no) + '</td><td>' + KIND[a.kind] + '</td><td>' + ST[a.status] + '</td><td class="num">' + yen(a.final_amount) + '</td><td><button class="btn ghost small" data-bk="go-case" data-id="' + a.id + '">開く</button></td></tr>'; }).join('')
      + '</tbody></table>'
      + (P.length ? '<h3 style="margin-top:12px">買い取ったお品物（' + P.length + '点）</h3><table class="bk-table"><tbody>' + P.map(function(p){ return '<tr><td>' + esc(p.name) + '</td><td class="num">' + yen(p.cost) + '</td><td>' + (BK.productSt[p.status] || p.status) + '</td></tr>'; }).join('') + '</tbody></table>' : '')
      + '</div>';
  }

  // ── 商品管理表（買取 → 在庫 → 卸に出品 → 売却）──
  function profit(p){ return p.price == null ? null : Number(p.price) - Number(p.fee || 0) - Number(p.cost || 0); }
  function productsView(){
    var P = BK.products || [], st = BF.pst, q = BF.pq;
    var L = P.filter(function(p){ return (!st || p.status === st) && (!q || (p.name + (p.receipt_no || '') + (p.seller || '') + (p.buyer || '') + p.id + prodNo(p)).replace(/-/g, '').indexOf(q.replace(/-/g, '')) >= 0); })
      .sort(function(a, b){ return a.created_at < b.created_at ? 1 : -1; });
    var cnt = function(s){ return P.filter(function(p){ return p.status === s; }); };
    var stock = cnt('stock'), listed = cnt('listed'), sold = cnt('sold');
    var sum = function(A, k){ return A.reduce(function(t, p){ return t + Number(p[k] || 0); }, 0); };
    var buyers = (BK.buyers || []).filter(function(b){ return b.active !== false; });
    var bopt = '<option value="">卸先を選ぶ</option>' + buyers.map(function(b){ return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('');
    var nsel = Object.keys(BSEL).filter(function(k){ return BSEL[k]; }).length;
    var pending = ROWS.filter(function(r){ return Array.isArray(r.lines) && r.lines.length && (r.status === 'paid' || r.status === 'done' || (r.status === 'accepted' && (r.kind === 'shop' || r.kind === 'visit'))) && !P.some(function(p){ return p.app_id === r.id; }); });
    var h = '<div class="bk-head"><h2>商品管理表</h2><div class="bk-tools"><select data-bf="pst"><option value="">すべての状態</option>' + Object.keys(BK.productSt).map(function(k){ return '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + BK.productSt[k] + '</option>'; }).join('') + '</select>'
      + '<input type="search" data-bf="pq" value="' + esc(q) + '" placeholder="品名・受付番号・売主で探す"><button class="btn ghost small" data-bk="prod-csv">表を書き出す</button></div></div>'
      + '<div class="kpis"><div><small>在庫</small><b>' + stock.length + '点</b><small>原価 ' + yen(sum(stock, 'cost')) + '・見込み卸値 ' + yen(sum(stock, 'expect')) + '（見込み利益 ' + yen(sum(stock, 'expect') - sum(stock.filter(function(p){ return p.expect != null; }), 'cost')) + '）</small></div><div><small>出品中</small><b>' + listed.length + '点</b><small>原価 ' + yen(sum(listed, 'cost')) + '</small></div><div><small>売却済</small><b>' + sold.length + '点</b><small>売上 ' + yen(sum(sold, 'price')) + '</small></div></div>'
      + (pending.length ? '<p class="note">振込済み・成約のお申込みのうち、まだ商品管理表に入っていない明細が <b>' + pending.length + '件</b> あります。<button class="btn blue small" data-bk="prod-import">受付の明細から取り込む</button></p>' : '')
      + '<p class="hint">振込済み・完了になると（店頭・出張は成約で）、明細が自動でここに入ります。行の左のチェックでまとめて操作できます。行を押すと1点ずつ直せます。</p>'
      + '<div class="bulk"><b>チェックした ' + nsel + '点を：</b><select data-bb="buyer">' + bopt + '</select><input type="date" data-bb="date" value="' + ymd(new Date()) + '">'
      + '<button class="btn blue small" data-bk="bulk-list"' + (nsel ? '' : ' disabled') + '>卸に出品</button>'
      + '<input type="number" data-bb="total" min="0" placeholder="売却額の合計（円）"><input type="number" data-bb="fee" min="0" placeholder="手数料の合計（円）">'
      + '<button class="btn primary small" data-bk="bulk-sold"' + (nsel ? '' : ' disabled') + '>売却を記録</button><button class="btn ghost small" data-bk="bulk-stock"' + (nsel ? '' : ' disabled') + '>在庫に戻す</button></div>'
      + '<p class="hint">売却額の合計は、チェックした商品の買取価格の比率で各商品に分けます（1点ずつ直すこともできます）。</p>'
      + '<div class="table-wrap"><table class="bk-table"><thead><tr><th><input type="checkbox" data-bk="sel-all" aria-label="すべて選ぶ"' + (L.length && L.every(function(p){ return BSEL[p.id]; }) ? ' checked' : '') + '></th><th>登録日</th><th>品名</th><th>受付番号・売主</th><th class="num">点数</th><th class="num">買取価格</th><th class="num">見込み卸値</th><th>状態</th><th>卸先</th><th class="num">売却価格</th><th class="num">粗利</th></tr></thead><tbody>'
      + (L.length ? L.map(function(p){ var pr = profit(p); return '<tr class="click' + (BOPEN === p.id ? ' on' : '') + '"><td><input type="checkbox" data-sel="' + p.id + '"' + (BSEL[p.id] ? ' checked' : '') + '></td><td data-bk="prod-open" data-id="' + p.id + '">' + ymd(p.created_at) + '</td><td data-bk="prod-open" data-id="' + p.id + '"><b>' + esc(p.name) + '</b>' + (p.matome ? ' <span class="tag">おまとめ</span>' : '') + '<br><small>' + esc(prodNo(p) || p.id) + '</small></td><td>' + esc(p.receipt_no || '手入力') + '<br><small>' + esc(p.seller || '') + '</small></td><td class="num">' + (p.qty || 1) + '</td><td class="num">' + yen(p.cost) + '</td><td class="num">' + yen(p.expect) + '</td><td><span class="tag ' + ({ stock: '', listed: 'go', sold: 'ok' }[p.status] || 'new') + '">' + (BK.productSt[p.status] || p.status) + '</span></td><td>' + esc(p.buyer || '') + '</td><td class="num">' + yen(p.price) + '</td><td class="num' + (pr < 0 ? ' minus' : '') + '">' + (pr == null ? '' : yen(pr)) + '</td></tr>'
        + (BOPEN === p.id ? '<tr><td colspan="11">' + prodEdit(p, bopt) + '</td></tr>' : ''); }).join('') : '<tr><td colspan="11" class="empty">該当する商品はありません</td></tr>')
      + '</tbody></table></div>'
      + '<details class="box"><summary><b>商品を手で追加する</b>（受付を通さずに買い取った物など）</summary><div class="inline" style="margin-top:8px"><label class="f">品名<br><input type="text" data-pa="name" maxlength="120"></label><label class="f">品目<br><input type="text" data-pa="category" maxlength="30"></label><label class="f">点数<br><input type="number" data-pa="qty" value="1" min="1"></label><label class="f">買取価格（円）<br><input type="number" data-pa="cost" min="0"></label><label class="f">売主<br><input type="text" data-pa="seller" maxlength="60"></label></div><button class="btn blue small" data-bk="prod-add">追加する</button></details>';
    return h;
  }
  function prodEdit(p, bopt){
    var v = function(k){ return p[k] == null ? '' : esc(p[k]); }, ro = isAdm() ? '' : ' disabled title="直せるのは管理者（中嶋）だけです"';
    return '<div class="cust" data-prod-edit="' + p.id + '">' + (isAdm() ? '' : '<p class="hint" style="margin:0 0 6px">品名・点数・買取価格・見込み卸値を直せるのは管理者（中嶋）だけです。</p>') + '<div class="inline">'
      + '<label class="f">品名<br><input type="text" data-pe="name" value="' + v('name') + '" maxlength="120" style="min-width:260px"' + ro + '></label>'
      + '<label class="f">点数<br><input type="number" data-pe="qty" value="' + v('qty') + '" min="1"' + ro + '></label>'
      + '<label class="f">買取価格（円）<br><input type="number" data-pe="cost" value="' + v('cost') + '" min="0"' + ro + '></label>'
      + '<label class="f">見込み卸値（円）<br><input type="number" data-pe="expect" value="' + v('expect') + '" min="0"' + ro + '></label>'
      + '<label class="f">状態<br><select data-pe="status">' + Object.keys(BK.productSt).map(function(k){ return '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + BK.productSt[k] + '</option>'; }).join('') + '</select></label>'
      + '<label class="f">卸先<br><select data-pe="buyer_id">' + bopt.replace('value="' + p.buyer_id + '"', 'value="' + p.buyer_id + '" selected') + '</select></label>'
      + '<label class="f">出品日<br><input type="date" data-pe="listed_at" value="' + ymd(p.listed_at) + '"></label>'
      + '<label class="f">売却日<br><input type="date" data-pe="sold_at" value="' + ymd(p.sold_at) + '"></label>'
      + '<label class="f">売却価格（円）<br><input type="number" data-pe="price" value="' + v('price') + '" min="0"></label>'
      + '<label class="f">手数料（円）<br><input type="number" data-pe="fee" value="' + v('fee') + '" min="0"></label>'
      + '<label class="f">入金額（円）<br><input type="number" data-pe="paid_in" value="' + v('paid_in') + '" min="0"></label>'
      + '<label class="f">入金日<br><input type="date" data-pe="paid_in_at" value="' + ymd(p.paid_in_at) + '"></label></div>'
      + '<div class="f"><label>メモ</label><input type="text" data-pe="memo" value="' + v('memo') + '" maxlength="300"></div>'
      + '<div class="actions"><button class="btn blue small" data-bk="prod-save" data-id="' + p.id + '">保存</button>' + (p.app_id ? '<button class="btn ghost small" data-bk="go-case" data-id="' + p.app_id + '">買取のお申込みを開く</button>' : '') + '</div></div>';
  }

  // ── 卸先管理帳 ──
  function buyersView(){
    var B = BK.buyers || [], P = BK.products || [];
    var h = '<div class="bk-head"><h2>卸先管理帳</h2><div class="bk-tools"><button class="btn blue small" data-bk="buyer-new">卸先を追加</button><button class="btn ghost small" data-bk="buyer-csv">表を書き出す</button></div></div>'
      + (BOPEN === 'new' ? buyerForm({ active: true }) : '')
      + '<div class="table-wrap"><table class="bk-table"><thead><tr><th>名称</th><th>種別</th><th>担当者・電話</th><th>取扱品目</th><th class="num">手数料率</th><th class="num">出品中</th><th class="num">売却</th><th class="num">売上</th><th class="num">粗利</th></tr></thead><tbody>'
      + (B.length ? B.map(function(b){
          var mine = P.filter(function(p){ return p.buyer_id === b.id; }), sold = mine.filter(function(p){ return p.status === 'sold'; });
          var sales = sold.reduce(function(t, p){ return t + Number(p.price || 0); }, 0), pf = sold.reduce(function(t, p){ return t + (profit(p) || 0); }, 0);
          return '<tr class="click' + (b.active === false ? ' off' : '') + (BOPEN === b.id ? ' on' : '') + '" data-bk="buyer-open" data-id="' + b.id + '"><td><b>' + esc(b.name) + '</b>' + (b.active === false ? ' <span class="tag">休止</span>' : '') + '</td><td>' + esc(b.type || '') + '</td><td>' + esc(b.person || '') + '<br><small>' + esc(b.tel || '') + '</small></td><td>' + esc(b.items || '') + '</td><td class="num">' + (b.fee_rate == null ? '' : b.fee_rate + '%') + '</td><td class="num">' + mine.filter(function(p){ return p.status === 'listed'; }).length + '</td><td class="num">' + sold.length + '</td><td class="num">' + yen(sales) + '</td><td class="num">' + yen(pf) + '</td></tr>'
            + (BOPEN === b.id ? '<tr><td colspan="9">' + buyerForm(b) + '</td></tr>' : '');
        }).join('') : '<tr><td colspan="9" class="empty">まだ卸先がありません。「卸先を追加」から登録してください。</td></tr>')
      + '</tbody></table></div>';
    return h;
  }
  function buyerForm(b){
    var v = function(k){ return b[k] == null ? '' : esc(b[k]); };
    var t = function(k, label, w){ return '<label class="f">' + label + '<br><input type="text" data-be="' + k + '" value="' + v(k) + '"' + (w ? ' style="min-width:' + w + 'px"' : '') + '></label>'; };
    return '<div class="cust" data-buyer-form="' + (b.id || '') + '"><div class="inline">' + t('name', '名称', 220)
      + '<label class="f">種別<br><select data-be="type">' + BK.buyerTypes.map(function(x){ return '<option' + (x === b.type ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>'
      + t('person', '担当者') + t('tel', '電話') + t('email', 'メール', 200) + t('address', '住所', 260) + t('items', '取扱品目', 200)
      + '<label class="f">手数料率（%）<br><input type="number" data-be="fee_rate" value="' + v('fee_rate') + '" min="0" step="0.1"></label>'
      + t('terms', '支払条件', 200) + t('license', '古物商許可番号', 200) + '</div>'
      + '<div class="f"><label>メモ</label><textarea data-be="memo">' + v('memo') + '</textarea></div>'
      + '<label class="check"><input type="checkbox" data-be="active"' + (b.active === false ? '' : ' checked') + '> 取引中（外すと「休止」になり、出品先の選択肢に出ません）</label>'
      + '<div class="actions"><button class="btn blue small" data-bk="buyer-save" data-id="' + (b.id || '') + '">保存</button><button class="btn ghost small" data-bk="close">閉じる</button></div></div>';
  }

  // ── 売上台帳（仕入＝買取 と 販売＝卸への売却。粗利）──
  function ledgerView(){
    var m = BF.month || ym(new Date()), all = m === 'all';
    var inM = function(s){ return all || ym(s) === m; };
    var buys = allBuys().filter(function(x){ return inM(x.d); }).sort(function(a, b){ return a.d < b.d ? 1 : -1; });
    var sells = (BK.products || []).filter(function(p){ return p.status === 'sold' && p.sold_at && inM(p.sold_at); }).sort(function(a, b){ return a.sold_at < b.sold_at ? 1 : -1; });
    var sB = buys.reduce(function(t, x){ return t + x.amt; }, 0);
    var sS = sells.reduce(function(t, p){ return t + Number(p.price || 0); }, 0), sF = sells.reduce(function(t, p){ return t + Number(p.fee || 0); }, 0);
    var sC = sells.reduce(function(t, p){ return t + Number(p.cost || 0); }, 0), sP = sS - sF - sC;
    var sIn = sells.reduce(function(t, p){ return t + Number(p.paid_in || 0); }, 0);
    // 見込み：その期間に買い取った品物（買取価格あり）の「見込み卸値」（金額が出ている卸先に売った場合の価格）と、その買取価格との差
    var expOf = function(test){ return (BK.products || []).filter(function(p){ return p.expect != null && p.expect !== '' && p.cost != null && test(p.created_at); }); };
    var EX = expOf(inM), sE = EX.reduce(function(t, p){ return t + Number(p.expect || 0); }, 0), sEC = EX.reduce(function(t, p){ return t + Number(p.cost || 0); }, 0), sEP = sE - sEC;
    var months = {}; allBuys().forEach(function(x){ months[ym(x.d)] = 1; }); (BK.products || []).forEach(function(p){ if(p.sold_at) months[ym(p.sold_at)] = 1; }); months[ym(new Date())] = 1;
    var ML = Object.keys(months).sort().reverse();
    var monthly = ML.slice(0, 12).map(function(k){
      var b = allBuys().filter(function(x){ return ym(x.d) === k; }).reduce(function(t, x){ return t + x.amt; }, 0);
      var S = (BK.products || []).filter(function(p){ return p.status === 'sold' && ym(p.sold_at) === k; });
      var s = S.reduce(function(t, p){ return t + Number(p.price || 0); }, 0), f = S.reduce(function(t, p){ return t + Number(p.fee || 0); }, 0), c = S.reduce(function(t, p){ return t + Number(p.cost || 0); }, 0);
      var E = expOf(function(d){ return ym(d) === k; }), e = E.reduce(function(t, p){ return t + Number(p.expect || 0); }, 0), ec = E.reduce(function(t, p){ return t + Number(p.cost || 0); }, 0);
      return '<tr><td>' + k.replace('-', '年') + '月</td><td class="num">' + yen(b) + '</td><td class="num">' + yen(e) + '</td><td class="num' + (e - ec < 0 ? ' minus' : '') + '">' + yen(e - ec) + '</td><td class="num">' + yen(s) + '</td><td class="num">' + yen(f) + '</td><td class="num">' + yen(c) + '</td><td class="num' + (s - f - c < 0 ? ' minus' : '') + '">' + yen(s - f - c) + '</td></tr>';
    }).join('');
    return '<div class="bk-head"><h2>売上台帳</h2><div class="bk-tools"><select data-bf="month">' + ML.map(function(k){ return '<option value="' + k + '"' + (k === m ? ' selected' : '') + '>' + k.replace('-', '年') + '月</option>'; }).join('') + '<option value="all"' + (all ? ' selected' : '') + '>全期間</option></select><button class="btn ghost small" data-bk="ledger-csv">表を書き出す</button>' + admBadge() + '</div></div>'
      + '<div class="kpis kpis5"><div><small>買取</small><b>' + yen(sB) + '</b><small>' + buys.length + '件（お客様ごと）</small></div>'
      + '<div><small>卸への売上見込み</small><b>' + yen(sE) + '</b><small>見込み卸値 ' + EX.length + '点</small></div>'
      + '<div><small>卸への売上</small><b>' + yen(sS) + '</b><small>' + sells.length + '点・手数料 ' + yen(sF) + '</small></div>'
      + '<div><small>粗利見込み</small><b class="' + (sEP < 0 ? 'minus' : '') + '">' + yen(sEP) + '</b><small>売上見込み − 買取価格</small></div>'
      + '<div><small>粗利</small><b class="' + (sP < 0 ? 'minus' : '') + '">' + yen(sP) + '</b><small>売上 − 手数料 − 買取価格<br>入金済み ' + yen(sIn) + (sells.some(function(p){ return p.cost == null; }) ? '<br>買取価格が未入力の ' + sells.filter(function(p){ return p.cost == null; }).length + '点は0円で計算' : '') + '</small></div></div>'
      + (function(){ var RR = (BK.reports || []).filter(function(r){ return all || String(r.date).slice(0, 7) === m; }); if(!RR.length) return '';
          var b = RR.reduce(function(t, r){ return t + Number(r.buy || 0); }, 0), sv = RR.reduce(function(t, r){ return t + Number(r.sell || 0); }, 0), pf = RR.reduce(function(t, r){ return t + Number(r.profit || 0); }, 0), v = RR.reduce(function(t, r){ return t + Number(r.visitors || 0); }, 0);
          // 「月間〇〇」は日報に書かれたその月の総数。1か月を選んだときは、その月の最後の日報の月間の数字を出す（登録した日の合計は小さく併記）
          var L = all ? null : RR.slice().sort(function(a, c){ return a.date < c.date ? 1 : -1; })[0];
          var M = function(k, d, unit){ var x = L && L['m_' + k]; return x == null || x === '' ? (unit ? d + unit : yen(d)) : (unit ? Number(x) + unit : yen(x)); };
          var sub = function(d, unit){ return L ? '<small>登録した ' + RR.length + '日分の合計 ' + (unit ? d + unit : yen(d)) + '</small>' : '<small>日報 ' + RR.length + '日分</small>'; };
          var ttl = L ? '月間' : '日報の';
          // 上の5項目と同じ数字は出さず、日報に書かれた月間の数字との照らし合わせだけを1行で出す
          var mb = Number(L && L.m_buy != null && L.m_buy !== '' ? L.m_buy : b), rb = rpBuys().filter(function(x){ return inM(x.d); }).reduce(function(t, x){ return t + x.amt; }, 0);
          return '<p class="bk-check">' + (L ? '日報（' + esc(L.date) + '）の月間' : '日報の合計') + '：来客 ' + M('visitors', v, '人') + '・買取額 ' + yen(mb) + '・売値 ' + M('sell', sv) + '・利益 ' + M('profit', pf)
            + '　<b class="' + (mb === rb ? 'ok' : 'minus') + '">' + (mb === rb ? '店頭の買取と一致 ✓' : '店頭の買取（' + yen(rb) + '）と差 ' + yen(mb - rb) + '（登録していない日報があります）') + '</b></p>' + regKpis(RR, sP); })()
      + '<h3>買取（仕入）</h3><div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th>受付番号</th><th>お客様・お品物</th><th>方法・状態</th><th class="num">買取金額</th></tr></thead><tbody>'
      + (buys.length ? buys.map(function(x){ var it = x.items ? x.items[0] + (x.items.length > 1 ? ' 他' + (x.items.length - 1) + '点' : '') : '';
          return '<tr' + (x.id ? ' class="click" data-bk="go-case" data-id="' + x.id + '"' : '') + ' title="' + esc((x.items || []).join('、')) + '"><td>' + ymd(x.d) + '</td><td>' + esc(x.no) + '</td><td>' + esc([x.who, it].filter(Boolean).join('　')) + '</td><td>' + esc(x.how) + (x.st && x.st !== '成約' ? '・' + esc(x.st) : '') + (x.ct && x.ct !== '店頭・対面' ? '・' + x.ct : '') + '</td><td class="num">' + yen(x.amt) + '</td></tr>'; }).join('') + '<tr class="sum"><td colspan="4">合計（' + buys.length + '件）</td><td class="num">' + yen(sB) + '</td></tr>' : '<tr><td colspan="5" class="empty">この期間の買取はありません</td></tr>')
      + '</tbody></table></div>'
      + '<h3>卸への販売</h3><div class="table-wrap"><table class="bk-table"><thead><tr><th>売却日</th><th>卸先</th><th>品名</th><th class="num">買取価格</th><th class="num">売却価格</th><th class="num">手数料</th><th class="num">粗利</th><th>入金</th></tr></thead><tbody>'
      + (sells.length ? sells.map(function(p){ var pr = profit(p); return '<tr><td>' + ymd(p.sold_at) + '</td><td>' + esc(p.buyer || '') + '</td><td>' + esc(p.name) + '</td><td class="num">' + yen(p.cost) + '</td><td class="num">' + yen(p.price) + '</td><td class="num">' + yen(p.fee) + '</td><td class="num' + (pr < 0 ? ' minus' : '') + '">' + yen(pr) + '</td><td>' + (p.paid_in_at ? ymd(p.paid_in_at) : '<span class="tag new">未入金</span> <button class="btn ghost small" data-bk="paid-in" data-id="' + esc(p.id) + '" title="今日の日付で、売却価格−手数料を入金額として記録します">入金済みにする</button>') + '</td></tr>'; }).join('')
        + '<tr class="sum"><td colspan="3">合計</td><td class="num">' + yen(sC) + '</td><td class="num">' + yen(sS) + '</td><td class="num">' + yen(sF) + '</td><td class="num">' + yen(sP) + '</td><td></td></tr>' : '<tr><td colspan="8" class="empty">この期間の売却はありません</td></tr>')
      + '</tbody></table></div>'
      + '<h3>月ごとの集計（直近12か月）</h3><div class="table-wrap"><table class="bk-table"><thead><tr><th>月</th><th class="num">買取</th><th class="num">卸への売上見込み</th><th class="num">粗利見込み</th><th class="num">卸への売上</th><th class="num">手数料</th><th class="num">売れた物の買取価格</th><th class="num">粗利</th></tr></thead><tbody>' + monthly + '</tbody></table></div>'
      + '<p class="hint">買取は「成約・振込済・完了」のお申込み（日付は振込日、なければ同意日）と、日報で登録した店頭の成約（お客様ごとに1行。品物の一覧は商品管理表）です。売上は商品管理表で「売却済」にした商品（日付は売却日）です。</p>'
      + (isAdm() ? dupView() : '');
  }
  // 重複の点検（管理者だけ）。消さずに「片付けたデータ」シートへ移す
  function dupView(){
    var h = '<h3>重複の点検（管理者）</h3><div class="actions"><button class="btn blue" data-bk="adm-dup-scan">' + (DUP ? 'もう一度点検する' : '重複を点検する') + '</button>'
      + (DUP && DUP.groups.length ? '<button class="btn primary" data-bk="adm-dup-go">チェックしたものを片付ける（' + Object.keys(DSEL).filter(function(k){ return DSEL[k]; }).length + '件）</button>' : '') + '</div>';
    if(!DUP) return h + '<p class="hint">同じ日報が2行ある・同じ品物が2回入っている、などを探します。片付けたものは消さずに、スプレッドシートの「片付けたデータ」に移します。</p>';
    if(!DUP.groups.length) return h + '<p class="msg ok">重複は見つかりませんでした（商品 ' + DUP.products + '点・日報 ' + DUP.reports + '日分を点検）。</p>';
    h += '<p class="hint">商品 ' + DUP.products + '点・日報 ' + DUP.reports + '日分を点検し、' + DUP.groups.length + 'か所の重複が見つかりました。初めは、各グループのいちばん上（売れている物・先に入った物）を残し、残りにチェックを入れています。</p>';
    var st = BK.productSt || {};
    DUP.groups.forEach(function(g, gi){
      h += '<div class="dup-g"><b>' + esc(g.label) + '</b><div class="table-wrap"><table class="bk-table"><thead><tr><th>片付ける</th>'
        + (g.kind === '日報' ? '<th>行</th><th>日付</th><th class="num">来客</th><th class="num">買取額</th><th class="num">お客様</th><th>登録者</th><th>更新日時</th>' : '<th>行</th><th>登録日</th><th>品名</th><th class="num">買取価格</th><th class="num">見込み卸値</th><th>状態</th><th class="num">売却価格</th><th>売主・取込元</th>')
        + '</tr></thead><tbody>'
        + g.rows.map(function(x){ var k = g.kind === '日報' ? 'r:' + x.row + ':' + x.date : 'p:' + x.id;
            return '<tr><td><input type="checkbox" data-dsel="' + esc(k) + '"' + (DSEL[k] ? ' checked' : '') + '></td><td>' + x.row + '</td>'
              + (g.kind === '日報' ? '<td>' + esc(x.date) + '</td><td class="num">' + (x.visitors == null ? '' : x.visitors) + '</td><td class="num">' + yen(x.buy) + '</td><td class="num">' + x.deals + '</td><td>' + esc(x.author) + '</td><td>' + esc(String(x.updated_at || '').slice(0, 16).replace('T', ' ')) + '</td>'
                : '<td>' + esc(x.date) + '</td><td>' + esc(x.name) + '</td><td class="num">' + yen(x.cost) + '</td><td class="num">' + yen(x.expect) + '</td><td>' + esc(st[x.status] || x.status || '') + '</td><td class="num">' + yen(x.price) + '</td><td><small>' + esc(x.seller) + '<br>' + esc(x.source) + '</small></td>')
              + '</tr>'; }).join('')
        + '</tbody></table></div></div>';
    });
    return h;
  }
  // 点検の結果から、初めに片付ける候補（各グループで残す1つ以外）を選ぶ
  function dupDefaults(){
    DSEL = {};
    var rank = { sold: 0, listed: 1, stock: 2 };
    DUP.groups.forEach(function(g){
      var L = g.rows.slice();
      if(g.kind === '日報') L.sort(function(a, b){ return a.row - b.row; });
      else L.sort(function(a, b){ return ((rank[a.status] == null ? 3 : rank[a.status]) - (rank[b.status] == null ? 3 : rank[b.status])) || (a.row - b.row); });
      g.rows = L;
      L.slice(1).forEach(function(x){ DSEL[g.kind === '日報' ? 'r:' + x.row + ':' + x.date : 'p:' + x.id] = true; });
    });
  }

  // 日報の登録もれ・月間の数字の確認（前の日の月間＋その日の数字＝その日の月間）
  function rpCheck(L){
    var A = L.slice().sort(function(a, b){ return a.date < b.date ? -1 : 1; }), bad = {}, have = {};
    var nx = function(d){ var t = new Date(d + 'T12:00:00+09:00'); t.setDate(t.getDate() + 1); return ymd(t); };
    A.forEach(function(r, i){
      have[r.date] = r; var pv = A[i - 1]; if(!pv) return;
      if(nx(pv.date) !== r.date) return;   // 間の日が抜けているときは比べない
      var msg = [];
      [['buy', '買取額'], ['visitors', '来客数']].forEach(function(f){
        var a = pv['m_' + f[0]], c = r['m_' + f[0]], d = r[f[0]];
        if(a == null || a === '' || c == null || c === '' || d == null || d === '') return;
        var exp = Number(a) + Number(d); if(exp !== Number(c)) msg.push('月間' + f[1] + ' ' + (f[0] === 'buy' ? yen(c) : c + '人') + '（前日の月間＋この日＝' + (f[0] === 'buy' ? yen(exp) : exp + '人') + '）');
      });
      if(msg.length) bad[r.date] = msg.join('・');
    });
    var k = String((A[0] || {}).date || '').slice(0, 7), miss = [];
    if(k){
      var today = ymd(new Date()), end = A[A.length - 1].date;
      for(var t = new Date(k + '-01T12:00:00+09:00'); ymd(t).slice(0, 7) === k && ymd(t) <= today; t.setDate(t.getDate() + 1)){ var ds = ymd(t); if(!have[ds] && ds < end) miss.push(ds); }
    }
    return { bad: bad, have: have, miss: miss };
  }
  // 月の登録カレンダー（✓登録済・⚠数字が合わない／中身が空・赤＝未登録）
  function rpCalendar(k, L, ck){
    var first = new Date(k + '-01T12:00:00+09:00'), today = ymd(new Date()), h = '<div class="rp-cal">';
    ['日', '月', '火', '水', '木', '金', '土'].forEach(function(w){ h += '<b>' + w + '</b>'; });
    for(var i = 0; i < first.getDay(); i++) h += '<span class="future"></span>';
    for(var t = new Date(first); ymd(t).slice(0, 7) === k; t.setDate(t.getDate() + 1)){
      var ds = ymd(t), r = ck.have[ds], c = r ? (ck.bad[ds] ? 'bad' : !(r.deals || []).length && !Number(r.buy) && (r.visitors == null || r.visitors === '') ? 'empty' : 'ok') : (ds <= today ? (ck.miss.indexOf(ds) >= 0 ? 'miss' : 'none') : 'future');
      h += '<span class="' + c + (c === 'future' ? '' : ' click') + '"' + (c === 'future' ? '' : ' data-bk="cal-go" data-date="' + ds + '" role="button" tabindex="0"') + ' title="' + ds + ' ' + ({ ok: '登録済み（押すとその日の日報へ）', bad: '月間の数字が合いません（押すとその日の日報へ）', empty: '登録済み・中身が空（押すとその日の日報へ）', miss: '未登録（押すと貼り付け欄へ）', none: '押すと貼り付け欄へ', future: '' }[c]) + '">' + t.getDate() + (c === 'ok' ? '✓' : c === 'bad' || c === 'empty' ? '⚠' : '') + '</span>';
    }
    return h + '</div><p class="hint" style="margin:0 12px 8px">✓ 登録済み　⚠ 月間の数字が合わない・中身が空　赤 未登録（休みの日なら気にしなくて大丈夫です）</p>';
  }
  // ── 日報（文章で書いた日報を貼り付け → AIが読み取り → 確かめて登録）──
  var RP = null, RPTEXT = '', RPOPEN = {};
  var DEAL_ST = ['成約', '失注', '預り', '基準外'];
  // 長いメモは1行目だけ出して、押すと全部見える
  function memoCell(t){
    t = String(t || ''); var lines = t.split('\n');
    if(lines.length <= 2 && t.length <= 60) return '<span style="white-space:pre-wrap">' + esc(t) + '</span>';
    return '<details class="rp-memo"><summary>' + esc(lines[0].slice(0, 40)) + (lines[0].length > 40 ? '…' : '') + '　<small>（続きを見る）</small></summary><div style="white-space:pre-wrap">' + esc(t) + '</div></details>';
  }
  function rpGet(path){ return path.split('.').reduce(function(o, k){ return o == null ? o : o[k]; }, RP); }
  function rpSet(path, v){ var ks = path.split('.'), o = RP; for(var i = 0; i < ks.length - 1; i++){ if(o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }
  function rin(path, type, w){ var v = rpGet(path); return '<input type="' + (type || 'text') + '" data-rp="' + path + '" value="' + (v == null ? '' : esc(v)) + '"' + (w ? ' style="width:' + w + '"' : '') + '>'; }
  function sumOf(L, k){ return (L || []).reduce(function(t, x){ return t + (Number(x[k]) || 0); }, 0); }
  function chk(label, a, b){ var ok = a === b; return '<li class="' + (ok ? 'ok' : 'ng') + '">' + (ok ? '✓ ' : '⚠ ') + label + '：' + yen(a) + (ok ? '' : ' ／ 日報の記載 ' + yen(b)) + '</li>'; }
  function reportView(){
    var R = (BK.reports || []).slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; });
    var h = '<div class="bk-head"><h2>日報</h2><div class="bk-tools">' + admBadge() + '</div></div>'
      + '<p class="hint">いつもの日報の文章をそのまま貼り付けて「読み取る」を押してください（いつもの書き方ならすぐ読み取れます）。読み取った内容を確かめてから「登録する」を押すと、日報・商品管理表（成約品は在庫・見込み卸値つき、ネット販売・オークションの売上は売却済）・卸先・売上台帳に入ります。同じ日報を2回登録しても、商品は二重に入りません。</p>'
      + '<div class="f"><textarea data-rp-text style="min-height:180px" placeholder="例：11月1日（日）&#10;【来客数】3&#10;【買取額】702000円 …">' + esc(RPTEXT) + '</textarea></div>'
      + '<div class="actions"><button class="btn blue" data-bk="rp-parse">読み取る</button><button class="btn ghost small" data-bk="rp-parse-ai" title="いつもと違う書き方で読めないときだけ。1〜3分かかります">AIでも読んでみる（1〜3分）</button>' + (RP ? '<button class="btn ghost small" data-bk="rp-clear">読み取りをやめる</button>' : '') + '</div>';
    if(RP) h += reportPreview();
    // 失注案件（追客リスト）と登録した日報は、月ごとに折りたためる。長いメモも折りたたむ
    var open_ = []; R.forEach(function(r){ (r.deals || []).forEach(function(d, i){ if(d.status && d.status !== '成約') open_.push({ date: r.date, d: d, cno: custNoOf(r.date, d, i) }); }); });
    var months = []; R.forEach(function(r){ var k = String(r.date).slice(0, 7); if(months.indexOf(k) < 0) months.push(k); });
    var isOpen = function(key, def){ return key in RPOPEN ? RPOPEN[key] : def; };
    var mLabel = function(k){ return k.replace('-', '年') + '月'; };
    var lost = '';   // 失注案件（追客リスト）は画面のいちばん最後に出す
    if(open_.length){
      // 失注案件は基本は閉じておき、必要なときに開く
      lost += '<details class="rp-month rp-lost" data-rpo="lost-all"' + (isOpen('lost-all', false) ? ' open' : '') + '><summary>失注案件（追客リスト）' + open_.length + '件　<small>押すと開きます</small></summary><div style="padding:4px 10px 10px">';
      months.forEach(function(k, mi){
        var L = open_.filter(function(x){ return String(x.date).slice(0, 7) === k; }); if(!L.length) return;
        lost += '<details class="rp-month" data-rpo="lost:' + k + '"' + (isOpen('lost:' + k, mi === 0) ? ' open' : '') + '><summary>' + mLabel(k) + '（' + L.length + '件）</summary>'
          + '<div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th>番号（受付番号）</th><th>来店～退店</th><th>状態</th><th>お品物・詳細</th><th class="num">提示額</th><th class="num">希望額</th><th>メモ</th></tr></thead><tbody>'
          + L.map(function(x){ return '<tr><td>' + esc(x.date) + '</td><td class="nowrap">' + esc(x.d.no || '') + ' <small>' + esc(x.cno) + '</small></td><td>' + esc(x.d.time || '') + '</td><td><span class="tag new">' + esc(x.d.status) + '</span></td><td>' + esc((x.d.items || []).map(function(i){ return i.name; }).join('、')) + '</td><td class="num">' + yen(x.d.offer) + '</td><td class="num">' + yen(x.d.wish) + '</td><td>' + memoCell(x.d.note || '') + '</td></tr>'; }).join('')
          + '</tbody></table></div></details>';
      });
      lost += '</div></details>';
    }
    // お預かり中の品物（預り）は追客リストとは別に、いつも開いて出す
    var azu = open_.filter(function(x){ return x.d.status === '預り'; });
    if(azu.length) h += '<h3>お預かり中（' + azu.length + '件）</h3><div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th>受付番号</th><th>お品物</th><th class="num">提示額</th><th>メモ</th></tr></thead><tbody>'
      + azu.map(function(x){ return '<tr><td>' + esc(x.date) + '</td><td class="nowrap">' + esc(x.cno) + '</td><td>' + esc((x.d.items || []).map(function(i){ return i.name; }).join('、')) + '</td><td class="num">' + yen(x.d.offer) + '</td><td>' + memoCell(x.d.note || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    h += '<h3>登録した日報</h3>';
    if(!R.length) h += '<p class="empty">まだ日報はありません</p>';
    months.forEach(function(k, mi){
      var L = R.filter(function(r){ return String(r.date).slice(0, 7) === k; });
      var last = L[0], tot = function(f){ return L.reduce(function(t, r){ return t + Number(r[f] || 0); }, 0); };
      var mb = last && last.m_buy != null && last.m_buy !== '' ? last.m_buy : tot('buy');
      var ck = rpCheck(L), nBad = Object.keys(ck.bad).length;
      h += '<details class="rp-month" data-rpo="rep:' + k + '"' + (isOpen('rep:' + k, mi === 0) ? ' open' : '') + '><summary>' + mLabel(k) + '（' + L.length + '日分・月間買取額 ' + yen(mb) + '）'
        + (ck.miss.length ? '　<span class="tag new">未登録 ' + ck.miss.length + '日</span>' : '') + (nBad ? '　<span class="tag new">月間の数字が合わない ' + nBad + '日</span>' : '') + '</summary>'
        + rpCalendar(k, L, ck)
        + '<div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th class="num">来客</th><th class="num">買取額</th><th class="num">売値</th><th class="num">利益</th><th class="num">残金（レジ）</th><th>レジの出入り・メモ</th></tr></thead><tbody>'
        + L.map(function(r){ return '<tr id="rp-row-' + esc(r.date) + '"' + (ck.bad[r.date] ? ' class="rp-bad"' : '') + '><td>' + esc(r.date) + (ck.bad[r.date] ? '<br><small class="minus">⚠ ' + esc(ck.bad[r.date]) + '</small>' : '')
          + (isAdm() ? '<div class="adm-btns"><button class="btn ghost small" data-bk="adm-rp-edit" data-date="' + esc(r.date) + '">直す</button><button class="btn ghost small danger" data-bk="adm-rp-del" data-date="' + esc(r.date) + '">取り消す</button></div>' : '') + '</td><td class="num">' + (r.visitors == null ? '' : r.visitors) + '</td><td class="num">' + yen(r.buy) + '</td><td class="num">' + yen(r.sell) + '</td><td class="num">' + yen(r.profit) + '</td><td class="num">' + yen(r.cash) + '</td><td>'
          + memoCell([movesOf(r).length ? movesOf(r).map(function(x){ var pl = placeOf(x); return moveName(x) + (pl !== 'レジ' ? '（' + pl + '）' : '') + ' ' + (x.sign < 0 ? '−' : '+') + yen(x.amount); }).join('\n') : r.cash_notes, r.notes].filter(Boolean).join('\n')) + '</td></tr>' + dealsRow(r, isOpen); }).join('')
        + '</tbody></table></div></details>';
    });
    h += lost;
    return h;
  }
  // レジ（残金）の出入り：買取資金の補充／貸付金（人の名前）／卸先からの入金／経費
  function movesOf(r){ return Array.isArray(r.moves) ? r.moves : []; }
  // 貸付金の返済は金庫から（レジとは関係なし）
  function placeOf(x){ return x.place || (/^貸付金の返済/.test(x.kind) ? '金庫' : 'レジ'); }
  var EXPOPEN = false;
  function expList(L){
    L = L.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var tot = 0;
    return '<div class="loan-list"><h3 style="margin:6px 0">経費の一覧</h3><div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th>区分</th><th>どこのお金</th><th class="num">金額</th><th>日報の記載</th></tr></thead><tbody>'
      + L.map(function(e){ tot += Number(e.x.amount) || 0; return '<tr><td>' + esc(e.date) + '</td><td>' + esc(catOf(e.x)) + '</td><td>' + placeLabel(e.x) + '</td><td class="num minus">−' + yen(e.x.amount) + '</td><td>' + esc(e.x.text || '') + '</td></tr>'; }).join('')
      + '<tr class="sum"><td colspan="3">合計（' + L.length + '件）</td><td class="num">−' + yen(tot) + '</td><td></td></tr></tbody></table></div></div>';
  }
  function regKpis(RR, gp){
    var t = {};
    var ex = { reg: 0, all: 0, cat: {}, list: [] }, bank = 0;
    RR.forEach(function(r){ movesOf(r).forEach(function(x){
      var v = Number(x.amount) || 0;
      if(x.kind === '経費'){ ex.all += v; if(placeOf(x) === 'レジ') ex.reg += v; var c = catOf(x); ex.cat[c] = (ex.cat[c] || 0) + v; ex.list.push({ date: r.date, x: x }); return; }
      if(x.kind === '卸先からの振込'){ bank += v; return; }
      var k = /^貸付金/.test(x.kind) ? '貸付金' : x.kind; t[k] = (t[k] || 0) + v * (x.sign || 1); }); });
    if(ex.all) t['経費'] = -ex.all;
    // 貸付金の残高は全期間で数える
    var all = {}; (BK.reports || []).forEach(function(r){ movesOf(r).forEach(function(x){ if(/^貸付金/.test(x.kind) && x.who) all[x.who] = (all[x.who] || 0) + (Number(x.amount) || 0) * (x.sign || 1); }); });
    var last = RR.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; })[0];
    if(!Object.keys(t).length && !(last && last.cash != null)) return '';
    return '<div class="kpis"><div><small>レジ残金（' + esc(last ? last.date : '') + '）</small><b>' + yen(last && last.cash) + '</b></div>'
      // 0円の項目は出さない
      + (t['買取資金の補充'] ? '<div><small>買取資金の補充</small><b>' + yen(t['買取資金の補充']) + '</b></div>' : '')
      + (t['卸先からの入金'] ? '<div><small>卸先からの入金（レジへ）</small><b>' + yen(t['卸先からの入金']) + '</b></div>' : '')
      + (bank ? '<div><small>卸先からの振込（口座へ）</small><b>' + yen(bank) + '</b><small>レジとは関係なし</small></div>' : '')
      + (ex.all ? '<div class="click kpi-btn" data-bk="exp-open" role="button" tabindex="0" title="押すと、いつ・何の経費かの一覧が出ます"><small>経費 ' + (EXPOPEN ? '▲' : '▼') + '</small><b class="minus">' + yen(ex.all) + '</b><small>'
          + esc(Object.keys(ex.cat).map(function(k){ return k + ' ' + yen(ex.cat[k]); }).join('・')) + (ex.all !== ex.reg ? '<br>うちレジから ' + yen(ex.reg) : '') + (gp != null ? '<br>粗利 − 経費 ＝ ' + yen(gp - ex.all) : '') + '</small></div>' : '')
      + (function(){ var rp = 0; RR.forEach(function(r){ movesOf(r).forEach(function(x){ if(placeOf(x) === '金庫') rp += Number(x.amount) || 0; }); }); return rp ? '<div><small>貸付金の返済（金庫から・レジとは関係なし）</small><b>' + yen(rp) + '</b></div>' : ''; })()
      + '<div class="click kpi-btn" data-bk="loan-open" role="button" tabindex="0" title="押すと、いつ・だれの貸付・返済かの一覧が出ます"><small>店への貸付金の残高 ' + (LOANOPEN ? '▲' : '▼') + '</small><b>' + yen(Object.keys(all).reduce(function(s, k){ return s + all[k]; }, 0)) + '</b><small>' + esc(Object.keys(all).map(function(k){ return k + ' ' + yen(all[k]); }).join('・')) + '</small></div></div>'
      + (LOANOPEN ? loanList() : '') + (EXPOPEN && ex.list.length ? expList(ex.list) : '');
  }
  // 店への貸付金の一覧（全期間・日付の古い順。残高の移り変わりつき）
  var LOANOPEN = false;
  function loanList(){
    var L = [];
    (BK.reports || []).forEach(function(r){ movesOf(r).forEach(function(x){ if(/^貸付金/.test(x.kind)) L.push({ date: r.date, x: x }); }); });
    L.sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var bal = {}, tot = 0;
    return '<div class="loan-list"><h3 style="margin:6px 0">店への貸付金の一覧</h3><div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th>だれ</th><th>内容</th><th>どこのお金</th><th class="num">金額</th><th class="num">その人の残高</th><th class="num">残高の合計</th><th>日報の記載</th></tr></thead><tbody>'
      + (L.length ? L.map(function(e){ var x = e.x, v = (Number(x.amount) || 0) * (x.sign || 1), w = x.who || '－'; bal[w] = (bal[w] || 0) + v; tot += v;
          return '<tr><td>' + esc(e.date) + '</td><td>' + esc(w) + '</td><td>' + (x.sign < 0 ? '返済' : '貸付') + '</td><td>' + esc(placeOf(x)) + '</td><td class="num' + (v < 0 ? ' minus' : '') + '">' + (v < 0 ? '−' : '+') + yen(Math.abs(v)) + '</td><td class="num">' + yen(bal[w]) + '</td><td class="num">' + yen(tot) + '</td><td>' + esc(x.text || '') + '</td></tr>'; }).join('')
        : '<tr><td colspan="8" class="empty">まだ貸付金の記録はありません</td></tr>')
      + '</tbody></table></div></div>';
  }
  function catOf(x){
    if(x.kind !== '経費') return '';
    if(x.cat) return x.cat;
    var t = String(x.text || '');
    if(/フレッツ|ビッグローブ|BIGLOBE|NTT|ソフトバンク|docomo|ドコモ|au|楽天モバイル|インターネット|ネット代|通信|電話|プロバイダ|Wi-?Fi/i.test(t)) return '通信費';
    if(/水道|電気|ガス|関西電力|関電|大阪ガス|光熱/.test(t)) return '水道光熱費';
    if(/交通|電車|切符|バス|タクシー|ガソリン|駐車|高速/.test(t)) return '交通費';
    if(/送料|郵便|切手代|ゆうパック|レターパック|宅急便|宅配|発送/.test(t)) return '送料';
    if(/用紙|封筒|文具|コピー|備品|消耗|テープ|袋|電池|洗剤|ティッシュ|トナー|インク/.test(t)) return '消耗品・備品';
    return 'その他';
  }
  function placeLabel(x){ var pl = placeOf(x); return pl === '金庫' ? '<span class="tag">金庫（レジとは関係なし）</span>' : pl === '口座' ? '<span class="tag">口座への振込（レジとは関係なし）</span>' : /^在庫/.test(pl) ? '<span class="tag">' + esc(pl) + 'で支払い（レジからの持ち出しなし）</span>' : 'レジ'; }
  function moveName(x){ return x.kind + (catOf(x) ? '（' + catOf(x) + '）' : ''); }
  function movesTable(M){
    return '<div class="table-wrap"><table class="bk-table"><thead><tr><th>種類</th><th>どこのお金</th><th class="num">金額</th><th>日報の記載</th></tr></thead><tbody>'
      + M.map(function(x){ return '<tr><td>' + esc(moveName(x)) + '</td><td>' + placeLabel(x) + '</td><td class="num' + (x.sign < 0 ? ' minus' : '') + '">' + (x.sign < 0 ? '−' : '+') + yen(x.amount) + '</td><td>' + esc(x.text) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  // 登録した日報の「お客様ごと」（時間・結果・買取額・予定卸値・予定利益・商品詳細）
  function dealsRow(r, isOpen){
    var D = r.deals || []; if(!D.length) return '';
    var cnt = {}; D.forEach(function(d){ cnt[d.status || '－'] = (cnt[d.status || '－'] || 0) + 1; });
    var key = 'day:' + r.date;
    return '<tr class="rp-sub"><td colspan="7"><details data-rpo="' + key + '"' + (isOpen(key, false) ? ' open' : '') + '><summary>お客様 ' + D.length + '組（' + Object.keys(cnt).map(function(k){ return k + cnt[k]; }).join('・') + '）</summary>'
      + '<div class="table-wrap"><table class="bk-table"><thead><tr><th>番号（受付番号）</th><th>時間</th><th>結果</th><th class="num">買取額</th><th class="num">予定卸値</th><th class="num">予定利益</th><th>商品詳細（商品番号／品目／買取価格／予定卸値／備考）</th></tr></thead><tbody>'
      + D.map(function(d, di){ var its = d.items || [], c = sumOf(its, 'cost'), p = sumOf(its, 'price');
          return '<tr><td class="nowrap">' + esc(d.no || '') + '<br><small>' + custNoOf(r.date, d, D.indexOf(d)) + '</small></td><td>' + esc(d.time || '') + '</td><td><span class="tag ' + (d.status === '成約' ? 'ok' : 'new') + '">' + esc(d.status || '') + '</span></td><td class="num">' + yen(c) + '</td><td class="num">' + yen(p) + '</td><td class="num' + (p - c < 0 ? ' minus' : '') + '">' + (its.some(function(x){ return x.cost != null && x.cost !== ''; }) ? yen(p - c) : '－') + '</td><td>'
            + '<table class="rp-mini"><tbody>' + its.map(function(x, j){ return '<tr><td class="nowrap"><small>' + itemNoOf(r.date, d, di, j) + '</small></td><td>' + esc(x.name || '') + '</td><td class="num">' + (x.cost == null ? '－' : yen(x.cost)) + '</td><td class="num">' + (x.price == null ? '－' : yen(x.price)) + '</td><td>' + esc(x.note || '') + '</td></tr>'; }).join('') + '</tbody></table>'
            + (d.note ? '<div class="hint" style="margin:4px 0 0">' + esc(d.note) + '</div>' : '') + '</td></tr>'; }).join('')
      + '</tbody></table></div></details></td></tr>';
  }
  function reportPreview(){
    var won = (RP.deals || []).filter(function(d){ return d.status === '成約'; }), wItems = [].concat.apply([], won.map(function(d){ return d.items || []; }));
    var buyers = (BK.buyers || []).filter(function(b){ return b.active !== false; });
    var hq = buyers.filter(function(b){ return /本部/.test(b.name); })[0];
    var h = '<div class="cust rp"><h3 style="margin-top:0">読み取った内容（直せます）' + (RP.by === 'ai' ? ' <span class="tag">AIで読み取り</span>' : '') + '</h3>'
      + ((RP.warn || []).length ? '<div class="rp-warn"><b>注意</b><ul>' + RP.warn.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '')
      + (((BK.reports || []).some(function(r){ return r.date === RP.date; })) ? '<div class="rp-warn">この日（' + esc(RP.date) + '）の日報はすでに登録されています。登録すると上書きになります。</div>' : '')
      + '<div class="inline">'
      + '<label class="f">日付<br>' + rin('date', 'date') + '</label><label class="f">来客数<br>' + rin('visitors', 'number', '6em') + '</label><label class="f">買取額<br>' + rin('buy', 'number') + '</label><label class="f">売値（予定卸値）<br>' + rin('sell', 'number') + '</label><label class="f">利益（予定利益）<br>' + rin('profit', 'number') + '</label><label class="f">残金（レジ）<br>' + rin('cash', 'number') + '</label></div>'
      + '<p class="hint" style="margin:4px 0">「月間」がつくものは、その月の総数（1日から今日まで）です。</p><div class="inline"><label class="f">月間来客数<br>' + rin('month.visitors', 'number', '6em') + '</label><label class="f">月間買取額<br>' + rin('month.buy', 'number') + '</label><label class="f">月間売値（予定卸値）<br>' + rin('month.sell', 'number') + '</label><label class="f">月間利益（予定利益）<br>' + rin('month.profit', 'number') + '</label></div>'
      + '<ul class="rp-chk">' + chk('成約品の買取価格の合計', sumOf(wItems, 'cost'), Number(RP.buy) || 0) + chk('成約品の予定卸値の合計', sumOf(wItems, 'price'), Number(RP.sell) || 0) + chk('予定利益（売値 − 買取額）', (Number(RP.sell) || 0) - (Number(RP.buy) || 0), Number(RP.profit) || 0) + '</ul>'
      + '<h3>お客様ごと（成約した品物は商品管理表に「在庫」で入り、予定卸値は「見込み卸値」として記録します）</h3>';
    // お客様ごと：時間・結果・買取額・予定卸値・予定利益・商品詳細（品目・買取価格・予定卸値・備考）
    (RP.deals || []).forEach(function(d, i){
      var p = 'deals.' + i, its = d.items || [], c = sumOf(its, 'cost'), pr = sumOf(its, 'price');
      h += '<div class="rp-deal st-' + esc(d.status || '') + '"><div class="rp-dh">'
        + '<b class="rp-no">' + esc(d.no || (i + 1)) + '<br><small style="font-size:.5em;font-weight:400">' + (RP.date ? custNoOf(RP.date, d, i) : '') + '</small></b>'
        + '<label title="一度預けて退店し、もう一度来店した場合は「16:21~16:22、17:15~17:35」のように2つ書けます">時間（来店～退店。2回来店は「、」で区切る）<br>' + rin(p + '.time', 'text', '13em') + '</label>'
        + '<label>結果<br><select data-rp="' + p + '.status">' + DEAL_ST.concat(d.status && DEAL_ST.indexOf(d.status) < 0 ? [d.status] : []).map(function(x){ return '<option' + (x === d.status ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>'
        + '<div class="rp-sum"><small>買取額</small><b>' + yen(c) + '</b></div><div class="rp-sum"><small>予定卸値</small><b>' + yen(pr) + '</b></div><div class="rp-sum"><small>予定利益</small><b class="' + (pr - c < 0 ? 'minus' : '') + '">' + (its.some(function(x){ return x.cost != null && x.cost !== ''; }) ? yen(pr - c) : '－') + '</b></div>'
        + (d.status !== '成約' ? '<label>提示額<br>' + rin(p + '.offer', 'number', '7em') + '</label><label>希望額<br>' + rin(p + '.wish', 'number', '7em') + '</label>' : '')
        + '<button class="btn ghost small rp-del" data-bk="rp-deldeal" data-i="' + i + '" title="このお客様を消す">×</button></div>'
        + '<div class="table-wrap"><table class="bk-table rp-items"><thead><tr><th>商品番号</th><th>品目（商品詳細）</th><th class="num">買取価格</th><th class="num">予定卸値</th><th>備考</th><th></th></tr></thead><tbody>'
        + its.map(function(x, j){ var q = p + '.items.' + j; return '<tr><td class="nowrap"><small>' + (RP.date ? itemNoOf(RP.date, d, i, j) : '') + '</small></td><td>' + rin(q + '.name', 'text', '100%') + '</td><td class="num">' + rin(q + '.cost', 'number', '7.5em') + '</td><td class="num">' + rin(q + '.price', 'number', '7.5em') + '</td><td>' + rin(q + '.note', 'text', '100%') + '</td><td><button class="btn ghost small" data-bk="rp-delitem" data-i="' + i + '" data-j="' + j + '" title="この品物を消す">×</button></td></tr>'; }).join('')
        + '</tbody></table></div>'
        + '<div class="rp-df"><button class="btn ghost small" data-bk="rp-additem" data-i="' + i + '">＋ 品物を追加</button><label class="f">メモ（再来店・相見積もり・お断りの理由など）' + rin(p + '.note', 'text', '100%') + '</label></div></div>';
    });
    h += '<div class="actions" style="margin:6px 0 14px"><button class="btn ghost small" data-bk="rp-adddeal">＋ お客様を追加</button></div>';
    h += '<label class="f">予定卸値の卸先（金額が出ている卸先）<br><select data-rp-buyer><option value="">買取大吉本部（卸）' + (hq ? '' : '（自動で作成）') + '</option>' + buyers.filter(function(b){ return b !== hq; }).map(function(b){ return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</select></label>';
    (RP.net || []).forEach(function(n, i){
      var p = 'net.' + i, s = sumOf(n.items, 'price');
      h += '<h3>' + esc(n.type || 'ネット販売') + '：' + esc(n.channel || '') + ' ' + esc(n.month || '') + '（' + (n.items || []).length + '点）</h3><ul class="rp-chk">' + chk('売れた価格の合計', s, Number(n.total) || 0) + '<li>代金：<select data-rp="' + p + '.paid"><option value=""' + (n.paid ? '' : ' selected') + '>入金予定（まだ入っていない）</option><option value="cash"' + (n.paid === 'cash' ? ' selected' : '') + '>レジへ入金済み</option></select></li>' + (n.expect_total ? chk('売上見込み（元卸値）の合計', sumOf(n.items, 'expect'), Number(n.expect_total) || 0) : '') + '</ul><p class="hint">「800→2112」は、売れた在庫の「売上見込みだった価格 → 最終的に売れた価格」です。在庫に同じ品名があれば、その商品を売却済にします。</p>'
        + '<div class="table-wrap"><table class="bk-table"><thead><tr><th>日付</th><th>品名</th><th class="num">売上見込み</th><th class="num">売れた価格</th><th>メモ</th></tr></thead><tbody>'
        + (n.items || []).map(function(x, j){ var q = p + '.items.' + j; return '<tr><td>' + rin(q + '.date', 'date') + '</td><td>' + rin(q + '.name', 'text', '100%') + '</td><td class="num">' + rin(q + '.expect', 'number', '7em') + '</td><td class="num">' + rin(q + '.price', 'number', '7em') + '</td><td>' + rin(q + '.note', 'text', '8em') + '</td></tr>'; }).join('')
        + '</tbody></table></div>';
    });
    if(movesOf(RP).length) h += '<h3>お金の出入り（レジ・金庫）</h3><p class="hint">「現金〇〇円補充」＝買取資金の補充、「名前＋補充」＝その人から店への貸付金、「卸先名＋補充」＝その日に売った代金をレジに入れたもの、「名前＋返金」＝金庫からの貸付金の返済（レジとは関係なし）、として分けています。</p>' + movesTable(movesOf(RP));
    if((RP.notes || []).length) h += '<h3>メモ</h3><ul>' + (RP.notes || []).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    h += '<div class="actions"><button class="btn primary" data-bk="rp-save">この内容で登録する</button></div></div>';
    return h;
  }
  $('vBook').addEventListener('toggle', function(ev){ var k = ev.target.dataset && ev.target.dataset.rpo; if(k) RPOPEN[k] = ev.target.open; }, true);
  $('vBook').addEventListener('input', function(ev){
    var t = ev.target;
    if(t.hasAttribute('data-rp-text')){ RPTEXT = t.value; return; }
    if(t.dataset.rp){ rpSet(t.dataset.rp, t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value); }
  });
  $('vBook').addEventListener('change', function(ev){
    var t = ev.target;
    if(t.dataset.rp && t.tagName === 'SELECT'){ rpSet(t.dataset.rp, t.value); drawBook(); }
    else if(t.dataset.rp && t.type === 'number'){ var y = window.scrollY; drawBook(); window.scrollTo(0, y); }
  });
  $('vBook').addEventListener('click', async function(ev){
    var b = ev.target.closest('[data-bk^="rp-"]'); if(!b) return;
    ev.stopPropagation();
    var act = b.dataset.bk, lb = b.textContent;
    try{
      if(act === 'rp-clear'){ RP = null; drawBook(); return; }
      // お客様・品物の行を増やす／減らす
      if(act === 'rp-additem'){ var D = RP.deals[+b.dataset.i]; (D.items = D.items || []).push({ name: '', cost: null, price: null, note: null }); drawBook(); return; }
      if(act === 'rp-delitem'){ RP.deals[+b.dataset.i].items.splice(+b.dataset.j, 1); drawBook(); return; }
      if(act === 'rp-adddeal'){ RP.deals.push({ no: null, time: '', status: '成約', items: [{ name: '', cost: null, price: null, note: null }], note: null }); drawBook(); return; }
      if(act === 'rp-deldeal'){ if(!confirm('このお客様の行を消しますか？')) return; RP.deals.splice(+b.dataset.i, 1); drawBook(); return; }
      b.disabled = true;
      if(act === 'rp-parse' || act === 'rp-parse-ai'){
        var ta = $('vBook').querySelector('[data-rp-text]'); if(ta) RPTEXT = ta.value;
        if(RPTEXT.trim().length < 10) throw new Error('日報の文章を貼り付けてください');
        var ai = act === 'rp-parse-ai';
        b.textContent = ai ? 'AIが読んでいます…（1〜3分）' : '読み取っています…';
        RP = await call('staffReportParse', { text: RPTEXT, ai: ai }); RP.deals = RP.deals || []; RP.net = RP.net || []; RP.warn = RP.warn || [];
        say(RP.warn.length ? '読み取りました。黄色の注意を確かめてから登録してください' : '読み取りました。内容を確かめて、下の「この内容で登録する」を押してください', RP.warn.length ? 'warn' : 'ok'); drawBook(); return;
      }
      if(act === 'rp-save'){
        var bsel = $('vBook').querySelector('[data-rp-buyer]');
        if(!RP.date) throw new Error('日付を入れてください');
        var ta2 = $('vBook').querySelector('[data-rp-text]'); if(ta2 && ta2.value) RPTEXT = ta2.value;
        var dup = (BK.reports || []).some(function(r){ return r.date === RP.date; });
        if(dup && !isAdm()) throw new Error(RP.date + ' の日報はもう登録されています。登録した日報を直せるのは管理者（中嶋）だけです');
        if(!confirm(dup ? RP.date + ' の日報はすでに登録されています。この内容で上書きしますか？\n（品物は二重に入りません。日報の数字・お客様・メモはこの内容に置き換わります）' : RP.date + ' の日報を登録します。よろしいですか？')) throw null;
        b.textContent = '登録しています…';
        var res = await call('staffReportSave', { report: RP, text: RPTEXT, buyerId: bsel ? bsel.value : '', actor: actor() });
        say(res.date + ' の日報を登録しました（商品 ' + res.added + '点を追加' + (res.matched ? '・在庫の ' + res.matched + '点を売却済に' : '') + (res.skipped ? '・登録済みの ' + res.skipped + '点はそのまま' : '') + (res.redo ? '・直す前の品物 ' + res.redo + '点は片付けて入れ直し' : '') + (res.used ? '・店で使った券など ' + res.used + '点を在庫から引きました' : '') + '）' + (res.useMiss && res.useMiss.length ? '。在庫に見つからなかった券：' + res.useMiss.join('、') + '（商品管理表で「店で使用」にしてください）' : ''), res.useMiss && res.useMiss.length ? 'warn' : 'ok');
        RP = null; RPTEXT = ''; await loadBooks(); drawBook(); return;
      }
    }catch(e){ if(e) say(e.message); }
    b.disabled = false; b.textContent = lb;
  }, true);

  // ── 台帳の操作 ──
  $('vBook').addEventListener('input', function(ev){
    var f = ev.target.dataset.bf; if(!f) return;
    BF[f] = ev.target.value; var pos = ev.target.selectionStart;
    drawBook(); var el = $('vBook').querySelector('[data-bf="' + f + '"]'); if(el && el.type === 'search'){ el.focus(); try{ el.setSelectionRange(pos, pos); }catch(e){} }
  });
  $('vBook').addEventListener('change', function(ev){
    var t = ev.target;
    if(t.dataset.bf && t.tagName === 'SELECT'){ BF[t.dataset.bf] = t.value; BOPEN = null; drawBook(); }
    if(t.dataset.sel){ BSEL[t.dataset.sel] = t.checked; drawBook(); }
    if(t.dataset.dsel){ DSEL[t.dataset.dsel] = t.checked; drawBook(); }
    if(t.dataset.bk === 'sel-all'){ $('vBook').querySelectorAll('[data-sel]').forEach(function(c){ BSEL[c.dataset.sel] = t.checked; }); drawBook(); }
  });
  $('vBook').addEventListener('click', async function(ev){
    var b = ev.target.closest('[data-bk]'); if(!b || b.tagName === 'INPUT' && b.type === 'checkbox') return;
    var act = b.dataset.bk, V = $('vBook'), who = actor();
    var q = function(sel){ var e = V.querySelector(sel); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
    try{
      if(act === 'loan-open'){ LOANOPEN = !LOANOPEN; drawBook(); return; }
      if(act === 'exp-open'){ EXPOPEN = !EXPOPEN; drawBook(); return; }
      if(act === 'cust-open' || act === 'prod-open' || act === 'buyer-open'){ var id = b.dataset.key || b.dataset.id; BOPEN = BOPEN === id ? null : id; drawBook(); return; }
      if(act === 'buyer-new'){ BOPEN = 'new'; drawBook(); return; }
      if(act === 'close'){ BOPEN = null; drawBook(); return; }
      if(act === 'go-case'){ await showView('cases'); TAB = 'all'; drawList(); open(b.dataset.id); window.scrollTo(0, 0); return; }
      if(act === 'cust-csv'){ var C = customers(); csvDl('顧客一覧', ['受付番号（顧客管理番号）', 'お名前', 'ふりがな', '電話', 'メール', '住所', '区分', 'お申込み', '成約', '買取合計', '初回', '最終', '紹介元', 'メモ'], C.map(function(c){ return [c.no, c.name, c.kana, c.phone, c.email, c.address, c.rank, c.n, c.deals, c.total, ymd(c.first), ymd(c.last), Object.keys(c.refs).join('、'), c.note]; })); return; }
      if(act === 'prod-csv'){ csvDl('商品管理表', ['商品番号', '商品ID', '登録日', '受付番号', '売主', '品名', '品目', '点数', '買取価格', '見込み卸値', '状態', '卸先', '出品日', '売却日', '売却価格', '手数料', '粗利', '入金額', '入金日', 'メモ'], (BK.products || []).map(function(p){ return [prodNo(p), p.id, ymd(p.created_at), p.receipt_no, p.seller, p.name, p.category, p.qty, p.cost, p.expect, BK.productSt[p.status], p.buyer, ymd(p.listed_at), ymd(p.sold_at), p.price, p.fee, profit(p), p.paid_in, ymd(p.paid_in_at), p.memo]; })); return; }
      if(act === 'buyer-csv'){ csvDl('卸先管理帳', ['卸先ID', '名称', '種別', '担当者', '電話', 'メール', '住所', '取扱品目', '手数料率', '支払条件', '古物商許可番号', '取引中', 'メモ'], (BK.buyers || []).map(function(x){ return [x.id, x.name, x.type, x.person, x.tel, x.email, x.address, x.items, x.fee_rate, x.terms, x.license, x.active === false ? '休止' : '取引中', x.memo]; })); return; }
      if(act === 'ledger-csv'){
        var m = BF.month || ym(new Date()), all = m === 'all', inM = function(s){ return all || ym(s) === m; };
        var rows = allBuys().filter(function(x){ return inM(x.d); }).map(function(x){ return ['買取（仕入）', ymd(x.d), x.no, [x.who, (x.items || []).join('、')].filter(Boolean).join(' '), x.how, '', x.amt, '', '', '']; })
          .concat((BK.products || []).filter(function(p){ return p.status === 'sold' && inM(p.sold_at); }).map(function(p){ return ['卸への販売', ymd(p.sold_at), p.receipt_no, p.name, p.buyer, p.cost, '', p.price, p.fee, profit(p)]; }));
        csvDl('売上台帳_' + (all ? '全期間' : m), ['区分', '日付', '受付番号', '売主／品名', '方法／卸先', '買取価格（原価）', '買取金額', '売却価格', '手数料', '粗利'], rows); return;
      }
      b.disabled = true;
      if(act === 'cust-save'){
        await call('staffCustomerSave', { key: b.dataset.key, name: b.dataset.name, rank: q('[data-cf=rank]'), note: q('[data-cf=note]') });
        say('区分・メモを保存しました', 'ok');
      }
      if(act === 'prod-save'){
        var box = V.querySelector('[data-prod-edit="' + b.dataset.id + '"]'), patch = {};
        box.querySelectorAll('[data-pe]').forEach(function(e){ var k = e.dataset.pe, val = e.value.trim(); patch[k] = /_at$/.test(k) ? (val ? new Date(val + 'T12:00:00+09:00').toISOString() : '') : val; });
        if(patch.status === 'sold' && (patch.price === '' || !patch.sold_at)) throw new Error('売却済みにするときは、売却日と売却価格を入れてください');
        if((patch.status === 'listed' || patch.status === 'sold') && !patch.buyer_id) throw new Error('卸先を選んでください');
        await call('staffProductSave', { id: b.dataset.id, patch: patch }); say('商品を保存しました', 'ok');
      }
      if(act === 'bulk-list' || act === 'bulk-sold' || act === 'bulk-stock'){
        var ids = Object.keys(BSEL).filter(function(k){ return BSEL[k]; }); if(!ids.length) throw new Error('商品にチェックを入れてください');
        var buyer = q('[data-bb=buyer]'), day = q('[data-bb=date]'), iso = day ? new Date(day + 'T12:00:00+09:00').toISOString() : new Date().toISOString();
        if(act === 'bulk-stock'){ await call('staffProductSave', { ids: ids, patch: { status: 'stock', buyer_id: '', buyer: '', listed_at: '', sold_at: '', price: '', fee: '' } }); }
        if(act === 'bulk-list'){ if(!buyer) throw new Error('卸先を選んでください'); await call('staffProductSave', { ids: ids, patch: { status: 'listed', buyer_id: buyer, listed_at: iso } }); }
        if(act === 'bulk-sold'){
          var total = Number(q('[data-bb=total]')), fee = Number(q('[data-bb=fee]') || 0);
          if(!buyer) throw new Error('卸先を選んでください'); if(!(total >= 0) || q('[data-bb=total]') === '') throw new Error('売却額の合計を入れてください');
          var P = (BK.products || []).filter(function(p){ return ids.indexOf(p.id) >= 0; });
          var base = P.reduce(function(t, p){ return t + Number(p.cost || 0); }, 0), restP = total, restF = fee;
          if(!confirm(P.length + '点を ' + yen(total) + '（手数料 ' + yen(fee) + '）で売却したと記録します。よろしいですか？')) throw null;
          for(var i = 0; i < P.length; i++){
            var w = base ? Number(P[i].cost || 0) / base : 1 / P.length, last = i === P.length - 1;
            var pr = last ? restP : Math.round(total * w), fe = last ? restF : Math.round(fee * w); restP -= pr; restF -= fe;
            await call('staffProductSave', { id: P[i].id, patch: { status: 'sold', buyer_id: buyer, sold_at: iso, price: pr, fee: fe, listed_at: P[i].listed_at || iso } });
          }
        }
        BSEL = {}; say('記録しました', 'ok');
      }
      if(act === 'prod-import'){
        var pend = ROWS.filter(function(r){ return Array.isArray(r.lines) && r.lines.length && (r.status === 'paid' || r.status === 'done' || (r.status === 'accepted' && (r.kind === 'shop' || r.kind === 'visit'))) && !(BK.products || []).some(function(p){ return p.app_id === r.id; }); });
        var n = 0; for(var j = 0; j < pend.length; j++){ var rs = await call('staffProductsFromApp', { id: pend[j].id, actor: who }); n += rs.added; }
        say(n + '点を商品管理表に取り込みました', 'ok');
      }
      // カレンダーの日付を押す：登録済みならその日の日報の行へ、未登録なら貼り付け欄へ
      if(act === 'cal-go'){
        var cd = b.dataset.date, row = document.getElementById('rp-row-' + cd);
        if(row){
          var det = row.closest('details'); if(det && !det.open){ det.open = true; if(det.dataset.rpo) RPOPEN[det.dataset.rpo] = true; }
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.remove('rp-flash'); void row.offsetWidth; row.classList.add('rp-flash');
        } else {
          var ta = V.querySelector('[data-rp-text]'); if(ta){ ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); ta.focus(); }
          say(cd + ' の日報はまだ登録されていません。日報の文章を貼り付けて「読み取る」を押してください', 'ok');
        }
        b.disabled = false; return;
      }
      if(act === 'adm-dup-scan'){ DUP = await call('adminDupScan', {}); dupDefaults(); drawBook(); say(DUP.groups.length ? DUP.groups.length + 'か所の重複が見つかりました' : '重複は見つかりませんでした', 'ok'); return; }
      if(act === 'adm-dup-go'){
        var ks = Object.keys(DSEL).filter(function(k){ return DSEL[k]; }); if(!ks.length) throw new Error('片付けるものにチェックを入れてください');
        var prods = ks.filter(function(k){ return k.indexOf('p:') === 0; }).map(function(k){ return k.slice(2); });
        var reps = ks.filter(function(k){ return k.indexOf('r:') === 0; }).map(function(k){ var a = k.split(':'); return { row: Number(a[1]), date: a[2] }; });
        if(!confirm('商品 ' + prods.length + '点・日報 ' + reps.length + '行を片付けます。\n（消さずに、スプレッドシートの「片付けたデータ」に移します）よろしいですか？')){ b.disabled = false; return; }
        var ra = await call('adminArchive', { products: prods, reports: reps }); say(ra.archived + '件を片付けました', 'ok');
        await loadBooks(); DUP = await call('adminDupScan', {}); dupDefaults(); drawBook(); return;
      }
      if(act === 'adm-rp-edit'){
        var rr = await call('adminReportGet', { date: b.dataset.date });
        if(!rr.raw) throw new Error(rr.date + ' の日報は原文が残っていません。日報の文章を貼り付けて「読み取る」→「登録する」で直してください');
        RPTEXT = rr.raw; RP = null; VIEW = 'report'; drawBook(); window.scrollTo(0, 0);
        say(rr.date + ' の日報の原文を入れました。直してから「読み取る」→「登録する」を押すと置き換わります（売れていない品物は入れ直し、売れた品物はそのままです）', 'ok'); return;
      }
      if(act === 'adm-rp-del'){
        if(!confirm(b.dataset.date + ' の日報を取り消します。\nこの日の売れていない品物も一緒に片付けます（売れた品物は残します）。\n消さずに、スプレッドシートの「片付けたデータ」に移します。よろしいですか？')){ b.disabled = false; return; }
        var rd = await call('adminReportArchive', { date: b.dataset.date });
        say(b.dataset.date + ' の日報を取り消しました（品物 ' + rd.products + '点を片付け' + (rd.kept ? '・売れた ' + rd.kept + '点は残しました' : '') + '）', 'ok');
      }
      if(act === 'paid-in'){
        var pp = (BK.products || []).filter(function(x){ return x.id === b.dataset.id; })[0]; if(!pp) throw new Error('商品が見つかりません');
        var amt = Number(pp.price || 0) - Number(pp.fee || 0);
        if(!confirm(pp.name + '\n入金額 ' + yen(amt) + '（今日の日付）で入金済みにします。よろしいですか？')){ b.disabled = false; return; }
        await call('staffProductSave', { id: pp.id, patch: { paid_in: amt, paid_in_at: new Date().toISOString() } }); say('入金済みにしました', 'ok');
      }
      if(act === 'prod-add'){
        var item = {}; V.querySelectorAll('[data-pa]').forEach(function(e){ item[e.dataset.pa] = e.value.trim(); });
        await call('staffProductAdd', { item: item }); say('商品を追加しました', 'ok');
      }
      if(act === 'buyer-save'){
        var fbox = V.querySelector('[data-buyer-form="' + (b.dataset.id || '') + '"]'), x = { id: b.dataset.id || '' };
        fbox.querySelectorAll('[data-be]').forEach(function(e){ x[e.dataset.be] = e.type === 'checkbox' ? e.checked : e.value.trim(); });
        await call('staffBuyerSave', { buyer: x }); BOPEN = null; say('卸先を保存しました', 'ok');
      }
      await loadBooks(); drawBook();
    }catch(e){ if(e) say(e.message); b.disabled = false; }
  });

  // 新しい版の確認：画面を開いたままでも、更新があればお知らせを出す（5分ごと・画面に戻ったとき）
  (function(){
    var me = [].slice.call(document.scripts).map(function(x){ return x.getAttribute('src') || ''; }).filter(function(x){ return /^admin\.js\?v=/.test(x); })[0];
    if(!me) return;
    var shown = false;
    async function check(){
      if(shown) return;
      try{
        var t = await (await fetch('admin.html?_=' + Date.now(), { cache: 'no-store' })).text(), m = /admin\.js\?v=[0-9a-f]+/.exec(t);
        if(m && m[0] !== me){
          shown = true;
          var d = document.createElement('div'); d.className = 'new-ver';
          d.innerHTML = '管理画面が新しくなりました。<button type="button" class="btn small">最新の画面にする</button>';
          d.querySelector('button').onclick = function(){ location.reload(); };
          document.body.appendChild(d);
        }
      }catch(e){}
    }
    setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) check(); });
  })();
  (async function(){ if(API.configured && SESS){ try{ await enter(); }catch(e){ SS.set(null); SESS = null; } } if(!API.configured) $('loginMsg').innerHTML = '<p class="msg warn">受付システムが未接続です（config.js を設定してください）</p>'; })();
})();
