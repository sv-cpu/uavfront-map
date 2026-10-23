/* БПЛА Фронт · карта атак — static client.
   Data: data.json (build_map.py). Geometry: regions.geojson (geoBoundaries/OSM, ODbL), world.geojson (Natural Earth, PD). */
(function () {
  "use strict";
  var S = { w: "24h", h: 167, live: true, data: null, geo: null, sel: null, timer: null };
  var BREAKS = { "3h": [1, 2, 4, 7, 12], "24h": [1, 4, 10, 20, 35], "7d": [1, 10, 30, 60, 120] };
  var FILL = ["#16293f", "#1b3a50", "#224c5f", "#2b5f6d", "#3a7680"];   // single-hue sequential: slate -> muted teal
  var RED = "#d9343f", STEEL = "#c9d3dc", AP_GREY = "#8a9aab";
  var WH = { "3h": 3, "24h": 24, "7d": 168 };
  var WRU = { "3h": "3 ч", "24h": "24 ч", "7d": "7 дн." };
  var KIND = { alert: "тревога", movement: "пролёт", incident: "попадание", interception: "сбито", airport_closed: "аэропорт", airport_open: "аэропорт" };
  var CONF = { o: "офиц.", q: "СМИ", u: "не подтв." };
  var CONF_T = { o: "официальный источник", q: "СМИ со ссылкой на официальный источник", u: "не подтверждено официально" };

  // ---------------------------------------------------------------- glyphs (inline SVG, monochrome, no backgrounds)
  // «Лютый»-type silhouette, top view, nose up: slim fuselage, long straight high wing, small tailplane, pusher prop.
  function droneSvg(size, deg) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="-32 -32 64 64" style="transform:rotate(' + (deg || 0) + 'deg)">' +
      '<g fill="' + STEEL + '" stroke="#0a1422" stroke-width="0.8" stroke-linejoin="round">' +
      '<path d="M-2.2,-2.6 L-29,-0.9 L-29,1.9 L-2.2,3.2 Z M2.2,-2.6 L29,-0.9 L29,1.9 L2.2,3.2 Z"/>' +          // wing
      '<path d="M-1.4,16 L-9.5,18.6 L-9.5,20.6 L-1.4,20.6 Z M1.4,16 L9.5,18.6 L9.5,20.6 L1.4,20.6 Z"/>' +       // tailplane
      '<path d="M0,-27 C1.9,-27 2.5,-23.5 2.5,-19 L2.2,15 L1.1,22.6 L-1.1,22.6 L-2.2,15 L-2.5,-19 C-2.5,-23.5 -1.9,-27 0,-27 Z"/>' + // fuselage
      '</g><path d="M-7,24.2 L7,24.2" stroke="' + STEEL + '" stroke-width="1.3" stroke-linecap="round"/>' +   // pusher propeller
      '<circle cx="0" cy="24.2" r="1.2" fill="' + STEEL + '"/></svg>';
  }
  function airportSvg(col) {   // runway mark: outlined strip with centreline
    return '<svg width="16" height="16" viewBox="-8 -8 16 16"><g transform="rotate(-35)" stroke="' + col + '" fill="none">' +
      '<rect x="-2.2" y="-7" width="4.4" height="14" stroke-width="1.2" fill="rgba(10,20,34,.6)"/>' +
      '<path d="M0,-4.6V-2.8M0,-0.9V0.9M0,2.8V4.6" stroke-width="0.9"/></g></svg>';
  }
  function incSvg(conf) {      // red diamond; outline only when unconfirmed
    var solid = conf !== "u";
    return '<svg width="12" height="12" viewBox="-6 -6 12 12"><path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="' + (solid ? RED : "rgba(10,20,34,.7)") +
      '" stroke="' + (solid ? "#0a1422" : RED) + '" stroke-width="' + (solid ? 0.8 : 1.5) + '"/></svg>';
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//.test(u) ? u : "#"; }
  function links(us, label) {
    return (us || []).map(function (u, i) { return '<a href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + esc(label || ("источник" + (us.length > 1 ? " " + (i + 1) : ""))) + "</a>"; }).join(" · ");
  }
  function ctag(c) { return '<span class="tag c-' + esc(c) + '" title="' + esc(CONF_T[c] || "") + '">' + esc(CONF[c] || c) + "</span>"; }
  function tparse(s) { var p = s.split(/[-T:]/); return Date.UTC(+p[0], p[1] - 1, +p[2], +p[3], +p[4]); } // MSK wall clock as UTC ms
  function fmt(s) { return s ? s.slice(8, 10) + "." + s.slice(5, 7) + " " + s.slice(11, 16) : ""; }
  function fmtMs(ms) { var d = new Date(ms); function z(n) { return (n < 10 ? "0" : "") + n; } return z(d.getUTCDate()) + "." + z(d.getUTCMonth() + 1) + " " + z(d.getUTCHours()) + ":00"; }
  function color(v) { var b = BREAKS[S.w], i = 0; if (!v) return null; while (i < b.length && v >= b[i]) i++; return FILL[Math.max(0, Math.min(i, FILL.length) - 1)]; }
  function short(r) { return ({ "Москва и Московская обл.": "Москва и МО", "Ленинградская обл. и СПб": "СПб и Ленобласть", "Республика Крым": "Крым" })[r] || r; }

  var map = L.map("map", { zoomControl: true, attributionControl: true, minZoom: 3, maxZoom: 10, worldCopyJump: false });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('Границы: geoBoundaries / © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) · Natural Earth');
  function addBasemap(bm) {   // optional third-party tiles (WEBMAP_BASEMAP=carto|esri); default: none
    if (!bm || !bm.url) return;
    L.tileLayer(bm.url, { subdomains: bm.subdomains || "abc", maxZoom: bm.maxZoom || 16, attribution: bm.attribution }).addTo(map);
  }
  map.setView([53, 40], 5);
  var gLayer = null, incLayer = L.layerGroup().addTo(map), apLayer = L.layerGroup().addTo(map), drLayer = L.layerGroup().addTo(map), seaLayer = L.layerGroup().addTo(map);

  // ---------------------------------------------------------------- per-region stats for current view
  function seriesSum(r, key, h0, h1) {
    var s = S.data.series[r]; if (!s || !s[key]) return 0;
    var t = 0; s[key].forEach(function (p) { if (p[0] > h0 && p[0] <= h1) t += (key === "ms" ? 1 : p[1]); }); return t;
  }
  function stats(r) {
    var R = S.data.regions[r];
    if (S.live) {
      var w = (R && R.w[S.w]) || { st: 0 };
      var a = w.a || 0, m = w.m || 0, i = (w.i || []).length;
      return { a: a, m: m, i: i, ms: w.ms || 0, msa: !!w.msa, st: w.st || 0, sd: w.sd, score: a + m + 2 * i, dir: w.dir };
    }
    var h1 = S.h, h0 = S.h - WH[S.w];
    var a2 = seriesSum(r, "a", h0, h1), m2 = seriesSum(r, "m", h0, h1), i2 = seriesSum(r, "i", h0, h1), ms = seriesSum(r, "ms", h0, h1);
    var act = seriesSum(r, "a", h1 - 1, h1) + seriesSum(r, "m", h1 - 1, h1);
    return { a: a2, m: m2, i: i2, ms: ms, msa: seriesSum(r, "ms", h1 - 2, h1) > 0, st: act ? 2 : (a2 + m2 ? 1 : 0), score: a2 + m2 + 2 * i2, dir: null };
  }
  function viewRange() {
    var start = tparse(S.data.series_start);
    if (S.live) return [tparse(S.data.windows[S.w]), tparse(S.data.now) + 60000];
    var to = start + (S.h + 1) * 3600000; return [to - WH[S.w] * 3600000, to];
  }

  // ---------------------------------------------------------------- render
  function style(f) {
    var st = stats(f.properties.key), c = color(st.score), sel = S.sel === f.properties.key;
    var red = st.st === 2 || st.ms;
    return {
      color: red ? RED : sel ? "#8fa3b5" : "#2a3f58",
      weight: sel ? 1.8 : st.st === 2 ? 1.6 : st.ms ? 1.4 : 0.6,
      dashArray: st.ms && st.st !== 2 ? "4 3" : null,
      fillColor: c || "#0e1a29", fillOpacity: c ? 0.92 : 1, opacity: red ? 0.95 : 1
    };
  }
  function render() {
    if (!gLayer) return;
    gLayer.setStyle(style);
    gLayer.eachLayer(function (l) { var s = stats(l.feature.properties.key); if (s.st === 2 || s.ms) l.bringToFront(); });
    drLayer.clearLayers(); seaLayer.clearLayers(); incLayer.clearLayers(); apLayer.clearLayers();
    var regs = S.data.regions, small = window.innerWidth < 700;
    Object.keys(regs).forEach(function (r) {
      var st = stats(r), ll = regs[r].ll;
      if (!ll) return;
      if (st.m) {
        var sz = small ? 24 : 30;
        L.marker(ll, { icon: L.divIcon({ className: "mk drone", html: droneSvg(sz, st.dir == null ? 0 : st.dir), iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }), zIndexOffset: 400 })
          .bindTooltip(esc(short(r)) + " — пролётов: " + st.m + (st.dir != null ? " · курс " + st.dir + "°" : ""), { className: "rt", direction: "top" })
          .on("click", function () { openPanel(r); }).addTo(drLayer);
      }
      if (S.data.seas[r] && st.score) L.marker(ll, { icon: L.divIcon({ className: "mk", html: '<span class="sea">' + esc(r) + " · " + st.score + "</span>", iconSize: null }) })
        .on("click", function () { openPanel(r); }).addTo(seaLayer);
    });
    var rg = viewRange();
    S.data.incidents.forEach(function (e) {
      var t = tparse(e.t); if (t < rg[0] || t >= rg[1] || !e.ll) return;
      L.marker(e.ll, { icon: L.divIcon({ className: "mk", html: incSvg(e.c), iconSize: [12, 12], iconAnchor: [6, 6] }), zIndexOffset: e.c !== "u" ? 600 : 500 })
        .bindPopup(incPopup(e), { maxWidth: 290 }).addTo(incLayer);
    });
    S.data.airports.forEach(function (a) {
      if (!a.ll) return;
      var n = S.live ? a.w[S.w].n : 0;
      if (!S.live) { if (!(a.w["7d"].lc && tparse(a.w["7d"].lc) >= rg[0] && tparse(a.w["7d"].lc) < rg[1])) return; n = 1; }
      if (!n && !(S.live && a.closed)) return;
      var closed = S.live && a.closed;
      L.marker(a.ll, { icon: L.divIcon({ className: "mk", html: airportSvg(closed ? RED : AP_GREY), iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 300 })
        .bindPopup(apPopup(a), { maxWidth: 260 }).addTo(apLayer);
    });
    if (S.sel) openPanel(S.sel, true);
    legendScale();
  }
  function incPopup(e) {
    var cas = (e.k ? "погибли: " + e.k + "; " : "") + (e.w ? "ранены: " + e.w : "");
    return '<div class="pp-h">Попадание / обломки · ' + esc(fmt(e.t)) + " МСК</div>" +
      '<div class="pp-t">' + esc(short(e.r)) + (e.pl ? ", " + esc(e.pl) : "") + "</div>" + esc(e.tx) +
      (e.tg.length ? '<div class="pp-f">Объекты: ' + esc(e.tg.join(", ")) + "</div>" : "") +
      (cas ? '<div class="pp-f">Пострадавшие (офиц.): ' + esc(cas) + "</div>" : "") +
      '<div class="pp-f">' + ctag(e.c) + e.n + " ист. · " + links(e.u) + "</div>" +
      (e.ex ? "" : '<div class="pp-f">Точка условная — центр региона.</div>');
  }
  function apPopup(a) {
    var w = a.w[S.w];
    return '<div class="pp-h">Аэропорт</div><div class="pp-t">' + esc(a.name) + "</div>" + esc(short(a.r)) +
      (a.closed ? '<div class="pp-f"><span class="tag alert">ограничения</span>с ' + esc(fmt(a.lt)) + "</div>" : "") +
      '<div class="pp-f">Эпизодов ограничений за ' + WRU[S.w] + ': <b class="num">' + (w.n || 0) + "</b>" + (w.lc ? " · последнее " + esc(fmt(w.lc)) : "") + "</div>" +
      '<div class="pp-f">' + ctag(a.c) + links(a.u, "источник") + "</div>";
  }
  function legendScale() {
    var b = BREAKS[S.w], h = '<div class="cap">Активность за ' + WRU[S.w] + "</div><div class=\"scale\">";
    for (var i = 0; i < b.length; i++) h += '<div><i style="background:' + FILL[i] + '"></i>' + b[i] + (i === b.length - 1 ? "+" : "") + "</div>";
    document.getElementById("lgScale").innerHTML = h + '</div><div class="cap" style="text-transform:none;letter-spacing:0">тревоги + пролёты + 2×попадания</div>';
  }

  // ---------------------------------------------------------------- side panel
  function openPanel(r, quiet) {
    S.sel = r; if (!quiet && gLayer) gLayer.setStyle(style);
    var R = S.data.regions[r] || { w: {}, ev: [] }, st = stats(r), name = r;
    if (S.geo) S.geo.features.forEach(function (f) { if (f.properties.key === r) name = f.properties.name; });
    var h = "<h2>" + esc(name) + "</h2>";
    h += '<div class="cap">' + (S.live ? "последние " + WRU[S.w] : WRU[S.w] + " до " + esc(document.getElementById("tlabel").textContent)) + "</div>";
    if (st.st === 2) h += '<span class="flag">Активность сейчас</span>';
    if (st.ms) h += '<span class="flag">Ракетная опасность' + (st.msa ? " · не снята" : " · " + st.ms) + "</span>";
    h += '<div class="kpis"><div class="kpi' + (st.a ? " hot" : "") + '"><b>' + st.a + "</b><span>тревоги</span></div>" +
      '<div class="kpi"><b>' + st.m + "</b><span>пролёты</span></div>" +
      '<div class="kpi' + (st.i ? " hot" : "") + '"><b>' + st.i + "</b><span>попадания</span></div></div>";
    if (st.dir != null) h += '<div class="note">Последний известный курс пролёта: <span class="num">' + st.dir + "°</span></div>";
    if (S.live && st.sd && (st.sd.o || st.sd.q)) {
      h += "<h3>Сбито — по официальным данным региона</h3>";
      if (st.sd.o) h += '<div class="row"><span>' + ctag("o") + "власти / МО</span><b>" + st.sd.o + "</b></div>";
      if (st.sd.q) h += '<div class="row"><span>' + ctag("q") + "СМИ со ссылкой на офиц.</span><b>" + st.sd.q + "</b></div>";
      h += '<div class="note">' + links(st.sd.u) + "<br>Детализация; в общий итог не суммируется. Общий итог — только сводки МО.</div>";
    }
    if (R.rs && R.rs.length) {
      h += "<h3>Сводки региона</h3>";
      R.rs.forEach(function (x) { h += '<div class="row"><span>' + ctag(x.c) + '<span class="num">' + esc(x.p) + "</span> · " + links(x.u, "ист.") + "</span><b>" + x.n + "</b></div>"; });
    }
    var aps = S.data.airports.filter(function (a) { return a.r === r && (a.w[S.w].n || a.closed); });
    if (aps.length) {
      h += "<h3>Аэропорты</h3>";
      aps.forEach(function (a) {
        h += '<div class="ev">' + (a.closed ? '<span class="tag alert">ограничения</span>' : '<span class="tag">норм.</span>') + "<b>" + esc(a.name) + "</b> · эпизодов " +
          '<span class="num">' + (a.w[S.w].n || 0) + "</span>" + (a.w[S.w].lc ? ", посл. " + esc(fmt(a.w[S.w].lc)) : "") + " · " + links(a.u, "ист.") + "</div>";
      });
    }
    var rg = viewRange();
    var incs = S.data.incidents.filter(function (e) { var t = tparse(e.t); return e.r === r && t >= rg[0] && t < rg[1]; }).slice(-8).reverse();
    if (incs.length) {
      h += "<h3>Попадания / обломки</h3>";
      incs.forEach(function (e) {
        h += '<div class="ev"><time>' + esc(fmt(e.t)) + "</time>" + ctag(e.c) + (e.pl ? "<b>" + esc(e.pl) + "</b>: " : "") + esc(e.tx) +
          (e.tg.length ? ' <span class="note">[' + esc(e.tg.join(", ")) + "]</span>" : "") + " " + links(e.u, "ист.") + "</div>";
      });
    }
    if (R.ev && R.ev.length) {
      h += "<h3>Последние события · 7 дн.</h3>";
      R.ev.forEach(function (e) {
        var cls = e.k === "alert" || e.k === "incident" || e.k === "airport_closed" ? " alert" : "";
        var lab = e.k === "airport_closed" ? "аэроп. огр." : e.k === "airport_open" ? "аэроп. откр." : (KIND[e.k] || e.k);
        h += '<div class="ev"><time>' + esc(fmt(e.t)) + '</time><span class="tag' + cls + '">' + esc(lab) + "</span>" + (e.ms ? '<span class="tag alert">ракетная</span>' : "") +
          esc(e.tx) + " " + ctag(e.c) + links(e.u, "ист.") + "</div>";
      });
    }
    if (S.data.mod && S.data.mod.regions.indexOf(r) >= 0) h += '<div class="note">Регион упомянут в последней сводке МО (' + esc(S.data.mod.period) + ").</div>";
    h += '<div class="note">Каждое событие учтено один раз (дедупликация по каналам). Метки: офиц. — официальный источник; СМИ — со ссылкой на офиц.; не подтв. — без официального подтверждения.</div>';
    document.getElementById("pbody").innerHTML = h;
    document.getElementById("panel").classList.add("open");
  }
  document.getElementById("pclose").onclick = function () { document.getElementById("panel").classList.remove("open"); S.sel = null; if (gLayer) gLayer.setStyle(style); };

  // ---------------------------------------------------------------- controls
  Array.prototype.forEach.call(document.querySelectorAll("#winbar button"), function (b) {
    b.onclick = function () {
      S.w = b.getAttribute("data-w");
      Array.prototype.forEach.call(document.querySelectorAll("#winbar button"), function (x) { x.classList.toggle("on", x === b); });
      render();
    };
  });
  document.getElementById("lgDrone").innerHTML = droneSvg(18, 0);
  document.getElementById("lgInc").innerHTML = incSvg("o");
  document.getElementById("lgAp").innerHTML = airportSvg(AP_GREY);
  document.getElementById("lgToggle").onclick = function () { document.getElementById("legend").classList.toggle("min"); };
  if (window.innerWidth < 700) document.getElementById("legend").classList.add("min");
  var slider = document.getElementById("slider"), tl = document.getElementById("tlabel"), tb = document.getElementById("timebar");
  var PLAY = '<svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z"/></svg>', PAUSE = '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>';
  function setHour(h) {
    S.h = h; S.live = h >= 167; slider.value = h;
    tl.textContent = S.live ? "СЕЙЧАС" : fmtMs(tparse(S.data.series_start) + (h + 1) * 3600000) + " МСК";
    tb.classList.toggle("past", !S.live);
    render();
  }
  slider.addEventListener("input", function () { stop(); setHour(+slider.value); });
  function stop() { if (S.timer) { clearInterval(S.timer); S.timer = null; document.getElementById("play").innerHTML = PLAY; } }
  document.getElementById("play").onclick = function () {
    if (S.timer) return stop();
    if (S.h >= 167) setHour(0);
    document.getElementById("play").innerHTML = PAUSE;
    S.timer = setInterval(function () { if (S.h >= 167) return stop(); setHour(S.h + 1); }, 280);
  };
  function fitHeader() { document.documentElement.style.setProperty("--hh", document.getElementById("hdr").offsetHeight + "px"); map.invalidateSize(); }
  window.addEventListener("resize", fitHeader);

  // ---------------------------------------------------------------- load
  var bust = "?t=" + Math.floor(Date.now() / 60000);
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  Promise.all([getJSON("data.json" + bust), getJSON("regions.geojson"), getJSON("world.geojson").catch(function () { return null; })])
    .then(function (res) {
      S.data = res[0]; S.geo = res[1];
      addBasemap(S.data.basemap);
      if (res[2]) L.geoJSON(res[2], { interactive: false, style: { color: "#1c2c40", weight: 0.6, fillColor: "#0d1826", fillOpacity: 1 } }).addTo(map);
      document.getElementById("upd").textContent = S.data.generated_at;
      var m = S.data.mod;
      if (m) document.getElementById("mod").innerHTML = "<b>" + m.total + '</b> БПЛА · <span class="num">' + esc(m.period) + "</span>" +
        (m.day ? '<span class="dayp"> · сутки до <span class="num">' + esc(m.day.period.slice(-11)) + "</span>: <b>" + m.day.total + "</b></span>" : "");
      var keys = {};
      gLayer = L.geoJSON(S.geo, {
        style: style,
        onEachFeature: function (f, l) {
          keys[f.properties.key] = 1;
          l.on("click", function () { openPanel(f.properties.key); });
          l.bindTooltip(function () { var st = stats(f.properties.key); return esc(f.properties.name) + (st.score ? ' · <span class="num">' + st.a + "/" + st.m + "/" + st.i + "</span> тр./прол./попад." : ""); }, { sticky: true, className: "rt" });
        }
      }).addTo(map);
      var miss = Object.keys(S.data.regions).filter(function (r) { return !keys[r] && !S.data.seas[r]; });
      if (miss.length) console.warn("regions without polygon:", miss);
      fitHeader();
      if (window.innerWidth < 700) map.setView([50.5, 38.5], 4); else map.fitBounds([[43, 27], [61, 56]]);
      render();
    })
    .catch(function (e) { console.error(e); document.getElementById("upd").textContent = "ошибка загрузки данных"; });
})();
