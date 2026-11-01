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
})();
