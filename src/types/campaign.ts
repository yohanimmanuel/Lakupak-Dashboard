export interface Campaign {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  status: 'Draft' | 'Scheduled' | 'Sent' | 'Completed';
  sentDate?: string;
  recipients: string;
  openedPercent: number;
  clickedPercent: number;
  revenue: number;
  orders: number;
  createdAt?: string;
  updatedAt?: string;
  userId?: number;
  // WhatsApp campaign design content
  contentBlocks?: CampaignContentBlock[];
}

export interface CampaignTableRow {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  sentDate?: string;
  recipients: string;
  openedPercent: number;
  clickedPercent: number;
  revenue: number;
  orders: number;
}

// WhatsApp Campaign Content Blocks
export type ContentBlockType = 
  | 'text' 
  | 'image' 
  | 'product' 
  | 'button' 
  | 'list' 
  | 'header' 
  | 'divider' 
  | 'spacing';

export interface CampaignContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  // Text block
  text?: string;
  textStyle?: 'normal' | 'bold' | 'italic';
  // Image block
  imageUrl?: string;
  imageAlt?: string;
  // Product block
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  productButtonText?: string;
  productButtonLink?: string;
  // Button block
  buttonText?: string;
  buttonLink?: string;
  buttonStyle?: 'primary' | 'secondary';
  // List block
  listItems?: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
  // Header block
  headerText?: string;
  headerImage?: string;
  // Spacing
  spacingSize?: 'small' | 'medium' | 'large';
}
