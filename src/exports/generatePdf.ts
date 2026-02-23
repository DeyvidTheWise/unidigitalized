import { PDFDocument } from "pdf-lib";

export async function generatePdfFromPng(pngBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const png = await pdfDoc.embedPng(pngBuffer);

  const page = pdfDoc.addPage([png.width, png.height]);
  page.drawImage(png, {
    x: 0,
    y: 0,
    width: png.width,
    height: png.height,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
