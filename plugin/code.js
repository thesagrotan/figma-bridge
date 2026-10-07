figma.showUI(__html__, { width: 40, height: 40 });

// Preload and cache common fonts
const loadedFonts = new Set();
async function ensureFontLoaded(font = { family: "Inter", style: "Regular" }) {
  const key = `${font.family}-${font.style}`;
  if (loadedFonts.has(key)) return;
  await figma.loadFontAsync(font);
  loadedFonts.add(key);
}

// Background warmup on launch
Promise.all([
  ensureFontLoaded({ family: "Inter", style: "Regular" }),
  ensureFontLoaded({ family: "Inter", style: "Medium" }),
  ensureFontLoaded({ family: "Inter", style: "Semi Bold" }),
]).catch(() => {});

// Sync persistent settings from clientStorage to UI on launch
(async () => {
  try {
    const savedPort = await figma.clientStorage.getAsync("figma_mcp_bridge_port");
    const savedToken = await figma.clientStorage.getAsync("figma_mcp_bridge_token");
    if (savedPort || savedToken) {
      figma.ui.postMessage({ type: "init_storage", port: savedPort, token: savedToken });
    }
  } catch {}
})();

figma.ui.onmessage = async (message) => {
  if (message.type === "set_title") {
    try { figma.ui.title = message.title; } catch {}
    return;
  }

  if (message.type === "save_storage") {
    try {
      if (message.port) await figma.clientStorage.setAsync("figma_mcp_bridge_port", String(message.port));
      if (message.token) await figma.clientStorage.setAsync("figma_mcp_bridge_token", String(message.token));
    } catch {}
    return;
  }

  if (message.type === "generate_insight_detail") {
    try {
      const frameName = await generateInsightDetailInteraction();
      figma.ui.postMessage({ type: "generation_done", frameName });
    } catch (err) {
      figma.notify("Error: " + err.message, { error: true });
    }
    return;
  }

  if (message.type === "generate_channel_frames") {
    try {
      await generateChannelFrames();
      figma.ui.postMessage({ type: "generation_done", frameName: "Channel frames (3)" });
    } catch (err) {
      figma.notify("Channel frames error: " + err.message, { error: true });
    }
    return;
  }

  if (message.type !== "execute") return;

  try {
    const result = await execute(message.command);
    figma.ui.postMessage({ type: "result", id: message.command.id, command: message.command, result: { ok: true, result } });
  } catch (error) {
    figma.ui.postMessage({
      type: "result",
      id: message.command.id,
      command: message.command,
      result: { ok: false, error: error instanceof Error ? error.message : String(error) },
    });
  }
};

async function generateInsightDetailInteraction() {
  const modelFrame = figma.currentPage.findOne(n => n.name === "model" && n.type === "FRAME");
  if (!modelFrame) throw new Error("Frame 'model' not found");

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });

  const targetX = modelFrame.x + modelFrame.width + 60;
  const targetY = modelFrame.y;

  // Remove previous if exists
  const existing = figma.currentPage.findOne(n => n.name === "model — insight detail (selected state)");
  if (existing) existing.remove();

  const detailFrame = figma.createFrame();
  detailFrame.name = "model — insight detail (selected state)";
  detailFrame.resize(modelFrame.width, modelFrame.height);
  detailFrame.x = targetX;
  detailFrame.y = targetY;
  detailFrame.cornerRadius = 10;
  detailFrame.clipsContent = true;
  detailFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  detailFrame.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
  detailFrame.strokeWeight = 1;

  // Title bar
  const titleBar = figma.createFrame();
  titleBar.name = "TitleBar";
  titleBar.resize(detailFrame.width, 44);
  titleBar.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
  titleBar.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
  titleBar.strokeWeight = 1;
  detailFrame.appendChild(titleBar);

  const dots = [
    { r: 0.99, g: 0.38, b: 0.36 },
    { r: 1.0, g: 0.74, b: 0.18 },
    { r: 0.16, g: 0.80, b: 0.38 }
  ];
  dots.forEach((c, idx) => {
    const dot = figma.createEllipse();
    dot.name = "Dot";
    dot.resize(10, 10);
    dot.x = 18 + idx * 18;
    dot.y = 17;
    dot.fills = [{ type: 'SOLID', color: c }];
    titleBar.appendChild(dot);
  });

  // Vertical split divider
  const colDivider = figma.createLine();
  colDivider.name = "Divider/Columns";
  colDivider.x = 487;
  colDivider.y = 44;
  colDivider.resize(detailFrame.height - 44, 0);
  colDivider.rotation = -90;
  colDivider.strokes = [{ type: 'SOLID', color: { r: 0.90, g: 0.90, b: 0.90 } }];
  detailFrame.appendChild(colDivider);

  // Left Column Container (Width: 422)
  const leftCol = figma.createFrame();
  leftCol.name = "FocusedFeedColumn";
  leftCol.x = 24;
  leftCol.y = 56;
  leftCol.resize(440, detailFrame.height - 72);
  leftCol.layoutMode = "VERTICAL";
  leftCol.itemSpacing = 16;
  leftCol.fills = [];
  detailFrame.appendChild(leftCol);

  // Back Navigation Bar
  const navBar = figma.createFrame();
  navBar.name = "NavigationBar";
  navBar.layoutMode = "HORIZONTAL";
  navBar.counterAxisAlignItems = "CENTER";
  navBar.itemSpacing = 6;
  navBar.resize(440, 28);
  navBar.fills = [];

  const backIcon = figma.createText();
  backIcon.fontName = { family: "Inter", style: "Semi Bold" };
  backIcon.characters = "‹";
  backIcon.fontSize = 20;
  backIcon.fills = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }];
  navBar.appendChild(backIcon);

  const backLabel = figma.createText();
  backLabel.fontName = { family: "Inter", style: "Medium" };
  backLabel.characters = "Feed";
  backLabel.fontSize = 14;
  backLabel.fills = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }];
  navBar.appendChild(backLabel);

  const navSpacer = figma.createFrame();
  navSpacer.name = "Spacer";
  navSpacer.layoutGrow = 1;
  navSpacer.resize(10, 10);
  navSpacer.fills = [];
  navBar.appendChild(navSpacer);

  const badge = figma.createFrame();
  badge.name = "FocusBadge";
  badge.layoutMode = "HORIZONTAL";
  badge.paddingLeft = 8; badge.paddingRight = 8;
  badge.paddingTop = 3; badge.paddingBottom = 3;
  badge.cornerRadius = 6;
  badge.fills = [{ type: 'SOLID', color: { r: 0.93, g: 0.93, b: 0.95 } }];
  const badgeText = figma.createText();
  badgeText.fontName = { family: "Inter", style: "Medium" };
  badgeText.characters = "Insight Focus";
  badgeText.fontSize = 11;
  badgeText.fills = [{ type: 'SOLID', color: { r: 0.45, g: 0.45, b: 0.48 } }];
  badge.appendChild(badgeText);
  navBar.appendChild(badge);

  leftCol.appendChild(navBar);

  // Selected Insight Card
  const insightCard = figma.createFrame();
  insightCard.name = "SelectedInsightCard";
  insightCard.layoutMode = "VERTICAL";
  insightCard.itemSpacing = 10;
  insightCard.paddingLeft = 14; insightCard.paddingRight = 14;
  insightCard.paddingTop = 12; insightCard.paddingBottom = 12;
  insightCard.resize(440, 120);
  insightCard.cornerRadius = 10;
  insightCard.fills = [{ type: 'SOLID', color: { r: 0.965, g: 0.98, b: 1.0 } }];
  insightCard.strokes = [{ type: 'SOLID', color: { r: 0.70, g: 0.82, b: 1.0 } }];
  insightCard.strokeWeight = 1.5;

  const cardHeader = figma.createFrame();
  cardHeader.name = "Header";
  cardHeader.layoutMode = "HORIZONTAL";
  cardHeader.counterAxisAlignItems = "CENTER";
  cardHeader.itemSpacing = 8;
  cardHeader.resize(412, 22);
  cardHeader.fills = [];

  const logo = figma.createFrame();
  logo.name = "BroadcastLogo";
  logo.resize(22, 22);
  logo.cornerRadius = 4;
  logo.fills = [{ type: 'SOLID', color: { r: 0.17, g: 0.44, b: 0.75 } }];
  cardHeader.appendChild(logo);

  const channelText = figma.createText();
  channelText.fontName = { family: "Inter", style: "Semi Bold" };
  channelText.characters = "Bloomberg Live";
  channelText.fontSize = 13;
  channelText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 } }];
  cardHeader.appendChild(channelText);

  const cSpacer = figma.createFrame();
  cSpacer.name = "Spacer";
  cSpacer.layoutGrow = 1;
  cSpacer.resize(10, 10);
  cSpacer.fills = [];
  cardHeader.appendChild(cSpacer);

  const timestamp = figma.createText();
  timestamp.fontName = { family: "Inter", style: "Regular" };
  timestamp.characters = "14:32";
  timestamp.fontSize = 12;
  timestamp.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.53 } }];
  cardHeader.appendChild(timestamp);

  insightCard.appendChild(cardHeader);

  const summary = figma.createText();
  summary.fontName = { family: "Inter", style: "Medium" };
  summary.characters = "Federal Reserve signals pause on benchmark rate adjustments amid stabilizing labor metrics and core inflation moderation.";
  summary.fontSize = 13;
  summary.lineHeight = { value: 18, unit: 'PIXELS' };
  summary.resize(412, 38);
  summary.fills = [{ type: 'SOLID', color: { r: 0.12, g: 0.12, b: 0.14 } }];
  insightCard.appendChild(summary);

  leftCol.appendChild(insightCard);

  // Source link caption
  const linkRow = figma.createFrame();
  linkRow.name = "SourceLinkCaption";
  linkRow.layoutMode = "HORIZONTAL";
  linkRow.counterAxisAlignItems = "CENTER";
  linkRow.itemSpacing = 6;
  linkRow.resize(440, 20);
  linkRow.fills = [];

  const arrow = figma.createText();
  arrow.fontName = { family: "Inter", style: "Semi Bold" };
  arrow.characters = "↳";
  arrow.fontSize = 13;
  arrow.fills = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }];
  linkRow.appendChild(arrow);

  const caption = figma.createText();
  caption.fontName = { family: "Inter", style: "Semi Bold" };
  caption.characters = "EXTRACTED FROM TRANSCRIPT";
  caption.fontSize = 11;
  caption.letterSpacing = { value: 0.4, unit: 'PIXELS' };
  caption.fills = [{ type: 'SOLID', color: { r: 0.45, g: 0.45, b: 0.5 } }];
  linkRow.appendChild(caption);

  leftCol.appendChild(linkRow);

  // Transcript container
  const transcript = figma.createFrame();
  transcript.name = "TranscriptContainer";
  transcript.layoutMode = "VERTICAL";
  transcript.itemSpacing = 12;
  transcript.paddingLeft = 14; transcript.paddingRight = 14;
  transcript.paddingTop = 14; transcript.paddingBottom = 14;
  transcript.resize(440, 390);
  transcript.cornerRadius = 10;
  transcript.fills = [{ type: 'SOLID', color: { r: 0.985, g: 0.985, b: 0.99 } }];
  transcript.strokes = [{ type: 'SOLID', color: { r: 0.91, g: 0.91, b: 0.93 } }];
  transcript.strokeWeight = 1;

  const t1 = figma.createText();
  t1.fontName = { family: "Inter", style: "Regular" };
  t1.characters = "[14:30:15] Anchor: Turning now to Washington where committee members have just concluded the morning monetary briefing.";
  t1.fontSize = 12.5;
  t1.lineHeight = { value: 18, unit: 'PIXELS' };
  t1.resize(412, 36);
  t1.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.58 } }];
  transcript.appendChild(t1);

  // Highlighted segment
  const hl = figma.createFrame();
  hl.name = "HighlightedSourceSegment";
  hl.layoutMode = "HORIZONTAL";
  hl.itemSpacing = 10;
  hl.paddingLeft = 10; hl.paddingRight = 10;
  hl.paddingTop = 10; hl.paddingBottom = 10;
  hl.resize(412, 84);
  hl.cornerRadius = 8;
  hl.fills = [{ type: 'SOLID', color: { r: 0.91, g: 0.95, b: 1.0 } }];
  hl.strokes = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }];
  hl.strokeWeight = 1;

  const pill = figma.createFrame();
  pill.name = "IndicatorPill";
  pill.resize(3.5, 64);
  pill.cornerRadius = 2;
  pill.fills = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }];
  hl.appendChild(pill);

  const t2 = figma.createText();
  t2.fontName = { family: "Inter", style: "Medium" };
  t2.characters = "[14:31:40] Powell: \"Our current assessment indicates that policy is well-positioned to remain on hold as both labor conditions and core inflation trend toward equilibrium.\"";
  t2.fontSize = 12.5;
  t2.lineHeight = { value: 18, unit: 'PIXELS' };
  t2.resize(378, 64);
  t2.fills = [{ type: 'SOLID', color: { r: 0.08, g: 0.18, b: 0.36 } }];
  hl.appendChild(t2);

  transcript.appendChild(hl);

  const t3 = figma.createText();
  t3.fontName = { family: "Inter", style: "Regular" };
  t3.characters = "[14:33:02] Analyst: That explicit acknowledgment of policy positioning has immediate yield curve implications across Treasury notes...";
  t3.fontSize = 12.5;
  t3.lineHeight = { value: 18, unit: 'PIXELS' };
  t3.resize(412, 36);
  t3.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.58 } }];
  transcript.appendChild(t3);

  leftCol.appendChild(transcript);

  // Right Column (Canvas preview)
  const rightCol = figma.createFrame();
  rightCol.name = "CanvasColumn";
  rightCol.x = 524;
  rightCol.y = 56;
  rightCol.resize(350, detailFrame.height - 72);
  rightCol.layoutMode = "VERTICAL";
  rightCol.itemSpacing = 16;
  rightCol.fills = [];
  detailFrame.appendChild(rightCol);

  const cHead = figma.createText();
  cHead.fontName = { family: "Inter", style: "Semi Bold" };
  cHead.characters = "Canvas";
  cHead.fontSize = 14;
  cHead.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  rightCol.appendChild(cHead);

  for (let i = 0; i < 3; i++) {
    const card = figma.createFrame();
    card.name = "CanvasCard";
    card.resize(340, 110);
    card.cornerRadius = 8;
    card.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.97 } }];
    card.strokes = [{ type: 'SOLID', color: { r: 0.90, g: 0.90, b: 0.92 } }];
    rightCol.appendChild(card);
  }

  figma.currentPage.selection = [detailFrame];
  figma.viewport.scrollAndZoomIntoView([modelFrame, detailFrame]);
  figma.notify("Created '" + detailFrame.name + "'!");
  return detailFrame.name;
}

