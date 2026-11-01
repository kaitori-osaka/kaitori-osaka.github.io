/* 受付システム（Google Apps Script）との通信部品。
   接続先は config.js の endpoint（Apps Script の「ウェブアプリ」のアドレス）。
   送信は text/plain の POST（ブラウザの事前確認を起こさない方式）で、返事は {ok, data | error}。 */
(function(){
  var C = window.SHOP_CONFIG || {};
  var API = { url: C.endpoint || '', configured: !!C.endpoint };

  API.call = async function(action, data){
    if(!API.configured){ var e0 = new Error('受付システムが未接続です'); e0.code = 'unconfigured'; throw e0; }
    var r;
    try{ r = await fetch(API.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, data: data || {} }), redirect: 'follow' }); }
    catch(e){ var en = new Error('通信できませんでした。電波の状況をご確認ください'); en.code = 'network'; throw en; }
    var j = null; try{ j = await r.json(); }catch(e){}
    if(!j){ throw new Error('通信に失敗しました（' + r.status + '）'); }
    if(!j.ok){ var er = new Error(j.error || '処理に失敗しました'); if(/ログイン/.test(er.message)) er.code = 'auth'; throw er; }
    return j.data;
  };

  // ログインの保存（お客様は端末に残す／担当者は画面を閉じるまで）
  API.store = function(name, keep){
    var box = function(){ try{ return keep ? localStorage : sessionStorage; }catch(e){ return null; } };
    return {
      get: function(){ try{ return JSON.parse(box().getItem(name) || 'null'); }catch(e){ return null; } },
      set: function(v){ try{ v ? box().setItem(name, JSON.stringify(v)) : box().removeItem(name); }catch(e){} }
    };
  };

  // 画像を長い辺 maxPx の JPEG に縮めて data URL で返す（読めない形式はそのまま）
  API.shrink = function(file, maxPx){
    maxPx = maxPx || 1600;
    return new Promise(function(res){
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function(){
        var s = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        res(c.toDataURL('image/jpeg', .85));
      };
      img.onerror = function(){ URL.revokeObjectURL(u); var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.readAsDataURL(file); };
      img.src = u;
    });
  };

  window.API = API;

  // ── お振込先の入力（金融機関の種類・支店の種類・預金の種類を選べる） ──
  // 入力欄は data-bk="n|nk|b|bk|t|no|h" で見分ける。form() で HTML、read(root) で文字列と不足を返す
  var BK_KIND = ['銀行', '信用金庫', '信用組合', '労働金庫', '農業協同組合（JA）', '漁業協同組合', 'ゆうちょ銀行'];
  var BR_KIND = ['支店', '本店', '出張所', '営業部', '本所', '支所'];
  var BK_NAMES = ['三菱UFJ', '三井住友', 'みずほ', 'りそな', '関西みらい', '池田泉州', '京都', '南都', '紀陽', '大阪', '大阪シティ', '永和', '北おおさか', '尼崎', '近畿産業', 'PayPay', '楽天', '住信SBIネット', 'ソニー', 'auじぶん', 'イオン', 'セブン'];
  var opt = function(a){ return a.map(function(x){ return '<option>' + x + '</option>'; }).join(''); };
  window.KD_BANK = {
    form: function(id, optional){
      var o = optional ? '<span class="opt">任意</span>' : '';
      return '<div class="f bk-row"><label>金融機関名' + o + '</label><div class="bk-pair"><input type="text" maxlength="30" data-bk="n" list="' + id + '-names" placeholder="例：三菱UFJ" autocomplete="off"><select data-bk="nk" aria-label="金融機関の種類">' + opt(BK_KIND) + '</select></div>'
        + '<datalist id="' + id + '-names">' + opt(BK_NAMES) + '</datalist><p class="hint bk-yucho" hidden>ゆうちょ銀行は、通帳にある「振込用の店名（〇一八 など）」と「口座番号（7桁）」をご記入ください。</p></div>'
        + '<div class="f bk-row"><label>支店名' + o + '</label><div class="bk-pair"><input type="text" maxlength="30" data-bk="b" placeholder="例：天王寺"><select data-bk="bk" aria-label="支店の種類">' + opt(BR_KIND) + '</select></div></div>'
        + '<div class="f"><span class="lb">預金の種類</span><div class="choices">' + ['普通', '当座', '貯蓄'].map(function(x, i){ return '<label><input type="radio" name="' + id + '-t" data-bk="t" value="' + x + '"' + (i ? '' : ' checked') + '>' + x + '</label>'; }).join('') + '</div></div>'
        + '<div class="f"><label>口座番号' + o + '</label><input type="text" maxlength="8" inputmode="numeric" data-bk="no" placeholder="例：1234567"></div>'
        + '<div class="f"><label>口座名義（カタカナ）' + o + '</label><input type="text" maxlength="40" data-bk="h" placeholder="例：ヤマダ タロウ"></div>';
    },
    // 種類の選び直しで、ゆうちょの案内や「本店」の入力を切り替える
    sync: function(root){
      var q = function(k){ return root.querySelector('[data-bk="' + k + '"]'); };
      if(!q('nk')) return;
      var yu = q('nk').value === 'ゆうちょ銀行', y = root.querySelector('.bk-yucho');
      if(y) y.hidden = !yu;
      q('n').disabled = yu; q('bk').hidden = yu; q('n').placeholder = yu ? '（入力不要）' : '例：三菱UFJ';
      q('b').placeholder = yu ? '例：〇一八' : /本店|本所|営業部/.test(q('bk').value) ? '（そのままで結構です）' : '例：天王寺';
    },
    read: function(root){
      var q = function(k){ var e = root.querySelector('[data-bk="' + k + '"]' + (k === 't' ? ':checked' : '')); return e ? String(e.value || '').trim() : ''; };
      var nk = q('nk'), yu = nk === 'ゆうちょ銀行', n = q('n'), b = q('b'), bk = q('bk'), no = q('no').replace(/[^0-9]/g, ''), h = q('h');
      var nkShort = nk.replace(/（JA）/, '');
      var name = yu ? 'ゆうちょ銀行' : (n && (n.slice(-nkShort.length) === nkShort || /ＪＡ|JA|農協/.test(n) && /農業/.test(nk)) ? n : n + nkShort);
      var hasBk = BR_KIND.some(function(x){ return b.slice(-x.length) === x; });
      var br = yu ? b + (b && !/店$/.test(b) ? '店' : '') : !b && /本店|本所|営業部/.test(bk) ? bk : hasBk ? b : b + bk;
      var any = n || b || no || h, ok = (yu || n) && br && no.length >= 6 && h;
      return { any: !!any, ok: !!ok, text: name + ' ' + br + ' ' + (q('t') || '普通') + ' ' + no + ' ' + h };
    }
  };
  document.addEventListener('change', function(ev){ var r = ev.target.closest && ev.target.closest('[data-bk-form]'); if(r) KD_BANK.sync(r); });
})();
