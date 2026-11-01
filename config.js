/* 受付システムの接続設定（公開されるファイル）
   endpoint … Apps Script を「ウェブアプリ」として公開したときのアドレス（https://script.google.com/macros/s/…/exec）
   空の間は、申込は「送信されていません」と表示し、受付完了は表示しない。 */
window.SHOP_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbwQyX_pmC_RO3S_t9mIjiZb6iQ2MMZrLo_EXqyx1iV7C-HWqsc7uPl3rFSHa9TBsBn2ZQ/exec",
  // trial：試験運用（実在の情報を入力しないよう上部に表示）／live：本番運用
  //  本番に切り替えるときは、Apps Script のスクリプト プロパティ MODE も live にする
  mode: "trial",
  maxPhotos: 6,
  maxPhotoMB: 15,
  tel: "0120-933-496"
};
