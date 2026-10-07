import SwiftUI

// MARK: - Stringer macOS 27 Login View
// Built using SwiftUI Design Skill & macOS 27 Apple HIG guidelines:
// 8pt grid spacing, authentic SF Symbols, macOS window chrome & materials.

public struct StringerLoginView: View {
    // MARK: - State
    @State private var email: String = "alex.chen@stringer.intel"
    @State private var password: String = "••••••••••••••••"
    @State private var rememberMe: Bool = true
    @State private var isLoading: Bool = false
    @State private var isFocusedEmail: Bool = true
    
    public init() {}

    public var body: some View {
        ZStack {
            // macOS 27 Window Backdrop (Subtle warm light tint with ambient shadow)
            Color(lightHex: "F4F4F6", darkHex: "1C1C1E")
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // MARK: - Window TitleBar
                windowTitleBar
                
                Spacer(minLength: 8)
                
                // MARK: - Central Authentication Card
                authDialogCard
                
                Spacer(minLength: 16)
            }
        }
        .frame(width: 800, height: 670)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color(lightHex: "E0E0E3", darkHex: "2C2C2E"), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.14), radius: 24, x: 0, y: 12)
        .shadow(color: Color.black.opacity(0.06), radius: 6, x: 0, y: 2)
    }

    // MARK: - Title Bar
    private var windowTitleBar: some View {
        HStack(alignment: .center, spacing: 0) {
            // Window Traffic Lights (macOS 27 standard spacing)
            HStack(spacing: 9) {
                Circle().fill(Color(hex: "FF5F56")).frame(width: 12, height: 12)
                Circle().fill(Color(hex: "FFBD2E")).frame(width: 12, height: 12)
                Circle().fill(Color(hex: "27C93F")).frame(width: 12, height: 12)
            }
            .padding(.leading, 20)
            
            Spacer()
            
            // Trailing Help / Info Liquid Glass Button
            Button(action: {}) {
                Image(systemName: "questionmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.secondary)
                    .frame(width: 32, height: 32)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .shadow(color: Color.black.opacity(0.04), radius: 4, y: 1)
                    )
            }
            .buttonStyle(.plain)
            .padding(.trailing, 20)
        }
        .frame(height: 48)
    }

    // MARK: - Auth Dialog Card
    private var authDialogCard: some View {
        VStack(spacing: 16) {
            // MARK: App Emblem & Title
            VStack(spacing: 6) {
                // Stringer Obsidian App Tile
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(Color(lightHex: "1C1C1E", darkHex: "2C2C2E"))
                        .overlay(
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .stroke(Color.white.opacity(0.12), lineWidth: 1)
                        )
                        .frame(width: 52, height: 52)
                    
                    // Waveform Intelligence Glyph
                    Image(systemName: "waveform.path.ecg")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Color(hex: "007AFF"))
                }
                
                Text("Sign in to Stringer")
                    .font(.system(size: 19, weight: .bold, design: .default))
                    .foregroundStyle(Color.primary)
                    .padding(.top, 4)
                
                Text("Intelligence Workspace for macOS")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(Color.secondary)
            }
            .padding(.top, 4)

            // MARK: Form Inputs
            VStack(spacing: 12) {
                // Email Field
                VStack(alignment: .leading, spacing: 5) {
                    Text("Work Email")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Color.secondary)
                    
                    HStack(spacing: 8) {
                        TextField("", text: $email)
                            .font(.system(size: 13, weight: .medium))
                            .textFieldStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .frame(height: 30)
                    .background(Color(lightHex: "FFFFFF", darkHex: "2A2A2D"))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(Color(hex: "007AFF"), lineWidth: 1.5)
                            .shadow(color: Color(hex: "007AFF").opacity(0.3), radius: 3)
                    )
                }

                // Password Field
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text("Password")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color.secondary)
                        
                        Spacer()
                        
                        Button("Forgot password?") {}
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color(hex: "007AFF"))
                            .buttonStyle(.plain)
                    }
                    
                    HStack(spacing: 8) {
                        SecureField("", text: $password)
                            .font(.system(size: 13, weight: .medium))
                            .textFieldStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .frame(height: 30)
                    .background(Color(lightHex: "FFFFFF", darkHex: "2A2A2D"))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(Color(lightHex: "D1D1D6", darkHex: "3A3A3C"), lineWidth: 1)
                    )
                }

                // Checkbox
                HStack(spacing: 8) {
                    Button(action: { rememberMe.toggle() }) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(rememberMe ? Color(hex: "007AFF") : Color.clear)
                                .frame(width: 14, height: 14)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .stroke(rememberMe ? Color(hex: "007AFF") : Color.secondary, lineWidth: 1)
                                )
                            
                            if rememberMe {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    
                    Text("Keep me signed in on this Mac")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(Color.primary)
                    
                    Spacer()
                }
                .padding(.top, 2)
            }

            // MARK: Action Buttons
            VStack(spacing: 10) {
                // Primary Sign In Button
                Button(action: { isLoading = true }) {
                    Text("Sign In")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 28)
                        .background(Color(hex: "007AFF"))
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                // Divider Row
                HStack(spacing: 10) {
                    Rectangle()
                        .fill(Color(lightHex: "E5E5EA", darkHex: "38383A"))
                        .frame(height: 1)
                    
                    Text("or")
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(Color.secondary)
                    
                    Rectangle()
                        .fill(Color(lightHex: "E5E5EA", darkHex: "38383A"))
                        .frame(height: 1)
                }
                .frame(height: 14)

                // Sign in with Apple Button
                Button(action: {}) {
                    HStack(spacing: 6) {
                        Image(systemName: "apple.logo")
                            .font(.system(size: 13, weight: .medium))
                        Text("Sign in with Apple")
                            .font(.system(size: 12.5, weight: .medium))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 28)
                    .background(Color(lightHex: "1A1A1C", darkHex: "0A0A0C"))
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                // Unlock with Touch ID
                Button(action: {}) {
                    HStack(spacing: 6) {
                        Image(systemName: "touchid")
                            .font(.system(size: 15))
                        Text("Unlock with Touch ID")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(Color(hex: "007AFF"))
                    .padding(.top, 4)
                }
                .buttonStyle(.plain)
            }

            Spacer(minLength: 0)

            // MARK: Subtext Badge
            Text("macOS 27 Design Language · SwiftUI Architecture")
                .font(.system(size: 10, weight: .regular))
                .foregroundStyle(Color.secondary.opacity(0.8))
        }
        .padding(.horizontal, 24)
        .padding(.top, 26)
        .padding(.bottom, 22)
        .frame(width: 390, height: 560)
        .background(Color(lightHex: "FFFFFF", darkHex: "242426"))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color(lightHex: "E5E5E8", darkHex: "333336"), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 16, x: 0, y: 6)
    }
}

