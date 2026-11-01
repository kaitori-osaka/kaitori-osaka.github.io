/* 管理画面（担当者用）
   ログインは共通アカウント（メールとパスワード）。誰が操作したかは「操作する人」で切り替えて記録する。
   読み書きの権限はデータベース側（担当者として登録したアカウントだけ）で守っている。 */
(function(){
  if(!window.API) return;
  var SS = API.store('kd-admin', false), SESS = SS.get();
  function call(action, data){ return API.call(action, Object.assign({ s: SESS && SESS.s }, data || {})).catch(function(e){ if(e.code === 'auth'){ SS.set(null); setTimeout(function(){ location.reload(); }, 1500); } throw e; }); }
  var $ = function(id){ return document.getElementById(id); };
  var KIND = { shop: '店頭', visit: '出張', photo: '写真査定', takuhai: '宅配' };
  var ST = { new: '新着', contacted: '連絡済', scheduled: '日時確定', kit_sent: 'キット発送', arrived: '到着', appraised: '金額提示中', accepted: '成約・同意', declined: '不成立', done: '完了', cancelled: '取消' };
  var STATUS_BY_KIND = {
    shop: ['new', 'contacted', 'scheduled', 'accepted', 'declined', 'done', 'cancelled'],
    visit: ['new', 'contacted', 'scheduled', 'appraised', 'accepted', 'declined', 'done', 'cancelled'],
    photo: ['new', 'contacted', 'appraised', 'accepted', 'declined', 'done', 'cancelled'],
    takuhai: ['new', 'contacted', 'kit_sent', 'arrived', 'appraised', 'accepted', 'declined', 'done', 'cancelled']
  };
  var CLOSED = ['done', 'cancelled', 'declined'];
  var ROWS = [], ROSTER = [], CUR = null, TAB = 'todo';

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function yen(n){ return n == null ? '' : Number(n).toLocaleString('ja-JP') + '円'; }
  function dt(s){ if(!s) return ''; var d = new Date(s); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + '日月火水木金土'[d.getDay()] + ') ' + d.toTimeString().slice(0, 5); }
  function say(t, cls){ $('appMsg').innerHTML = t ? '<p class="msg ' + (cls || 'bad') + '">' + esc(t) + '</p>' : ''; if(t && cls === 'ok') setTimeout(function(){ $('appMsg').innerHTML = ''; }, 4000); }
  function actor(){ return $('actor').value || '担当者'; }
  function tagFor(s){ return s === 'new' ? 'new' : s === 'appraised' ? 'go' : (s === 'accepted' || s === 'done') ? 'ok' : CLOSED.indexOf(s) >= 0 ? 'end' : ''; }
  function needsAction(r){ return r.status === 'new' || r.unread_staff > 0 || r.id_status === 'submitted' || r.status === 'arrived' || (r.answer && r.status === 'accepted' && !r.final_amount && r.kind === 'photo'); }

  // ── ログイン ──
  $('loginForm').addEventListener('submit', async function(ev){
    ev.preventDefault(); $('loginMsg').innerHTML = '';
    try{ SESS = await API.call('staffLogin', { password: $('pw').value }); SS.set(SESS); $('pw').value = ''; await enter(); }
    catch(e){ $('loginMsg').innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; }
  });
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
      if(CUR && quiet) { var c = ROWS.filter(function(r){ return r.id === CUR; })[0]; if(c && c.unread_staff > 0) open(CUR); }
    }catch(e){ say(e.message); }
  }
  function filtered(){
    var k = $('fKind').value, q = $('fq').value.trim().replace(/-/g, '');
    return ROWS.filter(function(r){
      if(TAB === 'todo' && !needsAction(r)) return false;
      if(TAB === 'open' && CLOSED.indexOf(r.status) >= 0) return false;
      if(k && r.kind !== k) return false;
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
  async function open(id){
    CUR = id; drawList();
    var r = ROWS.filter(function(x){ return x.id === id; })[0]; if(!r) return;
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

  function render(r, msgs, evs){
    var wish = r.wishes ? esc(r.wishes).split(' / ').map(function(w, i){ return '第' + (i + 1) + '希望 ' + w; }).join('<br>') : '';
    var tel = r.phone.replace(/[^0-9+]/g, '');
    var h = '<div class="l1" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2>' + esc(r.name) + ' 様' + (r.kana ? '<small>（' + esc(r.kana) + '）</small>' : '') + '</h2><span><span class="tag">' + KIND[r.kind] + '</span> <span class="tag ' + tagFor(r.status) + '">' + ST[r.status] + '</span>' + (r.mode === 'trial' ? ' <span class="tag trial">試験</span>' : '') + '</span></div>'
      + '<p class="hint">受付番号 ' + esc(r.receipt_no) + '・受付 ' + dt(r.created_at) + '</p>';

    h += '<div class="box grid2"><dl class="kv">'
      + '<dt>電話</dt><dd><a href="tel:' + tel + '">' + esc(r.phone) + '</a></dd>'
      + '<dt>メール</dt><dd>' + (r.email ? esc(r.email) : '（なし）') + '</dd>'
      + '<dt>連絡方法</dt><dd>' + ({ phone: '電話', email: 'メール', either: 'どちらでも' }[r.contact_pref]) + '</dd>'
      + (r.address ? '<dt>住所</dt><dd>' + esc((r.postal ? '〒' + r.postal + ' ' : '') + r.address) + '</dd>' : '')
      + (r.ref ? '<dt>紹介元</dt><dd><b>' + esc(r.ref) + '</b></dd>' : '')
      + (r.how_found ? '<dt>きっかけ</dt><dd>' + esc(r.how_found) + '</dd>' : '')
      + '</dl><dl class="kv">'
      + '<dt>品目</dt><dd>' + esc((r.items || []).join('、') || '（未選択）') + '</dd>'
      + (r.item_note ? '<dt>内容</dt><dd style="white-space:pre-wrap">' + esc(r.item_note) + '</dd>' : '')
      + (r.quantity ? '<dt>量</dt><dd>' + esc(r.quantity) + '</dd>' : '')
      + (r.kind === 'takuhai' ? '<dt>キット</dt><dd>' + (r.kit_boxes ? r.kit_boxes + '箱' : '不要') + '</dd>' : '')
      + (wish ? '<dt>希望日時</dt><dd>' + wish + '</dd>' : '')
      + '</dl></div>';

    // 担当・状態・メモ
    h += '<div class="box"><h3>担当と状態</h3><div class="inline">'
      + '<label class="f">担当者<br><select data-f="assignee"><option value="">（未定）</option>' + ROSTER.map(function(x){ return '<option' + (x.name === r.assignee ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>'
      + '<label class="f">状態<br><select data-f="status">' + STATUS_BY_KIND[r.kind].map(function(s){ return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + ST[s] + '</option>'; }).join('') + '</select></label>'
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
    if(r.kind === 'takuhai'){
      h += '<div class="box"><h3>宅配キットとご本人確認</h3><div class="inline"><label class="f">追跡番号<br><input type="text" data-f="kit_tracking" value="' + esc(r.kit_tracking || '') + '"></label>'
        + '<button class="btn blue small" data-act="kit">キット発送をお知らせ</button><button class="btn ghost small" data-act="arrived">お品物の到着を記録</button></div>'
        + '<p style="margin-top:10px">身分証：<b>' + ({ none: '未提出', submitted: '提出あり（確認待ち）', verified: '確認済み' }[r.id_status]) + '</b></p><div class="pics" data-pics="idcopy"></div>'
        + (r.id_status === 'submitted' ? '<div class="actions"><button class="btn blue small" data-act="id-ok">身分証を確認済みにする</button></div>' : '')
        + '<p class="hint">転送不要の簡易書留の到達と、同じ名義の口座への振込で本人確認を完了します。</p></div>';
    }

    // 金額の提示
    var isRange = r.kind === 'photo';
    h += '<div class="box"><h3>' + (isRange ? '概算金額の提示' : '査定金額の提示') + '</h3><div class="inline">'
      + (isRange
        ? '<label class="f">下限（円）<br><input type="number" min="0" step="100" data-f="estimate_low" value="' + (r.estimate_low == null ? '' : r.estimate_low) + '"></label><label class="f">上限（円）<br><input type="number" min="0" step="100" data-f="estimate_high" value="' + (r.estimate_high == null ? '' : r.estimate_high) + '"></label>'
        : '<label class="f">金額（円）<br><input type="number" min="0" step="1" data-f="final_amount" value="' + (r.final_amount == null ? '' : r.final_amount) + '"></label>')
      + '</div><div class="f" style="margin-top:8px"><label>お客様へのひとこと（金額の根拠など）</label><textarea data-f="estimate_note" style="min-height:70px">' + esc(r.estimate_note || '') + '</textarea></div>'
      + '<button class="btn primary small" data-act="estimate"' + (r.email ? '' : ' disabled') + '>金額をお客様に知らせる</button>'
      + (r.email ? '' : '<p class="hint">メールアドレスがないため、金額はお電話でお伝えください。</p>')
      + (r.answer ? '<p style="margin-top:8px"><b>お客様の回答：' + (r.answer === 'accept' ? '同意' : '見送り') + '</b>（' + dt(r.answer_at) + '）</p>' : '')
      + (isRange && r.status === 'accepted' ? '<p class="hint">売り方（店頭・出張・宅配）をお客様と相談し、必要なら新しい案件として受け付けてください。</p>' : '')
      + '</div>';

    // 連絡
    h += '<div class="box"><h3>お客様との連絡</h3><div class="thread">'
      + (msgs.length ? msgs.map(function(m){ return '<div class="bubble ' + (m.sender === 'staff' ? 'customer' : m.sender === 'customer' ? 'staff' : 'system') + '">' + esc(m.body) + '<time>' + (m.sender === 'staff' ? '店舗' + (m.author ? '（' + esc(m.author) + '）' : '') : m.sender === 'customer' ? 'お客様' : '') + '・' + dt(m.created_at) + '</time></div>'; }).join('') : '<p class="hint">まだやり取りはありません。</p>')
      + '</div><div class="f" style="margin-top:10px"><textarea data-f="reply" placeholder="お客様へのご連絡（メールでも届きます）"></textarea></div>'
      + '<button class="btn blue small" data-act="reply"' + (r.email ? '' : ' disabled') + '>送る</button>'
      + '<button class="btn ghost small" data-act="done" style="margin-left:6px">完了にする</button></div>';

    h += '<div class="box"><h3>履歴</h3><div class="log">' + evs.map(function(x){ return dt(x.at) + '　' + esc(x.actor || '') + '　' + esc(x.action); }).join('<br>') + '</div></div>';
    return h;
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
    try{
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
      if(act === 'reply'){
        var body = g('reply').trim(); if(!body) throw new Error('本文を入れてください');
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
  async function log(id, action, detail){ try{ await call('staffLog', { id: id, actor: actor(), action: action, detail: detail || null }); }catch(e){} }
  function fmtJp(iso){ var d = new Date(iso); return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' }) + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }); }

  // 写真の拡大
  $('detail').addEventListener('click', function(ev){ var i = ev.target.closest('.pics img'); if(!i) return; var lb = $('lb'); lb.querySelector('img').src = i.src; lb.hidden = false; });
  $('lb').addEventListener('click', function(){ this.hidden = true; });

  // 表の書き出し（いま表示している一覧）
  $('csv').onclick = function(){
    var cols = [['受付番号', 'receipt_no'], ['方法', function(r){ return KIND[r.kind]; }], ['状態', function(r){ return ST[r.status]; }], ['受付日時', function(r){ return dt(r.created_at); }], ['お名前', 'name'], ['ふりがな', 'kana'], ['電話', 'phone'], ['メール', 'email'], ['住所', function(r){ return (r.postal || '') + ' ' + (r.address || ''); }], ['品目', function(r){ return (r.items || []).join('、'); }], ['内容', 'item_note'], ['担当', 'assignee'], ['日時', function(r){ return dt(r.scheduled_at); }], ['概算下限', 'estimate_low'], ['概算上限', 'estimate_high'], ['金額', 'final_amount'], ['きっかけ', 'how_found'], ['紹介元', 'ref']];
    var lines = [cols.map(function(c){ return c[0]; })].concat(filtered().map(function(r){ return cols.map(function(c){ return typeof c[1] === 'function' ? c[1](r) : r[c[1]]; }); }));
    var csv = '﻿' + lines.map(function(l){ return l.map(function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '申込一覧_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };

  (async function(){ if(API.configured && SESS){ try{ await enter(); }catch(e){ SS.set(null); SESS = null; } } if(!API.configured) $('loginMsg').innerHTML = '<p class="msg warn">受付システムが未接続です（config.js を設定してください）</p>'; })();
})();