async function generateChannelFrames() {
  const modelFrame = figma.currentPage.findOne(n => n.name === "model" && n.type === "FRAME");
  if (!modelFrame) throw new Error("Frame 'model' not found");

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const detailFrame = figma.currentPage.findOne(n => n.name === "model — insight detail (selected state)");
  const rightAnchor = detailFrame ? (detailFrame.x + detailFrame.width) : (modelFrame.x + modelFrame.width);
  const W = modelFrame.width, H = modelFrame.height, GAP = 60;
  let nextX = rightAnchor + GAP;

  const solid = (r, g, b, a) => {
    const paint = { type: "SOLID", color: { r, g, b } };
    if (a !== undefined) paint.opacity = a;
    return paint;
  };

  const C = {
    bg:         solid(1, 1, 1),
    titlebar:   solid(0.98, 0.98, 0.98),
    border:     solid(0.88, 0.88, 0.88),
    divider:    solid(0.90, 0.90, 0.90),
    blue:       solid(0.0, 0.478, 1.0),
    blueWash:   solid(0.91, 0.95, 1.0),
    blueBorder: solid(0.7, 0.82, 1.0),
    selected:   solid(0.965, 0.98, 1.0),
    surface:    solid(0.985, 0.985, 0.99),
    surface2:   solid(0.96, 0.96, 0.97),
    chip:       solid(0.93, 0.93, 0.95),
    liveRed:    solid(1.0, 0.23, 0.19),
    liveWash:   solid(1.0, 0.93, 0.93),
    text:       solid(0.1, 0.1, 0.12),
    textSub:    solid(0.5, 0.5, 0.53),
    textMid:    solid(0.3, 0.3, 0.34),
    textLight:  solid(0.7, 0.7, 0.72),
    greenOn:    solid(0.16, 0.80, 0.38),
    toggle:     solid(0.235, 0.78, 0.455),
    toggleOff:  solid(0.82, 0.82, 0.84),
    chipBlue:   solid(0.0, 0.478, 1.0),
    white:      solid(1, 1, 1),
  };

  const BRANDS = [
    { name: "Bloomberg",       r: 0.17, g: 0.44, b: 0.75 },
    { name: "CNBC",            r: 0.18, g: 0.54, b: 0.34 },
    { name: "Federal Reserve", r: 0.78, g: 0.22, b: 0.22 },
    { name: "C-SPAN",          r: 0.52, g: 0.18, b: 0.62 },
    { name: "Reuters",         r: 0.90, g: 0.55, b: 0.10 },
  ];

  const clearExisting = (name) => {
    const old = figma.currentPage.findOne(n => n.name === name && n.type === "FRAME");
    if (old) old.remove();
  };

  const makeShell = (name, x, y) => {
    const f = figma.createFrame();
    f.name = name; f.resize(W, H); f.x = x; f.y = y;
    f.cornerRadius = 10; f.clipsContent = true;
    f.fills = [C.bg]; f.strokes = [C.border]; f.strokeWeight = 1;
    const tb = figma.createFrame();
    tb.name = "TitleBar"; tb.resize(W, 44);
    tb.fills = [C.titlebar]; tb.strokes = [C.border]; tb.strokeWeight = 1;
    f.appendChild(tb);
    [{ r: 0.99, g: 0.38, b: 0.36 }, { r: 1.0, g: 0.74, b: 0.18 }, { r: 0.16, g: 0.80, b: 0.38 }].forEach((c, i) => {
      const dot = figma.createEllipse();
      dot.name = "TrafficLight"; dot.resize(10, 10); dot.x = 18 + i * 18; dot.y = 17;
      dot.fills = [solid(c.r, c.g, c.b)]; tb.appendChild(dot);
    });
    const div = figma.createLine();
    div.name = "Divider/Columns"; div.x = 487; div.y = 44;
    div.resize(H - 44, 0); div.rotation = -90; div.strokes = [C.divider];
    f.appendChild(div);
    return f;
  };

  const makeRightCol = (parent) => {
    const col = figma.createFrame();
    col.name = "CanvasColumn"; col.x = 524; col.y = 56;
    col.resize(350, H - 72); col.layoutMode = "VERTICAL"; col.itemSpacing = 16; col.fills = [];
    parent.appendChild(col);
    const cHead = figma.createText();
    cHead.fontName = { family: "Inter", style: "Semi Bold" };
    cHead.characters = "Canvas"; cHead.fontSize = 14; cHead.fills = [C.textSub];
    col.appendChild(cHead);
    for (let i = 0; i < 3; i++) {
      const card = figma.createFrame();
      card.name = "CanvasCard"; card.resize(340, i === 0 ? 140 : 110); card.cornerRadius = 8;
      card.fills = [C.surface2]; card.strokes = [C.divider]; card.strokeWeight = 1;
      col.appendChild(card);
    }
  };

  const addText = (parent, chars, size, style, color, lh) => {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: style }; t.characters = chars;
    t.fontSize = size; t.fills = [color];
    if (lh) t.lineHeight = { value: lh, unit: "PIXELS" };
    parent.appendChild(t); return t;
  };

  const makeToggle = (parent, on) => {
    const track = figma.createFrame();
    track.name = "Toggle"; track.resize(36, 22); track.cornerRadius = 11;
    track.fills = [on ? C.toggle : C.toggleOff];
    parent.appendChild(track);
    const thumb = figma.createEllipse();
    thumb.name = "Thumb"; thumb.resize(18, 18); thumb.x = on ? 16 : 2; thumb.y = 2;
    thumb.fills = [C.white]; track.appendChild(thumb);
  };

  const makeLivePill = (parent) => {
    const pill = figma.createFrame();
    pill.name = "LivePill"; pill.layoutMode = "HORIZONTAL"; pill.counterAxisAlignItems = "CENTER";
    pill.itemSpacing = 4; pill.paddingLeft = 7; pill.paddingRight = 8;
    pill.paddingTop = 3; pill.paddingBottom = 3; pill.cornerRadius = 5;
    pill.fills = [C.liveWash]; pill.strokes = [solid(1.0, 0.23, 0.19, 0.3)]; pill.strokeWeight = 1;
    const dot = figma.createEllipse(); dot.name = "dot"; dot.resize(6, 6); dot.fills = [C.liveRed];
    pill.appendChild(dot);
    const lt = figma.createText(); lt.fontName = { family: "Inter", style: "Semi Bold" };
    lt.characters = "LIVE"; lt.fontSize = 10; lt.fills = [C.liveRed];
    pill.appendChild(lt); parent.appendChild(pill);
  };

  const hSpacer = (parent) => {
    const s = figma.createFrame(); s.name = "Spacer"; s.layoutGrow = 1; s.resize(10, 1); s.fills = [];
    parent.appendChild(s);
  };

  // ═══════════════ FRAME 1: Channel View ════════════════════════
  clearExisting("model — channel view");
  const chF = makeShell("model — channel view", nextX, modelFrame.y);
  nextX += W + GAP;

  // Left clipping container
  const chLeft = figma.createFrame();
  chLeft.name = "FeedColumn"; chLeft.x = 0; chLeft.y = 44;
  chLeft.resize(487, H - 44); chLeft.fills = []; chLeft.clipsContent = true;
  chF.appendChild(chLeft);

  // Nav bar ‹ Feed
  const chNav = figma.createFrame();
  chNav.name = "NavigationBar"; chNav.layoutMode = "HORIZONTAL"; chNav.counterAxisAlignItems = "CENTER";
  chNav.itemSpacing = 5; chNav.x = 16; chNav.y = 12; chNav.resize(455, 28); chNav.fills = [];
  chLeft.appendChild(chNav);
  addText(chNav, "‹", 20, "Semi Bold", C.blue);
  addText(chNav, "Feed", 14, "Medium", C.blue);
  hSpacer(chNav);
  const breadcrumb = figma.createFrame();
  breadcrumb.name = "Breadcrumb"; breadcrumb.layoutMode = "HORIZONTAL";
  breadcrumb.paddingLeft = 8; breadcrumb.paddingRight = 8; breadcrumb.paddingTop = 3; breadcrumb.paddingBottom = 3;
  breadcrumb.cornerRadius = 6; breadcrumb.fills = [C.chip]; chNav.appendChild(breadcrumb);
  addText(breadcrumb, "Channel View", 11, "Medium", C.textSub);

  // Channel header card
  const b0 = BRANDS[0];
  const chHdr = figma.createFrame();
  chHdr.name = "ChannelHeader"; chHdr.x = 16; chHdr.y = 52;
  chHdr.resize(455, 72); chHdr.layoutMode = "HORIZONTAL"; chHdr.counterAxisAlignItems = "CENTER";
  chHdr.itemSpacing = 14; chHdr.paddingLeft = 14; chHdr.paddingRight = 14;
  chHdr.paddingTop = 12; chHdr.paddingBottom = 12; chHdr.cornerRadius = 10;
  chHdr.fills = [C.selected]; chHdr.strokes = [C.blueBorder]; chHdr.strokeWeight = 1;
  chLeft.appendChild(chHdr);

  const chLogo = figma.createFrame();
  chLogo.name = "ChannelLogo"; chLogo.resize(44, 44); chLogo.cornerRadius = 10;
  chLogo.fills = [solid(b0.r, b0.g, b0.b)]; chHdr.appendChild(chLogo);

  const chInfo = figma.createFrame();
  chInfo.name = "ChannelInfo"; chInfo.layoutMode = "VERTICAL"; chInfo.itemSpacing = 3;
  chInfo.layoutGrow = 1; chInfo.resize(10, 44); chInfo.fills = []; chHdr.appendChild(chInfo);
  addText(chInfo, "Bloomberg Television", 15, "Semi Bold", C.text);
  addText(chInfo, "bloomberg.com/live  ·  English  ·  Finance / Markets", 11, "Regular", C.textSub);
  const stChip = figma.createFrame();
  stChip.name = "StatusChip"; stChip.layoutMode = "HORIZONTAL"; stChip.counterAxisAlignItems = "CENTER";
  stChip.itemSpacing = 4; stChip.paddingLeft = 7; stChip.paddingRight = 8;
  stChip.paddingTop = 3; stChip.paddingBottom = 3; stChip.cornerRadius = 5; stChip.fills = [C.chip];
  chInfo.appendChild(stChip);
  const sdot = figma.createEllipse(); sdot.resize(6, 6); sdot.fills = [C.greenOn]; stChip.appendChild(sdot);
  addText(stChip, "Active", 11, "Medium", C.textMid);
  const editBtn = figma.createFrame();
  editBtn.name = "EditButton"; editBtn.layoutMode = "HORIZONTAL";
  editBtn.paddingLeft = 10; editBtn.paddingRight = 10; editBtn.paddingTop = 6; editBtn.paddingBottom = 6;
  editBtn.cornerRadius = 6; editBtn.fills = [C.chip]; chHdr.appendChild(editBtn);
  addText(editBtn, "Edit", 12, "Medium", C.textMid);

  // Auto-follow toggle row
  const togRow = figma.createFrame();
  togRow.name = "AutoFollowRow"; togRow.x = 16; togRow.y = 136;
  togRow.resize(455, 52); togRow.layoutMode = "HORIZONTAL"; togRow.counterAxisAlignItems = "CENTER";
  togRow.itemSpacing = 12; togRow.paddingLeft = 14; togRow.paddingRight = 14;
  togRow.paddingTop = 12; togRow.paddingBottom = 12; togRow.cornerRadius = 10;
  togRow.fills = [C.surface]; togRow.strokes = [C.divider]; togRow.strokeWeight = 1;
  chLeft.appendChild(togRow);
  const togInfo = figma.createFrame();
  togInfo.name = "ToggleInfo"; togInfo.layoutMode = "VERTICAL"; togInfo.itemSpacing = 2;
  togInfo.layoutGrow = 1; togInfo.resize(10, 30); togInfo.fills = []; togRow.appendChild(togInfo);
  addText(togInfo, "Auto-follow new live broadcasts", 13, "Medium", C.text);
  addText(togInfo, "Automatically ingest new streams from this channel", 11, "Regular", C.textSub);
  makeToggle(togRow, true);

  // Section header
  const bSec = figma.createFrame();
  bSec.name = "SectionHeader"; bSec.x = 16; bSec.y = 200;
  bSec.resize(455, 24); bSec.layoutMode = "HORIZONTAL"; bSec.counterAxisAlignItems = "CENTER"; bSec.fills = [];
  chLeft.appendChild(bSec);
  const bSecLbl = figma.createText();
  bSecLbl.fontName = { family: "Inter", style: "Semi Bold" }; bSecLbl.characters = "BROADCASTS";
  bSecLbl.fontSize = 11; bSecLbl.letterSpacing = { value: 0.5, unit: "PIXELS" }; bSecLbl.fills = [C.textSub];
  bSec.appendChild(bSecLbl);
  hSpacer(bSec);
  addText(bSec, "1 live · 4 past", 11, "Regular", C.textSub);

  // Live broadcast row
  const liveRow = figma.createFrame();
  liveRow.name = "BroadcastRow/Live"; liveRow.x = 16; liveRow.y = 234;
  liveRow.resize(455, 64); liveRow.layoutMode = "VERTICAL"; liveRow.itemSpacing = 4;
  liveRow.paddingLeft = 14; liveRow.paddingRight = 14; liveRow.paddingTop = 10; liveRow.paddingBottom = 10;
  liveRow.cornerRadius = 10; liveRow.fills = [C.liveWash];
  liveRow.strokes = [solid(1.0, 0.23, 0.19, 0.25)]; liveRow.strokeWeight = 1;
  chLeft.appendChild(liveRow);
  const lrTop = figma.createFrame();
  lrTop.name = "TopRow"; lrTop.layoutMode = "HORIZONTAL"; lrTop.counterAxisAlignItems = "CENTER";
  lrTop.itemSpacing = 8; lrTop.resize(427, 20); lrTop.fills = []; liveRow.appendChild(lrTop);
  addText(lrTop, "Markets Open — Fed Rate Decision Special", 13, "Semi Bold", C.text);
  hSpacer(lrTop); makeLivePill(lrTop);
  addText(liveRow, "Started 14:00 · 47 insights extracted · Tap to open transcript", 11, "Regular", C.textMid);

  // Past broadcast rows
  const pastData = [
    { title: "Powell Presser — September 2025", sub: "Sep 18 · 2:04:12 · 134 insights" },
    { title: "CPI Data Reaction: Live Markets",  sub: "Sep 11 · 1:22:08 · 89 insights" },
    { title: "Jobs Report Special Coverage",     sub: "Sep 4  · 0:58:34 · 61 insights" },
    { title: "FOMC Minutes Release",             sub: "Aug 21 · 0:44:17 · 43 insights" },
  ];
  let pastY = 308;
  pastData.forEach((d) => {
    const row = figma.createFrame();
    row.name = "BroadcastRow/Past"; row.x = 16; row.y = pastY; row.resize(455, 52);
    row.layoutMode = "HORIZONTAL"; row.counterAxisAlignItems = "CENTER"; row.itemSpacing = 10;
    row.paddingLeft = 14; row.paddingRight = 14; row.paddingTop = 10; row.paddingBottom = 10;
    row.cornerRadius = 8; row.fills = [C.surface]; row.strokes = [C.divider]; row.strokeWeight = 1;
    chLeft.appendChild(row);
    const ico = figma.createFrame();
    ico.name = "Icon"; ico.resize(28, 28); ico.cornerRadius = 6; ico.fills = [C.chip]; row.appendChild(ico);
    const ri = figma.createFrame();
    ri.name = "Info"; ri.layoutMode = "VERTICAL"; ri.itemSpacing = 2;
    ri.layoutGrow = 1; ri.resize(10, 32); ri.fills = []; row.appendChild(ri);
    addText(ri, d.title, 13, "Medium", C.text);
    addText(ri, d.sub, 11, "Regular", C.textSub);
    addText(row, "›", 18, "Regular", C.textLight);
    pastY += 60;
  });
  makeRightCol(chF);
  figma.notify("✅ 1/3 — Channel View built");

  // ═══════════════ FRAME 2: Channel Management ══════════════════
  clearExisting("model — channel management");
  const mgF = makeShell("model — channel management", nextX, modelFrame.y);
  nextX += W + GAP;

  const mgLeft = figma.createFrame();
  mgLeft.name = "FeedColumn"; mgLeft.x = 0; mgLeft.y = 44;
  mgLeft.resize(487, H - 44); mgLeft.fills = []; mgLeft.clipsContent = true;
  mgF.appendChild(mgLeft);

  // Panel header row
  const mgNav = figma.createFrame();
  mgNav.name = "PanelHeader"; mgNav.x = 16; mgNav.y = 12;
  mgNav.resize(455, 30); mgNav.layoutMode = "HORIZONTAL"; mgNav.counterAxisAlignItems = "CENTER"; mgNav.fills = [];
  mgLeft.appendChild(mgNav);
  addText(mgNav, "Channels", 17, "Semi Bold", C.text); hSpacer(mgNav);
  const addBtn = figma.createFrame();
  addBtn.name = "AddChannelButton"; addBtn.layoutMode = "HORIZONTAL"; addBtn.counterAxisAlignItems = "CENTER";
  addBtn.itemSpacing = 5; addBtn.paddingLeft = 10; addBtn.paddingRight = 12;
  addBtn.paddingTop = 6; addBtn.paddingBottom = 6; addBtn.cornerRadius = 7; addBtn.fills = [C.chipBlue];
  mgNav.appendChild(addBtn);
  addText(addBtn, "+", 15, "Semi Bold", C.white); addText(addBtn, "Add Channel", 13, "Medium", C.white);

  // Filter tabs
  const tabRow = figma.createFrame();
  tabRow.name = "FilterTabs"; tabRow.x = 16; tabRow.y = 54;
  tabRow.resize(455, 30); tabRow.layoutMode = "HORIZONTAL"; tabRow.counterAxisAlignItems = "CENTER";
  tabRow.itemSpacing = 6; tabRow.fills = []; mgLeft.appendChild(tabRow);
  ["All", "Active", "Paused", "Archived"].forEach((t, i) => {
    const tab = figma.createFrame();
    tab.name = "Tab/" + t; tab.layoutMode = "HORIZONTAL";
    tab.paddingLeft = 12; tab.paddingRight = 12; tab.paddingTop = 5; tab.paddingBottom = 5;
    tab.cornerRadius = 7; tab.fills = [i === 0 ? C.chipBlue : C.chip]; tabRow.appendChild(tab);
    addText(tab, t, 12, i === 0 ? "Semi Bold" : "Regular", i === 0 ? C.white : C.textMid);
  });

  // Search bar
  const srch = figma.createFrame();
  srch.name = "SearchBar"; srch.x = 16; srch.y = 96; srch.resize(455, 32);
  srch.cornerRadius = 8; srch.fills = [C.surface]; srch.strokes = [C.divider]; srch.strokeWeight = 1;
  srch.layoutMode = "HORIZONTAL"; srch.counterAxisAlignItems = "CENTER"; srch.itemSpacing = 7;
  srch.paddingLeft = 10; srch.paddingRight = 10; mgLeft.appendChild(srch);
  addText(srch, "⌕", 14, "Regular", C.textLight);
  addText(srch, "Search channels…", 13, "Regular", C.textLight);

  // Channel rows
  const channelData = [
    { idx: 0, on: true,  status: "Live now",   rate: "~42 insights/hr" },
    { idx: 1, on: true,  status: "Live now",   rate: "~28 insights/hr" },
    { idx: 2, on: true,  status: "Last: 11:00",rate: "~15 insights/hr" },
    { idx: 3, on: false, status: "Paused",     rate: "—" },
    { idx: 4, on: true,  status: "Live now",   rate: "~9 insights/hr"  },
  ];
  let crY = 142;
  channelData.forEach(d => {
    const br = BRANDS[d.idx];
    const cr = figma.createFrame();
    cr.name = "ChannelRow/" + br.name; cr.x = 16; cr.y = crY;
    cr.resize(455, 62); cr.layoutMode = "HORIZONTAL"; cr.counterAxisAlignItems = "CENTER";
    cr.itemSpacing = 12; cr.paddingLeft = 14; cr.paddingRight = 14;
    cr.paddingTop = 10; cr.paddingBottom = 10; cr.cornerRadius = 10;
    cr.fills = [C.surface]; cr.strokes = [C.divider]; cr.strokeWeight = 1;
    mgLeft.appendChild(cr);

    const cLogo = figma.createFrame();
    cLogo.name = "Logo"; cLogo.resize(36, 36); cLogo.cornerRadius = 8;
    cLogo.fills = [solid(br.r, br.g, br.b)]; cr.appendChild(cLogo);

    const cMeta = figma.createFrame();
    cMeta.name = "Meta"; cMeta.layoutMode = "VERTICAL"; cMeta.itemSpacing = 2;
    cMeta.layoutGrow = 1; cMeta.resize(10, 42); cMeta.fills = []; cr.appendChild(cMeta);
    addText(cMeta, br.name, 13, "Semi Bold", C.text);

    const metaBot = figma.createFrame();
    metaBot.name = "MetaBottom"; metaBot.layoutMode = "HORIZONTAL"; metaBot.counterAxisAlignItems = "CENTER";
    metaBot.itemSpacing = 6; metaBot.fills = []; cMeta.appendChild(metaBot);
    if (d.on && d.status.includes("Live")) {
      const ldot = figma.createEllipse(); ldot.resize(6, 6); ldot.fills = [C.liveRed]; metaBot.appendChild(ldot);
    }
    addText(metaBot, d.status, 11, "Regular", d.on && d.status.includes("Live") ? C.liveRed : C.textSub);
    addText(metaBot, "·", 11, "Regular", C.textLight);
    addText(metaBot, d.rate, 11, "Regular", C.textSub);
    makeToggle(cr, d.on);
    addText(cr, "›", 18, "Regular", C.textLight);
    crY += 70;
  });

  // Footer summary
  const foot = figma.createFrame();
  foot.name = "Footer"; foot.x = 16; foot.y = 498; foot.resize(455, 44);
  foot.cornerRadius = 8; foot.fills = [C.blueWash]; foot.strokes = [C.blueBorder]; foot.strokeWeight = 1;
  foot.layoutMode = "HORIZONTAL"; foot.counterAxisAlignItems = "CENTER";
  foot.itemSpacing = 8; foot.paddingLeft = 14; foot.paddingRight = 14; mgLeft.appendChild(foot);
  addText(foot, "4 channels active", 12, "Medium", C.text);
  hSpacer(foot);
  addText(foot, "~94 insights / hr total", 12, "Regular", C.textMid);
  makeRightCol(mgF);
  figma.notify("✅ 2/3 — Channel Management built");

  // ═══════════════ FRAME 3: Broadcast Detail ════════════════════
  clearExisting("model — broadcast detail (from channel)");
  const bdF = makeShell("model — broadcast detail (from channel)", nextX, modelFrame.y);

  const bdLeft = figma.createFrame();
  bdLeft.name = "FeedColumn"; bdLeft.x = 0; bdLeft.y = 44;
  bdLeft.resize(487, H - 44); bdLeft.fills = []; bdLeft.clipsContent = true;
  bdF.appendChild(bdLeft);

  // Nav ‹ Bloomberg Television
  const bdNav = figma.createFrame();
  bdNav.name = "NavigationBar"; bdNav.layoutMode = "HORIZONTAL"; bdNav.counterAxisAlignItems = "CENTER";
  bdNav.itemSpacing = 5; bdNav.x = 16; bdNav.y = 12; bdNav.resize(455, 28); bdNav.fills = [];
  bdLeft.appendChild(bdNav);
  addText(bdNav, "‹", 20, "Semi Bold", C.blue);
  addText(bdNav, "Bloomberg Television", 14, "Medium", C.blue);
  hSpacer(bdNav);
  const bdBC = figma.createFrame();
  bdBC.name = "Breadcrumb"; bdBC.layoutMode = "HORIZONTAL";
  bdBC.paddingLeft = 8; bdBC.paddingRight = 8; bdBC.paddingTop = 3; bdBC.paddingBottom = 3;
  bdBC.cornerRadius = 6; bdBC.fills = [C.chip]; bdNav.appendChild(bdBC);
  addText(bdBC, "Broadcast", 11, "Medium", C.textSub);

  // Broadcast header
  const bdHdr = figma.createFrame();
  bdHdr.name = "BroadcastHeader"; bdHdr.x = 16; bdHdr.y = 52;
  bdHdr.resize(455, 80); bdHdr.layoutMode = "VERTICAL"; bdHdr.itemSpacing = 6;
  bdHdr.paddingLeft = 14; bdHdr.paddingRight = 14; bdHdr.paddingTop = 12; bdHdr.paddingBottom = 12;
  bdHdr.cornerRadius = 10; bdHdr.fills = [C.selected]; bdHdr.strokes = [C.blueBorder]; bdHdr.strokeWeight = 1;
  bdLeft.appendChild(bdHdr);

  const bdTR = figma.createFrame();
  bdTR.name = "TitleRow"; bdTR.layoutMode = "HORIZONTAL"; bdTR.counterAxisAlignItems = "CENTER";
  bdTR.itemSpacing = 8; bdTR.resize(427, 22); bdTR.fills = []; bdHdr.appendChild(bdTR);
  addText(bdTR, "Markets Open — Fed Rate Decision Special", 14, "Semi Bold", C.text);
  hSpacer(bdTR); makeLivePill(bdTR);
  addText(bdHdr, "Bloomberg Television  ·  Started 14:00 today  ·  134 insights extracted", 11, "Regular", C.textSub);

  const progTrack = figma.createFrame();
  progTrack.name = "ProgressTrack"; progTrack.resize(427, 4); progTrack.cornerRadius = 2; progTrack.fills = [C.chip];
  bdHdr.appendChild(progTrack);
  const progFill = figma.createFrame();
  progFill.name = "Fill"; progFill.resize(280, 4); progFill.cornerRadius = 2; progFill.fills = [C.blue];
  progTrack.appendChild(progFill);

  // Insight timeline section header
  const tlSec = figma.createFrame();
  tlSec.name = "SectionHeader"; tlSec.x = 16; tlSec.y = 146;
  tlSec.resize(455, 24); tlSec.layoutMode = "HORIZONTAL"; tlSec.counterAxisAlignItems = "CENTER";
  tlSec.itemSpacing = 6; tlSec.fills = []; bdLeft.appendChild(tlSec);
  const tlLbl = figma.createText();
  tlLbl.fontName = { family: "Inter", style: "Semi Bold" }; tlLbl.characters = "INSIGHT TIMELINE";
  tlLbl.fontSize = 11; tlLbl.letterSpacing = { value: 0.5, unit: "PIXELS" }; tlLbl.fills = [C.textSub];
  tlSec.appendChild(tlLbl); hSpacer(tlSec);
  ["All", "Monetary", "Market", "Geo"].forEach((f, fi) => {
    const fc = figma.createFrame();
    fc.name = "Filter/" + f; fc.layoutMode = "HORIZONTAL";
    fc.paddingLeft = 8; fc.paddingRight = 8; fc.paddingTop = 3; fc.paddingBottom = 3;
    fc.cornerRadius = 5; fc.fills = [fi === 0 ? C.chipBlue : C.chip]; tlSec.appendChild(fc);
    addText(fc, f, 10, "Regular", fi === 0 ? C.white : C.textMid);
  });

  // Timeline items
  const tlItems = [
    { time: "14:32", tag: "Monetary Policy",  text: "Federal Reserve signals pause on benchmark rate adjustments amid stabilizing labor metrics.", selected: true },
    { time: "14:28", tag: "Market Reaction",  text: "2-year Treasury yields dip 4 bps as traders reprice rate-cut probability for Q1.",           selected: false },
    { time: "14:20", tag: "Monetary Policy",  text: "Powell reiterates 'data-dependent' stance — no preset course for remainder of 2025.",        selected: false },
    { time: "14:11", tag: "Market Reaction",  text: "S&P 500 futures turn positive; equities traders absorb dovish tilt in statement.",            selected: false },
    { time: "14:02", tag: "Geopolitical",     text: "Chair references global supply disruptions as ongoing uncertainty factor.",                   selected: false },
  ];
  let tlY = 180;
  tlItems.forEach((item) => {
    const tli = figma.createFrame();
    tli.name = "TimelineItem"; tli.x = 16; tli.y = tlY;
    tli.resize(455, item.selected ? 84 : 72); tli.layoutMode = "HORIZONTAL"; tli.itemSpacing = 10;
    tli.paddingLeft = 14; tli.paddingRight = 14; tli.paddingTop = 10; tli.paddingBottom = 10;
    tli.cornerRadius = 10; tli.fills = [item.selected ? C.selected : C.surface];
    tli.strokes = [item.selected ? C.blueBorder : C.divider]; tli.strokeWeight = item.selected ? 1.5 : 1;
    bdLeft.appendChild(tli);

    const tsCol = figma.createFrame();
    tsCol.name = "Timestamp"; tsCol.layoutMode = "VERTICAL"; tsCol.counterAxisAlignItems = "CENTER";
    tsCol.itemSpacing = 4; tsCol.resize(36, 52); tsCol.fills = []; tli.appendChild(tsCol);
    addText(tsCol, item.time, 11, "Semi Bold", item.selected ? C.blue : C.textSub);

    const cBlock = figma.createFrame();
    cBlock.name = "Content"; cBlock.layoutMode = "VERTICAL"; cBlock.itemSpacing = 4;
    cBlock.layoutGrow = 1; cBlock.resize(10, 52); cBlock.fills = []; tli.appendChild(cBlock);

    const tagChip = figma.createFrame();
    tagChip.name = "TagChip"; tagChip.layoutMode = "HORIZONTAL";
    tagChip.paddingLeft = 6; tagChip.paddingRight = 6; tagChip.paddingTop = 2; tagChip.paddingBottom = 2;
    tagChip.cornerRadius = 4; tagChip.fills = [item.selected ? C.blueWash : C.chip]; cBlock.appendChild(tagChip);
    addText(tagChip, item.tag, 10, "Medium", item.selected ? C.blue : C.textMid);

    addText(cBlock, item.text, 12, "Regular", C.text, 18);

    if (item.selected) {
      const actRow = figma.createFrame();
      actRow.name = "Actions"; actRow.layoutMode = "HORIZONTAL"; actRow.counterAxisAlignItems = "CENTER";
      actRow.itemSpacing = 6; actRow.fills = []; cBlock.appendChild(actRow);
      const vsBtn = figma.createFrame();
      vsBtn.name = "ViewSource"; vsBtn.layoutMode = "HORIZONTAL";
      vsBtn.paddingLeft = 8; vsBtn.paddingRight = 8; vsBtn.paddingTop = 3; vsBtn.paddingBottom = 3;
      vsBtn.cornerRadius = 5; vsBtn.fills = [C.chipBlue]; actRow.appendChild(vsBtn);
      addText(vsBtn, "View Source", 11, "Medium", C.white);
      const pinBtn = figma.createFrame();
      pinBtn.name = "Pin"; pinBtn.layoutMode = "HORIZONTAL";
      pinBtn.paddingLeft = 8; pinBtn.paddingRight = 8; pinBtn.paddingTop = 3; pinBtn.paddingBottom = 3;
      pinBtn.cornerRadius = 5; pinBtn.fills = [C.chip]; actRow.appendChild(pinBtn);
      addText(pinBtn, "Pin to Canvas", 11, "Medium", C.textMid);
    }
    tlY += item.selected ? 92 : 80;
  });

  makeRightCol(bdF);
  figma.notify("✅ 3/3 — Broadcast Detail built");

  figma.currentPage.selection = [chF, mgF, bdF];
  figma.viewport.scrollAndZoomIntoView([modelFrame, chF, mgF, bdF]);
  figma.notify("🎉 All 3 Stringer channel frames built successfully!", { timeout: 5000 });
}

