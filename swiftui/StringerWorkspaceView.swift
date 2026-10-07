import SwiftUI

// MARK: - Design Tokens
// Defined following swiftui-design-skill guidelines: 8pt grid, warm neutrals, and semantic scales.

enum DesignTokens {
    // Spacing (8pt Grid)
    static let spaceXXS: CGFloat = 2
    static let spaceXS: CGFloat  = 4
    static let spaceS: CGFloat   = 8
    static let spaceM: CGFloat   = 12
    static let spaceL: CGFloat   = 16
    static let spaceXL: CGFloat  = 24
    static let spaceXXL: CGFloat = 32

    // Corner Radii
    static let radiusXS: CGFloat = 4
    static let radiusS: CGFloat  = 6
    static let radiusM: CGFloat  = 8
    static let radiusL: CGFloat  = 10
    static let radiusWindow: CGFloat = 12

    // Colors
    enum Colors {
        // Window & Backgrounds
        static let windowBackground = Color(lightHex: "FFFFFF", darkHex: "18181A")
        static let windowBorder     = Color(lightHex: "E5E5E7", darkHex: "2C2C2E")
        static let titleBarDivider  = Color(lightHex: "EBEBED", darkHex: "2C2C2E")
        static let columnDivider    = Color(lightHex: "ECECED", darkHex: "2A2A2C")
        static let itemDivider      = Color(lightHex: "F2F2F4", darkHex: "242426")

        // Skeletons & Wireframe Placeholders
        static let skeletonPill     = Color(lightHex: "EDEDED", darkHex: "2C2C30")
        static let skeletonSearch   = Color(lightHex: "DEDEDE", darkHex: "38383C")
        static let skeletonLinePrimary   = Color(lightHex: "DEDEDE", darkHex: "3C3C40")
        static let skeletonLineSecondary = Color(lightHex: "ECECEC", darkHex: "303034")
        static let skeletonLineTertiary  = Color(lightHex: "E6E6E6", darkHex: "2A2A2E")

        // Cards
        static let cardBackground   = Color(lightHex: "F2F2F2", darkHex: "222225")
        static let cardBorder       = Color(lightHex: "E5E5E5", darkHex: "333336")

        // Typography
        static let textLabel        = Color(lightHex: "A8A8A8", darkHex: "787880")
        static let textPrimary      = Color(lightHex: "1C1C1E", darkHex: "F2F2F7")
        static let textSecondary    = Color(lightHex: "716D66", darkHex: "98989D")

        // Channel / Source Badge Accents (Matching Figma wireframe nodes)
        static let badgeRed    = Color(hex: "C0392B") // rgb(192, 57, 43)
        static let badgeAmber  = Color(hex: "D99A00") // rgb(217, 154, 0)
        static let badgeGreen  = Color(hex: "3F7A4E") // rgb(63, 122, 78)
        static let badgeBlue   = Color(hex: "2B71C0") // rgb(43, 113, 192)

        // macOS Window Controls
        static let trafficClose    = Color(hex: "FF5F56")
        static let trafficMinimize = Color(hex: "FFBD2E")
        static let trafficZoom     = Color(hex: "27C93F")
        static let trafficMuted    = Color(hex: "DCDCDC")
    }

    // Typography Hierarchy
    enum Typography {
        static let sectionHeader = Font.system(size: 13, weight: .semibold, design: .default)
        static let timestamp     = Font.system(size: 11, weight: .medium, design: .monospaced)
        static let headline      = Font.system(size: 13, weight: .semibold, design: .default)
        static let body          = Font.system(size: 12, weight: .regular, design: .default)
        static let caption       = Font.system(size: 10, weight: .medium, design: .default)
        static let brandTitle    = Font.system(size: 14, weight: .bold, design: .serif)
    }
}

