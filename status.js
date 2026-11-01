/* お申込み状況（お客様）
   メールアドレスを入れる → 届いたメールのボタンを押す → このページでお申込みが見られる（パスワードなし）。
   見られるのは、そのメールアドレスで申し込んだものだけ（データベース側で制限）。 */
(function(){
  if(!window.API) return;
  var SS = API.store('kd-portal', true), SESS = SS.get();
  var $ = function(id){ return document.getElementById(id); };
  var KIND = { shop: '店頭買取（来店予約）', visit: '出張買取', photo: '写真査定', takuhai: '宅配買取' };
  var ST = { new: '受付済み', contacted: 'ご連絡済み', scheduled: '日時確定', kit_sent: 'キット発送済み', arrived: 'お品物到着',
             appraised: '金額をご確認ください', accepted: 'ご成約', declined: '見送り', done: '完了', cancelled: '取消',
             pre_appraised: '仮査定をご確認ください', waiting: 'お品物の発送をお待ちしています', shipped: '発送済み（到着待ち）', paid: 'お振込み済み' };
  var PLAN = { matome: 'A おまとめ簡易買取', kodaka: 'B 提携先ご紹介 30%高価買取' };
  // 提携先プランの流れ（お客様に見せる手順）
  var PFLOW = {
    matome: [['waiting', 'お品物を着払いで発送'], ['shipped', '発送済み'], ['arrived', '当店に到着・査定中'], ['appraised', 'おまとめ価格のご確認'], ['accepted', 'ご同意'], ['paid', 'お振込み']],
    kodaka: [['waiting', 'お品物を着払いで発送'], ['shipped', '発送済み'], ['arrived', '当店に到着・査定中'], ['appraised', '買取価格のご確認'], ['accepted', 'ご同意'], ['paid', 'お振込み']],
    kodaka_pre: [['new', '写真で仮査定中'], ['pre_appraised', '仮査定のご確認'], ['waiting', 'お品物を着払いで発送'], ['shipped', '発送済み'], ['arrived', '当店に到着・査定中'], ['appraised', '買取価格のご確認'], ['accepted', 'ご同意'], ['paid', 'お振込み']]
  };
  var FLOW = {
    shop: ['new', 'contacted', 'scheduled', 'done'],
    visit: ['new', 'contacted', 'scheduled', 'accepted', 'done'],
    photo: ['new', 'appraised', 'accepted', 'done'],
    takuhai: ['new', 'kit_sent', 'arrived', 'appraised', 'accepted', 'done']
  };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // お品物の内訳（商品番号・商品名・点数・買取価格／おまとめ）
  function linesHtml(c){
    var L = c.lines || []; if(!L.length) return '';
    var mm = c.priceMode === 'matome' || c.priceMode === 'hybrid';
    return '<table class="lines-view"><thead><tr><th>番号</th><th>お品物</th><th>点数</th><th>買取価格</th></tr></thead><tbody>'
      + L.map(function(x){ return '<tr><td>' + esc(x.no) + '</td><td>' + esc(x.name) + (x.up === false ? '<br><small>（30%上乗せの対象外）</small>' : '') + '</td><td>' + esc(x.qty) + '</td><td>' + (mm && (c.priceMode === 'matome' || x.matome) ? 'おまとめ' : (x.price != null ? yen(x.price) : '―')) + '</td></tr>'; }).join('')
      + (mm && c.matomeAmount != null ? '<tr class="sum"><td colspan="3">おまとめ価格</td><td>' + yen(c.matomeAmount) + '</td></tr>' : '')
      + '</tbody></table>';
  }
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
  $('telForm').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var nm = $('tname').value.trim(), tl = $('ttel').value.trim(); if(!nm || !tl) return;
    var b = ev.target.querySelector('button'); b.disabled = true;
    try{ SESS = await API.call('portalByPhone', { name: nm, phone: tl }); SS.set(SESS); await start(); $('me').scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); }
    catch(e){ say('loginMsg', e.message); }
    b.disabled = false;
  });
  $('logout').addEventListener('click', function(){ SS.set(null); location.reload(); });
  // 更新ボタン（上と、画面の右下に常に表示）
  async function reload(){
    var bs = [$('reload'), $('reloadFab')]; bs.forEach(function(b){ if(b) b.disabled = true; });
    try{ await load(); say('stMsg', '最新の状況を表示しました', 'ok'); }catch(e){ say('stMsg', e.message); }
    bs.forEach(function(b){ if(b) b.disabled = false; });
  }
  $('reload').addEventListener('click', reload); $('reloadFab').addEventListener('click', reload);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && SESS && !$('me').hidden){ var ae = document.activeElement; if(!(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) load().catch(function(){}); } });

  async function start(){
    if(!API.configured){ say('stMsg', '受付システムが接続されていません。お電話でお問い合わせください。'); $('login').hidden = true; return; }
    var m = /[#&]t=([0-9a-f]+)/.exec(location.hash);
    if(m){
      try{ history.replaceState(null, '', location.pathname); }catch(e){ location.hash = ''; }
      try{ SESS = await API.call('portalEnter', { t: m[1] }); SS.set(SESS); }catch(e){ say('loginMsg', e.message); }
    }
    if(!SESS) return;
    $('login').hidden = true; $('me').hidden = false; $('reloadFab').hidden = false; $('meMail').textContent = (SESS.label || SESS.email) + ' のお申込みの内容';
    try{ await load(); }catch(e){ if(e.code === 'auth'){ SS.set(null); SESS = null; $('login').hidden = false; $('me').hidden = true; } say('stMsg', e.message); }
  }

  var ALL = [];
  async function load(){
    ALL = await API.call('portalCases', { s: SESS.s });
    if(!ALL.length){ $('cases').innerHTML = '<p class="note blue">このメールアドレスでのお申込みは見つかりませんでした。お申込みのときと同じメールアドレスかご確認ください。<br><a href="apply.html">新しく申し込む</a></p>'; return; }
    $('cases').innerHTML = ALL.map(card).join('');
    $('reloadAt').textContent = new Date().toTimeString().slice(0, 5) + ' 時点';
  }

  // 「いま」と「次にお客様がすること」
  function nowBox(c){
    var s = c.status, n = '', sub = '', end = false;
    var idNeed = c.kind === 'takuhai' && c.idStatus === 'none';
    if(s === 'declined' || s === 'cancelled'){ n = 'このお申込みは終了しています。'; end = true; }
    else if(s === 'done' || s === 'paid'){ n = 'お取引は完了しました。ご利用ありがとうございました。'; end = true; }
    else if(s === 'appraised' || s === 'pre_appraised'){ n = '下の金額を確かめて、ボタンでお答えください。'; }
    else if(c.kind === 'shop') n = s === 'scheduled' && c.scheduledAt ? dt(c.scheduledAt, true) + '　お品物と身分証を持ってご来店ください。' : '担当者からのご連絡をお待ちください。営業時間内なら予約の前でもご来店いただけます。';
    else if(c.kind === 'visit') n = s === 'scheduled' && c.scheduledAt ? dt(c.scheduledAt, true) + '　担当者が伺います。身分証をご用意ください。' : s === 'accepted' ? '担当者からのご連絡をお待ちください。' : '担当者から日時のご連絡（お電話）をお待ちください。';
    else if(c.kind === 'photo') n = s === 'accepted' ? '担当者から、売り方のご連絡をお待ちください。' : '写真で査定しています。結果をメールでお知らせします。';
    else if(c.plan){
      if(s === 'new') n = '写真で仮査定しています。結果をメールでお知らせします。';
      else if(s === 'waiting' || s === 'contacted' || s === 'kit_sent') n = (c.kitBoxes > 0 && !c.kitTracking) ? '宅配キットの到着をお待ちください。届いたら、お品物を詰めて着払いで送ってください。' : 'お品物を箱に詰めて着払いで送り、下の「発送しました」ボタンを押してください。';
      else if(s === 'shipped') n = 'お品物の到着をお待ちしています。届いたらお知らせします。';
      else if(s === 'arrived') n = '査定しています。結果をメールでお知らせします。';
      else if(s === 'accepted') n = c.bankSet ? 'ご登録の口座へのお振込みをお待ちください。' : '下の「お振込先の口座」を登録してください。';
    } else {
      if(s === 'kit_sent') n = '宅配キットが届いたら、お品物を詰めて送ってください。';
      else if(s === 'arrived') n = '査定しています。結果をメールでお知らせします。';
      else if(s === 'accepted') n = 'お振込みのご案内をお待ちください。';
      else n = '宅配キットの発送をお待ちください。';
    }
    if(idNeed && !end) sub = 'あわせて、下の「ご本人確認の書類」から身分証の画像を送ってください（法律で必要です）。';
    return '<div class="nowbox' + (end ? ' end' : '') + '"><div class="now">いま：<b>' + (ST[s] || s) + '</b></div><div class="next">' + (end ? '' : '次にすること：') + n + (sub ? '<small>' + sub + '</small>' : '') + '</div></div>';
  }

  function card(c){
    if(c.plan) return planCard(c);
    var flow = FLOW[c.kind], idx = flow.indexOf(c.status);
    if(c.status === 'declined' || c.status === 'cancelled') idx = -1;
    var pill = c.status === 'appraised' ? 'go' : (c.status === 'accepted' || c.status === 'done') ? 'ok' : (c.status === 'declined' || c.status === 'cancelled') ? 'end' : '';
    var h = '<article class="case" data-case="' + c.id + '"><div class="top"><div><b>' + KIND[c.kind] + '</b><br><small>受付番号 ' + esc(c.receiptNo) + '・' + dt(c.createdAt) + '</small></div><span class="pill ' + pill + '">' + ST[c.status] + '</span></div>' + nowBox(c);
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
        + linesHtml(c) + (c.estimateNote ? '<p style="white-space:pre-wrap;margin-top:6px">' + esc(c.estimateNote) + '</p>' : '')
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

  function planCard(c){
    var key = c.plan === 'kodaka' && c.preEst ? 'kodaka_pre' : c.plan, steps = PFLOW[key] || PFLOW.matome;
    var order = steps.map(function(x){ return x[0]; });
    var idx = c.status === 'done' ? order.length : order.indexOf(c.status);
    if(c.status === 'contacted' || c.status === 'kit_sent') idx = order.indexOf('waiting');
    var closed = c.status === 'declined' || c.status === 'cancelled';
    var pill = (c.status === 'appraised' || c.status === 'pre_appraised' || c.status === 'waiting') ? 'go' : (c.status === 'accepted' || c.status === 'paid' || c.status === 'done') ? 'ok' : closed ? 'end' : '';
    var h = '<article class="case" data-case="' + c.id + '"><div class="top"><div><b>宅配買取・' + PLAN[c.plan] + '</b><br><small>受付番号 ' + esc(c.receiptNo) + '・' + dt(c.createdAt) + '</small></div><span class="pill ' + pill + '">' + (ST[c.status] || c.status) + '</span></div>' + nowBox(c);
    if(!closed){
      h += '<ol class="track" aria-label="進み具合">' + order.map(function(s, i){ return '<li class="' + (i <= idx ? 'on' : '') + '"></li>'; }).join('') + '</ol>';
      h += '<div class="flowbox"><b>お取引の流れ</b><ol>' + steps.map(function(x, i){ return '<li class="' + (i < idx ? 'done' : i === idx ? 'on' : '') + '">' + x[1] + (i === idx ? '　←いまここ' : '') + '</li>'; }).join('') + '</ol></div>';
    }
    // 仮査定
    if(c.estimateLow != null && (c.status === 'pre_appraised' || c.preEst)){
      var pr = c.estimateHigh && c.estimateHigh !== c.estimateLow ? yen(c.estimateLow) + ' 〜 ' + yen(c.estimateHigh) : yen(c.estimateLow);
      h += '<div class="note blue" style="margin-top:12px"><p>仮査定（目安）</p><p class="price">' + pr + '</p>'
        + (c.status === 'pre_appraised' && c.estimateNote ? '<p style="white-space:pre-wrap;margin-top:6px">' + esc(c.estimateNote) + '</p>' : '')
        + '<p style="margin-top:6px"><small>写真からの目安です。お品物の到着後に本査定を行い、正式な金額をお知らせします。</small></p>';
      if(c.status === 'pre_appraised') h += '<div class="actions"><button class="btn primary" data-answer="accept">この内容でお品物を送る</button><button class="btn ghost" data-answer="decline">今回は見送る</button></div>';
      h += '</div>';
    }
    // 発送のご案内
    if(c.status === 'waiting' || c.status === 'contacted' || c.status === 'kit_sent' || (c.status === 'new' && !c.preEst)){
      if(c.kitBoxes > 0) h += '<p style="margin-top:12px"><b>宅配キット（' + c.kitBoxes + '箱）：</b>' + (c.kitTracking ? '発送しました（追跡番号 ' + esc(c.kitTracking) + '）。届いたら下の方法でお送りください。' : 'ただいま準備しています。発送したらメールでお知らせします。') + '</p>';
      h += '<div class="note" style="margin-top:12px"><b>お品物の送り方</b><ol style="margin:6px 0 0;padding-left:1.4em"><li>お品物を' + (c.kitBoxes > 0 ? '宅配キットの' : '') + '箱に詰める（箱の数はいくつでも）</li><li>箱の中に<b>受付番号「' + esc(c.receiptNo) + '」とお名前</b>を書いたメモを入れる</li><li>宅配便の<b>着払い</b>で次のあてに送る</li></ol>'
        + '<p style="margin-top:8px;white-space:pre-wrap">' + esc(c.sendTo) + '</p>'
        + '<div class="f" style="margin-top:10px"><label>送り状の追跡番号（わかれば）</label><input type="text" maxlength="40" inputmode="numeric" data-track></div>'
        + '<div class="actions"><button class="btn primary" data-ship>発送しました</button></div></div>';
    }
    if(c.status === 'shipped') h += '<p style="margin-top:10px">発送のご連絡を受け付けました' + (c.shipTracking ? '（追跡番号 ' + esc(c.shipTracking) + '）' : '') + '。到着しましたらお知らせします。</p>';
    if(c.arrivedAt && ['arrived'].indexOf(c.status) >= 0) h += '<p style="margin-top:10px">' + dt(c.arrivedAt) + 'にお品物が到着しました。ただいま査定しています。</p>';
    // 本査定の金額
    if(c.finalAmount != null && (c.status === 'appraised' || c.answer)){
      h += '<div class="note blue" style="margin-top:12px"><p>' + (c.plan === 'matome' ? 'おまとめ価格' : '買取価格（提携先ご紹介の高価買取）') + '</p><p class="price">' + yen(c.finalAmount) + '</p>'
        + (c.plan === 'kodaka' ? '<p><small>' + (c.baseAmount != null ? '通常の査定額 ' + yen(c.baseAmount) + '　' : '') + '※貴金属・商品券は30%上乗せの対象外です</small></p>' : '')
        + linesHtml(c) + (c.estimateNote ? '<p style="white-space:pre-wrap;margin-top:6px">' + esc(c.estimateNote) + '</p>' : '')
        + (c.plan === 'matome' ? '<p style="margin-top:6px"><small>価格がつかなかったお品物も、処分費などは一切かかりません（おまとめ買取として当店で処分いたします）。</small></p>' : '');
      if(c.status === 'appraised') h += '<div class="actions"><button class="btn primary" data-answer="accept">この金額で売る</button><button class="btn ghost" data-answer="decline">今回は見送る</button></div>';
      else if(c.answer) h += '<p style="margin-top:8px"><b>' + (c.answer === 'accept' ? 'ご同意いただきました。ご登録の口座へお振込みいたします。' : '見送りを承りました。担当者からご連絡します。') + '</b></p>';
      h += '</div>';
    }
    if(c.status === 'paid' || c.status === 'done') h += '<p style="margin-top:10px"><b>' + (c.paidAt ? dt(c.paidAt) + 'に' : '') + 'お振込みいたしました。</b>ご利用ありがとうございました。</p>';
    // 振込先
    if(!closed && ['paid', 'done'].indexOf(c.status) < 0){
      h += c.bankSet ? '<p style="margin-top:8px"><small>お振込先：登録済み（変更はお電話か下の連絡欄でお知らせください）</small></p>'
        : '<div class="note" style="margin-top:12px"><b>お振込先の口座をご登録ください</b><p><small>お申込みの方ご本人名義の口座に限ります。</small></p>'
          + '<div data-bk-form>' + KD_BANK.form('st' + c.id.slice(0, 6)) + '</div>'
          + '<div class="actions"><button class="btn blue small" data-bank>振込先を登録する</button></div></div>';
    }
    // 本人確認
    if(c.idStatus === 'none' && !closed && ['paid', 'done'].indexOf(c.status) < 0)
      h += '<div class="note" style="margin-top:12px"><b>ご本人確認の書類をお送りください</b><p>運転免許証・マイナンバーカード（顔写真の面のみ）・パスポートなどの画像を送ってください。両面ある身分証は表と裏の両方をお願いします。</p>'
        + '<input type="file" accept="image/*" multiple hidden data-idfile><div class="actions"><button class="btn blue small" data-idpick>身分証の画像を選ぶ・撮る</button></div><div data-idmsg></div></div>';
    if(c.idStatus !== 'none') h += '<p style="margin-top:8px"><small>ご本人確認の書類：' + (c.idStatus === 'verified' ? '確認済み' : '受け取りました（確認中）') + '</small></p>';
    var ms = c.messages || [];
    h += '<details style="margin-top:12px"' + (ms.some(function(m){ return m.sender === 'staff'; }) ? ' open' : '') + '><summary><b>担当者との連絡（' + ms.length + '件）</b></summary><div class="thread">'
      + ms.map(function(m){ return '<div class="bubble ' + m.sender + '">' + esc(m.body) + '<time>' + (m.sender === 'staff' ? '担当者・' : m.sender === 'customer' ? 'あなた・' : '') + dt(m.at, true) + '</time></div>'; }).join('')
      + '</div><div class="f" style="margin-top:10px"><textarea maxlength="2000" placeholder="担当者へのご連絡" data-body></textarea></div><button class="btn blue small" data-send>送る</button></details>';
    return h + '</article>';
  }

  document.addEventListener('click', async function(ev){
    var t = ev.target.closest('button'); if(!t) return;
    var art = t.closest('[data-case]'); if(!art) return;
    var id = art.dataset.case;
    if(t.dataset.answer){
      var isPre = (ALL.filter(function(x){ return x.id === id; })[0] || {}).status === 'pre_appraised';
      var ok = t.dataset.answer === 'accept' ? confirm(isPre ? 'この内容で、お品物を送る手続きに進みます。よろしいですか？' : 'この金額で進めます。よろしいですか？') : confirm('今回は見送ります。よろしいですか？');
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
    if(t.hasAttribute('data-ship')){
      if(!confirm('お品物を発送したことを当店に知らせます。よろしいですか？')) return;
      t.disabled = true;
      try{ await API.call('portalShip', { s: SESS.s, app: id, tracking: (art.querySelector('[data-track]') || {}).value || '' }); await load(); say('stMsg', '発送のご連絡を受け付けました。到着しましたらお知らせします。', 'ok'); }
      catch(e){ say('stMsg', e.message); t.disabled = false; }
    }
    if(t.hasAttribute('data-bank')){
      var BK = KD_BANK.read(art.querySelector('[data-bk-form]'));
      if(!BK.ok){ say('stMsg', '金融機関名・支店名・口座番号・名義をすべてご記入ください'); return; }
      if(!confirm('次の口座で登録します。よろしいですか？\n\n' + BK.text)) return;
      t.disabled = true;
      try{ await API.call('portalBank', { s: SESS.s, app: id, bank: BK.text }); await load(); say('stMsg', 'お振込先を登録しました。', 'ok'); }
      catch(e){ say('stMsg', e.message); t.disabled = false; }
    }
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
