// أكاديمية اقرأ وارق — المصحف المعلِّم
// النص: مصحف المدينة برواية حفص من مشروع تنزيل (عبر api.alquran.cloud، نسخة quran-uthmani) يُعرض كما هو دون أي تعديل — التلاوات: everyayah.com
// لا يُجمع أي بيانات؛ التقدّم يُحفظ في متصفح الطالب فقط.
(function () {
  'use strict';

  var API = 'https://api.alquran.cloud/v1';
  var AUDIO = 'https://everyayah.com/data/';
  var SITE = 'https://iqrawarq.com/mushaf.html';
  var EDITION = 'quran-uthmani';
  var BASMALA = null; // تُجلب حرفيًّا من المصدر (الفاتحة ١) ولا تُكتب يدويًّا

  var $ = function (id) { return document.getElementById(id); };

  // ---------- أدوات ----------
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('iw_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('iw_' + k, JSON.stringify(v)); } catch (e) { /* التخزين غير متاح */ } }
  };
  function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function pad3(n) { return ('00' + n).slice(-3); }
  function cmp(a, b) { return a[0] - b[0] || a[1] - b[1]; }
  function sname(name) { // اسم السورة بلا تشكيل ولا علامات قرآنية — لواجهة الموقع
    return String(name || '').replace(/^سُورَةُ\s*/, '').replace(/[ً-ٰٟۖ-ۭ]/g, '').replace(/ٱ/g, 'ا').trim();
  }
  function qname(name) { return String(name || '').replace(/^سُورَةُ\s*/, ''); }
  function today(off) { var d = new Date(); d.setDate(d.getDate() + (off || 0)); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  var JUZ = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون',
    'الحادي والعشرون', 'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون', 'الخامس والعشرون', 'السادس والعشرون', 'السابع والعشرون', 'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون'];


  // ---------- الحالة ----------
  var meta = null;          // {surahs:[{n,name,count}], pages:[[s,a]], juzs:[[s,a]]}
  var page = 1, ayahs = [], cache = {};
  var selIdx = -1, popRule = '';
  var prefs = store.get('prefs', { hide: false, qs: 0, rec: 'Husary_Muallim_128kbps', rep: '1', rate: '1' });

  // ---------- البيانات ----------
  function getJSON(url) {
    return fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { if (j.code !== 200) throw new Error('API'); return j.data; });
  }

  function loadMeta() {
    var m = store.get('meta1', null);
    if (m && m.surahs && m.surahs.length === 114) { meta = m; return Promise.resolve(m); }
    return getJSON(API + '/meta').then(function (d) {
      meta = {
        surahs: d.surahs.references.map(function (s) { return { n: s.number, name: s.name, count: s.numberOfAyahs }; }),
        pages: d.pages.references.map(function (r) { return [r.surah, r.ayah]; }),
        juzs: d.juzs.references.map(function (r) { return [r.surah, r.ayah]; })
      };
      store.set('meta1', meta);
      return meta;
    });
  }

  function findIdx(list, key) { // آخر عنصر يبدأ قبل المفتاح أو عنده
    var lo = 0, hi = list.length - 1, ans = 0;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (cmp(list[mid], key) <= 0) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  function pageOf(s, a) { return meta ? findIdx(meta.pages, [s, a]) + 1 : 1; }

  function loadPage(p) {
    if (cache[p]) return Promise.resolve(cache[p]);
    var c = store.get('u1pg' + p, null);
    if (c && c.length) { cache[p] = c; return Promise.resolve(c); }
    return getJSON(API + '/page/' + p + '/' + EDITION).then(function (d) {
      var list = d.ayahs.map(function (x) {
        return { s: x.surah.number, sn: x.surah.name, a: x.numberInSurah, j: x.juz, t: String(x.text || '') };
      });
      cache[p] = list; store.set('u1pg' + p, list);
      return list;
    });
  }

  // تحويل علامات التجويد [x[نص] أو [x:رقم[نص] إلى مقاطع
  function parse(t) {
    var out = [], re = /\[([a-z])(?::\d+)?\[([^\]]*)\]/g, last = 0, m;
    while ((m = re.exec(t))) {
      if (m.index > last) out.push({ c: '', x: t.slice(last, m.index) });
      out.push({ c: m[1], x: m[2] });
      last = re.lastIndex;
    }
    if (last < t.length) out.push({ c: '', x: t.slice(last) });
    return out;
  }
  function plain(segs) { return segs.map(function (g) { return g.x; }).join(''); }
  function stripBasmala(segs, ay) {
    var p = plain(segs);
    if (p.indexOf('بِسْمِ') !== 0) return segs;
    var cut = -1, sp = 0;
    for (var i = 0; i < p.length; i++) { if (p[i] === ' ' && ++sp === 4) { cut = i + 1; break; } }
    if (cut < 0) return segs;
    ay.basm = p.slice(0, cut).trim(); // البسملة كما وردت في المصدر حرفيًّا
    var out = [], pos = 0;
    segs.forEach(function (g) {
      var end = pos + g.x.length;
      if (end > cut) out.push({ c: g.c, x: g.x.slice(Math.max(0, cut - pos)) });
      pos = end;
    });
    return out;
  }

  // ---------- العرض ----------
  var qt = $('qtext');

  function showLoading() {
    qt.textContent = '';
    var d = el('div', 'loading'); d.appendChild(el('div', 'spin')); d.appendChild(document.createTextNode('جارٍ تحميل الصفحة…'));
    qt.appendChild(d);
  }
  function showError(p) {
    qt.textContent = '';
    var d = el('div', 'err', 'تعذّر تحميل الصفحة. تحقّق من اتصالك بالإنترنت.');
    var b = el('button', 'btn btn-gold', 'إعادة المحاولة'); b.type = 'button'; b.style.marginTop = '14px'; b.style.display = 'flex'; b.style.marginInline = 'auto';
    b.addEventListener('click', function () { goPage(p); });
    d.appendChild(b); qt.appendChild(d);
  }

  function render() {
    qt.textContent = '';
    var frag = document.createDocumentFragment();
    var flow = null;
    function newFlow() { flow = el('div', 'flow'); frag.appendChild(flow); }
    newFlow();
    ayahs.forEach(function (ay, i) {
      var segs = parse(ay.t);
      if (ay.a === 1 && ay.s !== 1) segs = stripBasmala(segs, ay);
      if (ay.a === 1) {
        frag.appendChild(el('div', 'sbanner', 'سُورَةُ ' + qname(ay.sn)));
        var bs = ay.basm || BASMALA;
        if (ay.s !== 1 && ay.s !== 9 && bs) frag.appendChild(el('div', 'basm', bs));
        newFlow();
      }
      ay.plain = plain(segs).trim();
      var sp = el('span', 'ay'); sp.dataset.i = i; sp.tabIndex = 0;
      sp.setAttribute('role', 'button');
      sp.setAttribute('aria-label', 'الآية ' + ar(ay.a) + ' من سورة ' + sname(ay.sn));
      var w = el('span', 'w');
      segs.forEach(function (g) {
        if (!g.x) return;
        if (g.c) { var t = el('span', 't-' + g.c, g.x); t.dataset.r = g.c; w.appendChild(t); }
        else w.appendChild(document.createTextNode(g.x));
      });
      sp.appendChild(w);
      sp.appendChild(document.createTextNode(' '));
      sp.appendChild(el('span', 'an', '۝' + ar(ay.a)));
      flow.appendChild(sp);
      flow.appendChild(document.createTextNode(' '));
    });
    qt.appendChild(frag);
    var f = ayahs[0];
    var names = [];
    ayahs.forEach(function (a) { var n = sname(a.sn); if (names.indexOf(n) < 0) names.push(n); });
    $('topSurah').textContent = 'سورة ' + names.join(' • ');
    $('topJuz').textContent = 'الجزء ' + (JUZ[f.j - 1] || ar(f.j));
    $('footPage').textContent = ar(page);
    $('inPage').value = page;
    $('selSurah').value = String(f.s);
    $('selJuz').value = String(f.j);
    markPlaying();
  }

  function stopPlay() { if (playing) { audio.pause(); playing = false; setIcon(); } cur = -1; loopOne = false; markPlaying(); nowInfo(); }
  function goPage(p, after, fromPlayer) {
    p = Math.max(1, Math.min(604, parseInt(p, 10) || 1));
    if (!fromPlayer && p !== page && typeof stopPlay === 'function' && audio) stopPlay();
    var changed = p !== page || !ayahs.length;
    page = p;
    store.set('last', p);
    try { history.replaceState(null, '', '#p=' + p); } catch (e) { /* */ }
    closePop();
    if (changed) showLoading();
    return loadPage(p).then(function (list) {
      if (page !== p) return;
      ayahs = list; render();
      if (changed && !after) window.scrollTo({ top: $('qtext').getBoundingClientRect().top + window.scrollY - 160, behavior: 'smooth' });
      if (after) after();
      if (p < 604) loadPage(p + 1).catch(function () { });
      updateWird();
    }).catch(function () { if (page === p) showError(p); });
  }

  function ayEl(i) { return qt.querySelector('.ay[data-i="' + i + '"]'); }
  function select(i, scroll) {
    var old = qt.querySelector('.ay.sel'); if (old) old.classList.remove('sel');
    selIdx = i; var e = ayEl(i);
    if (e) { e.classList.add('sel'); if (scroll) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  // ---------- نافذة الآية ----------
  var pop = $('pop');
  function openPop(i) {
    var ay = ayahs[i]; if (!ay) return;
    select(i);
    $('popRef').textContent = 'سورة ' + sname(ay.sn) + ' — الآية ' + ar(ay.a);
    pop.classList.add('open');
  }
  function closePop() { pop.classList.remove('open'); }
  $('popX').addEventListener('click', closePop);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePop();
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === 'ArrowLeft') goPage(page + 1);
    if (e.key === 'ArrowRight') goPage(page - 1);
  });
  document.addEventListener('click', function (e) {
    if (pop.classList.contains('open') && !pop.contains(e.target) && !e.target.closest('.ay')) closePop();
  });

  qt.addEventListener('click', function (e) {
    var a = e.target.closest('.ay'); if (!a) return;
    var i = +a.dataset.i;
    if (prefs.hide && !a.classList.contains('show')) { a.classList.add('show'); select(i); return; }
    openPop(i);
  });
  qt.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ay')) { e.preventDefault(); e.target.click(); }
  });

  $('aPlay').addEventListener('click', function () { closePop(); loopOne = false; playAt(selIdx); });
  $('aOne').addEventListener('click', function () { closePop(); loopOne = true; playAt(selIdx); toast('تكرار الآية مستمر — اضغط إيقاف أو التالي للخروج'); });
  $('aShare').addEventListener('click', function () {
    var ay = ayahs[selIdx]; if (!ay) return;
    var link = SITE + '#s=' + ay.s + ':' + ay.a;
    var text = '﴿' + ay.plain + '﴾ [' + sname(ay.sn) + ': ' + ar(ay.a) + ']\n\nاستمع إليها بصوت الشيخ الحصري في «المصحف المعلِّم» من أكاديمية اقرأ وارق:';
    share(text, link);
    closePop();
  });

  function share(text, link) {
    if (navigator.share) {
      navigator.share({ text: text, url: link }).catch(function () { });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + '\n' + link).then(function () { toast('نُسخ النص مع الرابط ✓'); }, function () { toast('تعذّر النسخ'); });
    }
  }

  // ---------- التلاوة ----------
  var audio = $('audio'), cur = -1, reps = 0, loopOne = false, playing = false;
  var preloader = new Audio(); preloader.preload = 'auto';

  function url(s, a) { return AUDIO + prefs.rec + '/' + pad3(s) + pad3(a) + '.mp3'; }
  function needsBasmala(ay) { return ay.a === 1 && ay.s !== 1 && ay.s !== 9; }
  function recName() { var o = $('selRec').selectedOptions[0]; return o ? o.textContent : ''; }

  function markPlaying() {
    var old = qt.querySelector('.ay.play'); if (old) old.classList.remove('play');
    if (cur >= 0 && playing) { var e = ayEl(cur); if (e) e.classList.add('play'); }
  }
  function setIcon() {
    $('pIcon').setAttribute('href', playing ? '#i-pause' : '#i-play');
    $('pPlay').setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل');
  }
  function nowInfo() {
    var ay = ayahs[cur];
    $('nowRef').textContent = ay ? ('سورة ' + sname(ay.sn) + ' — الآية ' + ar(ay.a)) : 'اختر آية أو اضغط تشغيل';
    $('nowRec').textContent = recName() + (loopOne ? ' • تكرار مستمر' : '');
    if (ay && 'mediaSession' in navigator && window.MediaMetadata) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: 'سورة ' + sname(ay.sn) + ' — ' + ar(ay.a), artist: recName(), album: 'المصحف المعلِّم — اقرأ وارق' }); } catch (e) { }
    }
  }

  function playAt(i) {
    var ay = ayahs[i]; if (!ay) return;
    cur = i; reps = 0;
    select(i, true);
    var basm = needsBasmala(ay);
    audio.dataset.basm = basm ? '1' : '';
    audio.src = basm ? AUDIO + prefs.rec + '/001001.mp3' : url(ay.s, ay.a);
    audio.playbackRate = parseFloat(prefs.rate) || 1;
    playing = true; setIcon(); markPlaying(); nowInfo();
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function (err) { if (err && err.name === 'NotAllowedError') { playing = false; setIcon(); } });
    var nx = ayahs[i + 1]; if (nx) { preloader.src = url(nx.s, nx.a); }
  }

  audio.addEventListener('ended', function () {
    if (audio.dataset.basm === '1') { var ay = ayahs[cur]; audio.dataset.basm = ''; audio.src = url(ay.s, ay.a); audio.playbackRate = parseFloat(prefs.rate) || 1; audio.play(); return; }
    reps++;
    var want = parseInt(prefs.rep, 10);
    if (loopOne || want === 0 || reps < want) { audio.currentTime = 0; audio.play(); return; }
    next();
  });
  audio.addEventListener('error', function () {
    if (!audio.src) return;
    playing = false; setIcon(); markPlaying();
    toast('تعذّر تشغيل التلاوة. تحقّق من الاتصال وحاول مجددًا.');
  });

  function next() {
    loopOne = false;
    if (cur + 1 < ayahs.length) { playAt(cur + 1); return; }
    if (page < 604) { goPage(page + 1, function () { playAt(0); }, true); }
    else { playing = false; setIcon(); markPlaying(); toast('صدق الله العظيم'); }
  }
  function prev() {
    loopOne = false;
    if (cur > 0) { playAt(cur - 1); return; }
    if (page > 1) { goPage(page - 1, function () { playAt(ayahs.length - 1); }, true); }
  }
  function toggle() {
    if (playing) { audio.pause(); playing = false; setIcon(); markPlaying(); return; }
    if (cur < 0 || !audio.src || !ayahs[cur]) { playAt(selIdx >= 0 ? selIdx : 0); return; }
    playing = true; setIcon(); markPlaying(); audio.play();
  }
  $('pPlay').addEventListener('click', toggle);
  $('pSet').addEventListener('click', function () {
    var pl = document.querySelector('.player'); var o = pl.classList.toggle('open');
    this.setAttribute('aria-expanded', String(o));
  });
  $('pNext').addEventListener('click', next);
  $('pPrev').addEventListener('click', prev);
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('play', toggle);
      navigator.mediaSession.setActionHandler('pause', toggle);
    } catch (e) { }
  }

  // ---------- الإعدادات ----------
  function savePrefs() { store.set('prefs', prefs); }
  function applyPrefs() {
    qt.classList.toggle('hide', !!prefs.hide); $('btnHide').setAttribute('aria-pressed', String(!!prefs.hide));
    if (prefs.qs) qt.style.setProperty('--qs', prefs.qs + 'px'); else qt.style.removeProperty('--qs');
    $('selRec').value = prefs.rec; if (!$('selRec').value) { prefs.rec = 'Husary_Muallim_128kbps'; $('selRec').value = prefs.rec; }
    $('selRep').value = prefs.rep; $('selRate').value = prefs.rate;
  }
  $('btnHide').addEventListener('click', function () {
    prefs.hide = !prefs.hide;
    qt.querySelectorAll('.ay.show').forEach(function (e) { e.classList.remove('show'); });
    applyPrefs(); savePrefs();
    toast(prefs.hide ? 'وضع التسميع: اقرأ الآية من حفظك ثم اضغط عليها لتتحقق' : 'عادت الآيات ظاهرة');
  });
  function fontStep(d) {
    var curPx = prefs.qs || parseFloat(getComputedStyle(qt).fontSize) || 28;
    prefs.qs = Math.max(18, Math.min(46, Math.round(curPx + d)));
    applyPrefs(); savePrefs();
  }
  $('btnBig').addEventListener('click', function () { fontStep(3); });
  $('btnSmall').addEventListener('click', function () { fontStep(-3); });
  $('selRec').addEventListener('change', function () {
    prefs.rec = this.value; savePrefs(); nowInfo();
    if (playing && cur >= 0) playAt(cur);
  });
  $('selRep').addEventListener('change', function () { prefs.rep = this.value; savePrefs(); });
  $('selRate').addEventListener('change', function () { prefs.rate = this.value; audio.playbackRate = parseFloat(this.value) || 1; savePrefs(); });

  $('inPage').addEventListener('change', function () { goPage(this.value); });
  $('btnNextPage').addEventListener('click', function () { goPage(page + 1); });
  $('btnPrevPage').addEventListener('click', function () { goPage(page - 1); });

  function fillSelects() {
    var ss = $('selSurah'); ss.textContent = '';
    meta.surahs.forEach(function (s) { var o = el('option', null, ar(s.n) + '. ' + sname(s.name)); o.value = s.n; ss.appendChild(o); });
    var sj = $('selJuz'); sj.textContent = '';
    for (var j = 1; j <= 30; j++) { var o = el('option', null, 'الجزء ' + JUZ[j - 1]); o.value = j; sj.appendChild(o); }
    ss.addEventListener('change', function () { var s = +this.value; goPage(pageOf(s, 1), function () { selectKey(s, 1); }); });
    sj.addEventListener('change', function () { var r = meta.juzs[+this.value - 1]; goPage(pageOf(r[0], r[1]), function () { selectKey(r[0], r[1]); }); });
  }
  function selectKey(s, a) {
    for (var i = 0; i < ayahs.length; i++) if (ayahs[i].s === s && ayahs[i].a === a) { select(i, true); return; }
  }

  // ---------- الورد اليومي ----------
  var wird = store.get('wird', { amt: 1, pos: 1, done: 0, kh: 0, streak: 0, last: '' });
  function liveStreak() { return (wird.last === today() || wird.last === today(-1)) ? wird.streak : 0; }
  function updateWird() {
    var to = Math.min(604, wird.pos + wird.amt - 1);
    var txt = wird.pos === to ? ('صفحة ' + ar(wird.pos)) : ('من صفحة ' + ar(wird.pos) + ' إلى ' + ar(to));
    if (meta) { var r = meta.pages[wird.pos - 1]; var s = r && meta.surahs[r[0] - 1]; if (s) txt += ' — سورة ' + sname(s.name); }
    $('wToday').textContent = (wird.last === today() ? 'وردك التالي: ' : 'ورد اليوم: ') + txt;
    var pct = Math.round((wird.pos - 1) / 604 * 100);
    $('wBar').style.width = pct + '%';
    $('wPct').textContent = 'تقدّمك في الختمة: ' + ar(pct) + '٪';
    $('wStreak').textContent = ar(liveStreak());
    $('wDone').textContent = ar(wird.done);
    $('wKh').textContent = ar(wird.kh);
    $('wAmt').value = String(wird.amt);
    $('wGo').textContent = (page >= wird.pos && page <= to) ? 'أنت في وردك الآن ✓' : 'افتح ورد اليوم';
  }
  function saveWird() { store.set('wird', wird); updateWird(); }
  $('wGo').addEventListener('click', function () { goPage(wird.pos, function () { select(0, true); }); });
  $('wAmt').addEventListener('change', function () { wird.amt = parseInt(this.value, 10) || 1; saveWird(); });
  $('wHere').addEventListener('click', function () { wird.pos = page; saveWird(); toast('سيبدأ وردك من صفحة ' + ar(page)); });
  $('wFinish').addEventListener('click', function () {
    var first = wird.last !== today();
    if (first) wird.streak = (wird.last === today(-1)) ? wird.streak + 1 : 1;
    wird.last = today();
    var n = Math.min(wird.amt, 605 - wird.pos);
    wird.done += n; wird.pos += n;
    var khatma = false;
    if (wird.pos > 604) { wird.pos = 1; wird.kh += 1; khatma = true; }
    saveWird();
    var m = $('wMsg'); m.textContent = '';
    var msg = khatma ? 'مباركٌ ختمُ القرآن الكريم! تقبّل الله منك، وجعله حجةً لك. 🌙'
      : first ? ('أحسنت! أتممت ورد اليوم، وهذا يومك ' + ar(wird.streak) + ' على التوالي. نلقاك غدًا بإذن الله 🌿')
        : 'زادك الله حرصًا! أضفنا ما قرأت إلى ختمتك.';
    m.appendChild(document.createTextNode(msg + ' '));
    var b = el('button', 'btn btn-soft', 'شارك إنجازك'); b.type = 'button'; b.style.marginTop = '8px'; b.style.minHeight = '38px'; b.style.fontSize = '15px';
    b.addEventListener('click', function () {
      share(khatma ? 'أتممتُ ختمة القرآن الكريم مع «المصحف المعلِّم» من أكاديمية اقرأ وارق 🌙 جرّبه معي:'
        : 'أتممتُ وردي القرآني اليوم (اليوم ' + ar(wird.streak) + ' على التوالي) مع «المصحف المعلِّم» من أكاديمية اقرأ وارق 🌿 ابدأ وردك معي:', SITE);
    });
    m.appendChild(b);
    m.classList.add('on');
    if (!khatma) goPage(wird.pos);
  });

  // ---------- البدء ----------
  function fromHash() {
    var h = location.hash;
    var m1 = /#s=(\d+):(\d+)/.exec(h); if (m1) return { s: +m1[1], a: +m1[2] };
    var m2 = /#p=(\d+)/.exec(h); if (m2) return { p: +m2[1] };
    return null;
  }
  applyPrefs();
  updateWird();
  BASMALA = store.get('u1basm', null);
  if (!BASMALA) getJSON(API + '/ayah/1/' + EDITION).then(function (d) {
    BASMALA = String(d.text || '').trim(); store.set('u1basm', BASMALA);
  }).catch(function () { });
  loadMeta().then(function () {
    fillSelects(); updateWird();
    var h = fromHash();
    if (h && h.s) goPage(pageOf(h.s, h.a), function () { selectKey(h.s, h.a); });
    else goPage(h && h.p ? h.p : store.get('last', 1));
  }).catch(function () {
    var h = fromHash();
    goPage(h && h.p ? h.p : store.get('last', 1));
  });
})();
