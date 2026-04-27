import PDFDocument from 'pdfkit'
import path from 'path'

type PDFDoc = InstanceType<typeof PDFDocument>

const ARBOLES_DIR = path.resolve(__dirname, '../../data/arboles')
export const ARBOL_PORTADA = path.join(ARBOLES_DIR, 'arbol portada.jpg')
export const ARBOL_RAIZ    = path.join(ARBOLES_DIR, 'arbol raiz.jpg')
export const ARBOL_RAMA_L = path.join(ARBOLES_DIR, 'arbol rama L.jpg')
export const ARBOL_RAMA_R = path.join(ARBOLES_DIR, 'arbol rama R.jpg')

// Draw a JPEG image with Multiply blend mode so the white background is invisible.
export function drawImageMultiply(
  doc: PDFDoc, imagePath: string,
  x: number, y: number, fitW: number, fitH: number,
): void {
  const res = (doc as any).page.resources
  if (!res.data.ExtGState) res.data.ExtGState = {}
  if (!res.data.ExtGState['GsMultiply']) {
    const gs = (doc as any).ref({ Type: 'ExtGState', BM: 'Multiply' })
    gs.end()
    res.data.ExtGState['GsMultiply'] = gs
  }
  doc.save()
  ;(doc as any).addContent('/GsMultiply gs')
  doc.image(imagePath, x, y, { fit: [fitW, fitH] })
  doc.restore()
}

const HOEFLER_TTC = '/System/Library/Fonts/Supplemental/Hoefler Text.ttc'

export const FONT = 'Hoefler'
export const FONT_BLACK = 'Hoefler-Black'
export const FONT_ITALIC = 'Hoefler-Italic'

export function registerFonts(doc: PDFDoc): void {
  doc.registerFont(FONT, HOEFLER_TTC, 'HoeflerText-Regular')
  doc.registerFont(FONT_BLACK, HOEFLER_TTC, 'HoeflerText-Black')
  doc.registerFont(FONT_ITALIC, HOEFLER_TTC, 'HoeflerText-Italic')
}

export interface BranchPalette {
  saturated: string  // full-page background on divider pages
  medium: string     // accent bar and label text on family pages
  light: string      // full-page tint background on family pages
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (delta !== 0) {
    if (max === r)      h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else                h = (r - g) / delta + 4
    h = h * 60
    if (h < 0) h += 360
  }
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if      (h < 60)  [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else              [r, g, b] = [c, 0, x]
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function makePalette(saturated: string): BranchPalette {
  const [h, s, l] = hexToHsl(saturated)
  return {
    saturated,
    medium: hslToHex(h, s * 0.7,  l + (1 - l) * 0.35),
    light:  hslToHex(h, s * 0.25, l + (1 - l) * 0.85),
  }
}

// Main cover page background
export const COVER_BG = '#41599C'

// Origen (root family) section
export const ROOT_PALETTE: BranchPalette = makePalette('#82AB82')

// All branch sections
export const BRANCH_PALETTE: BranchPalette = makePalette('#E8A87C')