// MARK: - Color Extension for Light/Dark Semantic Support
private extension Color {
    init(lightHex: String, darkHex: String) {
        self.init(nsColor: NSColor(name: nil, dynamicProvider: { appearance in
            if appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua {
                return NSColor(hex: darkHex)
            } else {
                return NSColor(hex: lightHex)
            }
        }))
    }

    init(hex: String) {
        let scanner = Scanner(string: hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted))
        var hexNumber: UInt64 = 0
        if scanner.scanHexInt64(&hexNumber) {
            let r = Double((hexNumber & 0xff0000) >> 16) / 255
            let g = Double((hexNumber & 0x00ff00) >> 8) / 255
            let b = Double(hexNumber & 0x0000ff) / 255
            self.init(.sRGB, red: r, green: g, blue: b, opacity: 1.0)
            return
        }
        self.init(.sRGB, red: 0, green: 0, blue: 0, opacity: 1.0)
    }
}

private extension NSColor {
    convenience init(hex: String) {
        let scanner = Scanner(string: hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted))
        var hexNumber: UInt64 = 0
        if scanner.scanHexInt64(&hexNumber) {
            let r = CGFloat((hexNumber & 0xff0000) >> 16) / 255
            let g = CGFloat((hexNumber & 0x00ff00) >> 8) / 255
            let b = CGFloat(hexNumber & 0x0000ff) / 255
            self.init(srgbRed: r, green: g, blue: b, alpha: 1.0)
            return
        }
        self.init(srgbRed: 0, green: 0, blue: 0, alpha: 1.0)
    }
}

#Preview {
    StringerLoginView()
        .padding(40)
        .background(Color.gray.opacity(0.2))
}