async function generateRecreatedFrame() {
  const targetFrame = figma.currentPage.findOne(n => n.name === "to-recreate" && n.type === "FRAME") || figma.getNodeById("120:388");
  if (!targetFrame) throw new Error("Frame 'to-recreate' not found");

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const targetX = targetFrame.x + targetFrame.width + 60;
  const targetY = targetFrame.y;
  const W = 900, H = 700;

  // Remove existing recreated frame if present
  const existing = figma.currentPage.findOne(n => n.name === "recreated — SwiftUI Design" && n.type === "FRAME");
  if (existing) existing.remove();

  const solid = (r, g, b, a) => {
    const paint = { type: "SOLID", color: { r, g, b } };
    if (a !== undefined) paint.opacity = a;
    return paint;
  };

  const C = {
    bg: solid(1, 1, 1),
    titlebar: solid(0.985, 0.985, 0.99),
    border: solid(0.88, 0.88, 0.88),
    divider: solid(0.90, 0.90, 0.90),
    subtleDivider: solid(0.93, 0.93, 0.95),
    cardBg: solid(0.97, 0.97, 0.98),
    cardBorder: solid(0.89, 0.89, 0.91),
    feedRowBg: solid(0.985, 0.985, 0.99),
    feedRowBorder: solid(0.91, 0.91, 0.93),
    textPrimary: solid(0.10, 0.10, 0.12),
    textSecondary: solid(0.40, 0.40, 0.44),
    textTertiary: solid(0.60, 0.60, 0.64),
    blue: solid(0.15, 0.45, 0.85),
    blueWash: solid(0.92, 0.95, 1.0),
    green: solid(0.18, 0.65, 0.35),
    greenWash: solid(0.90, 0.97, 0.92),
    red: solid(0.82, 0.22, 0.18),
    redWash: solid(0.98, 0.92, 0.92),
    amber: solid(0.85, 0.58, 0.0),
    amberWash: solid(0.98, 0.95, 0.88),
    purple: solid(0.52, 0.25, 0.80),
    purpleWash: solid(0.95, 0.92, 0.99),
    white: solid(1, 1, 1),
  };

  const addText = (parent, chars, size, style = "Regular", color = C.textPrimary, lh = null) => {
    const t = figma.createText();
    t.fontName = { family: "Inter", style };
    t.characters = String(chars);
    t.fontSize = size;
    t.fills = [color];
    if (lh) t.lineHeight = { value: lh, unit: "PIXELS" };
    parent.appendChild(t);
    return t;
  };

  // 1. Root Frame
  const root = figma.createFrame();
  root.name = "recreated — SwiftUI Design";
  root.resize(W, H);
  root.x = targetX;
  root.y = targetY;
  root.cornerRadius = 10;
  root.clipsContent = true;
  root.fills = [C.bg];
  root.strokes = [C.border];
  root.strokeWeight = 1;

  // 2. Title Bar (Height 44)
  const titleBar = figma.createFrame();
  titleBar.name = "TitleBar";
  titleBar.resize(W, 44);
  titleBar.fills = [C.titlebar];
  titleBar.strokes = [C.border];
  titleBar.strokeWeight = 1;
  root.appendChild(titleBar);

  // Traffic lights
  [{ r: 0.99, g: 0.38, b: 0.36 }, { r: 1.0, g: 0.74, b: 0.18 }, { r: 0.16, g: 0.80, b: 0.38 }].forEach((c, i) => {
    const dot = figma.createEllipse();
    dot.name = "TrafficLight";
    dot.resize(10, 10);
    dot.x = 18 + i * 18;
    dot.y = 17;
    dot.fills = [solid(c.r, c.g, c.b)];
    titleBar.appendChild(dot);
  });

  // Title bar center: App Title & Status
  const tbCenter = figma.createFrame();
  tbCenter.name = "TitleBarContent";
  tbCenter.x = 84;
  tbCenter.y = 10;
  tbCenter.resize(W - 100, 24);
  tbCenter.layoutMode = "HORIZONTAL";
  tbCenter.counterAxisAlignItems = "CENTER";
  tbCenter.itemSpacing = 8;
  tbCenter.fills = [];
  titleBar.appendChild(tbCenter);

  addText(tbCenter, "Stringer", 13, "Semi Bold", C.textPrimary);
  addText(tbCenter, "·", 12, "Regular", C.textTertiary);
  addText(tbCenter, "Workstation — Recreated (SwiftUI Design Skill)", 12, "Medium", C.textSecondary);

  const tbSpacer = figma.createFrame();
  tbSpacer.name = "Spacer";
  tbSpacer.layoutGrow = 1;
  tbSpacer.resize(10, 10);
  tbSpacer.fills = [];
  tbCenter.appendChild(tbSpacer);

  const liveBadge = figma.createFrame();
  liveBadge.name = "LiveStatus";
  liveBadge.layoutMode = "HORIZONTAL";
  liveBadge.counterAxisAlignItems = "CENTER";
  liveBadge.itemSpacing = 5;
  liveBadge.paddingLeft = 8; liveBadge.paddingRight = 8;
  liveBadge.paddingTop = 3; liveBadge.paddingBottom = 3;
  liveBadge.cornerRadius = 6;
  liveBadge.fills = [C.greenWash];
  tbCenter.appendChild(liveBadge);

  const liveDot = figma.createEllipse();
  liveDot.resize(6, 6);
  liveDot.fills = [C.green];
  liveBadge.appendChild(liveDot);
  addText(liveBadge, "LIVE INGESTION", 10, "Semi Bold", C.green);

  // 3. Central Vertical Column Divider at x: 447
  const colDivider = figma.createLine();
  colDivider.name = "Divider/Columns";
  colDivider.x = 447;
  colDivider.y = 44;
  colDivider.resize(H - 44, 0);
  colDivider.rotation = -90;
  colDivider.strokes = [C.divider];
  root.appendChild(colDivider);

  // 4. Left Column: Feed Pane (x: 20, width: 412)
  const feedPane = figma.createFrame();
  feedPane.name = "FeedColumn";
  feedPane.x = 20;
  feedPane.y = 54;
  feedPane.resize(412, H - 64);
  feedPane.layoutMode = "VERTICAL";
  feedPane.itemSpacing = 10;
  feedPane.fills = [];
  root.appendChild(feedPane);

  // Feed Header Row
  const feedHdr = figma.createFrame();
  feedHdr.name = "FeedHeader";
  feedHdr.layoutMode = "HORIZONTAL";
  feedHdr.counterAxisAlignItems = "CENTER";
  feedHdr.resize(412, 24);
  feedHdr.fills = [];
  feedPane.appendChild(feedHdr);

  addText(feedHdr, "Live Broadcast Feed", 14, "Semi Bold", C.textPrimary);
  const fhSpacer = figma.createFrame();
  fhSpacer.name = "Spacer";
  fhSpacer.layoutGrow = 1;
  fhSpacer.resize(10, 1);
  fhSpacer.fills = [];
  feedHdr.appendChild(fhSpacer);

  const countChip = figma.createFrame();
  countChip.name = "CountChip";
  countChip.layoutMode = "HORIZONTAL";
  countChip.primaryAxisSizingMode = "AUTO";
  countChip.counterAxisSizingMode = "AUTO";
  countChip.paddingLeft = 8; countChip.paddingRight = 8;
  countChip.paddingTop = 3; countChip.paddingBottom = 3;
  countChip.cornerRadius = 5;
  countChip.fills = [C.blueWash];
  feedHdr.appendChild(countChip);
  addText(countChip, "7 Channels", 10.5, "Medium", C.blue);

  // Search & Filter Bar
  const searchRow = figma.createFrame();
  searchRow.name = "SearchBar";
  searchRow.resize(412, 28);
  searchRow.layoutMode = "HORIZONTAL";
  searchRow.counterAxisAlignItems = "CENTER";
  searchRow.itemSpacing = 8;
  searchRow.fills = [];
  feedPane.appendChild(searchRow);

  const searchInput = figma.createFrame();
  searchInput.name = "SearchInput";
  searchInput.layoutMode = "HORIZONTAL";
  searchInput.counterAxisAlignItems = "CENTER";
  searchInput.itemSpacing = 6;
  searchInput.paddingLeft = 8; searchInput.paddingRight = 8;
  searchInput.paddingTop = 5; searchInput.paddingBottom = 5;
  searchInput.cornerRadius = 6;
  searchInput.fills = [C.cardBg];
  searchInput.strokes = [C.cardBorder];
  searchInput.strokeWeight = 1;
  searchInput.layoutGrow = 1;
  searchInput.resize(10, 28);
  searchRow.appendChild(searchInput);
  addText(searchInput, "⌕", 12, "Regular", C.textTertiary);
  addText(searchInput, "Search broadcasts, transcripts, speakers…", 11.5, "Regular", C.textTertiary);

  const filterBtn = figma.createFrame();
  filterBtn.name = "FilterButton";
  filterBtn.layoutMode = "HORIZONTAL";
  filterBtn.counterAxisAlignItems = "CENTER";
  filterBtn.itemSpacing = 4;
  filterBtn.paddingLeft = 8; filterBtn.paddingRight = 8;
  filterBtn.paddingTop = 5; filterBtn.paddingBottom = 5;
  filterBtn.cornerRadius = 6;
  filterBtn.fills = [C.cardBg];
  filterBtn.strokes = [C.cardBorder];
  filterBtn.strokeWeight = 1;
  filterBtn.resize(60, 28);
  searchRow.appendChild(filterBtn);
  addText(filterBtn, "Filter", 11, "Medium", C.textSecondary);

  // Feed Items List
  const feedData = [
    {
      source: "Bloomberg Live",
      badgeColor: { r: 0.75, g: 0.22, b: 0.17 },
      tag: "MONETARY POLICY",
      time: "14:32",
      headline: "Federal Reserve Signals Rate Pause Amid Moderation",
      summary: "Committee maintains benchmark policy tier at 5.25%-5.50% citing stabilizing labor metrics and core disinflation progress.",
      insights: "47 insights"
    },
    {
      source: "CNBC Markets",
      badgeColor: { r: 0.85, g: 0.60, b: 0.0 },
      tag: "FIXED INCOME",
      time: "14:28",
      headline: "2-Year Treasury Yields Dip 4 bps Following Statement",
      summary: "Short-end sovereign debt catches bids across afternoon trade as markets reprice early 2026 easing probability.",
      insights: "31 insights"
    },
    {
      source: "Reuters Financial",
      badgeColor: { r: 0.25, g: 0.48, b: 0.31 },
      tag: "LABOR EQUILIBRIUM",
      time: "14:20",
      headline: "Non-Farm Payroll Trajectory Converges to Trend",
      summary: "Private sector additions moderate to 142k, aligning with monetary committee projections of sustainable expansion.",
      insights: "28 insights"
    },
    {
      source: "Federal Reserve Live",
      badgeColor: { r: 0.17, g: 0.44, b: 0.75 },
      tag: "CENTRAL BANK",
      time: "14:14",
      headline: "Powell Press Conference: Data-Dependent Horizon",
      summary: "Chair emphasizes balance sheet runoff cadence remains on autopilot with no immediate alterations scheduled.",
      insights: "89 insights"
    },
    {
      source: "Dow Jones Wire",
      badgeColor: { r: 0.75, g: 0.22, b: 0.17 },
      tag: "TECH & EQUITIES",
      time: "14:02",
      headline: "Semiconductor Index Paces Mid-Day Rebound",
      summary: "Broad tech indices turn positive with mega-cap liquidity expanding ahead of closing bell options expiration.",
      insights: "19 insights"
    }
  ];

  feedData.forEach((item, idx) => {
    const card = figma.createFrame();
    card.name = "FeedItem/" + item.source;
    card.layoutMode = "VERTICAL";
    card.itemSpacing = 5;
    card.paddingLeft = 10; card.paddingRight = 10;
    card.paddingTop = 8; card.paddingBottom = 8;
    card.cornerRadius = 8;
    card.fills = [idx === 0 ? C.blueWash : C.feedRowBg];
    card.strokes = [idx === 0 ? C.blue : C.feedRowBorder];
    card.strokeWeight = 1;
    card.resize(412, 92);
    feedPane.appendChild(card);

    // Header row
    const hr = figma.createFrame();
    hr.name = "ItemHeader";
    hr.layoutMode = "HORIZONTAL";
    hr.counterAxisAlignItems = "CENTER";
    hr.itemSpacing = 6;
    hr.resize(392, 18);
    hr.fills = [];
    card.appendChild(hr);

    const badge = figma.createFrame();
    badge.name = "Badge";
    badge.resize(16, 16);
    badge.cornerRadius = 4;
    badge.fills = [solid(item.badgeColor.r, item.badgeColor.g, item.badgeColor.b)];
    hr.appendChild(badge);

    addText(hr, item.source, 12, "Semi Bold", C.textPrimary);

    const tagPill = figma.createFrame();
    tagPill.name = "TagPill";
    tagPill.layoutMode = "HORIZONTAL";
    tagPill.primaryAxisSizingMode = "AUTO";
    tagPill.counterAxisSizingMode = "AUTO";
    tagPill.paddingLeft = 6; tagPill.paddingRight = 6;
    tagPill.paddingTop = 2; tagPill.paddingBottom = 2;
    tagPill.cornerRadius = 4;
    tagPill.fills = [idx === 0 ? C.white : C.subtleDivider];
    hr.appendChild(tagPill);
    addText(tagPill, item.tag, 9, "Semi Bold", idx === 0 ? C.blue : C.textSecondary);

    const sSpacer = figma.createFrame();
    sSpacer.name = "Spacer";
    sSpacer.layoutGrow = 1;
    sSpacer.resize(10, 1);
    sSpacer.fills = [];
    hr.appendChild(sSpacer);

    addText(hr, item.time, 11, "Regular", C.textTertiary);

    // Headline
    const hl = addText(card, item.headline, 12, "Semi Bold", C.textPrimary, 16);
    hl.textAutoResize = "HEIGHT";
    hl.resize(392, 16);

    // Summary
    const sm = addText(card, item.summary, 11, "Regular", C.textSecondary, 15);
    sm.textAutoResize = "HEIGHT";
    sm.resize(392, 15);

    // Meta footer
    const ft = figma.createFrame();
    ft.name = "Footer";
    ft.layoutMode = "HORIZONTAL";
    ft.counterAxisAlignItems = "CENTER";
    ft.itemSpacing = 6;
    ft.resize(392, 14);
    ft.fills = [];
    card.appendChild(ft);

    addText(ft, "↳ " + item.insights + " extracted", 10, "Medium", C.blue);
  });

  // 5. Right Column: Canvas Pane (x: 468, width: 412)
  const canvasPane = figma.createFrame();
  canvasPane.name = "CanvasColumn";
  canvasPane.x = 468;
  canvasPane.y = 54;
  canvasPane.resize(412, H - 64);
  canvasPane.layoutMode = "VERTICAL";
  canvasPane.itemSpacing = 12;
  canvasPane.fills = [];
  root.appendChild(canvasPane);

  // Canvas Header
  const cvsHdr = figma.createFrame();
  cvsHdr.name = "CanvasHeader";
  cvsHdr.layoutMode = "HORIZONTAL";
  cvsHdr.counterAxisAlignItems = "CENTER";
  cvsHdr.resize(412, 24);
  cvsHdr.fills = [];
  canvasPane.appendChild(cvsHdr);

  addText(cvsHdr, "Investigation Canvas", 14, "Semi Bold", C.textPrimary);
  const cvSpacer = figma.createFrame();
  cvSpacer.name = "Spacer";
  cvSpacer.layoutGrow = 1;
  cvSpacer.resize(10, 1);
  cvSpacer.fills = [];
  cvsHdr.appendChild(cvSpacer);

  const addCardBtn = figma.createFrame();
  addCardBtn.name = "AddCardBtn";
  addCardBtn.layoutMode = "HORIZONTAL";
  addCardBtn.counterAxisAlignItems = "CENTER";
  addCardBtn.primaryAxisSizingMode = "AUTO";
  addCardBtn.counterAxisSizingMode = "AUTO";
  addCardBtn.paddingLeft = 10; addCardBtn.paddingRight = 12;
  addCardBtn.paddingTop = 5; addCardBtn.paddingBottom = 5;
  addCardBtn.cornerRadius = 6;
  addCardBtn.fills = [C.blue];
  cvsHdr.appendChild(addCardBtn);
  addText(addCardBtn, "+ New Card", 11, "Medium", C.white);

  // Staggered Masonry Grid Container
  const gridContainer = figma.createFrame();
  gridContainer.name = "MasonryGrid";
  gridContainer.layoutMode = "HORIZONTAL";
  gridContainer.itemSpacing = 12;
  gridContainer.resize(412, H - 100);
  gridContainer.fills = [];
  canvasPane.appendChild(gridContainer);

  const makeCanvasCard = (parent, tag, tagColor, tagWash, title, excerpt, source) => {
    const c = figma.createFrame();
    c.name = "CanvasCard/" + tag;
    c.layoutMode = "VERTICAL";
    c.itemSpacing = 6;
    c.paddingLeft = 12; c.paddingRight = 12;
    c.paddingTop = 10; c.paddingBottom = 10;
    c.cornerRadius = 8;
    c.fills = [C.cardBg];
    c.strokes = [C.cardBorder];
    c.strokeWeight = 1;
    c.resize(198, 160);
    parent.appendChild(c);

    // Tag row
    const tr = figma.createFrame();
    tr.name = "TagRow";
    tr.layoutMode = "HORIZONTAL";
    tr.counterAxisAlignItems = "CENTER";
    tr.resize(174, 18);
    tr.fills = [];
    c.appendChild(tr);

    const cp = figma.createFrame();
    cp.name = "Chip";
    cp.layoutMode = "HORIZONTAL";
    cp.primaryAxisSizingMode = "AUTO";
    cp.counterAxisSizingMode = "AUTO";
    cp.paddingLeft = 6; cp.paddingRight = 6;
    cp.paddingTop = 2; cp.paddingBottom = 2;
    cp.cornerRadius = 4;
    cp.fills = [tagWash];
    tr.appendChild(cp);
    addText(cp, tag, 9, "Semi Bold", tagColor);

    const trSpacer = figma.createFrame();
    trSpacer.name = "Spacer";
    trSpacer.layoutGrow = 1;
    trSpacer.resize(1, 1);
    trSpacer.fills = [];
    tr.appendChild(trSpacer);

    const pinBadge = figma.createFrame();
    pinBadge.name = "PinBadge";
    pinBadge.layoutMode = "HORIZONTAL";
    pinBadge.primaryAxisSizingMode = "AUTO";
    pinBadge.counterAxisSizingMode = "AUTO";
    pinBadge.paddingLeft = 5; pinBadge.paddingRight = 5;
    pinBadge.paddingTop = 2; pinBadge.paddingBottom = 2;
    pinBadge.cornerRadius = 4;
    pinBadge.fills = [C.subtleDivider];
    tr.appendChild(pinBadge);
    addText(pinBadge, "PINNED", 8.5, "Semi Bold", C.textSecondary);

    // Title
    const ct = addText(c, title, 12, "Semi Bold", C.textPrimary, 16);
    ct.textAutoResize = "HEIGHT";
    ct.resize(174, 16);

    // Excerpt
    const ce = addText(c, excerpt, 10.5, "Regular", C.textSecondary, 15);
    ce.textAutoResize = "HEIGHT";
    ce.resize(174, 15);

    const cSpacer = figma.createFrame();
    cSpacer.name = "Spacer";
    cSpacer.layoutGrow = 1;
    cSpacer.resize(10, 1);
    cSpacer.fills = [];
    c.appendChild(cSpacer);

    // Source footer
    addText(c, source, 9.5, "Medium", C.textTertiary);
    return c;
  };

  // Column 0 (Standard y offset)
  const col0 = figma.createFrame();
  col0.name = "Column/Left";
  col0.layoutMode = "VERTICAL";
  col0.itemSpacing = 12;
  col0.resize(198, H - 100);
  col0.fills = [];
  gridContainer.appendChild(col0);

  makeCanvasCard(
    col0,
    "POLICY BRIEF",
    C.blue,
    C.blueWash,
    "Terminal Rate Positioning",
    "Forward guidance removes tightening bias. Balance of risks is evaluated as symmetric across dual mandate.",
    "Bloomberg Live · 14:32"
  );

  makeCanvasCard(
    col0,
    "YIELD CURVE",
    C.amber,
    C.amberWash,
    "Curve Steepening Dynamic",
    "2Y/10Y inversion narrows to -12 bps. Influx into sovereign duration observed across asset managers.",
    "CNBC Markets · 14:28"
  );

  makeCanvasCard(
    col0,
    "COMMODITIES",
    C.green,
    C.greenWash,
    "Energy Reserves Smoothing",
    "Brent crude stabilizes near $74/bbl following strategic inventory coordination announcements.",
    "Reuters Terminal · 14:10"
  );

  // Column 1 (Staggered offset downwards by 24pt!)
  const col1 = figma.createFrame();
  col1.name = "Column/Right";
  col1.layoutMode = "VERTICAL";
  col1.itemSpacing = 12;
  col1.paddingTop = 24; // Staggered masonry offset!
  col1.resize(198, H - 100);
  col1.fills = [];
  gridContainer.appendChild(col1);

  makeCanvasCard(
    col1,
    "MACRO DATA",
    C.purple,
    C.purpleWash,
    "Core CPI Disinflation Pace",
    "Services ex-shelter metric tracks lowest 3-month annualized pace in 18 months, reinforcing disinflation.",
    "Bureau of Labor Statistics · 13:45"
  );

  makeCanvasCard(
    col1,
    "TECH ROTATION",
    C.blue,
    C.blueWash,
    "Enterprise Capex Commitments",
    "Semiconductor infrastructure investment plans reiterated with cash flow cushions sustaining dividend yields.",
    "Dow Jones Wire · 14:02"
  );

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([targetFrame, root]);
  figma.notify("✨ Successfully recreated 'to-recreate' with SwiftUI Design Skill!");
  return { id: root.id, name: root.name, x: root.x, y: root.y, width: root.width, height: root.height };
}

