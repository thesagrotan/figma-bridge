/**
 * Copy-paste this script into Figma Desktop:
 * Menu: Plugins -> Development -> Open Console (or Inspect)
 * Paste and press Enter.
 */
(async () => {
  const modelFrame = figma.currentPage.findOne(n => n.name === "model" && n.type === "FRAME");
  if (!modelFrame) {
    figma.notify("Frame 'model' not found on current page", { error: true });
    return;
  }

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });

  const targetX = modelFrame.x + modelFrame.width + 60;
  const targetY = modelFrame.y;

  const existing = figma.currentPage.findOne(n => n.name === "model — insight detail (selected state)");
  if (existing) existing.remove();

  // Root frame
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

  // Window titlebar with macOS window controls
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
    dot.name = "TrafficLight";
    dot.resize(10, 10);
    dot.x = 18 + idx * 18;
    dot.y = 17;
    dot.fills = [{ type: 'SOLID', color: c }];
    titleBar.appendChild(dot);
  });

  // Vertical split divider (Left: Feed detail, Right: Canvas)
  const colDivider = figma.createLine();
  colDivider.name = "Divider/Columns";
  colDivider.x = 487;
  colDivider.y = 44;
  colDivider.resize(detailFrame.height - 44, 0);
  colDivider.rotation = -90;
  colDivider.strokes = [{ type: 'SOLID', color: { r: 0.90, g: 0.90, b: 0.90 } }];
  detailFrame.appendChild(colDivider);

  // Left Column (440px wide)
  const leftCol = figma.createFrame();
  leftCol.name = "FocusedFeedColumn";
  leftCol.x = 24;
  leftCol.y = 56;
  leftCol.resize(440, detailFrame.height - 72);
  leftCol.layoutMode = "VERTICAL";
  leftCol.itemSpacing = 16;
  leftCol.fills = [];
  detailFrame.appendChild(leftCol);

  // 1. Navigation Header (Apple HIG Back Button)
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
  backIcon.fills = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }]; // SF Blue
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
  badgeText.characters = "Insight Detail";
  badgeText.fontSize = 11;
  badgeText.fills = [{ type: 'SOLID', color: { r: 0.45, g: 0.45, b: 0.48 } }];
  badge.appendChild(badgeText);
  navBar.appendChild(badge);

  leftCol.appendChild(navBar);

  // 2. Selected Insight Card (Preserves Broadcast Logo & Metadata)
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

  // Broadcast logo placeholder (Blue cube as in 4th item)
  const logo = figma.createFrame();
  logo.name = "BroadcastLogo";
  logo.resize(22, 22);
  logo.cornerRadius = 4;
  logo.fills = [{ type: 'SOLID', color: { r: 0.17, g: 0.44, b: 0.75 } }];
  cardHeader.appendChild(logo);

  const channelText = figma.createText();
  channelText.fontName = { family: "Inter", style: "Semi Bold" };
  channelText.characters = "Bloomberg Live • Markets";
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
  summary.characters = "Federal Reserve signals pause on benchmark rate adjustments amid stabilizing labor metrics and consumer inflation moderation.";
  summary.fontSize = 13;
  summary.lineHeight = { value: 18, unit: 'PIXELS' };
  summary.resize(412, 38);
  summary.fills = [{ type: 'SOLID', color: { r: 0.12, g: 0.12, b: 0.14 } }];
  insightCard.appendChild(summary);

  leftCol.appendChild(insightCard);

  // 3. Source Link Indicator
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
  caption.characters = "TRANSCRIPT SOURCE (BROADCAST)";
  caption.fontSize = 11;
  caption.letterSpacing = { value: 0.4, unit: 'PIXELS' };
  caption.fills = [{ type: 'SOLID', color: { r: 0.45, g: 0.45, b: 0.5 } }];
  linkRow.appendChild(caption);

  leftCol.appendChild(linkRow);

  // 4. Transcript Container with Source Highlight
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

  // Context before
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
  hl.fills = [{ type: 'SOLID', color: { r: 0.91, g: 0.95, b: 1.0 } }]; // Accent wash
  hl.strokes = [{ type: 'SOLID', color: { r: 0.0, g: 0.48, b: 1.0 } }]; // Apple Blue border
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

  // Context after
  const t3 = figma.createText();
  t3.fontName = { family: "Inter", style: "Regular" };
  t3.characters = "[14:33:02] Analyst: That explicit acknowledgment of policy positioning has immediate yield curve implications across Treasury notes...";
  t3.fontSize = 12.5;
  t3.lineHeight = { value: 18, unit: 'PIXELS' };
  t3.resize(412, 36);
  t3.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.58 } }];
  transcript.appendChild(t3);

  leftCol.appendChild(transcript);

  // 5. Right Column (Preserved Canvas view)
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

  // Focus viewport on both frames to inspect the interaction side-by-side
  figma.currentPage.selection = [detailFrame];
  figma.viewport.scrollAndZoomIntoView([modelFrame, detailFrame]);
  figma.notify("✨ Apple HIG Insight Detail Frame successfully generated!");
})();
