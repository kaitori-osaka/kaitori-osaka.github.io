/* お申込み状況（お客様）
   メールアドレスを入れる → 届いたメールのボタンを押す → このページでお申込みが見られる（パスワードなし）。
   見られるのは、そのメールアドレスで申し込んだものだけ（データベース側で制限）。 */
(function(){
  if(!window.API) return;
  var SS = API.store('kd-portal', true), SESS = SS.get();
  var $ = function(id){ return document.getElementById(id); };
  var KIND = { shop: '店頭買取（来店予約）', visit: '出張買取', photo: '写真査定', takuhai: '宅配買取' };
  var ST = { new: '受付済み', contacted: 'ご連絡済み', scheduled: '日時確定', kit_sent: 'キット発送済み', arrived: 'お品物到着',
             appraised: '金額をご確認ください', accepted: 'ご成約', declined: '見送り', done: '完了', cancelled: '取消' };
  var FLOW = {
    shop: ['new', 'contacted', 'scheduled', 'done'],
    visit: ['new', 'contacted', 'scheduled', 'accepted', 'done'],
    photo: ['new', 'appraised', 'accepted', 'done'],
    takuhai: ['new', 'kit_sent', 'arrived', 'appraised', 'accepted', 'done']
  };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function yen(n){ return Number(n).toLocaleString('ja-JP') + '円'; }
  function dt(s, withTime){ if(!s) return ''; var d = new Date(s); return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) + (withTime ? ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''); }
  function say(el, t, cls){ $(el).innerHTML = t ? '<p class="msg ' + (cls || 'bad') + '">' + t + '</p>' : ''; }

  // ── ログイン ──
  $('loginForm').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var m = $('lmail').value.trim(); if(!m) return;
    var b = ev.target.querySelector('button'); b.disabled = true;
    try{
      await API.call('portalLink', { email: m });
      say('loginMsg', m + ' あてに確認用のメールをお送りしました。メールのアドレスを開いてください（有効期限は1時間です）。届かない場合は、お申込みのときのメールアドレスか、迷惑メールのフォルダをご確認ください。', 'ok');
    }catch(e){ say('loginMsg', e.message); }
    b.disabled = false;
  });
  $('logout').addEventListener('click', function(){ SS.set(null); location.reload(); });

  async function start(){
    if(!API.configured){ say('stMsg', '受付システムが接続されていません。お電話でお問い合わせください。'); $('login').hidden = true; return; }
    var m = /[#&]t=([0-9a-f]+)/.exec(location.hash);
    if(m){
      try{ history.replaceState(null, '', location.pathname); }catch(e){ location.hash = ''; }
      try{ SESS = await API.call('portalEnter', { t: m[1] }); SS.set(SESS); }catch(e){ say('loginMsg', e.message); }
    }
    if(!SESS) return;
    $('login').hidden = true; $('me').hidden = false; $('meMail').textContent = SESS.email + ' でお申込みの内容';
    try{ await load(); }catch(e){ if(e.code === 'auth'){ SS.set(null); SESS = null; $('login').hidden = false; $('me').hidden = true; } say('stMsg', e.message); }
  }

  var ALL = [];
  async function load(){
    ALL = await API.call('portalCases', { s: SESS.s });
    if(!ALL.length){ $('cases').innerHTML = '<p class="note blue">このメールアドレスでのお申込みは見つかりませんでした。お申込みのときと同じメールアドレスかご確認ください。<br><a href="apply.html">新しく申し込む</a></p>'; return; }
    $('cases').innerHTML = ALL.map(card).join('');
  }

  function card(c){
    var flow = FLOW[c.kind], idx = flow.indexOf(c.status);
    if(c.status === 'declined' || c.status === 'cancelled') idx = -1;
    var pill = c.status === 'appraised' ? 'go' : (c.status === 'accepted' || c.status === 'done') ? 'ok' : (c.status === 'declined' || c.status === 'cancelled') ? 'end' : '';
    var h = '<article class="case" data-case="' + c.id + '"><div class="top"><div><b>' + KIND[c.kind] + '</b><br><small>受付番号 ' + esc(c.receiptNo) + '・' + dt(c.createdAt) + '</small></div><span class="pill ' + pill + '">' + ST[c.status] + '</span></div>';
    if(idx >= 0) h += '<ol class="track" aria-label="進み具合">' + flow.map(function(s, i){ return '<li class="' + (i <= idx ? 'on' : '') + '" title="' + ST[s] + '"></li>'; }).join('') + '</ol>';
    if(c.wishes && !c.scheduledAt && (c.kind === 'shop' || c.kind === 'visit')) h += '<p><small>ご希望：' + esc(c.wishes) + '</small></p>';
    if(c.scheduledAt) h += '<p><b>' + (c.kind === 'visit' ? 'ご訪問' : 'ご来店') + 'の日時：</b>' + dt(c.scheduledAt, true) + '</p>';
    if(c.kitTracking) h += '<p><b>宅配キットの追跡番号：</b>' + esc(c.kitTracking) + '</p>';
    if(c.items && c.items.length) h += '<p><small>お品物：' + esc(c.items.join('、')) + '</small></p>';

    // 金額のご提示
    var hasPrice = c.finalAmount != null || c.estimateLow != null;
    if(hasPrice && (c.status === 'appraised' || c.answer)){
      var price = c.finalAmount != null ? yen(c.finalAmount) : (c.estimateHigh && c.estimateHigh !== c.estimateLow ? yen(c.estimateLow) + ' 〜 ' + yen(c.estimateHigh) : yen(c.estimateLow));
      h += '<div class="note blue" style="margin-top:12px"><p>' + (c.finalAmount != null ? '査定金額' : 'おおよその買取金額') + '</p><p class="price">' + price + '</p>'
        + (c.estimateNote ? '<p style="white-space:pre-wrap;margin-top:6px">' + esc(c.estimateNote) + '</p>' : '')
        + (c.kind === 'photo' ? '<p style="margin-top:6px"><small>写真からの目安です。実物を拝見して正式な金額をお伝えします。</small></p>' : '');
      if(c.status === 'appraised')
        h += '<div class="actions"><button class="btn primary" data-answer="accept">' + (c.kind === 'photo' ? 'この金額なら売りたい' : 'この金額で売る') + '</button><button class="btn ghost" data-answer="decline">今回は見送る</button></div>';
      else if(c.answer) h += '<p style="margin-top:8px"><b>' + (c.answer === 'accept' ? 'ご同意いただきました。担当者からご連絡します。' : '見送りを承りました。') + '</b></p>';
      h += '</div>';
    }

    // 宅配：本人確認
    if(c.kind === 'takuhai' && c.idStatus === 'none' && ['cancelled', 'declined', 'done'].indexOf(c.status) < 0)
      h += '<div class="note" style="margin-top:12px"><b>ご本人確認の書類をお送りください</b><p>運転免許証・マイナンバーカード（顔写真の面のみ）・パスポートなどの画像を送ってください。両面ある身分証は表と裏の両方をお願いします。</p>'
        + '<input type="file" accept="image/*" multiple hidden data-idfile><div class="actions"><button class="btn blue small" data-idpick>身分証の画像を選ぶ・撮る</button></div><div data-idmsg></div></div>';
    if(c.kind === 'takuhai' && c.idStatus !== 'none') h += '<p style="margin-top:8px"><small>ご本人確認の書類：' + (c.idStatus === 'verified' ? '確認済み' : '受け取りました（確認中）') + '</small></p>';

    // 連絡
    var ms = c.messages || [];
    h += '<details style="margin-top:12px"' + (ms.some(function(m){ return m.sender === 'staff'; }) ? ' open' : '') + '><summary><b>担当者との連絡（' + ms.length + '件）</b></summary><div class="thread">'
      + ms.map(function(m){ return '<div class="bubble ' + m.sender + '">' + esc(m.body) + '<time>' + (m.sender === 'staff' ? '担当者・' : m.sender === 'customer' ? 'あなた・' : '') + dt(m.at, true) + '</time></div>'; }).join('')
      + '</div><div class="f" style="margin-top:10px"><textarea maxlength="2000" placeholder="担当者へのご連絡（ご都合の日時、追加のお品物など）" data-body></textarea></div><button class="btn blue small" data-send>送る</button></details>';
    return h + '</article>';
  }

  document.addEventListener('click', async function(ev){
    var t = ev.target.closest('button'); if(!t) return;
    var art = t.closest('[data-case]'); if(!art) return;
    var id = art.dataset.case;
    if(t.dataset.answer){
      var ok = t.dataset.answer === 'accept' ? confirm('この金額で進めます。よろしいですか？') : confirm('今回は見送ります。よろしいですか？');
      if(!ok) return;
      t.disabled = true;
      try{ await API.call('portalAnswer', { s: SESS.s, app: id, answer: t.dataset.answer }); await load(); say('stMsg', 'ご回答を承りました。担当者からご連絡します。', 'ok'); }
      catch(e){ say('stMsg', e.message); t.disabled = false; }
    }
    if(t.hasAttribute('data-send')){
      var ta = art.querySelector('[data-body]'), b = ta.value.trim(); if(!b) return;
      t.disabled = true;
      try{ await API.call('portalSend', { s: SESS.s, app: id, body: b }); await load(); say('stMsg', '担当者へお送りしました。', 'ok'); }
      catch(e){ say('stMsg', e.message); t.disabled = false; }
    }
    if(t.hasAttribute('data-idpick')) art.querySelector('[data-idfile]').click();
  });
  document.addEventListener('change', async function(ev){
    if(!ev.target.hasAttribute('data-idfile')) return;
    var art = ev.target.closest('[data-case]'), box = art.querySelector('[data-idmsg]'), id = art.dataset.case;
    var files = Array.prototype.slice.call(ev.target.files || []).slice(0, 4); ev.target.value = '';
    if(!files.length) return;
    box.innerHTML = '<p class="msg warn">送っています…</p>';
    var n = 0;
    var lastErr = '';
    for(var i = 0; i < files.length; i++){
      try{ var data = await API.shrink(files[i], 2000); await API.call('portalId', { s: SESS.s, app: id, n: i + 1, data: data, last: i === files.length - 1 && n === i }); n++; }catch(e){ lastErr = e.message; }
    }
    if(n === files.length){ await load(); say('stMsg', '身分証の画像を受け取りました（' + n + '枚）。担当者が確認します。', 'ok'); }
    else box.innerHTML = '<p class="msg bad">' + n + ' / ' + files.length + ' 枚しか送れませんでした。' + esc(lastErr) + ' もう一度お送りください。</p>';
  });

  window.addEventListener('hashchange', function(){ if(/t=/.test(location.hash)) start(); });
  start();
})();
