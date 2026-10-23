/* БПЛА Фронт · карта атак — static client.
   Data: data.json (build_map.py). Geometry: regions.geojson (geoBoundaries/OSM, ODbL), world.geojson (Natural Earth, PD). */
(function () {
  "use strict";
  var S = { w: "24h", h: 167, live: true, data: null, geo: null, sel: null, timer: null };
  // headless snapshot mode (cards.py): ?snap=1[&sw=<hours>&to=<YYYY-MM-DDTHH:MM, MSK, exclusive end>][&bb=s,w,n,e]
  var Q = new URLSearchParams(location.search), SNAP = Q.get("snap");
  if (SNAP) document.documentElement.classList.add("snap");
  var BREAKS = { "3h": [1, 2, 4, 7, 12], "24h": [1, 4, 10, 20, 35], "7d": [1, 10, 30, 60, 120] };
  var FILL = ["#16293f", "#1b3a50", "#224c5f", "#2b5f6d", "#3a7680"];   // single-hue sequential: slate -> muted teal
  var RED = "#d9343f", STEEL = "#c9d3dc", AP_GREY = "#8a9aab";
  var WH = { "3h": 3, "24h": 24, "7d": 168 };
  var WRU = { "3h": "3 ч", "24h": "24 ч", "7d": "7 дн." };
  if (SNAP && Q.get("sw")) { WH.c = +Q.get("sw"); WRU.c = WH.c + " ч"; BREAKS.c = WH.c <= 6 ? BREAKS["3h"] : WH.c <= 24 ? [1, 3, 7, 14, 25] : BREAKS["7d"]; }
  var KIND = { alert: "тревога", movement: "пролёт", incident: "попадание", interception: "сбито", airport_closed: "аэропорт", airport_open: "аэропорт" };
  var CONF = { o: "офиц.", q: "СМИ", u: "не подтв." };
  var CONF_T = { o: "официальный источник", q: "СМИ со ссылкой на официальный источник", u: "не подтверждено официально" };

  // ---------------------------------------------------------------- glyphs (inline SVG, monochrome, no backgrounds)
  // «Лютый»-type silhouette, top view, nose up: slim fuselage, long straight high wing, small tailplane, pusher prop.
  // missile silhouette (cruise/ballistic generic), drawn nose up-right; muted when the alert was lifted
  function missileSvg(size, on) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="-16 -16 32 32" style="transform:rotate(45deg)">' +
      '<g fill="' + RED + '" fill-opacity="' + (on ? 1 : 0.7) + '" stroke="#0a1422" stroke-width="0.7" stroke-linejoin="round">' +
      '<path d="M-3.2,7 L-7,12.6 L-7,14.6 L-2.4,11.6 Z M3.2,7 L7,12.6 L7,14.6 L2.4,11.6 Z"/>' +                 // tail fins
      '<path d="M0,-15 C2.7,-12.4 3.2,-9.5 3.2,-6.5 L3.2,11.6 L1.8,13.8 L-1.8,13.8 L-3.2,11.6 L-3.2,-6.5 C-3.2,-9.5 -2.7,-12.4 0,-15 Z"/>' + // body
      '</g></svg>';
  }
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
  document.getElementById("map")._lm = map;   // handle for headless screenshot tests
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('Границы: geoBoundaries / © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) · Natural Earth');
  function addBasemap(bm) {   // optional third-party tiles (WEBMAP_BASEMAP=carto|esri); default: none
    if (!bm || !bm.url) return;
    L.tileLayer(bm.url, { subdomains: bm.subdomains || "abc", maxZoom: bm.maxZoom || 16, attribution: bm.attribution }).addTo(map);
  }
  map.setView([53, 40], 5);
  map.createPane("labels"); map.getPane("labels").style.zIndex = 450; map.getPane("labels").style.pointerEvents = "none";
  var lbLayer = L.layerGroup().addTo(map);
  map.createPane("dirs"); map.getPane("dirs").style.zIndex = 420;
  var dirLayer = L.layerGroup().addTo(map), dirOn = true;
  var gLayer = null, incLayer = L.layerGroup().addTo(map), apLayer = L.layerGroup().addTo(map), drLayer = L.layerGroup().addTo(map), msLayer = L.layerGroup().addTo(map), seaLayer = L.layerGroup().addTo(map);

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
    return { a: a2, m: m2, i: i2, ms: ms, msa: seriesSum(r, "ms", h1 - 2, h1) > 0, st: act && !SNAP ? 2 : (a2 + m2 ? 1 : 0), score: a2 + m2 + 2 * i2, dir: null };
  }
  function fmtHm(t) { var d = new Date(t); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function viewRange() {
    var start = tparse(S.data.series_start);
    if (S.live) return [tparse(S.data.windows[S.w]), tparse(S.data.now) + 60000];
    var to = start + (S.h + 1) * 3600000; return [to - WH[S.w] * 3600000, to];
  }

  // ---------------------------------------------------------------- render
  function style(f) {
    var st = stats(f.properties.key), c = color(st.score), sel = S.sel === f.properties.key;
    var red = st.st === 2;                       // missile danger is a glyph now (missileSvg), not an outline
    return {
      color: red ? RED : sel ? "#8fa3b5" : "#2a3f58",
      weight: sel ? 1.8 : red ? 1.6 : 0.6,
      fillColor: c || "#0e1a29", fillOpacity: c ? 0.92 : 1, opacity: red ? 0.95 : 1
    };
  }
  // ---------------------------------------------------------------- region name labels
  // Pole-of-inaccessibility points (prep_labels.py). Priority: active regions first, then by area; greedy collision culling
  // in screen space against already placed labels and drone glyphs. Low zoom: active or large regions only.
  var measureCtx = document.createElement("canvas").getContext("2d");
  function textW(t, px) { measureCtx.font = "500 " + px + "px Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif"; return measureCtx.measureText(t.toUpperCase()).width + t.length * px * 0.08; }
  function inRing(r, x, y) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++)
      if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    return c;
  }
  function inside(g, ll) {
    var polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    return polys.some(function (P) { return inRing(P[0], ll.lng, ll.lat) && !P.slice(1).some(function (h) { return inRing(h, ll.lng, ll.lat); }); });
  }
  function hit(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  function renderLabels() {
    lbLayer.clearLayers();
    if (!S.geo || !S.data) return;
    var z = map.getZoom(), small = window.innerWidth < 700;
    var px = z >= 7 ? 11.5 : z >= 6 ? 10.5 : z >= 5 ? 9.5 : 8.5;
    var minAr = z >= 6 ? 0 : z >= 5 ? 60 : 1e9;          // area (thousand km²) for quiet regions to get a label
    var boxes = [], cands = [];
    var soft = [];                                          // glyphs are obstacles: drones hard, hits/airports soft
    function obst(layer, h, arr) {
      layer.eachLayer(function (m) { var p = map.latLngToContainerPoint(m.getLatLng()); arr.push([p.x - h, p.y - h, p.x + h, p.y + h]); });
    }
    obst(drLayer, (small ? 24 : 30) / 2 - 3, boxes); msLayer.eachLayer(function (m) {     // missile glyph box from its real offset next to the drone
      var o = m.options.icon.options, p = map.latLngToContainerPoint(m.getLatLng()), x = p.x - o.iconAnchor[0], y = p.y - o.iconAnchor[1];
      boxes.push([x + 2, y + 2, x + o.iconSize[0] - 2, y + o.iconSize[1] - 2]);
    }); obst(incLayer, 5, soft); obst(apLayer, 6, soft);
    var mr = map.getContainer().getBoundingClientRect();     // floating UI (window switch, legend, time bar, zoom) = hard
    Array.prototype.forEach.call(document.querySelectorAll("#winbar, #legend, #timebar, .leaflet-control-zoom, .leaflet-control-attribution"), function (el) {
      var r = el.getBoundingClientRect(); if (r.width) boxes.push([r.left - mr.left - 3, r.top - mr.top - 3, r.right - mr.left + 3, r.bottom - mr.top + 3]);
    });
    function nsoft(b) { var n = 0; for (var i = 0; i < soft.length; i++) if (hit(b, soft[i])) n++; return n; }
    function free(b, arr) { for (var i = 0; i < arr.length; i++) if (hit(b, arr[i])) return false; return true; }
    S.geo.features.forEach(function (f) {
      var pr = f.properties; if (!pr.lp || !pr.lb) return;
      var st = stats(pr.key), act = st.score > 0, R = S.data.regions[pr.key];
      if (!act && pr.ar < minAr) return;
      if (z <= 4 && !act) return;
      var p = map.latLngToContainerPoint(pr.lp), dp = null;
      // keep clear of this region's own drone marker: drop the label just below it
      if (st.m && R && R.ll) {
        var d = map.latLngToContainerPoint(R.ll); dp = d;
        if (Math.abs(d.x - p.x) < 60 && Math.abs(d.y - p.y) < 24) p = L.point(d.x, d.y + (small ? 12 : 15) + px * 0.7);
      }
      var txt = z <= 4 ? (pr.ls || pr.lb) : pr.lb;
      cands.push({ pr: pr, t: txt, p: p, g: f.geometry, w: textW(txt, px), h: px * 1.25,
                   dp: dp, pri: (st.st === 2 || st.ms ? 3e6 : 0) + (act ? 1e6 + st.score * 100 : 0) + pr.ar, act: act });
    });
    cands.sort(function (a, b) { return b.pri - a.pri; });
    var sz = map.getSize(), dy = px * 1.3;
    cands.forEach(function (c) {
      // try the anchor point, then nudged below / above / sideways (still inside the region's neighbourhood)
      var offs = [[0, 0], [0, dy], [0, -dy], [c.w * 0.3, 0], [-c.w * 0.3, 0], [0, 1.8 * dy], [0, -1.8 * dy]], box = null;
      // first free spot that avoids every glyph; active regions may fall back to the spot touching the fewest hit/airport marks
      // (never a label, drone or UI control)
      var best = null, bestN = 1e9, bestP = null, pts = offs.map(function (o) { return [c.p.x + o[0], c.p.y + o[1], 1]; });
      pts[0][2] = 0;
      if (c.dp) {   // tight spots: hug the region's own drone marker (below / above / right / left of it)
        var ih = (small ? 12 : 15) + 1;
        pts.push([c.dp.x, c.dp.y + ih + c.h / 2, 0], [c.dp.x, c.dp.y - ih - c.h / 2, 0],
                 [c.dp.x + ih + c.w / 2 + 2, c.dp.y, 0], [c.dp.x - ih - c.w / 2 - 2, c.dp.y, 0]);
      }
      for (var k = 0; k < pts.length && !box; k++) {
        var x = pts[k][0], y = pts[k][1];
        var b = [x - c.w / 2 - 2, y - c.h / 2, x + c.w / 2 + 2, y + c.h / 2];
        if (b[0] < 4 || b[1] < 4 || b[2] > sz.x - 4 || b[3] > sz.y - 4) continue;   // never cut at the viewport edge
        if (pts[k][2] && !inside(c.g, map.containerPointToLatLng([x, y]))) continue;           // nudged label must stay in its region
        if (!free(b, boxes)) continue;
        var n = nsoft(b);
        if (!n) { box = b; c.p = L.point(x, y); }
        else if (c.act && n < bestN) { best = b; bestN = n; bestP = L.point(x, y); }
      }
      if (!box && best) { box = best; c.p = bestP; }
      if (!box) return;
      boxes.push(box);
      L.marker(map.containerPointToLatLng(c.p), {
        pane: "labels", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "rlab" + (c.act ? " act" : ""), html: '<span style="font-size:' + px + 'px">' + esc(c.t) + "</span>", iconSize: [0, 0] })
      }).addTo(lbLayer);
    });
  }
  map.on("zoomend moveend resize", function () { if (S.data) renderLabels(); });

  function render() {
    if (!gLayer) return;
    gLayer.setStyle(style);
    gLayer.eachLayer(function (l) { var s = stats(l.feature.properties.key); if (s.st === 2) l.bringToFront(); });
    drLayer.clearLayers(); msLayer.clearLayers(); seaLayer.clearLayers(); incLayer.clearLayers(); apLayer.clearLayers();
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
      if (st.ms) {   // missile danger: small rocket beside the drone (upper right), or alone at the marker point
        var ms = small ? 16 : 18, dz = small ? 24 : 30, off = st.m ? [-(dz / 2 + 1), dz / 2 - 2] : [ms / 2, ms / 2];
        L.marker(ll, { icon: L.divIcon({ className: "mk msl", html: missileSvg(ms, st.msa), iconSize: [ms, ms], iconAnchor: off }), zIndexOffset: 450 })
          .bindTooltip(esc(short(r)) + " — ракетная опасность" + (st.msa ? " · не снята" : ""), { className: "rt", direction: "top" })
          .on("click", function () { openPanel(r); }).addTo(msLayer);
      }
      if (S.data.seas[r] && st.score) L.marker(ll, { icon: L.divIcon({ className: "mk", html: '<span class="sea">' + esc(r) + " · " + st.score + "</span>", iconSize: null }) })
        .on("click", function () { openPanel(r); }).addTo(seaLayer);
    });
    var rg = viewRange();
    dirLayer.clearLayers();
    if (dirOn) (S.data.dirs || []).forEach(function (d) {   // reported directions: faint arrow X -> toward Y, fades with age
      var t = tparse(d.t); if (t < rg[0] || t >= rg[1]) return;
      var f = 1 - (rg[1] - t) / Math.max(rg[1] - rg[0], 1), op = 0.25 + 0.55 * f;
      var tip = "направление по сообщению · " + fmtHm(t) + " · " + esc(d.x) + " → " + (d.y ? esc(d.y) : "?") + " · " + esc((d.ch || []).join(", "));
      var ln = L.polyline([d.a, d.b], { pane: "dirs", color: "#d9d6cc", weight: small ? 1.2 : 1.4, opacity: op, interactive: true })
        .bindTooltip(tip, { className: "rt", sticky: true }).addTo(dirLayer);
      if (d.u) ln.on("click", function () { window.open(d.u, "_blank", "noopener"); });
      var dy = d.b[0] - d.a[0], dx = (d.b[1] - d.a[1]) * Math.cos(d.a[0] * Math.PI / 180), ang = Math.atan2(dx, dy) * 180 / Math.PI;
      L.marker(d.b, { pane: "dirs", interactive: false, icon: L.divIcon({ className: "mk dirh", iconSize: [10, 10], iconAnchor: [5, 5],
        html: '<svg width="10" height="10" viewBox="0 0 10 10" style="transform:rotate(' + ang.toFixed(0) + 'deg);opacity:' + op.toFixed(2) + '"><path d="M5 0.5 L9 9 L5 6.8 L1 9 Z" fill="#d9d6cc"/></svg>' }) }).addTo(dirLayer);
    });
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
    renderLabels();
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
    var w = (a.w[S.w] || { n: 0 });
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
    var aps = S.data.airports.filter(function (a) { return a.r === r && ((a.w[S.w] || { n: 0 }).n || a.closed); });
    if (aps.length) {
      h += "<h3>Аэропорты</h3>";
      aps.forEach(function (a) {
        h += '<div class="ev">' + (a.closed ? '<span class="tag alert">ограничения</span>' : '<span class="tag">норм.</span>') + "<b>" + esc(a.name) + "</b> · эпизодов " +
          '<span class="num">' + ((a.w[S.w] || { n: 0 }).n || 0) + "</span>" + ((a.w[S.w] || { n: 0 }).lc ? ", посл. " + esc(fmt((a.w[S.w] || { n: 0 }).lc)) : "") + " · " + links(a.u, "ист.") + "</div>";
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
    h += '<div class="cta">Срочные сообщения, сводки МО за ночь и сутки — в Telegram-канале ' +
      '<a href="https://t.me/uavfront" target="_blank" rel="noopener">@uavfront</a>. Подпишитесь, чтобы не пропустить.</div>';
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
  document.getElementById("lgMs").innerHTML = missileSvg(16, true);
  document.getElementById("lgInc").innerHTML = incSvg("o");
  document.getElementById("lgDir").innerHTML = '<svg width="22" height="10" viewBox="0 0 22 10"><path d="M1 5 H17" stroke="#d9d6cc" stroke-width="1.4" opacity=".75"/><path d="M21 5 L13 1.5 L15 5 L13 8.5 Z" fill="#d9d6cc" opacity=".75"/></svg>';
  document.getElementById("dirTg").onchange = function (ev) { dirOn = ev.target.checked; render(); };
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
      if (SNAP) {
        var bb = (Q.get("bb") || "43,27,61,56").split(",").map(Number);
        map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: [6, 6] });
        if (Q.get("sw")) {
          S.w = "c";
          var to = Q.get("to") ? tparse(Q.get("to")) : tparse(S.data.now);
          S.h = Math.max(0, Math.min(167, Math.round((to - tparse(S.data.series_start)) / 3600000) - 1)); S.live = false;
        }
        render();
        setTimeout(function () { window.__snapReady = true; }, 300);
        return;
      }
      if (window.innerWidth < 700) map.setView([50.5, 38.5], 4); else map.fitBounds([[43, 27], [61, 56]]);
      render();
    })
    .catch(function (e) { console.error(e); document.getElementById("upd").textContent = "ошибка загрузки данных"; });
})();
