// Draws the 1024 px app icon: a clock ring split into client colors, with a red second hand.
import AppKit

func color(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185)
NSGradient(starting: color(0x2A3244), ending: color(0x161B26))!.draw(in: tile, angle: -90)

let c = NSPoint(x: 512, y: 512)
var angle: CGFloat = 90
for (hex, share) in [(0x2F6FED, 0.34), (0x12A594, 0.22), (0xE5A00D, 0.26), (0xD6457A, 0.18)] as [(UInt32, CGFloat)] {
    let sweep = 360 * share
    let arc = NSBezierPath()
    arc.appendArc(withCenter: c, radius: 290, startAngle: angle - 3, endAngle: angle - sweep + 3, clockwise: true)
    arc.lineWidth = 62
    color(hex).setStroke()
    arc.stroke()
    angle -= sweep
}

func hand(_ deg: CGFloat, _ length: CGFloat, _ width: CGFloat, _ col: NSColor, tail: CGFloat = 0) {
    let r = deg * .pi / 180
    let p = NSBezierPath()
    p.move(to: NSPoint(x: c.x - cos(r) * tail, y: c.y - sin(r) * tail))
    p.line(to: NSPoint(x: c.x + cos(r) * length, y: c.y + sin(r) * length))
    p.lineWidth = width
    p.lineCapStyle = .round
    col.setStroke()
    p.stroke()
}
hand(150, 150, 38, .white)
hand(40, 215, 26, .white)
hand(245, 225, 11, color(0xFF5A3C), tail: 55)
color(0xFFFFFF).setFill()
NSBezierPath(ovalIn: NSRect(x: c.x - 24, y: c.y - 24, width: 48, height: 48)).fill()
color(0xFF5A3C).setFill()
NSBezierPath(ovalIn: NSRect(x: c.x - 10, y: c.y - 10, width: 20, height: 20)).fill()

try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
