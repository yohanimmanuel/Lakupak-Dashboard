export interface Campaign {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  status: 'Draft' | 'Scheduled' | 'Sent' | 'Completed';
  sentDate?: string;
  lastEdited?: string;
  recipients: string;
  openedPercent: number;
  clickedPercent: number;
  revenue: number;
  orders: number;
  createdAt?: string;
  updatedAt?: string;
  userId?: number;
}

export interface CampaignTableRow {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  sentDate?: string;
  lastEdited?: string;
  recipients: string;
  openedPercent: number;
  clickedPercent: number;
  revenue: number;
  orders: number;
}

