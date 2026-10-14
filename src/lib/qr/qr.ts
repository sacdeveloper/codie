import QRCode from "qrcode";

/** Renders a QR code as an SVG string (crisp at any print resolution). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
}

export async function qrDataUrl(text: string, width = 360): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width });
}