// MARK: - Color Extensions
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255.0,
            green: Double(g) / 255.0,
            blue: Double(b) / 255.0,
            opacity: Double(a) / 255.0
        )
    }

    init(lightHex: String, darkHex: String) {
        #if canImport(AppKit) && !targetEnvironment(macCatalyst)
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
                ? NSColor(Color(hex: darkHex))
                : NSColor(Color(hex: lightHex))
        })
        #elseif canImport(UIKit)
        self.init(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(Color(hex: darkHex))
                : UIColor(Color(hex: lightHex))
        })
        #else
        self.init(hex: lightHex)
        #endif
    }
}

// MARK: - Model & Mock Data
struct FeedItemData: Identifiable {
    let id: UUID = UUID()
    let badgeColor: Color
    let sourceName: String
    let time: String
    let title: String
    let summary: String
    let tag: String
}

struct CanvasCardData: Identifiable {
    let id: UUID = UUID()
    let title: String
    let category: String
    let excerpt: String
    let columnIndex: Int // 0 for left, 1 for right
}

enum SampleData {
    static let feedItems: [FeedItemData] = [
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeRed,
            sourceName: "Bloomberg Live",
            time: "14:32",
            title: "Federal Reserve Pause Signal",
            summary: "Policy committee indicates benchmark lending rate will remain positioned at current tier as core metrics stabilize.",
            tag: "MONETARY"
        ),
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeAmber,
            sourceName: "CNBC Markets",
            time: "14:32",
            title: "Treasury Yield Curve Shifts",
            summary: "2-year note yields compressed 4 basis points across mid-day session following committee transcripts.",
            tag: "BONDS"
        ),
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeGreen,
            sourceName: "Reuters Terminal",
            time: "14:32",
            title: "Labor Metric Equilibrium",
            summary: "Non-farm payroll trajectory converges toward quarterly projection consensus amid moderated turnover.",
            tag: "MACRO"
        ),
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeBlue,
            sourceName: "C-SPAN Briefing",
            time: "14:32",
            title: "Congressional Committee Q&A",
            summary: "Chair responds to senate banking panel inquiry concerning systemic commercial real estate portfolio stress.",
            tag: "POLICY"
        ),
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeRed,
            sourceName: "Bloomberg Energy",
            time: "14:32",
            title: "Crude Supply Shock Mitigation",
            summary: "Strategic reserves coordinate output smoothing following logistical routing interruptions.",
            tag: "COMMODITIES"
        ),
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeAmber,
            sourceName: "Dow Jones Wire",
            time: "14:32",
            title: "Equities Rebound on Tech Volumes",
            summary: "Semiconductor index paces broad Nasdaq rally as institutional cash balances rotate into equities.",
            tag: "EQUITIES"
        ),
        FeedItemData(
            badgeColor: DesignTokens.Colors.badgeGreen,
            sourceName: "Federal Reserve Bulletin",
            time: "14:32",
            title: "Balance Sheet Runoff Cadence",
            summary: "Securities reinvestment caps maintained without adjustments across upcoming operational cycle.",
            tag: "CENTRAL BANK"
        )
    ]

    static let canvasCards: [CanvasCardData] = [
        // Column 0 cards (Left in canvas column)
        CanvasCardData(
            title: "Monetary Stance",
            category: "POLICY BRIEF",
            excerpt: "Target Fed funds rate paused. Forward guidance emphasizes strict data dependency over scheduled cuts.",
            columnIndex: 0
        ),
        CanvasCardData(
            title: "Yield Compression",
            category: "DEBT MARKETS",
            excerpt: "Treasury curve steepening pauses as short-end instruments adjust to sustained terminal policy expectations.",
            columnIndex: 0
        ),
        CanvasCardData(
            title: "Sector Rotation",
            category: "EQUITY FLOWS",
            excerpt: "Defensive allocations rotate into cyclicals following stabilizing industrial production indices.",
            columnIndex: 0
        ),
        // Column 1 cards (Right in canvas column — staggered downwards)
        CanvasCardData(
            title: "Labor Dynamics",
            category: "MACRO DATA",
            excerpt: "Participation rate upticks slightly to 62.8% with wage expansion anchoring near 3.8% annualized.",
            columnIndex: 1
        ),
        CanvasCardData(
            title: "Liquidity Outlook",
            category: "CREDIT DESK",
            excerpt: "Overnight reverse repo facility balances stabilize above $400B threshold ahead of quarter-end.",
            columnIndex: 1
        )
    ]
}