async function execute(command) {
  if (command.type === "batch") {
    const payload = command.payload || {};
    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    const results = [];
    let lastCreatedId = null;

    for (const op of operations) {
      const opPayload = { ...(op.payload || {}) };
      if (opPayload.parentId === "$prev" && lastCreatedId) {
        opPayload.parentId = lastCreatedId;
      }
      const singleRes = await executeSingle({
        id: command.id,
        type: op.type,
        payload: opPayload,
      });
      results.push(singleRes);
      if (singleRes && singleRes.id && singleRes.deleted !== true) {
        lastCreatedId = singleRes.id;
      }
    }

    if (results.length > 0 && results[0]?.id) {
      const firstNode = figma.getNodeById(results[0].id);
      if (firstNode) {
        figma.currentPage.selection = [firstNode];
      }
    }

    return { count: results.length, operations: results };
  }

  return await executeSingle(command);
}

async function executeSingle(command) {
  const payload = command.payload || {};
  const parent = payload.parentId ? figma.getNodeById(payload.parentId) : figma.currentPage;
  if (!parent || !("appendChild" in parent)) throw new Error("Parent node was not found");

  if (command.type === "create_frame") {
    const node = figma.createFrame();
    node.name = String(payload.name || "MCP Frame");
    node.resize(Number(payload.width || 400), Number(payload.height || 300));
    node.x = Number(payload.x || 0);
    node.y = Number(payload.y || 0);
    parent.appendChild(node);
    return { id: node.id, name: node.name };
  }

  if (command.type === "create_text") {
    const node = figma.createText();
    await ensureFontLoaded({ family: "Inter", style: "Regular" });
    node.fontSize = Number(payload.fontSize || 16);
    node.characters = String(payload.characters || "MCP text");
    node.name = String(payload.name || "MCP Text");
    node.x = Number(payload.x || 0);
    node.y = Number(payload.y || 0);
    parent.appendChild(node);
    return { id: node.id, name: node.name };
  }

  if (command.type === "create_component") {
    const node = figma.createComponent();
    node.name = String(payload.name || "MCP Component");
    node.resize(Number(payload.width || 200), Number(payload.height || 100));
    node.x = Number(payload.x || 0);
    node.y = Number(payload.y || 0);
    parent.appendChild(node);
    return { id: node.id, name: node.name };
  }

  if (command.type === "create_instance") {
    const component = figma.getNodeById(String(payload.componentId || ""));
    if (!component || component.type !== "COMPONENT") throw new Error("Component not found or not a component node");
    const node = component.createInstance();
    node.x = Number(payload.x || 0);
    node.y = Number(payload.y || 0);
    parent.appendChild(node);
    return { id: node.id, name: node.name, mainComponentId: component.id };
  }

  if (command.type === "create_section") {
    const node = figma.createSection();
    node.name = String(payload.name || "MCP Section");
    node.x = Number(payload.x || 0);
    node.y = Number(payload.y || 0);
    if (payload.width !== undefined || payload.height !== undefined) {
      node.resizeWithoutConstraints(Number(payload.width || 800), Number(payload.height || 600));
    }
    parent.appendChild(node);
    return { id: node.id, name: node.name };
  }

  if (command.type === "group_nodes") {
    const nodeIds = Array.isArray(payload.nodeIds) ? payload.nodeIds : [];
    if (nodeIds.length < 1) throw new Error("group_nodes requires at least one nodeId in nodeIds");
    const nodes = nodeIds.map(id => figma.getNodeById(String(id))).filter(Boolean);
    if (nodes.length === 0) throw new Error("No valid nodes found for grouping");
    const group = figma.group(nodes, parent);
    if (payload.name) group.name = String(payload.name);
    return { id: group.id, name: group.name };
  }

  if (command.type === "inspect") {
    return {
      fileKey: figma.fileKey,
      fileName: figma.root.name,
      currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
      pages: figma.root.children.map(p => ({ id: p.id, name: p.name })),
      selection: figma.currentPage.selection.map(s => ({ id: s.id, name: s.name, type: s.type })),
    };
  }

  if (command.type === "ping_test") {
    return { pong: 42 };
  }

  if (command.type === "generate_recreated_frame") {
    return await generateRecreatedFrame();
  }

  if (command.type === "get_node_tree") {
    let target = null;
    if (payload.nodeId) target = figma.getNodeById(String(payload.nodeId));
    else if (payload.name) target = figma.currentPage.findOne(n => n.name === String(payload.name));
    else target = figma.currentPage;
    if (!target) throw new Error("Target node not found");

    const maxDepth = Number(payload.maxDepth || 10);
    function serializeNode(n, depth = 0) {
      const info = {
        id: n.id,
        name: n.name,
        type: n.type,
        x: "x" in n ? n.x : 0,
        y: "y" in n ? n.y : 0,
        width: "width" in n ? n.width : 0,
        height: "height" in n ? n.height : 0,
        visible: "visible" in n ? n.visible : true,
        opacity: "opacity" in n ? n.opacity : 1,
        fills: "fills" in n ? n.fills : undefined,
        strokes: "strokes" in n ? n.strokes : undefined,
        strokeWeight: "strokeWeight" in n ? n.strokeWeight : undefined,
        cornerRadius: "cornerRadius" in n ? n.cornerRadius : undefined,
        layoutMode: "layoutMode" in n ? n.layoutMode : undefined,
        itemSpacing: "itemSpacing" in n ? n.itemSpacing : undefined,
        paddingLeft: "paddingLeft" in n ? n.paddingLeft : undefined,
        paddingRight: "paddingRight" in n ? n.paddingRight : undefined,
        paddingTop: "paddingTop" in n ? n.paddingTop : undefined,
        paddingBottom: "paddingBottom" in n ? n.paddingBottom : undefined,
        primaryAxisAlignItems: "primaryAxisAlignItems" in n ? n.primaryAxisAlignItems : undefined,
        counterAxisAlignItems: "counterAxisAlignItems" in n ? n.counterAxisAlignItems : undefined,
        layoutGrow: "layoutGrow" in n ? n.layoutGrow : undefined,
        layoutAlign: "layoutAlign" in n ? n.layoutAlign : undefined,
        characters: "characters" in n ? n.characters : undefined,
        fontSize: "fontSize" in n ? n.fontSize : undefined,
        fontName: "fontName" in n ? n.fontName : undefined,
        lineHeight: "lineHeight" in n ? n.lineHeight : undefined,
        letterSpacing: "letterSpacing" in n ? n.letterSpacing : undefined,
      };
      if ("children" in n && depth < maxDepth) {
        info.children = n.children.map(c => serializeNode(c, depth + 1));
      }
      return info;
    }
    return serializeNode(target);
  }

  if (command.type === "export_node") {
    let target = null;
    if (payload.nodeId) target = figma.getNodeById(String(payload.nodeId));
    else if (payload.name) target = figma.currentPage.findOne(n => n.name === String(payload.name));
    else if (figma.currentPage.selection.length > 0) target = figma.currentPage.selection[0];
    if (!target) throw new Error("Node for export not found");
    const format = (payload.format || "PNG").toUpperCase();
    const bytes = await target.exportAsync({
      format,
      constraint: { type: "SCALE", value: Number(payload.scale || 2) },
    });
    const base64 = figma.base64Encode(bytes);
    return { id: target.id, name: target.name, format, base64, byteLength: bytes.byteLength };
  }

  // All remaining commands require an existing node resolved via nodeId
  const node = figma.getNodeById(String(payload.nodeId || ""));
  if (!node) throw new Error("Node was not found");

  if (command.type === "delete_node") {
    const nodeId = node.id;
    node.remove();
    return { id: nodeId, deleted: true };
  }

  if (command.type === "update_node") {
    if (payload.name !== undefined) node.name = String(payload.name);
    if (payload.x !== undefined && "x" in node) node.x = Number(payload.x);
    if (payload.y !== undefined && "y" in node) node.y = Number(payload.y);
    if (payload.width !== undefined && "resize" in node) node.resize(Number(payload.width), node.height);
    if (payload.height !== undefined && "resize" in node) node.resize(node.width, Number(payload.height));
    if (payload.characters !== undefined && "characters" in node) {
      if ("fontName" in node && typeof node.fontName !== "symbol") {
        await ensureFontLoaded(node.fontName);
      }
      node.characters = String(payload.characters);
    }
    return { id: node.id, name: node.name };
  }

  if (command.type === "set_fills") {
    if (!("fills" in node)) throw new Error("Node does not support fills");
    if (!Array.isArray(payload.fills)) throw new Error("payload.fills must be an array of Paint objects");
    node.fills = payload.fills;
    return { id: node.id, name: node.name };
  }

  if (command.type === "set_text_style") {
    if (node.type !== "TEXT") throw new Error("Node is not a TEXT node");
    const family = payload.fontFamily || "Inter";
    const style  = payload.fontStyle  || "Regular";
    await ensureFontLoaded({ family, style });
    node.fontName = { family, style };
    if (payload.fontSize            !== undefined) node.fontSize            = Number(payload.fontSize);
    if (payload.lineHeight          !== undefined) node.lineHeight          = payload.lineHeight;
    if (payload.letterSpacing       !== undefined) node.letterSpacing       = payload.letterSpacing;
    if (payload.textCase            !== undefined) node.textCase            = payload.textCase;
    if (payload.textDecoration      !== undefined) node.textDecoration      = payload.textDecoration;
    if (payload.textAlignHorizontal !== undefined) node.textAlignHorizontal = payload.textAlignHorizontal;
    if (payload.textAlignVertical   !== undefined) node.textAlignVertical   = payload.textAlignVertical;
    return { id: node.id, name: node.name };
  }

  if (command.type === "set_auto_layout") {
    if (node.type !== "FRAME" && node.type !== "COMPONENT") throw new Error("Node must be a FRAME or COMPONENT to use set_auto_layout");
    node.layoutMode = payload.layoutMode || "HORIZONTAL";
    if (payload.itemSpacing           !== undefined) node.itemSpacing           = Number(payload.itemSpacing);
    if (payload.paddingLeft           !== undefined) node.paddingLeft           = Number(payload.paddingLeft);
    if (payload.paddingRight          !== undefined) node.paddingRight          = Number(payload.paddingRight);
    if (payload.paddingTop            !== undefined) node.paddingTop            = Number(payload.paddingTop);
    if (payload.paddingBottom         !== undefined) node.paddingBottom         = Number(payload.paddingBottom);
    if (payload.primaryAxisAlignItems !== undefined) node.primaryAxisAlignItems = payload.primaryAxisAlignItems;
    if (payload.counterAxisAlignItems !== undefined) node.counterAxisAlignItems = payload.counterAxisAlignItems;
    if (payload.layoutWrap            !== undefined) node.layoutWrap            = payload.layoutWrap;
    if (payload.counterAxisSpacing    !== undefined) node.counterAxisSpacing    = Number(payload.counterAxisSpacing);
    return { id: node.id, name: node.name };
  }

  if (command.type === "move_to_page") {
    const page = figma.root.children.find(
      p => p.id === payload.pageId || p.name === payload.pageName
    );
    if (!page) throw new Error("Page not found — provide pageId or pageName");
    page.appendChild(node);
    return { id: node.id, name: node.name, pageId: page.id, pageName: page.name };
  }

  if (command.type === "set_prototype_link") {
    if (!payload.destinationId) throw new Error("payload.destinationId is required");
    const destination = figma.getNodeById(String(payload.destinationId));
    if (!destination) throw new Error("Destination node not found");
    const reaction = {
      action: {
        type: "NODE",
        destinationId: payload.destinationId,
        navigation: payload.navigation || "NAVIGATE",
        transition: payload.transition || null,
        preserveScrollPosition: payload.preserveScrollPosition || false,
      },
      trigger: { type: payload.triggerType || "ON_CLICK" },
    };
    node.reactions = [...node.reactions, reaction];
    return { id: node.id, name: node.name, reactionCount: node.reactions.length };
  }

  if (command.type === "set_variable_binding") {
    if (!payload.variableId) throw new Error("payload.variableId is required");
    if (!payload.field)      throw new Error("payload.field is required (e.g. \"fills\", \"width\", \"itemSpacing\")");
    const variable = figma.variables.getVariableById(String(payload.variableId));
    if (!variable) throw new Error("Variable not found: " + payload.variableId);
    node.setBoundVariable(payload.field, variable);
    return { id: node.id, name: node.name, variableId: payload.variableId, field: payload.field };
  }

  throw new Error("Unknown command type: " + command.type);
}

