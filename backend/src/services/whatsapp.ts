import { createHmac } from 'crypto';
import CryptoJS from 'crypto-js';
import { config } from '../config';
import { queryOne } from '../db';

interface WaMessage360 {
  messaging_product: string;
  recipient_type: string;
  to: string;
  type: string;
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
  };
  document?: {
    link: string;
    caption: string;
    filename: string;
  };
}

interface WaApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

export class WhatsAppService {
  private readonly graphBaseUrl = 'https://graph.facebook.com/v25.0';

  /**
   * Normaliza un número para enviar vía Meta Cloud API.
   * México: WhatsApp guarda el wa_id como 521XXXXXXXXXX (con el 1 móvil),
   * pero la Cloud API exige enviar a 52XXXXXXXXXX (sin el 1).
   * Argentina tiene un caso similar con el 549.
   */
  private normalizeRecipient(to: string): string {
    let clean = to.replace(/\D/g, '');
    // México: 521 + 10 dígitos → 52 + 10 dígitos
    if (clean.startsWith('521') && clean.length === 13) {
      clean = '52' + clean.slice(3);
    }
    // Argentina: 549 + 10 dígitos → 54 + 10 dígitos
    else if (clean.startsWith('549') && clean.length === 13) {
      clean = '54' + clean.slice(3);
    }
    return clean;
  }

  private async post(
    accessToken: string,
    phoneNumberId: string,
    body: WaMessage360
  ): Promise<WaApiResponse> {
    const response = await fetch(`${this.graphBaseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as WaApiResponse;

    if (!response.ok) {
      throw new Error(
        `Meta Graph API error ${response.status}: ${data.error?.message ?? 'Unknown error'}`
      );
    }

    return data;
  }

  async sendText(accessToken: string, phoneNumberId: string, to: string, text: string): Promise<string> {
    const cleanTo = this.normalizeRecipient(to);
    const payload: WaMessage360 = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { body: text },
    };

    const response = await this.post(accessToken, phoneNumberId, payload);
    const msgId = response.messages?.[0]?.id;
    if (!msgId) {
      throw new Error('Meta API did not return a message ID');
    }
    return msgId;
  }

  /**
   * Sube un archivo a Meta (POST /{phone_number_id}/media) y devuelve el media_id.
   */
  async uploadMedia(
    accessToken: string,
    phoneNumberId: string,
    buffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch(`${this.graphBaseUrl}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data = (await res.json()) as { id?: string; error?: { message: string } };
    if (!res.ok || !data.id) {
      throw new Error(`Meta upload error ${res.status}: ${data.error?.message ?? 'sin id'}`);
    }
    return data.id;
  }

  /**
   * Envía un mensaje de media ya subido (image/audio/video/document/sticker) por media_id.
   */
  async sendMediaById(
    accessToken: string,
    phoneNumberId: string,
    to: string,
    mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker',
    mediaId: string,
    caption?: string,
    filename?: string
  ): Promise<string> {
    const cleanTo = this.normalizeRecipient(to);
    const obj: Record<string, string> = { id: mediaId };
    if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
      obj.caption = caption;
    }
    if (mediaType === 'document') {
      obj.filename = filename || caption || 'documento';
    }
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: mediaType,
      [mediaType]: obj,
    } as unknown as Parameters<typeof this.post>[2];

    const response = await this.post(accessToken, phoneNumberId, payload);
    const msgId = response.messages?.[0]?.id;
    if (!msgId) {
      throw new Error('Meta API did not return a message ID for media');
    }
    return msgId;
  }

  async sendTemplate(
    accessToken: string,
    phoneNumberId: string,
    to: string,
    templateName: string,
    params: string[],
    languageCode = 'es_MX'
  ): Promise<string> {
    const cleanTo = this.normalizeRecipient(to);
    const payload: WaMessage360 = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: params.length > 0
          ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
          : [],
      },
    };

    const response = await this.post(accessToken, phoneNumberId, payload);
    const msgId = response.messages?.[0]?.id;
    if (!msgId) {
      throw new Error('Meta API did not return a message ID for template');
    }
    return msgId;
  }

  async sendDocument(
    accessToken: string,
    phoneNumberId: string,
    to: string,
    documentUrl: string,
    caption: string,
    filename = 'documento.pdf'
  ): Promise<string> {
    const cleanTo = this.normalizeRecipient(to);
    const payload: WaMessage360 = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'document',
      document: { link: documentUrl, caption, filename },
    };

    const response = await this.post(accessToken, phoneNumberId, payload);
    const msgId = response.messages?.[0]?.id;
    if (!msgId) {
      throw new Error('360dialog did not return a message ID for document');
    }
    return msgId;
  }

  async getCredentialsForChannel(channelId: string): Promise<{ accessToken: string; phoneNumberId: string }> {
    const canal = await queryOne<{ api_key_encrypted: string; numero: string }>(
      'SELECT api_key_encrypted, numero FROM canales WHERE id = $1 AND activo = true',
      [channelId]
    );

    if (!canal) {
      throw new Error(`Canal ${channelId} not found or inactive`);
    }

    if (!canal.api_key_encrypted || canal.api_key_encrypted === 'PENDIENTE_360DIALOG') {
      throw new Error(`Canal ${channelId} does not have a configured access token`);
    }

    let accessToken: string;
    try {
      const bytes = CryptoJS.AES.decrypt(canal.api_key_encrypted, config.ENCRYPTION_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      accessToken = decrypted || canal.api_key_encrypted;
    } catch {
      accessToken = canal.api_key_encrypted;
    }

    return { accessToken, phoneNumberId: canal.numero ?? '' };
  }

  // Legacy alias
  async getApiKeyForChannel(channelId: string): Promise<string> {
    const { accessToken } = await this.getCredentialsForChannel(channelId);
    return accessToken;
  }

  validateWebhookSignature(payload: Buffer, signature: string, secret: string): boolean {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const provided = signature.replace('sha256=', '');

    // Timing-safe comparison
    if (provided.length !== expectedSignature.length) {
      return false;
    }

    let mismatch = 0;
    for (let i = 0; i < expectedSignature.length; i++) {
      mismatch |= expectedSignature.charCodeAt(i) ^ provided.charCodeAt(i);
    }

    return mismatch === 0;
  }

  encryptApiKey(plainApiKey: string): string {
    return CryptoJS.AES.encrypt(plainApiKey, config.ENCRYPTION_KEY).toString();
  }
}

export const whatsappService = new WhatsAppService();
