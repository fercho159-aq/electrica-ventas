import nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { config } from '../config';
import { query, queryOne, queryMany } from '../db';
import Redis from 'ioredis';

interface Cotizacion {
  folio: string;
  created_at: string | Date;
  vigencia_dias: number;
  notas?: string;
  estado: string;
  id: string;
}

interface Lead {
  id: string;
  contacto: string;
  empresa?: string;
  telefono?: string;
  email?: string;
}

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT === 465,
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: config.NODE_ENV === 'production',
  },
});

export class EmailService {
  private redis: Redis;
  private imapPollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  async sendCotizacion(to: string, cotizacion: Cotizacion, lead: Lead, pdfBuffer: Buffer): Promise<void> {
    const subject = `Cotización ${cotizacion.folio} - ${config.EMPRESA_NOMBRE}`;

    const vigenciaFecha = new Date(
      new Date(cotizacion.created_at).getTime() +
        cotizacion.vigencia_dias * 24 * 60 * 60 * 1000
    ).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F8FAFC; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
    <div style="background: #1E40AF; padding: 32px 40px;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 24px; font-weight: 700;">${config.EMPRESA_NOMBRE}</h1>
      <p style="color: #93C5FD; margin: 8px 0 0; font-size: 14px;">Cotización de Materiales Eléctricos</p>
    </div>
    <div style="padding: 40px;">
      <p style="color: #1E293B; font-size: 16px; margin: 0 0 16px;">Estimado/a <strong>${lead.contacto}</strong>,</p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Adjunto encontrará la cotización <strong>${cotizacion.folio}</strong> de acuerdo a sus requerimientos.
        Esta cotización es válida hasta el <strong>${vigenciaFecha}</strong>.
      </p>
      <div style="background: #EFF6FF; border-left: 4px solid #1E40AF; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
        <p style="color: #1E40AF; font-size: 13px; font-weight: 600; margin: 0 0 4px;">Folio: ${cotizacion.folio}</p>
        <p style="color: #3B82F6; font-size: 12px; margin: 0;">Válida hasta: ${vigenciaFecha}</p>
      </div>
      ${cotizacion.notas ? `<p style="color: #475569; font-size: 14px; margin: 0 0 24px;"><strong>Notas:</strong> ${cotizacion.notas}</p>` : ''}
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 32px;">
        Para cualquier consulta o para proceder con la aceptación de la cotización, no dude en contactarnos.
      </p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 0 0 24px;">
      <p style="color: #64748B; font-size: 12px; margin: 0;">
        <strong>${config.EMPRESA_NOMBRE}</strong><br>
        Tel: ${config.EMPRESA_TELEFONO}<br>
        Email: ${config.EMPRESA_EMAIL}<br>
        ${config.EMPRESA_DIRECCION}
      </p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"${config.EMPRESA_NOMBRE}" <${config.SMTP_FROM}>`,
      to,
      subject,
      html,
      attachments: [
        {
          filename: `${cotizacion.folio}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendFollowUp(to: string, cotizacion: Cotizacion, lead: Lead): Promise<void> {
    const subject = `Seguimiento: Cotización ${cotizacion.folio} - ${config.EMPRESA_NOMBRE}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F8FAFC; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">
    <div style="background: #1E40AF; padding: 32px 40px;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 22px;">${config.EMPRESA_NOMBRE}</h1>
      <p style="color: #93C5FD; margin: 8px 0 0; font-size: 14px;">Seguimiento de Cotización</p>
    </div>
    <div style="padding: 40px;">
      <p style="color: #1E293B; font-size: 16px; margin: 0 0 16px;">Estimado/a <strong>${lead.contacto}</strong>,</p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Le escribimos para dar seguimiento a la cotización <strong>${cotizacion.folio}</strong> que le enviamos anteriormente.
        Queremos asegurarnos de que haya recibido la información y resolver cualquier duda que pueda tener.
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 32px;">
        ¿Podemos ayudarle en algo más? Estamos a su disposición para cualquier consulta.
      </p>
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 0 0 24px;">
      <p style="color: #64748B; font-size: 12px; margin: 0;">
        <strong>${config.EMPRESA_NOMBRE}</strong><br>
        Tel: ${config.EMPRESA_TELEFONO} | ${config.EMPRESA_EMAIL}
      </p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"${config.EMPRESA_NOMBRE}" <${config.SMTP_FROM}>`,
      to,
      subject,
      html,
    });
  }

  async startImapPolling(): Promise<void> {
    if (!config.IMAP_USER || !config.IMAP_PASS) {
      console.log('[IMAP] No credentials configured, skipping polling');
      return;
    }

    await this.pollImap();

    if (this.imapPollingTimer) {
      clearInterval(this.imapPollingTimer);
    }

    this.imapPollingTimer = setInterval(async () => {
      try {
        await this.pollImap();
      } catch (err) {
        console.error('[IMAP] Polling error:', (err as Error).message);
      }
    }, 120_000);

    console.log('[IMAP] Polling started every 120s');
  }

  stopImapPolling(): void {
    if (this.imapPollingTimer) {
      clearInterval(this.imapPollingTimer);
      this.imapPollingTimer = null;
      console.log('[IMAP] Polling stopped');
    }
  }

  private async pollImap(): Promise<void> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.IMAP_USER,
        password: config.IMAP_PASS,
        host: config.IMAP_HOST,
        port: config.IMAP_PORT,
        tls: true,
        tlsOptions: { rejectUnauthorized: config.NODE_ENV === 'production' },
        connTimeout: 15000,
        authTimeout: 10000,
      });

      imap.once('error', (err: Error) => {
        console.error('[IMAP] Connection error:', err.message);
        reject(err);
      });

      imap.once('end', () => {
        resolve();
      });

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          // Search for unseen messages
          imap.search(['UNSEEN'], async (searchErr, uids) => {
            if (searchErr) {
              imap.end();
              return reject(searchErr);
            }

            if (!uids || uids.length === 0) {
              imap.end();
              return;
            }

            console.log(`[IMAP] Found ${uids.length} unseen message(s)`);

            const fetch = imap.fetch(uids, { bodies: '', markSeen: true });
            const processingPromises: Promise<void>[] = [];

            fetch.on('message', (msg) => {
              const processPromise = new Promise<void>((msgResolve) => {
                const chunks: Buffer[] = [];

                msg.on('body', (stream) => {
                  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
                  stream.on('end', async () => {
                    try {
                      const rawEmail = Buffer.concat(chunks);
                      const parsed = await simpleParser(rawEmail);
                      await this.processIncomingEmail(parsed);
                    } catch (processErr) {
                      console.error('[IMAP] Error processing email:', (processErr as Error).message);
                    }
                    msgResolve();
                  });
                });
              });

              processingPromises.push(processPromise);
            });

            fetch.once('error', (fetchErr: Error) => {
              console.error('[IMAP] Fetch error:', fetchErr.message);
              imap.end();
            });

            fetch.once('end', async () => {
              await Promise.all(processingPromises);
              imap.end();
            });
          });
        });
      });

      imap.connect();
    });
  }

  private async processIncomingEmail(parsed: ParsedMail): Promise<void> {
    const fromAddress = parsed.from?.value[0]?.address;
    const subject = parsed.subject ?? '(sin asunto)';
    const textBody = parsed.text ?? (typeof parsed.html === 'string' ? parsed.html : '') ?? '';

    if (!fromAddress) {
      console.warn('[IMAP] Email without From address, skipping');
      return;
    }

    // Find email channel
    const emailCanal = await queryOne<{ id: string }>(
      "SELECT id FROM canales WHERE tipo = 'email' AND activo = true LIMIT 1"
    );

    if (!emailCanal) {
      console.warn('[IMAP] No active email channel found');
      return;
    }

    // Find existing lead by email
    let lead = await queryOne<{ id: string; asignado_a: string | null }>(
      'SELECT id, asignado_a FROM leads WHERE email = $1 AND canal_id = $2 LIMIT 1',
      [fromAddress, emailCanal.id]
    );

    if (!lead) {
      // Create new lead from email
      const fromName = parsed.from?.value[0]?.name ?? fromAddress;
      const insertResult = await query<{ id: string }>(
        `INSERT INTO leads (contacto, email, canal_id, etapa, prioridad, ultima_interaccion)
         VALUES ($1, $2, $3, 'nuevo', 'media', NOW())
         RETURNING id`,
        [fromName, fromAddress, emailCanal.id]
      );
      lead = { id: insertResult.rows[0].id, asignado_a: null };
      console.log(`[IMAP] Created new lead ${lead.id} for email ${fromAddress}`);
    }

    // Insert message
    const mensajeResult = await query<{ id: string }>(
      `INSERT INTO mensajes (lead_id, canal_id, direccion, origen, texto, ts)
       VALUES ($1, $2, 'entrante', 'cliente', $3, NOW())
       RETURNING id`,
      [lead.id, emailCanal.id, `[${subject}]\n\n${textBody.substring(0, 2000)}`]
    );

    // Update lead's last interaction
    await query(
      'UPDATE leads SET ultima_interaccion = NOW() WHERE id = $1',
      [lead.id]
    );

    // Publish to Redis
    const event = {
      type: 'mensaje_entrante',
      leadId: lead.id,
      mensajeId: mensajeResult.rows[0].id,
      canal: 'email',
      fromAddress,
      subject,
      timestamp: new Date().toISOString(),
    };

    await this.redis.publish(`lead:${lead.id}`, JSON.stringify(event));
    console.log(`[IMAP] Processed email from ${fromAddress} for lead ${lead.id}`);
  }

  async verifyTransporter(): Promise<boolean> {
    try {
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  destroy(): void {
    this.stopImapPolling();
    this.redis.disconnect();
  }
}

export const emailService = new EmailService();
