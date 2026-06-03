import PDFDocument from 'pdfkit';
import { config } from '../config';

interface CotizacionItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number | string;
}

interface Cotizacion {
  folio: string;
  created_at: string | Date;
  vigencia_dias: number;
  notas?: string;
  estado: string;
}

interface Lead {
  contacto: string;
  empresa?: string;
  email?: string;
  telefono?: string;
}

interface Vendedor {
  nombre: string;
  email?: string;
  telefono?: string;
  zona?: string;
}

interface EmpresaInfo {
  nombre: string;
  rfc: string;
  telefono: string;
  direccion: string;
  email: string;
}

export class PdfService {
  async generateCotizacion(
    cotizacion: Cotizacion,
    items: CotizacionItem[],
    lead: Lead,
    vendedor: Vendedor
  ): Promise<Buffer> {
    const empresa: EmpresaInfo = {
      nombre: config.EMPRESA_NOMBRE,
      rfc: config.EMPRESA_RFC,
      telefono: config.EMPRESA_TELEFONO,
      direccion: config.EMPRESA_DIRECCION,
      email: config.EMPRESA_EMAIL,
    };

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
        info: {
          Title: `Cotización ${cotizacion.folio}`,
          Author: empresa.nombre,
          Subject: 'Cotización de productos eléctricos',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Color palette
      const PRIMARY = '#1E40AF';
      const SECONDARY = '#93C5FD';
      const DARK = '#1E293B';
      const MUTED = '#64748B';
      const LIGHT_BG = '#F8FAFC';
      const BORDER = '#E2E8F0';
      const SUCCESS = '#16A34A';

      const pageWidth = doc.page.width - 120; // margins applied

      // ─── HEADER ───────────────────────────────────────────────────
      // Blue header band
      doc.rect(0, 0, doc.page.width, 110).fill(PRIMARY);

      // Company name
      doc
        .fill('#FFFFFF')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(empresa.nombre, 60, 25, { width: 340 });

      doc
        .fill('#BFDBFE')
        .fontSize(9)
        .font('Helvetica')
        .text(`RFC: ${empresa.rfc}`, 60, 52)
        .text(empresa.direccion, 60, 64)
        .text(`Tel: ${empresa.telefono}  |  ${empresa.email}`, 60, 76);

      // Folio badge
      doc.rect(doc.page.width - 200, 18, 140, 74).fill('#1D4ED8');
      doc
        .fill('#93C5FD')
        .fontSize(8)
        .font('Helvetica')
        .text('COTIZACIÓN', doc.page.width - 196, 26, { width: 132, align: 'center' });
      doc
        .fill('#FFFFFF')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(cotizacion.folio, doc.page.width - 196, 40, { width: 132, align: 'center' });

      const fechaEmision = new Date(cotizacion.created_at).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const fechaVigencia = new Date(
        new Date(cotizacion.created_at).getTime() +
          cotizacion.vigencia_dias * 24 * 60 * 60 * 1000
      ).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

      doc
        .fill('#BFDBFE')
        .fontSize(7)
        .text(`Fecha: ${fechaEmision}`, doc.page.width - 196, 62, { width: 132, align: 'center' })
        .text(`Vigencia: ${fechaVigencia}`, doc.page.width - 196, 74, { width: 132, align: 'center' });

      // ─── CLIENT & VENDOR INFO ──────────────────────────────────────
      const infoTop = 130;

      // Client box
      doc.rect(60, infoTop, pageWidth / 2 - 10, 90).fill(LIGHT_BG);
      doc
        .fill(PRIMARY)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('DATOS DEL CLIENTE', 70, infoTop + 8);

      doc.moveTo(70, infoTop + 18).lineTo(70 + pageWidth / 2 - 20, infoTop + 18).stroke(SECONDARY);

      doc
        .fill(DARK)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(lead.contacto, 70, infoTop + 24);

      if (lead.empresa) {
        doc.fill(MUTED).fontSize(9).font('Helvetica').text(lead.empresa, 70, infoTop + 38);
      }
      if (lead.email) {
        doc.fill(MUTED).fontSize(8).text(`Email: ${lead.email}`, 70, lead.empresa ? infoTop + 52 : infoTop + 38);
      }
      if (lead.telefono) {
        const telY = infoTop + (lead.empresa ? (lead.email ? 64 : 52) : lead.email ? 52 : 38);
        doc.fill(MUTED).fontSize(8).text(`Tel: ${lead.telefono}`, 70, telY);
      }

      // Vendor box
      const vendorLeft = 60 + pageWidth / 2 + 10;
      const vendorWidth = pageWidth / 2 - 10;
      doc.rect(vendorLeft, infoTop, vendorWidth, 90).fill(LIGHT_BG);
      doc
        .fill(PRIMARY)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('VENDEDOR ASIGNADO', vendorLeft + 10, infoTop + 8);

      doc
        .moveTo(vendorLeft + 10, infoTop + 18)
        .lineTo(vendorLeft + vendorWidth - 10, infoTop + 18)
        .stroke(SECONDARY);

      doc
        .fill(DARK)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(vendedor.nombre, vendorLeft + 10, infoTop + 24);

      if (vendedor.email) {
        doc.fill(MUTED).fontSize(8).font('Helvetica').text(`Email: ${vendedor.email}`, vendorLeft + 10, infoTop + 38);
      }
      if (vendedor.telefono) {
        doc.fill(MUTED).fontSize(8).text(`Tel: ${vendedor.telefono}`, vendorLeft + 10, infoTop + 50);
      }
      if (vendedor.zona) {
        doc.fill(MUTED).fontSize(8).text(`Zona: ${vendedor.zona}`, vendorLeft + 10, infoTop + 62);
      }

      // ─── ITEMS TABLE ──────────────────────────────────────────────
      const tableTop = infoTop + 105;

      // Table header
      doc.rect(60, tableTop, pageWidth, 24).fill(PRIMARY);

      const colWidths = {
        num: 30,
        desc: pageWidth - 30 - 80 - 90 - 90,
        qty: 80,
        price: 90,
        total: 90,
      };

      let x = 60;
      const headerY = tableTop + 7;

      doc.fill('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text('#', x + 8, headerY, { width: colWidths.num, align: 'center' });
      x += colWidths.num;
      doc.text('DESCRIPCIÓN', x + 4, headerY, { width: colWidths.desc });
      x += colWidths.desc;
      doc.text('CANTIDAD', x, headerY, { width: colWidths.qty, align: 'center' });
      x += colWidths.qty;
      doc.text('PRECIO UNIT.', x, headerY, { width: colWidths.price, align: 'right' });
      x += colWidths.price;
      doc.text('TOTAL', x, headerY, { width: colWidths.total - 8, align: 'right' });

      // Table rows
      let subtotal = 0;
      let rowY = tableTop + 24;

      items.forEach((item, index) => {
        const precioUnit = typeof item.precio_unitario === 'string'
          ? parseFloat(item.precio_unitario)
          : item.precio_unitario;
        const lineTotal = precioUnit * item.cantidad;
        subtotal += lineTotal;

        const rowBg = index % 2 === 0 ? '#FFFFFF' : LIGHT_BG;
        doc.rect(60, rowY, pageWidth, 22).fill(rowBg);

        // Row border
        doc
          .moveTo(60, rowY + 22)
          .lineTo(60 + pageWidth, rowY + 22)
          .stroke(BORDER);

        x = 60;
        doc.fill(MUTED).fontSize(8).font('Helvetica');
        doc.text(String(index + 1), x + 8, rowY + 7, { width: colWidths.num, align: 'center' });
        x += colWidths.num;
        doc.fill(DARK).text(item.nombre, x + 4, rowY + 7, {
          width: colWidths.desc - 8,
          ellipsis: true,
          lineBreak: false,
        });
        x += colWidths.desc;
        doc.fill(DARK).text(String(item.cantidad), x, rowY + 7, { width: colWidths.qty, align: 'center' });
        x += colWidths.qty;
        doc.fill(DARK).text(formatCurrency(precioUnit), x, rowY + 7, { width: colWidths.price, align: 'right' });
        x += colWidths.price;
        doc.fill(DARK).font('Helvetica-Bold').text(formatCurrency(lineTotal), x, rowY + 7, {
          width: colWidths.total - 8,
          align: 'right',
        });

        rowY += 22;
      });

      // ─── TOTALS ──────────────────────────────────────────────────
      const iva = subtotal * 0.16;
      const total = subtotal + iva;

      rowY += 8;
      const totalsLeft = 60 + pageWidth - 240;

      const drawTotalRow = (label: string, value: number, bold = false, bg?: string) => {
        if (bg) doc.rect(totalsLeft, rowY, 240, 22).fill(bg);
        doc
          .fill(bold ? DARK : MUTED)
          .fontSize(bold ? 10 : 9)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(label, totalsLeft + 8, rowY + 5, { width: 150 })
          .text(formatCurrency(value), totalsLeft + 8, rowY + 5, { width: 224, align: 'right' });
        rowY += 22;
      };

      doc.rect(totalsLeft, rowY - 2, 240, 1).fill(PRIMARY);
      rowY += 4;
      drawTotalRow('Subtotal', subtotal);
      drawTotalRow('IVA (16%)', iva);
      doc.rect(totalsLeft, rowY, 240, 26).fill(PRIMARY);
      doc
        .fill('#FFFFFF')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('TOTAL', totalsLeft + 8, rowY + 6, { width: 150 })
        .text(formatCurrency(total), totalsLeft + 8, rowY + 6, { width: 224, align: 'right' });
      rowY += 26;

      // ─── NOTES & CONDITIONS ───────────────────────────────────────
      rowY += 20;

      if (cotizacion.notas) {
        doc
          .fill(DARK)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Notas:', 60, rowY);
        rowY += 14;
        doc
          .fill(MUTED)
          .fontSize(8)
          .font('Helvetica')
          .text(cotizacion.notas, 60, rowY, { width: pageWidth });
        rowY += doc.heightOfString(cotizacion.notas, { width: pageWidth }) + 10;
      }

      // Terms
      doc
        .fill(DARK)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('Términos y Condiciones:', 60, rowY);
      rowY += 14;
      const terms = [
        `• Cotización válida por ${cotizacion.vigencia_dias} días a partir de la fecha de emisión.`,
        '• Los precios indicados incluyen IVA del 16%.',
        '• Condiciones de pago: 50% anticipo, 50% contra entrega.',
        '• Tiempo de entrega sujeto a disponibilidad en almacén.',
        '• Precios en pesos mexicanos (MXN).',
      ].join('\n');
      doc.fill(MUTED).fontSize(8).font('Helvetica').text(terms, 60, rowY, { width: pageWidth });
      rowY += doc.heightOfString(terms, { width: pageWidth }) + 20;

      // ─── SIGNATURE LINE ───────────────────────────────────────────
      if (rowY + 80 > doc.page.height - 80) {
        doc.addPage();
        rowY = 60;
      }

      const sigLeft = 60;
      const sigWidth = 180;
      doc
        .moveTo(sigLeft, rowY + 40)
        .lineTo(sigLeft + sigWidth, rowY + 40)
        .stroke(DARK);
      doc
        .fill(DARK)
        .fontSize(8)
        .font('Helvetica')
        .text(vendedor.nombre, sigLeft, rowY + 44, { width: sigWidth, align: 'center' })
        .text('Vendedor Autorizado', sigLeft, rowY + 56, { width: sigWidth, align: 'center' })
        .text(empresa.nombre, sigLeft, rowY + 68, { width: sigWidth, align: 'center' });

      // ─── FOOTER ──────────────────────────────────────────────────
      const footerY = doc.page.height - 40;
      doc.rect(0, footerY - 8, doc.page.width, 48).fill(LIGHT_BG);
      doc
        .fill(MUTED)
        .fontSize(7)
        .font('Helvetica')
        .text(
          `${empresa.nombre} • ${empresa.direccion} • Tel: ${empresa.telefono} • ${empresa.email}`,
          60,
          footerY,
          { width: pageWidth, align: 'center' }
        )
        .text(
          `Generado el ${new Date().toLocaleDateString('es-MX')} • ${cotizacion.folio}`,
          60,
          footerY + 12,
          { width: pageWidth, align: 'center' }
        );

      doc.end();
    });
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export const pdfService = new PdfService();
