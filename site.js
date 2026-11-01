/* 全ページ共通：メニューの開閉、試験運用の表示 */
(function(){
  var b = document.querySelector('.menu-btn'), d = document.getElementById('drawer');
  if(b && d) b.addEventListener('click', function(){ var o = d.hidden; d.hidden = !o; b.setAttribute('aria-expanded', String(o)); b.textContent = o ? '閉じる' : 'メニュー'; });
  var C = window.SHOP_CONFIG || {};
  if(C.mode === 'trial'){ var t = document.getElementById('trialBar'); if(t) t.hidden = false; }
})();
