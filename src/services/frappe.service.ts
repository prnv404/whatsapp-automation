import { config } from '../config';

export interface LeadData {
  name: string;
  phone: string;
  description: string;
}

export interface FrappeResponse {
  success: boolean;
  action: 'exists' | 'created';
  leadId: string;
}

export class FrappeClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = config.frappeUrl?.replace(/\/$/, '') || '';
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (config.frappeApiKey && config.frappeApiSecret) {
      this.headers['Authorization'] = `token ${config.frappeApiKey}:${config.frappeApiSecret}`;
    }
  }

  /**
   * Helper to perform fetch with retry logic up to 3 times.
   */
  private async fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Frappe API Error Details] URL: ${url} | Status: ${response.status} | Response:`, errorText);
          throw new Error(`Frappe API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response;
      } catch (error) {
        lastError = error;
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
    throw lastError;
  }

  /**
   * Normalize phone numbers:
   * - Remove spaces
   * - Remove dashes
   * - Convert +91XXXXXXXXXX to XXXXXXXXXX
   */
  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/[\s-]/g, '');
    if (normalized.startsWith('+91')) {
      normalized = normalized.substring(3);
    } else if (normalized.startsWith('91') && normalized.length > 10) {
      // In case they used 91 instead of +91
      normalized = normalized.substring(2);
    }
    return normalized;
  }

  /**
   * Search CRM Lead by mobile_no
   */
  public async searchLeadByPhone(phone: string): Promise<string | null> {
    const normalizedPhone = this.normalizePhone(phone);
    // Querying Lead doctype filtering by mobile_no
    const queryParams = new URLSearchParams({
      fields: JSON.stringify(['name']),
      filters: JSON.stringify([['mobile_no', 'like', `%${normalizedPhone}%`]]),
      limit_page_length: '1',
    });

    const url = `${this.baseUrl}/api/resource/CRM%20Lead?${queryParams.toString()}`;

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers: this.headers,
      });

      const json = (await response.json()) as any;
      if (json.data && json.data.length > 0) {
        return json.data[0].name; // 'name' is the ID in Frappe
      }
      return null;
    } catch (error) {
      console.error('[FrappeClient] Error searching lead:', error);
      throw error;
    }
  }

  /**
   * Create CRM Lead
   */
  public async createLead(data: LeadData): Promise<string> {
    const url = `${this.baseUrl}/api/resource/CRM%20Lead`;
    const payload = {
      first_name: data.name || 'Unknown WhatsApp User',
      mobile_no: this.normalizePhone(data.phone),
      status: 'New',
      notes: data.description,
    };

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as any;
      return json.data.name; // Return the new lead ID
    } catch (error) {
      console.error('[FrappeClient] Error creating lead:', error);
      throw error;
    }
  }

  /**
   * Add a comment to a specific Lead
   */
  public async addComment(leadId: string, text: string): Promise<void> {
    const url = `${this.baseUrl}/api/resource/Comment`;
    const payload = {
      reference_doctype: 'CRM Lead',
      reference_name: leadId,
      content: text,
      comment_type: 'Comment',
    };

    try {
      await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('[FrappeClient] Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Main entry method to create or get lead and add appropriate comments
   */
  public async createOrGetLead(data: LeadData): Promise<FrappeResponse> {
    if (!this.baseUrl || !config.frappeApiKey) {
      console.warn('[FrappeClient] Frappe CRM is not fully configured.');
      // Return a dummy success so it doesn't break the flow
      return { success: false, action: 'created', leadId: 'NOT_CONFIGURED' };
    }

    try {
      const existingLeadId = await this.searchLeadByPhone(data.phone);
      const timestamp = new Date().toISOString();

      if (existingLeadId) {
        // Lead exists
        await this.addComment(
          existingLeadId,
          `New WhatsApp message\n\nMessage:\n${data.description}\n\nTimestamp:\n${timestamp}`
        );
        return {
          success: true,
          action: 'exists',
          leadId: existingLeadId,
        };
      } else {
        // Lead does not exist
        const newLeadId = await this.createLead(data);
        
        await this.addComment(
          newLeadId,
          `Lead created from WhatsApp\n\nMessage:\n${data.description}\n\nCreated At:\n${timestamp}`
        );

        return {
          success: true,
          action: 'created',
          leadId: newLeadId,
        };
      }
    } catch (error) {
      console.error('[FrappeClient] Failed to create or get lead:', error);
      throw error;
    }
  }
}
