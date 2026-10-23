import QRCode from "qrcode";

/**
 * Renders a string as a PNG data URL for the authenticator-app QR code.
 * Server-side only: the enrollment secret must never be rendered by a
 * third-party QR service.
 */
export async function qrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
