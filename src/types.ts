export interface Lead {
  id: number;
  phone: string;
  first_message: string;
  first_detected_at: string;
  last_message_at: string;
  status: string;
}

export type ClassificationResult = 'LEAD' | 'NO';
