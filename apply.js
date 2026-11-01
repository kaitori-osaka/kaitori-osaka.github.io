/* お申込みフォーム：方法の切替、写真の縮小と送信、受付番号の表示 */
(function(){
  var C = window.SHOP_CONFIG || {}, MAX = C.maxPhotos || 6;
  var f = document.getElementById('applyForm'); if(!f) return;
  var msg = document.getElementById('formMsg'), btn = document.getElementById('submitBtn');
  var photos = [];   // data URL

  function kind(){ var r = f.querySelector('input[name=kind]:checked'); return r ? r.value : ''; }
  function sync(){
    var k = kind();
    f.querySelectorAll('[data-show]').forEach(function(el){
      var on = !!k && el.dataset.show.split(' ').indexOf(k) >= 0;
      el.hidden = !on;
    });
    var wl = document.getElementById('wishLegend'); if(wl) wl.textContent = k === 'visit' ? 'ご訪問の希望日時' : 'ご来店の希望日時';
  }
  var Q = new URLSearchParams(location.search), q = Q.get('t');
  // 紹介元（/ref-○○/ ページから来た場合）。端末に覚えておき、別のページを経由しても引き継ぐ
  var REF = Q.get('ref') || '';
  try{ if(REF) sessionStorage.setItem('kd-ref', REF); else REF = sessionStorage.getItem('kd-ref') || ''; }catch(e){}
  var REFNAME = (window.REF_NAMES || {})[REF] || '';
  if(REFNAME){ var rb = document.getElementById('refBadge'); if(rb){ rb.hidden = false; document.getElementById('refName').textContent = REFNAME; } }
  if(REFNAME){ var rx = document.getElementById('refExtra'); if(rx) rx.hidden = false; }
  // 紹介元に、担当者名・紹介コード（任意）を添えて記録する（例：エリッツ／担当 山田／コード A123）
  function refText(){
    if(!REFNAME) return '';
    var st = (val('refStaff') || '').trim().slice(0, 15), cd = (val('refCode') || '').trim().slice(0, 15);
    return REFNAME + (st ? '／担当 ' + st : '') + (cd ? '／コード ' + cd : '');
  }
  // 紹介元によっては受け付けない買取方法（店頭・出張）があるので、選択肢から外す
  ((window.REF_EXCLUDE || {})[REF] || []).forEach(function(v){
    var x = f.querySelector('input[name=kind][value="' + v + '"]'); if(!x) return;
    x.checked = false; x.disabled = true; var lb = x.closest('label'); if(lb) lb.hidden = true;
    if(q === v) q = '';
  });
  if(q){ var r0 = f.querySelector('input[name=kind][value="' + q + '"]'); if(r0) r0.checked = true; }
  // 専用プランのある紹介元（KIYOMICHI など）：宅配買取のみ、A／B を選ぶ
  // 紹介元のお客様は、宅配買取を A／B の2つのプランで受け付ける（KIYOMICHI はプランのみ）
  var PQ = Q.get('plan');
  var PLANMODE = !!(window.REF_PLANS || {})[REF] || (!!REFNAME && (PQ === 'matome' || PQ === 'kodaka'));
  if(REFNAME && !PLANMODE){
    var tx = f.querySelector('input[name=kind][value=takuhai]');
    if(tx){ tx.checked = false; tx.disabled = true; var tl = tx.closest('label'); if(tl){ tl.hidden = true;
      var nt = document.createElement('p'); nt.className = 'hint'; nt.style.marginTop = '10px';
      var u = '?t=takuhai&ref=' + encodeURIComponent(REF) + '&plan=';
      nt.innerHTML = '宅配買取は、ご紹介のお客様専用の <a href="' + u + 'matome">A おまとめ簡易買取</a> か <a href="' + u + 'kodaka">B 30%高価買取</a> からお申し込みください。';
      tl.parentNode.appendChild(nt); } }
    if(q === 'takuhai') q = '';
  }
  function plan(){ var r = f.querySelector('input[name=plan]:checked'); return r ? r.value : ''; }
  function pre(){ return plan() === 'kodaka' && f.elements.preEst.checked; }
  function syncPlan(){
    if(!PLANMODE) return;
    var pl = plan();
    document.getElementById('preBox').hidden = pl !== 'kodaka';
    document.getElementById('kitField').hidden = !pl;
    document.getElementById('photoField').hidden = !pre();
    var t = document.querySelector('#photoField .lb'); if(t) t.firstChild.textContent = '仮査定用の写真';
    btn.textContent = pl === 'matome' ? 'A おまとめ簡易買取で申し込む' : pl === 'kodaka' ? 'B 30%高価買取で申し込む' : 'この内容で申し込む';
  }
  if(PLANMODE){
    var tk = f.querySelector('input[name=kind][value=takuhai]'); if(tk) tk.checked = true;
    document.getElementById('kindBox').hidden = true;
    document.getElementById('planBox').hidden = false;
    document.getElementById('bankBox').hidden = false;
    f.elements.kitBoxes.value = '0';   // 提携先プランは「手持ちの箱で送る」を最初に選んでおく
    var pq = PQ; if(pq){ var rp = f.querySelector('input[name=plan][value="' + pq + '"]'); if(rp) rp.checked = true; }
  }
  f.addEventListener('change', function(ev){ if(ev.target.name === 'kind') sync(); syncPlan(); guide(); });
  f.addEventListener('input', function(){ guide(); });
  sync(); syncPlan();

  // ── 今どこ・次に何をするか ──
  // 上から順に、まだ終わっていない最初の項目を「次にすること」として出す
  function todo(){
    var k = kind(), em = val('email');
    if(PLANMODE ? !plan() : !k) return [1, PLANMODE ? 'A（おまとめ）か B（30%高価買取）を選んでください' : 'ご希望の方法（店頭・出張・写真・宅配）を1つ選んでください', PLANMODE ? 'planBox' : 'kindBox'];
    if(!val('name')) return [2, 'お名前を入力してください', 'fsCustomer'];
    if(val('phone').replace(/[^0-9]/g, '').length < 10) return [2, '電話番号を入力してください', 'fsCustomer'];
    if((k === 'photo' || k === 'takuhai') && !em) return [2, 'メールアドレスを入力してください（結果をお知らせします）', 'fsCustomer'];
    if((k === 'visit' || k === 'takuhai') && !val('address')) return [2, 'ご住所を入力してください', 'fsCustomer'];
    if((k === 'photo' || (PLANMODE && pre())) && photos.length === 0) return [3, '「写真を選ぶ・撮る」を押して、お品物の写真を選んでください', 'fsItems'];
    if(!f.elements.adult.checked || !f.elements.consent.checked) return [4, '「18歳以上です」と「個人情報の取扱いに同意します」にチェックを入れてください', 'fsLast'];
    return [4, 'いちばん下の赤いボタン「' + btn.textContent + '」を押してください', 'fsLast'];
  }
  var G = document.getElementById('guide'), GN = document.getElementById('gNext'), lastSec = '';
  function guide(doneAll){
    if(!G) return;
    var t = doneAll ? [5, '受付完了です。下の「次にすること」をご覧ください', ''] : todo();
    G.querySelectorAll('[data-g]').forEach(function(li){ var n = Number(li.dataset.g); li.classList.toggle('gok', n < t[0]); li.classList.toggle('gon', n === t[0]); });
    GN.textContent = t[1];
    f.querySelectorAll('.fs.now').forEach(function(x){ x.classList.remove('now'); });
    var sec = t[2] && document.getElementById(t[2]); if(sec && !doneAll) sec.classList.add('now');
    lastSec = t[2];
  }
  if(G){
    G.addEventListener('click', function(ev){
      var li = ev.target.closest('[data-g]'); if(!li) return;
      var id = { 1: PLANMODE ? 'planBox' : 'kindBox', 2: 'fsCustomer', 3: 'fsItems', 4: 'fsLast' }[li.dataset.g];
      var el = id && document.getElementById(id); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    GN.parentNode.style.cursor = 'pointer';
    GN.parentNode.addEventListener('click', function(){ var el = lastSec && document.getElementById(lastSec); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  guide();
  // 日付は今日以降
  var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  f.querySelectorAll('input[type=date]').forEach(function(d){ d.min = today; });

  // ── 写真 ──
  var input = document.getElementById('photos'), thumbs = document.getElementById('thumbs');
  document.getElementById('pickPhotos').addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', async function(){
    var files = Array.prototype.slice.call(input.files || []); input.value = '';
    for(var i = 0; i < files.length && photos.length < MAX; i++){
      if(files[i].size > (C.maxPhotoMB || 10) * 1048576){ say('写真「' + files[i].name + '」が大きすぎます', 'bad'); continue; }
      photos.push(await API.shrink(files[i], 1600));
    }
    if(files.length && photos.length >= MAX) say('写真は' + MAX + '枚までです', 'warn');
    draw(); guide();
  });
  function draw(){
    thumbs.innerHTML = '';
    photos.forEach(function(p, i){
      var fg = document.createElement('figure');
      fg.innerHTML = '<img alt="選んだ写真 ' + (i + 1) + '"><button type="button" aria-label="写真 ' + (i + 1) + ' を外す">×</button>';
      fg.querySelector('img').src = p;
      fg.querySelector('button').onclick = function(){ photos.splice(i, 1); draw(); guide(); };
      thumbs.appendChild(fg);
    });
  }
  function say(t, cls){ msg.innerHTML = t ? '<p class="msg ' + (cls || 'bad') + '">' + t + '</p>' : ''; }
  function val(n){ var el = f.elements[n]; return el ? String(el.value || '').trim() : ''; }

  f.addEventListener('submit', async function(ev){
    ev.preventDefault(); say('');
    var k = kind();
    var problems = [];
    if(!k) problems.push('ご希望の方法を選んでください');
    if(!val('name')) problems.push('お名前を入力してください');
    if(val('phone').replace(/[^0-9]/g, '').length < 10) problems.push('電話番号を正しく入力してください');
    var em = val('email');
    if((k === 'photo' || k === 'takuhai') && !em) problems.push('メールアドレスを入力してください');
    if(em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) problems.push('メールアドレスを正しく入力してください');
    if((k === 'visit' || k === 'takuhai') && !val('address')) problems.push('ご住所を入力してください');
    if(k === 'photo' && photos.length === 0) problems.push('写真を1枚以上選んでください');
    if(PLANMODE && !plan()) problems.push('A（おまとめ簡易買取）か B（30%高価買取）を選んでください');
    if(PLANMODE && pre() && photos.length === 0) problems.push('仮査定をご希望の場合は、写真を1枚以上選んでください');
    var bk = '';
    if(PLANMODE){
      var bn = val('bkName'), bb = val('bkBranch'), bno = val('bkNo').replace(/[^0-9]/g, ''), bh = val('bkHolder');
      if(bn || bb || bno || bh){
        if(!bn || !bb || bno.length < 6 || !bh) problems.push('お振込先は、金融機関名・支店名・口座番号・名義をすべてご記入ください（後から登録することもできます）');
        bk = bn + ' ' + bb + ' ' + ((f.querySelector('[name=bkType]:checked') || {}).value || '普通') + ' ' + bno + ' ' + bh;
      }
    }
    if(!f.elements.adult.checked) problems.push('18歳以上であることをご確認ください');
    if(!f.elements.consent.checked) problems.push('個人情報の取扱いへの同意が必要です');
    if(problems.length){ say(problems.join('<br>')); msg.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    var wishes = [], ds = f.querySelectorAll('[name=wdate]'), ss = f.querySelectorAll('[name=wslot]');
    if(k === 'shop' || k === 'visit') ds.forEach(function(d, i){ if(d.value) wishes.push({ date: d.value, slot: ss[i].value || '' }); });
    var p = {
      kind: k, name: val('name'), kana: val('kana'), phone: val('phone'), email: em,
      postal: (k === 'visit' || k === 'takuhai') ? val('postal') : '', address: (k === 'visit' || k === 'takuhai') ? val('address') : '',
      contactPref: (f.querySelector('[name=contactPref]:checked') || {}).value || 'phone',
      items: Array.prototype.map.call(f.querySelectorAll('[name=items]:checked'), function(c){ return c.value; }),
      itemNote: val('itemNote'), quantity: (k === 'visit' || k === 'takuhai') ? val('quantity') : '',
      kitBoxes: k === 'takuhai' ? Number(val('kitBoxes')) : null,
      wishes: wishes, howFound: val('howFound'), website: val('website'),
      adult: true, consent: true, photoCount: (PLANMODE && !pre()) ? 0 : photos.length, ref: refText(),
      plan: PLANMODE ? plan() : '', preEst: PLANMODE ? pre() : false, bank: bk
    };

    if(!window.API || !API.configured){ say('受付システムが接続されていないため、送信されていません。お手数ですがお電話（' + (C.tel || '') + '）でお申込みください。'); return; }
    btn.disabled = true; btn.textContent = '送信しています…';
    var r;
    try{ r = await API.call('submit', { p: p }); }
    catch(e){ btn.disabled = false; btn.textContent = 'この内容で申し込む'; say(e.message || '送信できませんでした'); return; }

    var okN = 0;
    if(PLANMODE && !pre()) photos = [];
    if(photos.length){
      btn.textContent = '写真を送っています…';
      for(var i = 0; i < photos.length; i++){
        btn.textContent = '写真を送っています…（' + (i + 1) + ' / ' + photos.length + '）';
        try{ await API.call('upload', { token: r.uploadToken, n: i + 1, data: photos[i] }); okN++; }catch(e){}
      }
      try{ await API.call('uploadDone', { token: r.uploadToken }); }catch(e){}
    }
    finish(r, k, okN, photos.length, !!em, PLANMODE ? plan() : '', !!bk, Number(val('kitBoxes')) || 0);
  });

  // 受付のあと、お客様が順番にすること
  function nextList(k, pl, hasMail, hasBank, kitN, total){
    var L = [];
    var st = hasMail ? '「お申込み状況」のページ' : 'お電話';
    if(k === 'shop') L = ['担当者からのご連絡をお待ちください（予約の前でも、営業時間内ならご来店いただけます）', 'ご来店の日は、お品物と顔写真付きの身分証をお持ちください'];
    else if(k === 'visit') L = ['訪問の日時を決めるため、担当者からお電話します', '当日は、顔写真付きの身分証をご用意ください'];
    else if(k === 'photo') L = ['査定の結果をメールでお知らせします。しばらくお待ちください', 'メールが届いたら「お申込み状況」のページで金額を確かめ、ボタンでお答えください'];
    else if(pl){
      L.push('「お申込み状況」のページで、身分証の画像を送ってください');
      if(!hasBank) L.push('同じページで、お振込先の口座を登録してください');
      if(pl === 'kodaka' && total) L.push('仮査定の結果をメールでお知らせします。ページで確かめてお答えください');
      L.push((kitN ? '宅配キットが届いたら、' : '') + 'お品物を箱に詰め、受付番号とお名前のメモを入れて、着払いで送ってください');
      L.push('送ったら、ページの「発送しました」ボタンを押してください');
      L.push('査定の結果をメールでお知らせします。ページで金額を確かめ、ボタンでお答えください');
    } else L = ['「お申込み状況」のページで、身分証の画像を送ってください', '宅配キットが届いたら、お品物を詰めて送ってください', '査定の結果をメールでお知らせします。ページで金額を確かめ、ボタンでお答えください'];
    return '<div class="note blue" style="margin-top:14px;text-align:left"><b style="font-size:1.1rem">次にすること</b><ol style="margin:8px 0 0;padding-left:1.4em;display:grid;gap:6px;font-size:1.05rem">' + L.map(function(x){ return '<li>' + x + '</li>'; }).join('') + '</ol>'
      + '<p style="margin-top:8px"><small>' + (hasMail ? '進み具合は「お申込み状況」のページで、メールアドレス、またはお名前と電話番号でいつでも確かめられます。' : '進み具合は「お申込み状況」のページで、お名前と電話番号で確かめられます。') + '</small></p></div>';
  }
  function finish(r, k, okN, total, hasMail, pl, hasBank, kitN){
    var next = {
      shop: 'ご希望の日時を確認して、担当者からご連絡します。予約の確定前でも、営業時間内ならいつでもご来店いただけます。',
      visit: '訪問の日時を決めるため、担当者からお電話します。',
      photo: '写真を確認して、おおよその金額をメールでお知らせします。',
      takuhai: '宅配キットとご本人確認のご案内を、メールでお送りします。'
    }[k];
    if(pl && kitN && !(pl === 'kodaka' && total))
      next = '<b>ご希望の宅配キット（' + kitN + '箱）を準備でき次第お送りし、メールでお知らせします。</b>キットが届いたら、お品物を詰めて着払いでお送りください。'
        + '</p><div class="note blue" style="margin-top:8px;text-align:left">' + (window.SEND_TO_HTML || '') + '<br>箱の中に、<b>受付番号「' + r.receiptNo + '」とお名前</b>を書いたメモを入れてください。</div><p>';
    else if(pl === 'matome' || (pl === 'kodaka' && !total))
      next = '<b>お品物を箱に詰めて、着払いで次のあてにお送りください。</b>' + (pl === 'matome' ? '仮査定はありません。' : '')
        + '</p><div class="note blue" style="margin-top:8px;text-align:left">' + (window.SEND_TO_HTML || '') + '<br>箱の中に、<b>受付番号「' + r.receiptNo + '」とお名前</b>を書いたメモを入れてください。</div>'
        + '<p style="margin-top:8px">到着後に査定し、' + (pl === 'matome' ? 'おまとめ価格' : '通常の査定額に30%上乗せした買取価格（貴金属・商品券は上乗せの対象外です）') + 'をメールでお知らせします。'
        + (pl === 'matome' ? '価格がつかなかったお品物も、処分費などは一切かかりません。' : '');
    else if(pl === 'kodaka') next = '写真で仮査定を行い、結果をメールでお知らせします。仮査定をご確認いただいてから、お品物をお送りください。';
    if(pl) next += '</p><p style="margin-top:8px"><b>次にお願いすること：</b>「お申込み状況」のページで、身分証の画像を送ってください' + (hasBank ? '。' : '。あわせて、お振込先の口座もご登録ください。');
    var d = document.getElementById('done');
    d.innerHTML = '<h2>お申込みを受け付けました</h2><p style="margin-top:8px">受付番号</p><p class="no">' + r.receiptNo + '</p>'
      + '<p style="margin-top:12px">' + next + '</p>'
      + nextList(k, pl, hasMail, hasBank, kitN, total)
      + (total ? '<p class="msg ' + (okN === total ? 'ok' : 'warn') + '">写真 ' + okN + ' / ' + total + ' 枚を送りました' + (okN < total ? '。届かなかった写真は「お申込み状況」の連絡欄からお知らせください' : '') + '</p>' : '')
      + (hasMail ? '<p style="margin-top:8px">確認のメールをお送りしました。届かない場合は、迷惑メールのフォルダもご確認ください。</p>' : '')
      + '<div class="actions"><a class="btn blue" href="status.html">お申込み状況を見る</a>' + '<a class="btn ghost" href="index.html">トップへ戻る</a></div>';
    f.hidden = true; d.hidden = false; guide(true); d.scrollIntoView({ behavior: 'smooth' });
  }
})();