// MARK: - Root Stringer Workspace View (Recreating Figma "to-recreate")
public struct StringerWorkspaceView: View {
    @State private var isWireframeMode: Bool = true
    @State private var hoveredCardId: UUID? = nil
    @State private var selectedFeedId: UUID? = nil

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Window Title Bar (Height 44)
            windowTitleBar

            // Horizontal Titlebar Divider
            Rectangle()
                .fill(DesignTokens.Colors.titleBarDivider)
                .frame(height: 1)

            // Two-Column Workstation Body
            HStack(spacing: 0) {
                // Left Column: Feed Pane (Width: 422pt within container)
                feedColumn
                    .frame(width: 446)

                // Vertical Splitter Divider (Positioned at x=447 in Figma)
                Rectangle()
                    .fill(DesignTokens.Colors.columnDivider)
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)

                // Right Column: Canvas Pane
                canvasColumn
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: 900, height: 700)
        .background(DesignTokens.Colors.windowBackground)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radiusWindow, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radiusWindow, style: .continuous)
                .stroke(DesignTokens.Colors.windowBorder, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.12), radius: 24, x: 0, y: 12)
        .padding(24)
    }

    // MARK: - Window Title Bar
    private var windowTitleBar: some View {
        HStack(spacing: DesignTokens.spaceS) {
            // Traffic Light Window Controls
            HStack(spacing: DesignTokens.spaceS) {
                Circle()
                    .fill(isWireframeMode ? DesignTokens.Colors.trafficMuted : DesignTokens.Colors.trafficClose)
                    .frame(width: 10, height: 10)
                Circle()
                    .fill(isWireframeMode ? DesignTokens.Colors.trafficMuted : DesignTokens.Colors.trafficMinimize)
                    .frame(width: 10, height: 10)
                Circle()
                    .fill(isWireframeMode ? DesignTokens.Colors.trafficMuted : DesignTokens.Colors.trafficZoom)
                    .frame(width: 10, height: 10)
            }
            .padding(.leading, 18)

            Spacer()

            // Signature Detail: Blueprint Wireframe / Live Switcher
            Button(action: {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    isWireframeMode.toggle()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: isWireframeMode ? "square.dashed" : "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                    Text(isWireframeMode ? "Wireframe Blueprint (Figma 1:1)" : "Live Production Data")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundStyle(isWireframeMode ? DesignTokens.Colors.textSecondary : DesignTokens.Colors.badgeBlue)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(isWireframeMode ? Color.black.opacity(0.04) : DesignTokens.Colors.badgeBlue.opacity(0.12))
                )
            }
            .buttonStyle(.plain)
            .padding(.trailing, 16)
        }
        .frame(height: 44)
    }

    // MARK: - Left Column: Feed
    private var feedColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Feed Pane Header & Filter Controls (Height ~50)
            VStack(alignment: .leading, spacing: DesignTokens.spaceM) {
                Text("Feed")
                    .font(DesignTokens.Typography.sectionHeader)
                    .foregroundStyle(DesignTokens.Colors.textLabel)

                HStack {
                    // Search Bar Pill (width 130)
                    if isWireframeMode {
                        RoundedRectangle(cornerRadius: DesignTokens.radiusXS, style: .continuous)
                            .fill(DesignTokens.Colors.skeletonSearch)
                            .frame(width: 130, height: 18)
                    } else {
                        HStack(spacing: 6) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(DesignTokens.Colors.textSecondary)
                            Text("Search broadcasts…")
                                .font(.system(size: 11))
                                .foregroundStyle(DesignTokens.Colors.textSecondary)
                        }
                        .frame(width: 150, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: DesignTokens.radiusS)
                                .fill(DesignTokens.Colors.cardBackground)
                        )
                    }

                    Spacer()

                    // Action / Filter Button (width 64)
                    if isWireframeMode {
                        RoundedRectangle(cornerRadius: DesignTokens.radiusS, style: .continuous)
                            .fill(DesignTokens.Colors.skeletonPill)
                            .frame(width: 64, height: 20)
                    } else {
                        HStack(spacing: 4) {
                            Image(systemName: "line.3.horizontal.decrease")
                                .font(.system(size: 10))
                            Text("Filter")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundStyle(DesignTokens.Colors.textSecondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: DesignTokens.radiusS)
                                .fill(DesignTokens.Colors.cardBackground)
                        )
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 12)

            // Header Bottom Divider
            Rectangle()
                .fill(DesignTokens.Colors.titleBarDivider)
                .frame(height: 1)
                .padding(.horizontal, 24)

            // Feed Items List
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(SampleData.feedItems.enumerated()), id: \.element.id) { index, item in
                        FeedItemRow(
                            item: item,
                            isWireframe: isWireframeMode,
                            isSelected: selectedFeedId == item.id
                        )
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedFeedId = item.id
                            }
                        }

                        // Divider between feed items
                        if index < SampleData.feedItems.count - 1 {
                            Rectangle()
                                .fill(DesignTokens.Colors.itemDivider)
                                .frame(height: 1)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 8)
                        }
                    }
                }
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
        }
    }

    // MARK: - Right Column: Canvas
    private var canvasColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Canvas")
                    .font(DesignTokens.Typography.sectionHeader)
                    .foregroundStyle(DesignTokens.Colors.textLabel)

                Spacer()

                if !isWireframeMode {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(DesignTokens.Colors.badgeGreen)
                            .frame(width: 6, height: 6)
                        Text("Live Pinboard")
                            .font(DesignTokens.Typography.caption)
                            .foregroundStyle(DesignTokens.Colors.textSecondary)
                    }
                }
            }
            .padding(.horizontal, 36)
            .padding(.top, 16)
            .padding(.bottom, 12)

            // Masonry Staggered 2-Column Grid (Width: 375, Cards: 178 x 148)
            ScrollView(.vertical, showsIndicators: false) {
                HStack(alignment: .top, spacing: 18) {
                    // Column 0 (Standard y offset: 0)
                    VStack(spacing: 22) {
                        ForEach(SampleData.canvasCards.filter { $0.columnIndex == 0 }) { card in
                            CanvasCardView(
                                card: card,
                                isWireframe: isWireframeMode,
                                isHovered: hoveredCardId == card.id
                            )
                            .onHover { isHovering in
                                hoveredCardId = isHovering ? card.id : nil
                            }
                        }
                    }
                    .frame(width: 178)

                    // Column 1 (Staggered offset: +24pt downwards matching Figma y:53 vs y:29)
                    VStack(spacing: 22) {
                        ForEach(SampleData.canvasCards.filter { $0.columnIndex == 1 }) { card in
                            CanvasCardView(
                                card: card,
                                isWireframe: isWireframeMode,
                                isHovered: hoveredCardId == card.id
                            )
                            .onHover { isHovering in
                                hoveredCardId = isHovering ? card.id : nil
                            }
                        }
                    }
                    .frame(width: 178)
                    .padding(.top, 24) // Figma staggered vertical rhythm offset
                }
                .padding(.horizontal, 36)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
    }
}

