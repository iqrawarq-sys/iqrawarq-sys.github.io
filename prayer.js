// أكاديمية اقرأ وارق — التاريخ والساعة ومواقيت الصلاة
// كل الحساب يتم داخل متصفح الزائر؛ لا يُرسل أي شيء إلى أي خادم.
// الموقع (إن سمح به الزائر) يُحفظ على جهازه فقط.
(function () {
  'use strict';

  // ===== إعدادات يضبطها صاحب الموقع =====
  var DEF = { name: 'مسقط', lat: 23.5880, lng: 58.3829, tz: 'Asia/Muscat' }; // الموقع الافتراضي
  var FAJR_ANGLE = 18;   // زاوية الفجر
  var ISHA_ANGLE = 18;   // زاوية العشاء
  var ASR_FACTOR = 1;    // ١ = المذهب الشافعي والجمهور، ٢ = الحنفي
  // تعديل بالدقائق لكل صلاة لمطابقة التقويم الرسمي (احتياط)
  var ADJ = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  var HIJRI_ADJ = 0;     // تعديل التاريخ الهجري بالأيام (+1 أو -1) عند اختلاف رؤية الهلال عن تقويم أم القرى

  var $ = function (id) { return document.getElementById(id); };
  if (!$('ptList')) return;

  var NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  var ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  function icon(id) {
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
    s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
  }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('iw_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('iw_' + k, JSON.stringify(v)); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem('iw_' + k); } catch (e) { } }
  };
  var place = store.get('place', null) || DEF;

  // ===== التنسيق =====
  function fmt(opts, loc) {
    try { return new Intl.DateTimeFormat(loc || 'ar-OM-u-nu-arab', opts); }
    catch (e) { delete opts.timeZone; return new Intl.DateTimeFormat(loc || 'ar', opts); }
  }
  var F = {};
  function buildFormats() {
    var tz = place.tz || undefined;
    F.clock = fmt({ hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: tz });
    F.hm = fmt({ hour: 'numeric', minute: '2-digit', timeZone: tz });
    F.greg = fmt({ day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
    F.week = fmt({ weekday: 'long', timeZone: tz });
    F.hijri = fmt({ day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }, 'ar-SA-u-ca-islamic-umalqura-nu-arab');
    F.parts = fmt({ year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', timeZone: tz }, 'en-US');
  }
  function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function localYMD(date) { // اليوم والشهر والسنة في منطقة الموقع الزمنية
    var o = {};
    F.parts.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, fri: o.weekday === 'Fri' };
  }

  // ===== حساب المواقيت (الطريقة الفلكية المعتمدة في PrayTimes) =====
  var R = Math.PI / 180;
  function sin(d) { return Math.sin(d * R); } function cos(d) { return Math.cos(d * R); } function tan(d) { return Math.tan(d * R); }
  function asin(x) { return Math.asin(x) / R; } function acos(x) { return Math.acos(x) / R; }
  function atan2(y, x) { return Math.atan2(y, x) / R; } function acot(x) { return Math.atan(1 / x) / R; }
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sun(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var e = 23.439 - 0.00000036 * D;
    var RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
  }

  function compute(y, m, d, lat, lng) {
    var jd = julian(y, m, d) - lng / (15 * 24);
    function mid(t) { return fix(12 - sun(jd + t).eqt, 24); }
    function angleTime(ang, t, ccw) {
      var dcl = sun(jd + t).decl, noon = mid(t);
      var T = acos((-sin(ang) - sin(dcl) * sin(lat)) / (cos(dcl) * cos(lat))) / 15;
      return noon + (ccw ? -T : T);
    }
    function asrTime(f, t) { var dcl = sun(jd + t).decl; return angleTime(-acot(f + tan(Math.abs(lat - dcl))), t); }
    var h = {
      fajr: angleTime(FAJR_ANGLE, 5 / 24, true),
      sunrise: angleTime(0.833, 6 / 24, true),
      dhuhr: mid(12 / 24),
      asr: asrTime(ASR_FACTOR, 13 / 24),
      maghrib: angleTime(0.833, 18 / 24),
      isha: angleTime(ISHA_ANGLE, 18 / 24)
    };
    var base = Date.UTC(y, m - 1, d), out = {};
    ORDER.forEach(function (k) {
      var v = h[k] - lng / 15; // ساعات بتوقيت غرينتش
      out[k] = isFinite(v) ? new Date(base + Math.round((v * 60 + ADJ[k]) * 60) * 1000) : null;
    });
    return out;
  }

  // ===== المناسبات الإسلامية (حسب تقويم أم القرى، والعبرة بإعلان الرؤية الرسمي) =====
  var OCC = [
    { m: 1, d: 1, n: 'رأس السنة الهجرية', i: 'i-crescent' },
    { m: 1, d: 10, i: 'i-crescent', n: 'يوم عاشوراء', t: 'يُستحب صيامه مع اليوم التاسع' },
    { m: 3, d: 12, n: 'المولد النبوي الشريف', i: 'i-mosque' },
    { m: 7, d: 27, n: 'ذكرى الإسراء والمعراج', i: 'i-dome' },
    { m: 9, d: 1, n: 'بداية شهر رمضان المبارك', i: 'i-fanoos' },
    { m: 9, d: 21, i: 'i-fanoos', n: 'العشر الأواخر من رمضان', t: 'تحرّوا ليلة القدر' },
    { m: 10, d: 1, n: 'عيد الفطر المبارك', i: 'i-star8' },
    { m: 10, d: 2, n: 'صيام الست من شوال', i: 'i-crescent' },
    { m: 12, d: 1, n: 'العشر الأوائل من ذي الحجة', i: 'i-kaaba' },
    { m: 12, d: 9, i: 'i-kaaba', n: 'يوم عرفة', t: 'صيامه لغير الحاج يكفّر سنتين' },
    { m: 12, d: 10, n: 'عيد الأضحى المبارك', i: 'i-star8' },
    { m: 12, d: 11, n: 'أيام التشريق', i: 'i-kaaba' }
  ];
  var HP = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
  var HL = fmt({ day: 'numeric', month: 'long', timeZone: 'UTC' }, 'ar-SA-u-ca-islamic-umalqura-nu-arab');
  var GL = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  function hparts(ms) {
    var o = {}; HP.formatToParts(new Date(ms + HIJRI_ADJ * 864e5)).forEach(function (p) { o[p.type] = p.value; });
    return { m: +o.month, d: +o.day };
  }
  function inDays(n) {
    if (n === 0) return 'اليوم';
    if (n === 1) return 'غدًا';
    if (n === 2) return 'بعد يومين';
    return 'بعد ' + ar(n) + (n <= 10 ? ' أيام' : ' يومًا');
  }
  function buildOcc(t) {
    var base = Date.UTC(t.y, t.m - 1, t.d, 12), list = [], today = hparts(base);
    for (var i = 0; i < 360; i++) {
      var ms = base + i * 864e5, h = hparts(ms);
      OCC.forEach(function (o) { if (o.m === h.m && o.d === h.d) list.push({ o: o, i: i, ms: ms }); });
    }
    var ul = $('occList'); ul.textContent = '';
    list.forEach(function (x) {
      var li = document.createElement('li');
      if (x.i === 0) li.className = 'now';
      li.appendChild(icon(x.o.i || 'i-crescent'));
      var a = document.createElement('div'); var b = document.createElement('b'); b.textContent = x.o.n; a.appendChild(b);
      var s = document.createElement('small'); s.textContent = HL.format(new Date(x.ms + HIJRI_ADJ * 864e5)) + ' — ' + GL.format(new Date(x.ms)); a.appendChild(s);
      if (x.o.t) { var tip = document.createElement('small'); tip.className = 'tip'; tip.textContent = x.o.t; a.appendChild(tip); }
      var c = document.createElement('span'); c.textContent = inDays(x.i);
      li.appendChild(a); li.appendChild(c); ul.appendChild(li);
    });
    var box = $('ptOcc'), nx = list[0]; box.textContent = '';
    function row(ic, txt) { var r = document.createElement('span'); r.appendChild(icon(ic)); r.appendChild(document.createTextNode(txt)); box.appendChild(r); }
    if (nx && nx.i === 0) row(nx.o.i, 'اليوم: ' + nx.o.n);
    else if (nx) row(nx.o.i, 'المناسبة القادمة: ' + nx.o.n + ' — ' + inDays(nx.i));
    if (today.d >= 13 && today.d <= 15) row('i-fullmoon', 'اليوم من الأيام البيض (يُستحب صيامها)');
  }

  // ===== العرض =====
  var times = null, timesKey = '', nextK = '';
  function dayTimes(now) {
    var t = localYMD(now), key = t.y + '-' + t.m + '-' + t.d + place.lat + place.lng;
    if (key !== timesKey) {
      timesKey = key;
      try { buildOcc(t); } catch (e) { }
      times = compute(t.y, t.m, t.d, place.lat, place.lng);
      var tm = new Date(Date.UTC(t.y, t.m - 1, t.d + 1, 12));
      var t2 = localYMD(tm);
      times.fajrNext = compute(t2.y, t2.m, t2.d, place.lat, place.lng).fajr;
      times.fri = t.fri;
      renderList(now);
    }
    return times;
  }

  function renderList() {
    var ul = $('ptList'); ul.textContent = '';
    ORDER.forEach(function (k) {
      var li = document.createElement('li'); li.dataset.k = k;
      li.appendChild(icon('i-' + k));
      var n = document.createElement('span'); n.textContent = (k === 'dhuhr' && times.fri) ? 'الجمعة' : NAMES[k];
      var v = document.createElement('b'); v.textContent = times[k] ? F.hm.format(times[k]) : '—';
      li.appendChild(n); li.appendChild(v); ul.appendChild(li);
    });
    $('ptPlace').textContent = place.name;
  }

  function dur(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    s = s % 60;
    return ar(h) + ':' + ar(('0' + m).slice(-2)) + ':' + ar(('0' + s).slice(-2));
  }

  function tick() {
    var now = new Date();
    $('ptClock').textContent = F.clock.format(now);
    $('ptWeek').textContent = F.week.format(now);
    $('ptGreg').textContent = F.greg.format(now) + ' م';
    $('ptHijri').textContent = F.hijri.format(new Date(now.getTime() + HIJRI_ADJ * 864e5));
    var t = dayTimes(now);
    var k = '', at = null;
    for (var i = 0; i < ORDER.length; i++) {
      var key = ORDER[i];
      if (key === 'sunrise') continue;
      if (t[key] && t[key] > now) { k = key; at = t[key]; break; }
    }
    if (!k) { k = 'fajr'; at = t.fajrNext; }
    if (k !== nextK) {
      nextK = k;
      var old = document.querySelector('#ptList li.next'); if (old) old.classList.remove('next');
      var li = document.querySelector('#ptList li[data-k="' + k + '"]'); if (li) li.classList.add('next');
    }
    var nm = (k === 'dhuhr' && t.fri) ? 'الجمعة' : NAMES[k];
    $('ptNext').textContent = at ? ('بقي على ' + nm + ': ' + dur(at - now)) : '';
  }

  function setPlace(p) {
    place = p; timesKey = ''; nextK = '';
    buildFormats(); tick();
    $('ptLocT').textContent = (place.name === DEF.name) ? 'حسب موقعي' : 'العودة إلى مسقط';
  }

  $('ptLoc').addEventListener('click', function () {
    if (place.name !== DEF.name) { store.del('place'); setPlace(DEF); return; }
    if (!navigator.geolocation) return;
    var b = this; b.disabled = true; $('ptLocT').textContent = 'جارٍ التحديد…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var tz; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { }
      var p = { name: 'موقعك الحالي', lat: +pos.coords.latitude.toFixed(3), lng: +pos.coords.longitude.toFixed(3), tz: tz };
      store.set('place', p); b.disabled = false; setPlace(p);
    }, function () {
      b.disabled = false; setPlace(place);
      var n = $('ptNext'); n.textContent = 'لم يُسمح بتحديد الموقع — نعرض مواقيت مسقط';
    }, { timeout: 15000, maximumAge: 864e5 });
  });

  // فتح البطاقة وإغلاقها على الجوال
  var tg = $('tdToggle');
  if (tg) tg.addEventListener('click', function () {
    var card = document.querySelector('.today'), o = card.classList.toggle('open');
    tg.setAttribute('aria-expanded', String(o));
    $('tdToggleT').textContent = o ? 'إخفاء المواقيت والمناسبات' : 'مواقيت الصلاة والمناسبات';
  });

  buildFormats();
  setPlace(place);
  setInterval(tick, 1000);
})();
