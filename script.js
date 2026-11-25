// أكاديمية اقرأ وارق — سكربت الصفحة (لا يتصل بأي خادم، ولا يجمع أي بيانات)
(function () {
  'use strict';
  var msg = encodeURIComponent('السلام عليكم، أرغب في حجز الحصة التجريبية في أكاديمية اقرأ وارق.');
  var url = 'https://wa.me/96875542204?text=' + msg;
  var links = document.querySelectorAll('.wa-link');
  for (var i = 0; i < links.length; i++) {
    links[i].href = url;
    links[i].target = '_blank';
    links[i].rel = 'noopener noreferrer';
  }
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