// MARK: - Feed Item Row Component
struct FeedItemRow: View {
    let item: FeedItemData
    let isWireframe: Bool
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            // Header Row: Badge (22x22), Source/Title skeleton, Timestamp
            HStack(spacing: DesignTokens.spaceM) {
                // 22x22 Source Badge Icon
                RoundedRectangle(cornerRadius: DesignTokens.radiusXS, style: .continuous)
                    .fill(item.badgeColor)
                    .frame(width: 22, height: 22)
                    .overlay(
                        Group {
                            if !isWireframe {
                                Image(systemName: "antenna.radiowaves.left.and.right")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                    )

                if isWireframe {
                    // Figma wireframe title skeleton bar (width 150, height 9)
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLinePrimary)
                        .frame(width: 150, height: 9)
                } else {
                    Text(item.sourceName)
                        .font(DesignTokens.Typography.headline)
                        .foregroundStyle(DesignTokens.Colors.textPrimary)
                }

                Spacer()

                // Monospace Timestamp "14:32"
                Text(item.time)
                    .font(DesignTokens.Typography.timestamp)
                    .foregroundStyle(DesignTokens.Colors.textSecondary)
            }

            // Body Content (Skeleton lines vs. realistic typography)
            if isWireframe {
                // Exact widths from Figma node 120:388: 390, 350, 300, 170
                VStack(alignment: .leading, spacing: 7) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLineSecondary)
                        .frame(width: 390, height: 7)

                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLineSecondary)
                        .frame(width: 350, height: 7)

                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLineSecondary)
                        .frame(width: 300, height: 7)

                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLineTertiary)
                        .frame(width: 170, height: 7)
                }
            } else {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(DesignTokens.Typography.body)
                        .fontWeight(.semibold)
                        .foregroundStyle(DesignTokens.Colors.textPrimary)

                    Text(item.summary)
                        .font(DesignTokens.Typography.body)
                        .foregroundStyle(DesignTokens.Colors.textSecondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: DesignTokens.radiusM)
                .fill(isSelected ? item.badgeColor.opacity(0.06) : Color.clear)
        )
    }
}

