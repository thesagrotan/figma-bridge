/**
 * Stringer – Channel Navigation Frames
 * ======================================
 * Builds three new frames on the layout page adjacent to the existing
 * `model` and `model — insight detail` frames:
 *
 *   Frame 1 — "model — channel view (single channel)"
 *     Trigger: user clicks the colored broadcast logo on an insight card.
 *     Shows channel header, auto-follow toggle, live broadcast, archived broadcasts.
 *
 *   Frame 2 — "model — channel management (directory)"
 *     Trigger: user clicks a "Channels" button or filter action in the feed header.
 *     Shows global channel list with add/toggle/status for each subscription.
 *
 *   Frame 3 — "model — broadcast detail (from channel)"
 *     Trigger: user taps a broadcast row inside the channel view.
 *     Shows broadcast transcript timeline and back nav to channel.
 *
 * Run in Figma Desktop: Plugins → Development → Open Console → Paste → Enter
 */
(async () => {
  // ─────────────────────────── helpers ────────────────────────────

  const loadFonts = async () => {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  };

  const solid = (r, g, b, a = 1) => ({ type: "SOLID", color: { r, g, b }, opacity: a });

  // Colours
  const C = {
    bg:           solid(1, 1, 1),
    titlebar:     solid(0.98, 0.98, 0.98),
    border:       solid(0.88, 0.88, 0.88),
    divider:      solid(0.90, 0.90, 0.90),
    blue:         solid(0.0, 0.478, 1.0),
    blueWash:     solid(0.91, 0.95, 1.0),
    blueBorder:   solid(0.7, 0.82, 1.0),
    selected:     solid(0.965, 0.98, 1.0),
    surface:      solid(0.985, 0.985, 0.99),
    surface2:     solid(0.96, 0.96, 0.97),
    chip:         solid(0.93, 0.93, 0.95),
    chipActive:   solid(0.0, 0.478, 1.0),
    liveRed:      solid(1.0, 0.23, 0.19),
    liveRedWash:  solid(1.0, 0.93, 0.93),
    text:         solid(0.1, 0.1, 0.12),
    textSub:      solid(0.5, 0.5, 0.53),
    textMid:      solid(0.3, 0.3, 0.34),
    textLight:    solid(0.7, 0.7, 0.72),
    greenOn:      solid(0.16, 0.80, 0.38),
    toggle:       solid(0.235, 0.78, 0.455),   // system green
    toggleOff:    solid(0.82, 0.82, 0.84),
  };

  // channel brand colours (matching the coloured squares in model)
  const BRANDS = [
    { name: "Bloomberg",      r: 0.17, g: 0.44, b: 0.75 },  // blue
    { name: "CNBC",           r: 0.18, g: 0.54, b: 0.34 },  // green
    { name: "Federal Reserve",r: 0.78, g: 0.22, b: 0.22 },  // red
    { name: "C-SPAN",         r: 0.52, g: 0.18, b: 0.62 },  // purple
    { name: "Reuters",        r: 0.90, g: 0.55, b: 0.10 },  // amber
  ];

  // Reference model frame for positioning
  const modelFrame = figma.currentPage.findOne(n => n.name === "model" && n.type === "FRAME");
  if (!modelFrame) { figma.notify("'model' frame not found", { error: true }); return; }
  const detailFrame = figma.currentPage.findOne(n => n.name === "model — insight detail (selected state)");

  const BASE_X = modelFrame.x;
  const BASE_Y = modelFrame.y;
  const W = modelFrame.width;   // 900
  const H = modelFrame.height;  // 700
  const GAP = 60;

  // Place new frames to the right of detail frame (or model if no detail)
  const rightAnchor = detailFrame ? (detailFrame.x + detailFrame.width) : (modelFrame.x + modelFrame.width);
  let nextX = rightAnchor + GAP;

  // ─────────────────────────── shared builders ────────────────────

  /** Remove old frame of same name */
  const clearExisting = (name) => {
    const old = figma.currentPage.findOne(n => n.name === name && n.type === "FRAME");
    if (old) old.remove();
  };

  /** macOS window shell */
  const makeWindowShell = (name, x, y) => {
    const frame = figma.createFrame();
    frame.name = name;
    frame.resize(W, H);
    frame.x = x; frame.y = y;
    frame.cornerRadius = 10;
    frame.clipsContent = true;
    frame.fills = [C.bg];
    frame.strokes = [C.border];
    frame.strokeWeight = 1;

    // titlebar
    const tb = figma.createFrame();
    tb.name = "TitleBar";
    tb.resize(W, 44);
    tb.fills = [C.titlebar];
    tb.strokes = [C.border];
    tb.strokeWeight = 1;
    frame.appendChild(tb);

    // traffic lights
    [{ r: 0.99, g: 0.38, b: 0.36 }, { r: 1.0, g: 0.74, b: 0.18 }, { r: 0.16, g: 0.80, b: 0.38 }]
      .forEach((c, i) => {
        const dot = figma.createEllipse();
        dot.name = "TrafficLight";
        dot.resize(10, 10);
        dot.x = 18 + i * 18; dot.y = 17;
        dot.fills = [solid(c.r, c.g, c.b)];
        tb.appendChild(dot);
      });

    // vertical column divider at x=487
    const div = figma.createLine();
    div.name = "Divider/Columns";
    div.x = 487; div.y = 44;
    div.resize(H - 44, 0);
    div.rotation = -90;
    div.strokes = [C.divider];
    frame.appendChild(div);

    return frame;
  };

  /** Left content column */
  const makeLeftCol = (parent) => {
    const col = figma.createFrame();
    col.name = "FeedColumn";
    col.x = 0; col.y = 44;
    col.resize(487, H - 44);
    col.fills = [];
    col.clipsContent = true;
    parent.appendChild(col);
    return col;
  };

  /** Right canvas column (preserved, same as model) */
  const makeRightCol = (parent) => {
    const col = figma.createFrame();
    col.name = "CanvasColumn";
    col.x = 524; col.y = 56;
    col.resize(350, H - 72);
    col.layoutMode = "VERTICAL";
    col.itemSpacing = 16;
    col.fills = [];
    parent.appendChild(col);

    const cHead = figma.createText();
    cHead.fontName = { family: "Inter", style: "Semi Bold" };
    cHead.characters = "Canvas";
    cHead.fontSize = 14;
    cHead.fills = [C.textSub];
    col.appendChild(cHead);

    for (let i = 0; i < 3; i++) {
      const card = figma.createFrame();
      card.name = "CanvasCard";
      card.resize(340, i === 0 ? 140 : 110);
      card.cornerRadius = 8;
      card.fills = [C.surface2];
      card.strokes = [C.divider];
      card.strokeWeight = 1;
      col.appendChild(card);
    }
    return col;
  };

  /** Nav bar with back chevron */
  const makeNavBar = (parent, label, badge, x = 24, y = 56) => {
    const nav = figma.createFrame();
    nav.name = "NavigationBar";
    nav.layoutMode = "HORIZONTAL";
    nav.counterAxisAlignItems = "CENTER";
    nav.itemSpacing = 5;
    nav.x = x; nav.y = y;
    nav.resize(440, 28);
    nav.fills = [];

    const chev = figma.createText();
    chev.fontName = { family: "Inter", style: "Semi Bold" };
    chev.characters = "‹";
    chev.fontSize = 20;
    chev.fills = [C.blue];
    nav.appendChild(chev);

    const lbl = figma.createText();
    lbl.fontName = { family: "Inter", style: "Medium" };
    lbl.characters = label;
    lbl.fontSize = 14;
    lbl.fills = [C.blue];
    nav.appendChild(lbl);

    // spacer
    const sp = figma.createFrame();
    sp.name = "Spacer"; sp.layoutGrow = 1; sp.resize(10, 10); sp.fills = [];
    nav.appendChild(sp);

    if (badge) {
      const b = figma.createFrame();
      b.name = "Breadcrumb";
      b.layoutMode = "HORIZONTAL";
      b.paddingLeft = 8; b.paddingRight = 8;
      b.paddingTop = 3; b.paddingBottom = 3;
      b.cornerRadius = 6;
      b.fills = [C.chip];
      const bt = figma.createText();
      bt.fontName = { family: "Inter", style: "Medium" };
      bt.characters = badge;
      bt.fontSize = 11;
      bt.fills = [C.textSub];
      b.appendChild(bt);
      nav.appendChild(b);
    }

    parent.appendChild(nav);
    return nav;
  };

  /** Simple text node */
  const txt = (parent, chars, fontSize, style, colorKey, x, y, w, lineH) => {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: style || "Regular" };
    t.characters = chars;
    t.fontSize = fontSize || 13;
    t.fills = [colorKey];
    if (x !== undefined) t.x = x;
    if (y !== undefined) t.y = y;
    if (w !== undefined) { t.resize(w, t.height); t.textAutoResize = "HEIGHT"; }
    if (lineH) t.lineHeight = { value: lineH, unit: "PIXELS" };
    parent.appendChild(t);
    return t;
  };

  /** macOS-style toggle */
  const makeToggle = (parent, x, y, on = true) => {
    const track = figma.createFrame();
    track.name = "Toggle/Track";
    track.resize(36, 22);
    track.x = x; track.y = y;
    track.cornerRadius = 11;
    track.fills = [on ? C.toggle : C.toggleOff];
    parent.appendChild(track);

    const thumb = figma.createEllipse();
    thumb.name = "Toggle/Thumb";
    thumb.resize(18, 18);
    thumb.x = on ? 16 : 2; thumb.y = 2;
    thumb.fills = [solid(1, 1, 1)];
    track.appendChild(thumb);

    return track;
  };

  /** Live pulse indicator */
  const makeLivePill = (parent, x, y) => {
    const pill = figma.createFrame();
    pill.name = "LivePill";
    pill.layoutMode = "HORIZONTAL";
    pill.counterAxisAlignItems = "CENTER";
    pill.itemSpacing = 4;
    pill.paddingLeft = 7; pill.paddingRight = 8;
    pill.paddingTop = 3; pill.paddingBottom = 3;
    pill.cornerRadius = 5;
    pill.x = x; pill.y = y;
    pill.fills = [C.liveRedWash];
    pill.strokes = [solid(1.0, 0.23, 0.19, 0.3)];
    pill.strokeWeight = 1;

    const dot = figma.createEllipse();
    dot.name = "LiveDot";
    dot.resize(6, 6);
    dot.fills = [C.liveRed];
    pill.appendChild(dot);

    const lt = figma.createText();
    lt.fontName = { family: "Inter", style: "Semi Bold" };
    lt.characters = "LIVE";
    lt.fontSize = 10;
    lt.fills = [C.liveRed];
    pill.appendChild(lt);

    parent.appendChild(pill);
    return pill;
  };

  /** Horizontal separator line */
  const makeSep = (parent, x, y, w = 440) => {
    const line = figma.createLine();
    line.name = "Separator";
    line.x = x; line.y = y;
    line.resize(w, 0);
    line.strokes = [C.divider];
    parent.appendChild(line);
    return line;
  };

  // ═══════════════════════════════════════════════════════════════
  // FRAME 1 — Single Channel View
  // ═══════════════════════════════════════════════════════════════
  await loadFonts();
  clearExisting("model — channel view");

  const chFrame = makeWindowShell("model — channel view", nextX, BASE_Y);
  nextX += W + GAP;
  const chLeft = makeLeftCol(chFrame);

  // ── Nav ‹ Feed
  makeNavBar(chLeft, "Feed", "Channel View", 24, 12);

  // ── Channel header block ──────────────────────────────────────
  const brand = BRANDS[0]; // Bloomberg (blue)

  const chHeader = figma.createFrame();
  chHeader.name = "ChannelHeader";
  chHeader.x = 16; chHeader.y = 50;
  chHeader.resize(455, 72);
  chHeader.layoutMode = "HORIZONTAL";
  chHeader.counterAxisAlignItems = "CENTER";
  chHeader.itemSpacing = 14;
  chHeader.paddingLeft = 14; chHeader.paddingRight = 14;
  chHeader.paddingTop = 12; chHeader.paddingBottom = 12;
  chHeader.cornerRadius = 10;
  chHeader.fills = [C.selected];
  chHeader.strokes = [C.blueBorder];
  chHeader.strokeWeight = 1;
  chLeft.appendChild(chHeader);

  // Logo
  const chLogo = figma.createFrame();
  chLogo.name = "ChannelLogo";
  chLogo.resize(44, 44);
  chLogo.cornerRadius = 10;
  chLogo.fills = [solid(brand.r, brand.g, brand.b)];
  chHeader.appendChild(chLogo);

  // Info block
  const chInfo = figma.createFrame();
  chInfo.name = "ChannelInfo";
  chInfo.layoutMode = "VERTICAL";
  chInfo.itemSpacing = 3;
  chInfo.layoutGrow = 1;
  chInfo.resize(10, 44);
  chInfo.fills = [];
  chHeader.appendChild(chInfo);

  txt(chInfo, "Bloomberg Television", 15, "Semi Bold", C.text);
  txt(chInfo, "bloomberg.com/live  •  English  •  Finance / Markets", 11, "Regular", C.textSub);

  // Status chip
  const statusChip = figma.createFrame();
  statusChip.name = "StatusChip";
  statusChip.layoutMode = "HORIZONTAL";
  statusChip.counterAxisAlignItems = "CENTER";
  statusChip.itemSpacing = 4;
  statusChip.paddingLeft = 7; statusChip.paddingRight = 8;
  statusChip.paddingTop = 3; statusChip.paddingBottom = 3;
  statusChip.cornerRadius = 5;
  statusChip.fills = [C.chip];
  const sdot = figma.createEllipse();
  sdot.resize(6, 6); sdot.fills = [C.greenOn];
  statusChip.appendChild(sdot);
  const stxt = figma.createText();
  stxt.fontName = { family: "Inter", style: "Medium" };
  stxt.characters = "Active"; stxt.fontSize = 11;
  stxt.fills = [C.textMid];
  statusChip.appendChild(stxt);
  chInfo.appendChild(statusChip);

  // Edit button
  const editBtn = figma.createFrame();
  editBtn.name = "EditButton";
  editBtn.layoutMode = "HORIZONTAL";
  editBtn.paddingLeft = 10; editBtn.paddingRight = 10;
  editBtn.paddingTop = 6; editBtn.paddingBottom = 6;
  editBtn.cornerRadius = 6;
  editBtn.fills = [C.chip];
  const et = figma.createText();
  et.fontName = { family: "Inter", style: "Medium" };
  et.characters = "Edit"; et.fontSize = 12; et.fills = [C.textMid];
  editBtn.appendChild(et);
  chHeader.appendChild(editBtn);

  // ── Auto-Follow toggle row ────────────────────────────────────
  const toggleRow = figma.createFrame();
  toggleRow.name = "AutoFollowRow";
  toggleRow.x = 16; toggleRow.y = 134;
  toggleRow.resize(455, 52);
  toggleRow.layoutMode = "HORIZONTAL";
  toggleRow.counterAxisAlignItems = "CENTER";
  toggleRow.itemSpacing = 12;
  toggleRow.paddingLeft = 14; toggleRow.paddingRight = 14;
  toggleRow.paddingTop = 12; toggleRow.paddingBottom = 12;
  toggleRow.cornerRadius = 10;
  toggleRow.fills = [C.surface];
  toggleRow.strokes = [C.divider];
  toggleRow.strokeWeight = 1;
  chLeft.appendChild(toggleRow);

  const toggleInfo = figma.createFrame();
  toggleInfo.name = "ToggleInfo";
  toggleInfo.layoutMode = "VERTICAL";
  toggleInfo.itemSpacing = 2;
  toggleInfo.layoutGrow = 1;
  toggleInfo.resize(10, 30);
  toggleInfo.fills = [];
  toggleRow.appendChild(toggleInfo);

  txt(toggleInfo, "Auto-follow new live broadcasts", 13, "Medium", C.text);
  txt(toggleInfo, "Automatically ingest new streams from this channel", 11, "Regular", C.textSub);

  makeToggle(toggleRow, 0, 0, true);

  // ── Section header: Broadcasts ────────────────────────────────
  const bSec = figma.createFrame();
  bSec.name = "SectionHeader/Broadcasts";
  bSec.x = 16; bSec.y = 200;
  bSec.resize(455, 24);
  bSec.layoutMode = "HORIZONTAL";
  bSec.counterAxisAlignItems = "CENTER";
  bSec.fills = [];
  chLeft.appendChild(bSec);

  const bLabel = figma.createText();
  bLabel.fontName = { family: "Inter", style: "Semi Bold" };
  bLabel.characters = "BROADCASTS";
  bLabel.fontSize = 11;
  bLabel.letterSpacing = { value: 0.5, unit: "PIXELS" };
  bLabel.fills = [C.textSub];
  bSec.appendChild(bLabel);

  const bSpacer = figma.createFrame();
  bSpacer.name = "Spacer"; bSpacer.layoutGrow = 1; bSpacer.resize(10, 1); bSpacer.fills = [];
  bSec.appendChild(bSpacer);

  const bCount = figma.createText();
  bCount.fontName = { family: "Inter", style: "Regular" };
  bCount.characters = "1 live · 4 past";
  bCount.fontSize = 11;
  bCount.fills = [C.textSub];
  bSec.appendChild(bCount);

  // ── Live broadcast row ────────────────────────────────────────
  const liveRow = figma.createFrame();
  liveRow.name = "BroadcastRow/Live";
  liveRow.x = 16; liveRow.y = 234;
  liveRow.resize(455, 68);
  liveRow.layoutMode = "VERTICAL";
  liveRow.itemSpacing = 4;
  liveRow.paddingLeft = 14; liveRow.paddingRight = 14;
  liveRow.paddingTop = 10; liveRow.paddingBottom = 10;
  liveRow.cornerRadius = 10;
  liveRow.fills = [C.liveRedWash];
  liveRow.strokes = [solid(1.0, 0.23, 0.19, 0.25)];
  liveRow.strokeWeight = 1;
  chLeft.appendChild(liveRow);

  // top row: title + live pill
  const lrTop = figma.createFrame();
  lrTop.name = "TopRow";
  lrTop.layoutMode = "HORIZONTAL";
  lrTop.counterAxisAlignItems = "CENTER";
  lrTop.itemSpacing = 8;
  lrTop.resize(427, 20);
  lrTop.fills = [];
  liveRow.appendChild(lrTop);

  const lrTitle = figma.createText();
  lrTitle.fontName = { family: "Inter", style: "Semi Bold" };
  lrTitle.characters = "Markets Open — Fed Rate Decision Special";
  lrTitle.fontSize = 13;
  lrTitle.fills = [C.text];
  lrTop.appendChild(lrTitle);

  const lrSpacer = figma.createFrame();
  lrSpacer.name = "Spacer"; lrSpacer.layoutGrow = 1; lrSpacer.resize(10, 1); lrSpacer.fills = [];
  lrTop.appendChild(lrSpacer);

  makeLivePill(lrTop, 0, 0);

  const lrSub = figma.createText();
  lrSub.fontName = { family: "Inter", style: "Regular" };
  lrSub.characters = "Started 14:00 · 47 insights extracted · Tap to open";
  lrSub.fontSize = 11;
  lrSub.fills = [C.textMid];
  liveRow.appendChild(lrSub);

  // ── Past broadcasts ───────────────────────────────────────────
  const pastData = [
    { title: "Powell Presser — September 2025", date: "Sep 18 · 2:04:12 · 134 insights" },
    { title: "CPI Data Reaction: Live Markets",  date: "Sep 11 · 1:22:08 · 89 insights" },
    { title: "Jobs Report Special Coverage",     date: "Sep 4  · 0:58:34 · 61 insights" },
    { title: "FOMC Minutes Release",             date: "Aug 21 · 0:44:17 · 43 insights" },
  ];

  let pastY = 314;
  pastData.forEach((d, idx) => {
    const row = figma.createFrame();
    row.name = `BroadcastRow/Past/${idx + 1}`;
    row.x = 16; row.y = pastY;
    row.resize(455, 52);
    row.layoutMode = "HORIZONTAL";
    row.counterAxisAlignItems = "CENTER";
    row.itemSpacing = 10;
    row.paddingLeft = 14; row.paddingRight = 14;
    row.paddingTop = 10; row.paddingBottom = 10;
    row.cornerRadius = 8;
    row.fills = [C.surface];
    row.strokes = [C.divider];
    row.strokeWeight = 1;
    chLeft.appendChild(row);

    // Icon for archived broadcast (simple waveform-ish rectangle)
    const ico = figma.createFrame();
    ico.name = "BroadcastIcon";
    ico.resize(28, 28);
    ico.cornerRadius = 6;
    ico.fills = [C.chip];
    row.appendChild(ico);
    // tiny bars inside
    [10, 17, 10, 20, 14].forEach((h, bi) => {
      const bar = figma.createFrame();
      bar.name = "bar";
      bar.resize(3, h);
      bar.x = 4 + bi * 5; bar.y = 14 - h/2;
      bar.cornerRadius = 1.5;
      bar.fills = [C.textLight];
      ico.appendChild(bar);
    });

    const rowInfo = figma.createFrame();
    rowInfo.name = "RowInfo";
    rowInfo.layoutMode = "VERTICAL";
    rowInfo.itemSpacing = 2;
    rowInfo.layoutGrow = 1;
    rowInfo.resize(10, 32);
    rowInfo.fills = [];
    row.appendChild(rowInfo);

    txt(rowInfo, d.title, 13, "Medium", C.text);
    txt(rowInfo, d.date, 11, "Regular", C.textSub);

    // chevron
    const chv = figma.createText();
    chv.fontName = { family: "Inter", style: "Regular" };
    chv.characters = "›";
    chv.fontSize = 18;
    chv.fills = [C.textLight];
    row.appendChild(chv);

    pastY += 60;
  });

  // Right column (canvas preserved)
  makeRightCol(chFrame);
  figma.notify("✅ Frame 1/3 — Channel View built");

  // ═══════════════════════════════════════════════════════════════
  // FRAME 2 — Channel Management / Directory
  // ═══════════════════════════════════════════════════════════════
  clearExisting("model — channel management");

  const mgFrame = makeWindowShell("model — channel management", nextX, BASE_Y);
  nextX += W + GAP;
  const mgLeft = makeLeftCol(mgFrame);

  // Nav (no back – this is top-level)
  const mgNav = figma.createFrame();
  mgNav.name = "PanelHeader";
  mgNav.x = 16; mgNav.y = 12;
  mgNav.resize(455, 30);
  mgNav.layoutMode = "HORIZONTAL";
  mgNav.counterAxisAlignItems = "CENTER";
  mgNav.fills = [];
  mgLeft.appendChild(mgNav);

  const mgTitle = figma.createText();
  mgTitle.fontName = { family: "Inter", style: "Semi Bold" };
  mgTitle.characters = "Channels";
  mgTitle.fontSize = 17;
  mgTitle.fills = [C.text];
  mgNav.appendChild(mgTitle);

  const mgSpacer = figma.createFrame();
  mgSpacer.name = "Spacer"; mgSpacer.layoutGrow = 1; mgSpacer.resize(10, 1); mgSpacer.fills = [];
  mgNav.appendChild(mgSpacer);

  // Add channel button
  const addBtn = figma.createFrame();
  addBtn.name = "AddChannelButton";
  addBtn.layoutMode = "HORIZONTAL";
  addBtn.counterAxisAlignItems = "CENTER";
  addBtn.itemSpacing = 5;
  addBtn.paddingLeft = 10; addBtn.paddingRight = 12;
  addBtn.paddingTop = 6; addBtn.paddingBottom = 6;
  addBtn.cornerRadius = 7;
  addBtn.fills = [C.chipActive];
  const plusT = figma.createText();
  plusT.fontName = { family: "Inter", style: "Semi Bold" };
  plusT.characters = "+"; plusT.fontSize = 15; plusT.fills = [solid(1, 1, 1)];
  addBtn.appendChild(plusT);
  const addT = figma.createText();
  addT.fontName = { family: "Inter", style: "Medium" };
  addT.characters = "Add Channel"; addT.fontSize = 13; addT.fills = [solid(1, 1, 1)];
  addBtn.appendChild(addT);
  mgNav.appendChild(addBtn);

  // Filter tabs
  const tabRow = figma.createFrame();
  tabRow.name = "FilterTabs";
  tabRow.x = 16; tabRow.y = 54;
  tabRow.resize(455, 30);
  tabRow.layoutMode = "HORIZONTAL";
  tabRow.counterAxisAlignItems = "CENTER";
  tabRow.itemSpacing = 6;
  tabRow.fills = [];
  mgLeft.appendChild(tabRow);

  ["All", "Active", "Paused", "Archived"].forEach((t, i) => {
    const tab = figma.createFrame();
    tab.name = `Tab/${t}`;
    tab.layoutMode = "HORIZONTAL";
    tab.paddingLeft = 12; tab.paddingRight = 12;
    tab.paddingTop = 5; tab.paddingBottom = 5;
    tab.cornerRadius = 7;
    tab.fills = [i === 0 ? C.chipActive : C.chip];
    const tt = figma.createText();
    tt.fontName = { family: "Inter", style: i === 0 ? "Semi Bold" : "Regular" };
    tt.characters = t; tt.fontSize = 12;
    tt.fills = [i === 0 ? solid(1, 1, 1) : C.textMid];
    tab.appendChild(tt);
    tabRow.appendChild(tab);
  });

  // Search bar
  const searchBar = figma.createFrame();
  searchBar.name = "SearchBar";
  searchBar.x = 16; searchBar.y = 96;
  searchBar.resize(455, 32);
  searchBar.cornerRadius = 8;
  searchBar.fills = [C.surface];
  searchBar.strokes = [C.divider];
  searchBar.strokeWeight = 1;
  searchBar.layoutMode = "HORIZONTAL";
  searchBar.counterAxisAlignItems = "CENTER";
  searchBar.itemSpacing = 7;
  searchBar.paddingLeft = 10; searchBar.paddingRight = 10;
  mgLeft.appendChild(searchBar);

  const srchIco = figma.createText();
  srchIco.fontName = { family: "Inter", style: "Regular" };
  srchIco.characters = "⌕"; srchIco.fontSize = 14; srchIco.fills = [C.textLight];
  searchBar.appendChild(srchIco);

  const srchPh = figma.createText();
  srchPh.fontName = { family: "Inter", style: "Regular" };
  srchPh.characters = "Search channels…"; srchPh.fontSize = 13; srchPh.fills = [C.textLight];
  searchBar.appendChild(srchPh);

  // Channel list rows
  const channelRowData = [
    { idx: 0, on: true,  insightRate: "~42 insights/hr",  status: "Live now" },
    { idx: 1, on: true,  insightRate: "~28 insights/hr",  status: "Live now" },
    { idx: 2, on: true,  insightRate: "~15 insights/hr",  status: "Last: 11:00" },
    { idx: 3, on: false, insightRate: "—",                status: "Paused" },
    { idx: 4, on: true,  insightRate: "~9 insights/hr",   status: "Live now" },
  ];

  let chRowY = 142;
  channelRowData.forEach((d) => {
    const b = BRANDS[d.idx];
    const chRow = figma.createFrame();
    chRow.name = `ChannelRow/${b.name}`;
    chRow.x = 16; chRow.y = chRowY;
    chRow.resize(455, 62);
    chRow.layoutMode = "HORIZONTAL";
    chRow.counterAxisAlignItems = "CENTER";
    chRow.itemSpacing = 12;
    chRow.paddingLeft = 14; chRow.paddingRight = 14;
    chRow.paddingTop = 10; chRow.paddingBottom = 10;
    chRow.cornerRadius = 10;
    chRow.fills = [C.surface];
    chRow.strokes = [C.divider];
    chRow.strokeWeight = 1;
    mgLeft.appendChild(chRow);

    const cLogo = figma.createFrame();
    cLogo.name = "Logo";
    cLogo.resize(36, 36);
    cLogo.cornerRadius = 8;
    cLogo.fills = [solid(b.r, b.g, b.b)];
    chRow.appendChild(cLogo);

    const cMeta = figma.createFrame();
    cMeta.name = "Meta";
    cMeta.layoutMode = "VERTICAL";
    cMeta.itemSpacing = 2;
    cMeta.layoutGrow = 1;
    cMeta.resize(10, 42);
    cMeta.fills = [];
    chRow.appendChild(cMeta);

    txt(cMeta, b.name, 13, "Semi Bold", C.text);

    // inline status
    const metaBot = figma.createFrame();
    metaBot.name = "MetaBottom";
    metaBot.layoutMode = "HORIZONTAL";
    metaBot.counterAxisAlignItems = "CENTER";
    metaBot.itemSpacing = 6;
    metaBot.fills = [];
    cMeta.appendChild(metaBot);

    if (d.on && d.status.includes("Live")) {
      const ldot = figma.createEllipse();
      ldot.resize(6, 6); ldot.fills = [C.liveRed];
      metaBot.appendChild(ldot);
    }
    const stLabel = figma.createText();
    stLabel.fontName = { family: "Inter", style: "Regular" };
    stLabel.characters = d.status; stLabel.fontSize = 11;
    stLabel.fills = [d.on && d.status.includes("Live") ? C.liveRed : C.textSub];
    metaBot.appendChild(stLabel);

    const sep2 = figma.createText();
    sep2.fontName = { family: "Inter", style: "Regular" };
    sep2.characters = "·"; sep2.fontSize = 11; sep2.fills = [C.textLight];
    metaBot.appendChild(sep2);

    const rateT = figma.createText();
    rateT.fontName = { family: "Inter", style: "Regular" };
    rateT.characters = d.insightRate; rateT.fontSize = 11; rateT.fills = [C.textSub];
    metaBot.appendChild(rateT);

    makeToggle(chRow, 0, 0, d.on);

    // chevron to open channel detail
    const chv2 = figma.createText();
    chv2.fontName = { family: "Inter", style: "Regular" };
    chv2.characters = "›"; chv2.fontSize = 18; chv2.fills = [C.textLight];
    chRow.appendChild(chv2);

    chRowY += 70;
  });

  // Insight rate summary footer
  const footer = figma.createFrame();
  footer.name = "InsightRateFooter";
  footer.x = 16; footer.y = 500;
  footer.resize(455, 44);
  footer.cornerRadius = 8;
  footer.fills = [C.blueWash];
  footer.strokes = [C.blueBorder];
  footer.strokeWeight = 1;
  footer.layoutMode = "HORIZONTAL";
  footer.counterAxisAlignItems = "CENTER";
  footer.itemSpacing = 8;
  footer.paddingLeft = 14; footer.paddingRight = 14;
  mgLeft.appendChild(footer);

  txt(footer, "4 channels active", 12, "Medium", C.text);
  const fSp = figma.createFrame();
  fSp.name = "Spacer"; fSp.layoutGrow = 1; fSp.resize(10, 1); fSp.fills = [];
  footer.appendChild(fSp);
  txt(footer, "~94 insights / hr total", 12, "Regular", C.textMid);

  makeRightCol(mgFrame);
  figma.notify("✅ Frame 2/3 — Channel Management built");

  // ═══════════════════════════════════════════════════════════════
  // FRAME 3 — Broadcast Detail (entered from Channel View)
  // ═══════════════════════════════════════════════════════════════
  clearExisting("model — broadcast detail (from channel)");

  const bdFrame = makeWindowShell("model — broadcast detail (from channel)", nextX, BASE_Y);
  const bdLeft = makeLeftCol(bdFrame);

  // ── Nav: ‹ Bloomberg Television (channel name)
  makeNavBar(bdLeft, "Bloomberg Television", "Broadcast", 24, 12);

  // ── Broadcast header ──────────────────────────────────────────
  const bdHeader = figma.createFrame();
  bdHeader.name = "BroadcastHeader";
  bdHeader.x = 16; bdHeader.y = 50;
  bdHeader.resize(455, 80);
  bdHeader.layoutMode = "VERTICAL";
  bdHeader.itemSpacing = 6;
  bdHeader.paddingLeft = 14; bdHeader.paddingRight = 14;
  bdHeader.paddingTop = 12; bdHeader.paddingBottom = 12;
  bdHeader.cornerRadius = 10;
  bdHeader.fills = [C.selected];
  bdHeader.strokes = [C.blueBorder];
  bdHeader.strokeWeight = 1;
  bdLeft.appendChild(bdHeader);

  const bdTitleRow = figma.createFrame();
  bdTitleRow.name = "TitleRow";
  bdTitleRow.layoutMode = "HORIZONTAL";
  bdTitleRow.counterAxisAlignItems = "CENTER";
  bdTitleRow.itemSpacing = 8;
  bdTitleRow.resize(427, 22);
  bdTitleRow.fills = [];
  bdHeader.appendChild(bdTitleRow);

  txt(bdTitleRow, "Markets Open — Fed Rate Decision Special", 14, "Semi Bold", C.text);
  const bdSp = figma.createFrame();
  bdSp.name = "Spacer"; bdSp.layoutGrow = 1; bdSp.resize(10, 1); bdSp.fills = [];
  bdTitleRow.appendChild(bdSp);
  makeLivePill(bdTitleRow, 0, 0);

  const bdMeta = figma.createText();
  bdMeta.fontName = { family: "Inter", style: "Regular" };
  bdMeta.characters = "Bloomberg Television  ·  Started 14:00 today  ·  134 insights extracted";
  bdMeta.fontSize = 11;
  bdMeta.fills = [C.textSub];
  bdHeader.appendChild(bdMeta);

  // Progress bar (transcript coverage)
  const progTrack = figma.createFrame();
  progTrack.name = "ProgressTrack";
  progTrack.resize(427, 4);
  progTrack.cornerRadius = 2;
  progTrack.fills = [C.chip];
  bdHeader.appendChild(progTrack);
  const progFill = figma.createFrame();
  progFill.name = "ProgressFill";
  progFill.resize(280, 4);
  progFill.cornerRadius = 2;
  progFill.fills = [C.blue];
  progTrack.appendChild(progFill);

  // ── Insight timeline ──────────────────────────────────────────
  const tlSec = figma.createFrame();
  tlSec.name = "SectionHeader/Insights";
  tlSec.x = 16; tlSec.y = 144;
  tlSec.resize(455, 24);
  tlSec.layoutMode = "HORIZONTAL";
  tlSec.counterAxisAlignItems = "CENTER";
  tlSec.fills = [];
  bdLeft.appendChild(tlSec);

  const tlLbl = figma.createText();
  tlLbl.fontName = { family: "Inter", style: "Semi Bold" };
  tlLbl.characters = "INSIGHT TIMELINE";
  tlLbl.fontSize = 11;
  tlLbl.letterSpacing = { value: 0.5, unit: "PIXELS" };
  tlLbl.fills = [C.textSub];
  tlSec.appendChild(tlLbl);

  const tlSp = figma.createFrame();
  tlSp.name = "Spacer"; tlSp.layoutGrow = 1; tlSp.resize(10, 1); tlSp.fills = [];
  tlSec.appendChild(tlSp);

  // filter chips
  ["All", "Monetary", "Market", "Geopolitical"].forEach((f, fi) => {
    const fc = figma.createFrame();
    fc.name = `Filter/${f}`;
    fc.layoutMode = "HORIZONTAL";
    fc.paddingLeft = 8; fc.paddingRight = 8;
    fc.paddingTop = 3; fc.paddingBottom = 3;
    fc.cornerRadius = 5;
    fc.fills = [fi === 0 ? C.chipActive : C.chip];
    const ft = figma.createText();
    ft.fontName = { family: "Inter", style: "Regular" };
    ft.characters = f; ft.fontSize = 11;
    ft.fills = [fi === 0 ? solid(1,1,1) : C.textMid];
    fc.appendChild(ft);
    tlSec.appendChild(fc);
  });

  // Timeline entries
  const tlItems = [
    { time: "14:32", tag: "Monetary Policy", text: "Federal Reserve signals pause on benchmark rate adjustments amid stabilizing labor metrics." },
    { time: "14:28", tag: "Market Reaction",  text: "2-year Treasury yields dip 4 bps as traders reprice rate-cut probability for Q1." },
    { time: "14:20", tag: "Monetary Policy", text: "Powell reiterates 'data-dependent' stance — no preset course for remainder of 2025." },
    { time: "14:11", tag: "Market Reaction",  text: "S&P 500 futures turn positive; equities traders absorb dovish tilt in statement." },
    { time: "14:02", tag: "Geopolitical",    text: "Chair references global supply disruptions as an ongoing uncertainty factor." },
  ];

  let tlY = 180;
  tlItems.forEach((item, ti) => {
    const tli = figma.createFrame();
    tli.name = `TimelineItem/${ti + 1}`;
    tli.x = 16; tli.y = tlY;
    tli.resize(455, 74);
    tli.layoutMode = "HORIZONTAL";
    tli.itemSpacing = 10;
    tli.paddingLeft = 14; tli.paddingRight = 14;
    tli.paddingTop = 10; tli.paddingBottom = 10;
    tli.cornerRadius = 10;
    tli.fills = [ti === 0 ? C.selected : C.surface];
    tli.strokes = [ti === 0 ? C.blueBorder : C.divider];
    tli.strokeWeight = ti === 0 ? 1.5 : 1;
    bdLeft.appendChild(tli);

    // timestamp sidebar
    const tsCol = figma.createFrame();
    tsCol.name = "TimeStamp";
    tsCol.layoutMode = "VERTICAL";
    tsCol.counterAxisAlignItems = "CENTER";
    tsCol.itemSpacing = 4;
    tsCol.resize(36, 54);
    tsCol.fills = [];
    tli.appendChild(tsCol);

    const tsText = figma.createText();
    tsText.fontName = { family: "Inter", style: "Semi Bold" };
    tsText.characters = item.time;
    tsText.fontSize = 11;
    tsText.fills = [ti === 0 ? C.blue : C.textSub];
    tsCol.appendChild(tsText);

    // vertical connector (only for non-last)
    if (ti < tlItems.length - 1) {
      const conn = figma.createFrame();
      conn.name = "Connector";
      conn.resize(2, 24);
      conn.x = 17; conn.y = 0;
      conn.cornerRadius = 1;
      conn.fills = [C.divider];
      tsCol.appendChild(conn);
    }

    // content block
    const cBlock = figma.createFrame();
    cBlock.name = "ContentBlock";
    cBlock.layoutMode = "VERTICAL";
    cBlock.itemSpacing = 4;
    cBlock.layoutGrow = 1;
    cBlock.resize(10, 54);
    cBlock.fills = [];
    tli.appendChild(cBlock);

    // tag chip
    const tagChip = figma.createFrame();
    tagChip.name = "TagChip";
    tagChip.layoutMode = "HORIZONTAL";
    tagChip.paddingLeft = 6; tagChip.paddingRight = 6;
    tagChip.paddingTop = 2; tagChip.paddingBottom = 2;
    tagChip.cornerRadius = 4;
    tagChip.fills = [ti === 0 ? C.blueWash : C.chip];
    const tagT = figma.createText();
    tagT.fontName = { family: "Inter", style: "Medium" };
    tagT.characters = item.tag; tagT.fontSize = 10;
    tagT.fills = [ti === 0 ? C.blue : C.textMid];
    tagChip.appendChild(tagT);
    cBlock.appendChild(tagChip);

    const bodyT = figma.createText();
    bodyT.fontName = { family: "Inter", style: "Regular" };
    bodyT.characters = item.text;
    bodyT.fontSize = 12.5;
    bodyT.lineHeight = { value: 18, unit: "PIXELS" };
    bodyT.fills = [C.text];
    cBlock.appendChild(bodyT);

    // action row (first item only – view source transcript)
    if (ti === 0) {
      const actionRow = figma.createFrame();
      actionRow.name = "ActionRow";
      actionRow.layoutMode = "HORIZONTAL";
      actionRow.counterAxisAlignItems = "CENTER";
      actionRow.itemSpacing = 6;
      actionRow.fills = [];
      cBlock.appendChild(actionRow);

      const viewSrc = figma.createFrame();
      viewSrc.name = "ViewSourceButton";
      viewSrc.layoutMode = "HORIZONTAL";
      viewSrc.paddingLeft = 8; viewSrc.paddingRight = 8;
      viewSrc.paddingTop = 3; viewSrc.paddingBottom = 3;
      viewSrc.cornerRadius = 5;
      viewSrc.fills = [C.chipActive];
      const vt = figma.createText();
      vt.fontName = { family: "Inter", style: "Medium" };
      vt.characters = "View Source"; vt.fontSize = 11; vt.fills = [solid(1,1,1)];
      viewSrc.appendChild(vt);
      actionRow.appendChild(viewSrc);

      const pinBtn = figma.createFrame();
      pinBtn.name = "PinButton";
      pinBtn.layoutMode = "HORIZONTAL";
      pinBtn.paddingLeft = 8; pinBtn.paddingRight = 8;
      pinBtn.paddingTop = 3; pinBtn.paddingBottom = 3;
      pinBtn.cornerRadius = 5;
      pinBtn.fills = [C.chip];
      const pt = figma.createText();
      pt.fontName = { family: "Inter", style: "Medium" };
      pt.characters = "Pin to Canvas"; pt.fontSize = 11; pt.fills = [C.textMid];
      pinBtn.appendChild(pt);
      actionRow.appendChild(pinBtn);
    }

    tlY += 82;
  });

  makeRightCol(bdFrame);
  figma.notify("✅ Frame 3/3 — Broadcast Detail built");

  // ── Scroll all new frames into view ──────────────────────────
  figma.currentPage.selection = [chFrame, mgFrame, bdFrame];
  figma.viewport.scrollAndZoomIntoView([modelFrame, chFrame, mgFrame, bdFrame]);
  figma.notify("🎉 All 3 Stringer channel frames successfully built!", { timeout: 4000 });
})();