// MARK: - Canvas Card Component
struct CanvasCardView: View {
    let card: CanvasCardData
    let isWireframe: Bool
    let isHovered: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if isWireframe {
                // Exact Figma card wireframe internal vectors
                VStack(alignment: .leading, spacing: 14) {
                    // Card Title Skeleton (width 96, height 9)
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLinePrimary)
                        .frame(width: 96, height: 9)

                    // Card Description Skeletons (widths 132 and 110, height 7)
                    VStack(alignment: .leading, spacing: 7) {
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(DesignTokens.Colors.skeletonLineSecondary)
                            .frame(width: 132, height: 7)

                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(DesignTokens.Colors.skeletonLineSecondary)
                            .frame(width: 110, height: 7)
                    }

                    Spacer()

                    // Card Bottom Pill / Tag (width 58, height 16)
                    RoundedRectangle(cornerRadius: DesignTokens.radiusXS, style: .continuous)
                        .fill(DesignTokens.Colors.skeletonLineSecondary)
                        .frame(width: 58, height: 16)
                }
                .padding(16)
            } else {
                // Production-ready formatted card
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(card.category)
                            .font(DesignTokens.Typography.caption)
                            .foregroundStyle(DesignTokens.Colors.textSecondary)

                        Spacer()

                        Image(systemName: "pin")
                            .font(.system(size: 10))
                            .foregroundStyle(DesignTokens.Colors.textSecondary.opacity(isHovered ? 1.0 : 0.0))
                    }

                    Text(card.title)
                        .font(DesignTokens.Typography.headline)
                        .foregroundStyle(DesignTokens.Colors.textPrimary)

                    Text(card.excerpt)
                        .font(DesignTokens.Typography.body)
                        .foregroundStyle(DesignTokens.Colors.textSecondary)
                        .lineLimit(3)

                    Spacer()

                    Text("Pin to Canvas")
                        .font(DesignTokens.Typography.caption)
                        .foregroundStyle(DesignTokens.Colors.badgeBlue)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            Capsule().fill(DesignTokens.Colors.badgeBlue.opacity(0.1))
                        )
                }
                .padding(16)
            }
        }
        .frame(width: 178, height: 148)
        .background(DesignTokens.Colors.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radiusL, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radiusL, style: .continuous)
                .stroke(isHovered ? DesignTokens.Colors.badgeBlue.opacity(0.4) : DesignTokens.Colors.cardBorder, lineWidth: 1)
        )
        .scaleEffect(isHovered ? 1.02 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isHovered)
    }
}

// MARK: - Preview
struct StringerWorkspaceView_Previews: PreviewProvider {
    static var previews: some View {
        StringerWorkspaceView()
    }
}
