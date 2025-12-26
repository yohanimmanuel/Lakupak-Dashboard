'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Smartphone, 
  Monitor, 
  Plus, 
  GripVertical,
  X,
  Type,
  Image as ImageIcon,
  Package,
  MousePointerClick,
  List,
  Heading,
  Minus,
  MoreVertical,
  Edit,
  Trash2,
  MoveUp,
  MoveDown,
  FileText,
  Sparkles,
  Upload,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Gift
} from 'lucide-react';
import { Campaign, CampaignContentBlock, ContentBlockType } from '@/types/campaign';
import { uploadToCloudinaryDirect } from '@/utils/cloudinaryDirect';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

interface WhatsAppCampaignBuilderProps {
  campaign?: Campaign;
  onSave?: (campaign: Campaign) => void;
  onCancel?: () => void;
  onContentBlocksChange?: (contentBlocks: CampaignContentBlock[]) => void;
  embedded?: boolean;
}

const CONTENT_BLOCKS: Array<{
  type: ContentBlockType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    type: 'header',
    label: 'Header',
    icon: <Heading className="w-5 h-5" />,
    description: 'Add your logo and company name'
  },
  {
    type: 'text',
    label: 'Text',
    icon: <Type className="w-5 h-5" />,
    description: 'Add formatted text content'
  },
  {
    type: 'image',
    label: 'Image',
    icon: <ImageIcon className="w-5 h-5" />,
    description: 'Add an image or photo'
  },
  {
    type: 'product',
    label: 'Product',
    icon: <Package className="w-5 h-5" />,
    description: 'Showcase a product with details'
  },
  {
    type: 'button',
    label: 'Button',
    icon: <MousePointerClick className="w-5 h-5" />,
    description: 'Add an interactive button'
  },
  {
    type: 'list',
    label: 'List',
    icon: <List className="w-5 h-5" />,
    description: 'Create a list of items'
  },
  {
    type: 'divider',
    label: 'Divider',
    icon: <Minus className="w-5 h-5" />,
    description: 'Add a visual separator'
  },
  {
    type: 'spacing',
    label: 'Spacing',
    icon: <MoreVertical className="w-5 h-5" />,
    description: 'Add spacing between blocks'
  }
];

// Campaign Templates
const CAMPAIGN_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  blocks: CampaignContentBlock[];
}> = [
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Announce new products with images and details',
    icon: <Package className="w-5 h-5" />,
    blocks: [
      {
        id: 'template-header-1',
        type: 'header',
        order: 0,
        headerText: 'Laku-Laku',
        headerImage: undefined,
      },
      {
        id: 'template-text-1',
        type: 'text',
        order: 1,
        text: '🎉 New Products Available! 🎉\n\nWe\'re excited to introduce our latest collection. Check out these amazing products!',
        textStyle: 'normal',
      },
      {
        id: 'template-spacing-1',
        type: 'spacing',
        order: 2,
        spacingSize: 'medium',
      },
      {
        id: 'template-button-1',
        type: 'button',
        order: 3,
        buttonText: 'Shop Now',
        buttonLink: '',
        buttonStyle: 'primary',
      },
    ],
  },
  {
    id: 'promotion',
    name: 'Promotion',
    description: 'Promote special offers and discounts',
    icon: <Sparkles className="w-5 h-5" />,
    blocks: [
      {
        id: 'template-header-2',
        type: 'header',
        order: 0,
        headerText: 'Laku-Laku',
      },
      {
        id: 'template-text-2',
        type: 'text',
        order: 1,
        text: '🔥 Special Promotion! 🔥\n\nLimited time offer! Get amazing discounts on selected items.',
        textStyle: 'bold',
      },
      {
        id: 'template-list-1',
        type: 'list',
        order: 2,
        listItems: [
          { id: 'item-1', title: 'Up to 50% OFF', description: 'On selected products' },
          { id: 'item-2', title: 'Free Shipping', description: 'For orders above Rp 100,000' },
          { id: 'item-3', title: 'Valid until end of month', description: 'Don\'t miss out!' },
        ],
      },
      {
        id: 'template-button-2',
        type: 'button',
        order: 3,
        buttonText: 'View Offers',
        buttonLink: '',
        buttonStyle: 'primary',
      },
    ],
  },
  {
    id: 'announcement',
    name: 'Announcement',
    description: 'Share important updates and news',
    icon: <FileText className="w-5 h-5" />,
    blocks: [
      {
        id: 'template-header-3',
        type: 'header',
        order: 0,
        headerText: 'Laku-Laku',
      },
      {
        id: 'template-text-3',
        type: 'text',
        order: 1,
        text: '📢 Important Announcement\n\nWe have some exciting news to share with you!',
        textStyle: 'normal',
      },
      {
        id: 'template-divider-1',
        type: 'divider',
        order: 2,
      },
      {
        id: 'template-text-4',
        type: 'text',
        order: 3,
        text: 'Stay tuned for more updates and special offers coming your way!',
        textStyle: 'normal',
      },
    ],
  },
  {
    id: 'flash-sale',
    name: 'Flash Sale',
    description: 'Create urgency with limited-time offers',
    icon: <Clock className="w-5 h-5" />,
    blocks: [
      {
        id: 'template-header-4',
        type: 'header',
        order: 0,
        headerText: 'Laku-Laku',
      },
      {
        id: 'template-text-5',
        type: 'text',
        order: 1,
        text: '⚡ FLASH SALE ⚡\n\nLimited time only! Don\'t miss out on these incredible deals!',
        textStyle: 'bold',
      },
      {
        id: 'template-list-2',
        type: 'list',
        order: 2,
        listItems: [
          { id: 'item-4', title: 'Huge Discounts', description: 'Up to 70% OFF on selected items' },
          { id: 'item-5', title: 'Limited Stock', description: 'While supplies last' },
          { id: 'item-6', title: 'Ends Soon', description: 'Sale ends in 24 hours!' },
        ],
      },
      {
        id: 'template-spacing-2',
        type: 'spacing',
        order: 3,
        spacingSize: 'medium',
      },
      {
        id: 'template-button-3',
        type: 'button',
        order: 4,
        buttonText: 'Shop Flash Sale',
        buttonLink: '',
        buttonStyle: 'primary',
      },
    ],
  },
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Welcome new customers with special offers',
    icon: <Gift className="w-5 h-5" />,
    blocks: [
      {
        id: 'template-header-5',
        type: 'header',
        order: 0,
        headerText: 'Laku-Laku',
      },
      {
        id: 'template-text-6',
        type: 'text',
        order: 1,
        text: '👋 Welcome to Laku-Laku!\n\nThank you for joining us. We\'re excited to have you as part of our community!',
        textStyle: 'normal',
      },
      {
        id: 'template-spacing-3',
        type: 'spacing',
        order: 2,
        spacingSize: 'medium',
      },
      {
        id: 'template-text-7',
        type: 'text',
        order: 3,
        text: 'As a special welcome gift, enjoy exclusive benefits and discounts on your first order!',
        textStyle: 'normal',
      },
      {
        id: 'template-button-4',
        type: 'button',
        order: 4,
        buttonText: 'Start Shopping',
        buttonLink: '',
        buttonStyle: 'primary',
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start from scratch with a blank template',
    icon: <Plus className="w-5 h-5" />,
    blocks: [],
  },
];

export default function WhatsAppCampaignBuilder({
  campaign,
  onSave,
  onCancel,
  onContentBlocksChange,
  embedded = false
}: WhatsAppCampaignBuilderProps) {
  const [campaignName, setCampaignName] = useState(campaign?.name || 'Untitled campaign');
  const [contentBlocks, setContentBlocks] = useState<CampaignContentBlock[]>(
    campaign?.contentBlocks || []
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingHeaderId, setEditingHeaderId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingListItemId, setEditingListItemId] = useState<string | null>(null);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    campaign?.contentBlocks && campaign.contentBlocks.length > 0 ? 'custom' : null
  );
  const [templateScrollIndex, setTemplateScrollIndex] = useState(0);
  const [showTextStyleDropdown, setShowTextStyleDropdown] = useState(false);
  const [showButtonStyleDropdown, setShowButtonStyleDropdown] = useState(false);
  const [showSpacingSizeDropdown, setShowSpacingSizeDropdown] = useState(false);
  const textStyleDropdownRef = useRef<HTMLDivElement>(null);
  const buttonStyleDropdownRef = useRef<HTMLDivElement>(null);
  const spacingSizeDropdownRef = useRef<HTMLDivElement>(null);
  const templatesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editingTextRef = useRef<HTMLTextAreaElement>(null);
  const editingHeaderRef = useRef<HTMLInputElement>(null);
  const editingProductRef = useRef<HTMLInputElement>(null);
  const user = useUserStore((state) => state.user);
  
  // Calculate pages with overlapping items (sliding window pagination)
  // Page 1: Product Launch, Promotion, Announcement, Flash Sale
  // Page 2: Announcement, Flash Sale, Welcome, Custom
  // This creates continuity between pages (overlapping pagination behavior)
  const templatesPerPage = 4;
  const getPageTemplates = useCallback((pageIndex: number) => {
    if (pageIndex === 0) {
      // First page: Product Launch, Promotion, Announcement, Flash Sale
      return CAMPAIGN_TEMPLATES.slice(0, 4);
    } else if (pageIndex === 1) {
      // Second page: Announcement, Flash Sale, Welcome, Custom
      return [
        CAMPAIGN_TEMPLATES[2], // Announcement
        CAMPAIGN_TEMPLATES[3], // Flash Sale
        CAMPAIGN_TEMPLATES[4], // Welcome
        CAMPAIGN_TEMPLATES[5], // Custom
      ];
    }
    return [];
  }, []);
  
  const totalPages = 2; // We have 2 pages with overlapping items
  const currentPage = templateScrollIndex;
  const maxPageIndex = totalPages - 1;

  // Notify parent when contentBlocks change (for embedded mode)
  useEffect(() => {
    if (embedded && onContentBlocksChange) {
      onContentBlocksChange(contentBlocks);
    }
  }, [contentBlocks, embedded, onContentBlocksChange]);

  // Auto-focus textarea when editing starts
  useEffect(() => {
    if (editingBlockId && editingTextRef.current) {
      editingTextRef.current.focus();
      editingTextRef.current.setSelectionRange(
        editingTextRef.current.value.length,
        editingTextRef.current.value.length
      );
    }
  }, [editingBlockId]);

  // Auto-focus header input when editing starts
  useEffect(() => {
    if (editingHeaderId && editingHeaderRef.current) {
      editingHeaderRef.current.focus();
      editingHeaderRef.current.select();
    }
  }, [editingHeaderId]);

  // Search products
  const searchProducts = useCallback(async (query: string) => {
    if (!user?.id || !query.trim()) {
      setProducts([]);
      return;
    }

    setSearchingProducts(true);
    try {
      const PRODUCTS_QUERY = `
        query GetProducts($userId: Int!, $page: Int, $limit: Int, $search: String) {
          products(userId: $userId, page: $page, limit: $limit, search: $search) {
            nodes {
              id
              productId
              name
            }
          }
        }
      `;

      const data = await fetchGraphQL<{
        products: {
          nodes: Array<{ id: string; productId: string; name: string }>;
        };
      }>(PRODUCTS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 20,
        search: query,
      });

      setProducts(
        data.products.nodes.map((p) => ({ id: p.productId, name: p.name }))
      );
    } catch (error) {
      setProducts([]);
    } finally {
      setSearchingProducts(false);
    }
  }, [user?.id]);

  // Debounced product search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (productSearchQuery) {
        searchProducts(productSearchQuery);
      } else {
        setProducts([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearchQuery, searchProducts]);

  // Handle template selection
  const handleApplyTemplate = useCallback((templateId: string | null) => {
    if (templateId === 'custom') {
      setSelectedTemplate('custom');
      setContentBlocks([]); // Clear all blocks for custom
      return;
    }
    
    const template = CAMPAIGN_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      // Replace all blocks with template blocks (not append)
      const newBlocks = template.blocks.map((block, index) => ({
        ...block,
        id: `block-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        order: index,
      }));
      setContentBlocks(newBlocks);
      setSelectedTemplate(templateId);
    }
  }, []);

  const handleUpdateBlock = useCallback((blockId: string, updates: Partial<CampaignContentBlock>) => {
    setContentBlocks(prev =>
      prev.map(block =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    );
  }, []);

  // Handle image upload
  const handleImageUpload = useCallback(async (file: File, blockId: string) => {
    setUploadingImage(true);
    try {
      const result = await uploadToCloudinaryDirect(file, 'campaigns');
      if (result.success && result.url) {
        handleUpdateBlock(blockId, { imageUrl: result.url });
      } else {
        alert(result.error || 'Failed to upload image');
      }
    } catch (error) {
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  }, [handleUpdateBlock]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, blockId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        return;
      }
      handleImageUpload(file, blockId);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleImageUpload]);

  // Handle inline text editing
  const handleInlineTextEdit = useCallback((blockId: string, newText: string) => {
    handleUpdateBlock(blockId, { text: newText });
  }, [handleUpdateBlock]);

  const handleAddBlock = useCallback((type: ContentBlockType) => {
    const newBlock: CampaignContentBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      order: contentBlocks.length,
      // Default values based on type
      ...(type === 'text' && { text: 'Enter your text here' }),
      ...(type === 'button' && { buttonText: 'Click here', buttonLink: '', buttonStyle: 'primary' }),
      ...(type === 'spacing' && { spacingSize: 'medium' }),
    };
    setContentBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, [contentBlocks.length]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setContentBlocks(prev => {
      const filtered = prev.filter(b => b.id !== blockId);
      // Reorder remaining blocks
      return filtered.map((block, index) => ({ ...block, order: index }));
    });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  }, [selectedBlockId]);

  const handleMoveBlock = useCallback((blockId: string, direction: 'up' | 'down') => {
    setContentBlocks(prev => {
      const index = prev.findIndex(b => b.id === blockId);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newBlocks = [...prev];
      [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
      
      // Update order
      return newBlocks.map((block, idx) => ({ ...block, order: idx }));
    });
  }, []);

  const renderWhatsAppPreview = () => {
    const sortedBlocks = [...contentBlocks].sort((a, b) => a.order - b.order);
    
    return (
      <div className="flex-1 bg-gray-100 p-6 overflow-y-auto">
        <div className="max-w-md mx-auto">
          {/* WhatsApp Header */}
          <div className="bg-[#075e54] text-white p-4 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                <span className="text-[#075e54] font-bold text-sm">LL</span>
              </div>
              <div>
                <h3 className="font-semibold text-sm">Laku-Laku</h3>
                <p className="text-xs opacity-90">Online</p>
              </div>
            </div>
          </div>

          {/* Message Content */}
          <div className="bg-white rounded-b-lg shadow-lg min-h-[400px] p-4">
            {sortedBlocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                <Smartphone className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">Add content blocks to build your campaign</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedBlocks.map((block) => (
                  <div
                    key={block.id}
                    onClick={() => setSelectedBlockId(block.id)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      selectedBlockId === block.id
                        ? 'border-[#0a61d7] bg-blue-50'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    {renderBlockPreview(block)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBlockPreview = (block: CampaignContentBlock) => {
    switch (block.type) {
      case 'header':
        const isEditingHeader = editingHeaderId === block.id;
        return (
          <div className="text-center">
            {block.headerImage && (
              <img src={block.headerImage} alt="Header" className="w-16 h-16 mx-auto mb-2 rounded" />
            )}
            {isEditingHeader ? (
              <input
                ref={editingHeaderRef}
                type="text"
                value={block.headerText || ''}
                onChange={(e) => handleUpdateBlock(block.id, { headerText: e.target.value })}
                onBlur={() => setEditingHeaderId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    setEditingHeaderId(null);
                  }
                }}
                className="text-lg font-bold text-black text-center border-2 border-[#0a61d7] rounded-lg focus:outline-none px-2 py-1 w-full"
                placeholder="Your Company"
                autoFocus
              />
            ) : (
              <h2
                onClick={() => setEditingHeaderId(block.id)}
                className="text-lg font-bold text-black cursor-text hover:bg-gray-50 p-2 rounded transition-colors"
              >
                {block.headerText || 'Click to edit header...'}
              </h2>
            )}
          </div>
        );
      case 'text':
        const isEditingText = editingBlockId === block.id;
        return (
          <div className="relative group">
            {isEditingText ? (
              <textarea
                ref={editingTextRef}
                value={block.text || ''}
                onChange={(e) => handleInlineTextEdit(block.id, e.target.value)}
                onBlur={() => setEditingBlockId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingBlockId(null);
                  }
                }}
                className={`w-full p-2 border-2 border-[#0a61d7] rounded-lg focus:outline-none resize-none text-black ${
                  block.textStyle === 'bold' ? 'font-bold' : block.textStyle === 'italic' ? 'italic' : ''
                }`}
                rows={Math.max(3, (block.text || '').split('\n').length)}
                autoFocus
              />
            ) : (
              <p
                onClick={() => setEditingBlockId(block.id)}
                className={`text-black cursor-text hover:bg-gray-50 p-2 rounded transition-colors ${
                  block.textStyle === 'bold' ? 'font-bold' : block.textStyle === 'italic' ? 'italic' : ''
                } ${!block.text ? 'text-gray-400 italic' : ''}`}
              >
                {block.text || 'Click to edit text...'}
              </p>
            )}
          </div>
        );
      case 'image':
        return (
          <div className="relative group">
            {block.imageUrl ? (
              <div className="relative">
                <img src={block.imageUrl} alt={block.imageAlt || 'Campaign image'} className="w-full rounded-lg" />
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute('data-block-id', block.id);
                      fileInputRef.current.click();
                    }
                  }}
                  className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity opacity-0 group-hover:opacity-100"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute('data-block-id', block.id);
                    fileInputRef.current.click();
                  }
                }}
                className="w-full h-32 bg-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-300 transition-colors"
              >
                {uploadingImage ? (
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                    <span className="mt-2 text-sm text-gray-500">Click to upload image</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      case 'product':
        const isEditingProduct = editingProductId === block.id;
        return (
          <div className="border border-gray-200 rounded-lg p-3">
            {isEditingProduct ? (
              <div className="relative">
                <input
                  ref={editingProductRef}
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => {
                    setProductSearchQuery(e.target.value);
                    setEditingProductId(block.id);
                  }}
                  onFocus={() => setEditingProductId(block.id)}
                  onBlur={() => {
                    setTimeout(() => {
                      setEditingProductId(null);
                      setProducts([]);
                      setProductSearchQuery('');
                    }, 200);
                  }}
                  className="w-full px-3 py-2 text-sm border-2 border-[#0a61d7] rounded-lg focus:outline-none text-black"
                  placeholder="Search products..."
                  autoFocus
                />
                {products.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          handleUpdateBlock(block.id, { productId: product.id, productName: product.name });
                          setEditingProductId(null);
                          setProducts([]);
                          setProductSearchQuery('');
                        }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 text-black"
                      >
                        {product.name}
                      </button>
                    ))}
                  </div>
                )}
                {searchingProducts && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h3
                  onClick={() => {
                    setEditingProductId(block.id);
                    setProductSearchQuery(block.productName || '');
                  }}
                  className="font-semibold text-black cursor-text hover:bg-gray-50 p-2 rounded transition-colors"
                >
                  {block.productName || 'Click to search product...'}
                </h3>
                {block.productButtonText && (
                  <button type="button" className="mt-2 w-full bg-[#0a61d7] text-white py-2 rounded-lg text-sm font-semibold">
                    {block.productButtonText}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      case 'button':
        return (
          <button type="button" className={`w-full py-3 rounded-lg font-semibold text-sm ${
            block.buttonStyle === 'primary'
              ? 'bg-[#0a61d7] text-white'
              : 'bg-gray-200 text-black'
          }`}>
            {block.buttonText || 'Button'}
          </button>
        );
      case 'list':
        return (
          <div className="space-y-2">
            {block.listItems && block.listItems.length > 0 ? (
              <ul className="space-y-2">
                {block.listItems.map((item, index) => {
                  const isEditingItem = editingListItemId === `${block.id}-${item.id}`;
                  return (
                    <li key={item.id} className="flex items-start gap-2 group">
                      <span className="text-[#0a61d7] mt-1">•</span>
                      <div className="flex-1">
                        {isEditingItem ? (
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => {
                              const updatedItems = [...(block.listItems || [])];
                              updatedItems[index] = { ...item, title: e.target.value };
                              handleUpdateBlock(block.id, { listItems: updatedItems });
                            }}
                            onBlur={() => setEditingListItemId(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                setEditingListItemId(null);
                              }
                            }}
                            className="w-full px-2 py-1 text-sm border-2 border-[#0a61d7] rounded focus:outline-none text-black font-semibold"
                            autoFocus
                          />
                        ) : (
                          <p
                            onClick={() => setEditingListItemId(`${block.id}-${item.id}`)}
                            className="font-semibold text-black text-sm cursor-text hover:bg-gray-50 p-1 rounded transition-colors"
                          >
                            {item.title || 'Click to edit...'}
                          </p>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-600">{item.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updatedItems = block.listItems?.filter(i => i.id !== item.id) || [];
                          handleUpdateBlock(block.id, { listItems: updatedItems });
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-gray-400 text-sm">Add list items</p>
            )}
            <button
              type="button"
              onClick={() => {
                const newItem = {
                  id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  title: 'New item',
                  description: undefined,
                };
                const updatedItems = [...(block.listItems || []), newItem];
                handleUpdateBlock(block.id, { listItems: updatedItems });
                setEditingListItemId(`${block.id}-${newItem.id}`);
              }}
              className="text-sm text-[#0a61d7] hover:text-[#0851b8] font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add item
            </button>
          </div>
        );
      case 'divider':
        return <div className="border-t border-gray-300 my-2" />;
      case 'spacing':
        return <div className={`${block.spacingSize === 'small' ? 'h-2' : block.spacingSize === 'large' ? 'h-8' : 'h-4'}`} />;
      default:
        return null;
    }
  };

  const renderBlockEditor = () => {
    const selectedBlock = contentBlocks.find(b => b.id === selectedBlockId);
    if (!selectedBlock) {
      return (
        <div className="p-4 text-center text-gray-500 text-sm">
          Select a content block to edit
        </div>
      );
    }

    return (
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-black capitalize">{selectedBlock.type} Block</h3>
          <button
            type="button"
            onClick={() => handleDeleteBlock(selectedBlock.id)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {selectedBlock.type === 'text' && (
            <>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Style</label>
                <div className="relative" ref={textStyleDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTextStyleDropdown(!showTextStyleDropdown);
                      setShowButtonStyleDropdown(false);
                      setShowSpacingSizeDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between"
                  >
                    <span className="text-black capitalize">{selectedBlock.textStyle || 'normal'}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>

                  {showTextStyleDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {['normal', 'bold', 'italic'].map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => {
                            handleUpdateBlock(selectedBlock.id, { textStyle: style as any });
                            setShowTextStyleDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 text-black capitalize"
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Text Content</label>
                <textarea
                  value={selectedBlock.text || ''}
                  onChange={(e) => handleUpdateBlock(selectedBlock.id, { text: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-black"
                  rows={4}
                />
              </div>
            </>
          )}

          {selectedBlock.type === 'image' && (
            <>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Upload Image</label>
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute('data-block-id', selectedBlock.id);
                      fileInputRef.current.click();
                    }
                  }}
                  disabled={uploadingImage}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-black flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Choose Image
                    </>
                  )}
                </button>
              </div>
              {selectedBlock.imageUrl && (
                <div className="mt-2">
                  <img src={selectedBlock.imageUrl} alt="Preview" className="w-full rounded-lg max-h-32 object-cover" />
                </div>
              )}
              <div className="mt-2">
                <label className="block text-xs font-medium text-black mb-2">Image URL (or paste URL)</label>
                <input
                  type="text"
                  value={selectedBlock.imageUrl || ''}
                  onChange={(e) => handleUpdateBlock(selectedBlock.id, { imageUrl: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-black"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Alt Text</label>
                <input
                  type="text"
                  value={selectedBlock.imageAlt || ''}
                  onChange={(e) => handleUpdateBlock(selectedBlock.id, { imageAlt: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-black"
                  placeholder="Image description"
                />
              </div>
            </>
          )}

          {selectedBlock.type === 'button' && (
            <>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Button Text</label>
                <input
                  type="text"
                  value={selectedBlock.buttonText || ''}
                  onChange={(e) => handleUpdateBlock(selectedBlock.id, { buttonText: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Button Link</label>
                <input
                  type="text"
                  value={selectedBlock.buttonLink || ''}
                  onChange={(e) => handleUpdateBlock(selectedBlock.id, { buttonLink: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-black"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-black mb-2">Button Style</label>
                <div className="relative" ref={buttonStyleDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowButtonStyleDropdown(!showButtonStyleDropdown);
                      setShowTextStyleDropdown(false);
                      setShowSpacingSizeDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between"
                  >
                    <span className="text-black capitalize">{selectedBlock.buttonStyle || 'primary'}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>

                  {showButtonStyleDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {['primary', 'secondary'].map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => {
                            handleUpdateBlock(selectedBlock.id, { buttonStyle: style as any });
                            setShowButtonStyleDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 text-black capitalize"
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {selectedBlock.type === 'spacing' && (
            <div>
              <label className="block text-xs font-medium text-black mb-2">Spacing Size</label>
              <div className="relative" ref={spacingSizeDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSpacingSizeDropdown(!showSpacingSizeDropdown);
                    setShowTextStyleDropdown(false);
                    setShowButtonStyleDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between"
                >
                  <span className="text-black capitalize">{selectedBlock.spacingSize || 'medium'}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {showSpacingSizeDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {['small', 'medium', 'large'].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          handleUpdateBlock(selectedBlock.id, { spacingSize: size as any });
                          setShowSpacingSizeDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 text-black capitalize"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
          <button
            type="button"
            onClick={() => handleMoveBlock(selectedBlock.id, 'up')}
            disabled={selectedBlock.order === 0}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-black"
          >
            <MoveUp className="w-4 h-4 mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => handleMoveBlock(selectedBlock.id, 'down')}
            disabled={selectedBlock.order === contentBlocks.length - 1}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-black"
          >
            <MoveDown className="w-4 h-4 mx-auto" />
          </button>
        </div>
      </div>
    );
  };

  const handleSave = () => {
    if (onSave && campaign) {
      onSave({
        ...campaign,
        name: campaignName,
        contentBlocks,
        updatedAt: new Date().toISOString()
      });
    }
  };

  return (
    <div className={`w-full ${embedded ? '' : 'h-screen'} flex flex-col bg-white`}>
      {/* Header - Only show when not embedded */}
      {!embedded && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false);
                  }}
                  className="text-xl font-bold text-black border-b-2 border-[#0a61d7] focus:outline-none"
                  autoFocus
                />
              ) : (
                <h1
                  onClick={() => setIsEditingName(true)}
                  className="text-xl font-bold text-black cursor-pointer hover:text-[#0a61d7]"
                >
                  {campaignName}
                </h1>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border border-gray-300 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('mobile')}
                className={`p-2 ${viewMode === 'mobile' ? 'bg-[#0a61d7] text-white' : 'bg-white text-gray-600'}`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('desktop')}
                className={`p-2 ${viewMode === 'desktop' ? 'bg-[#0a61d7] text-white' : 'bg-white text-gray-600'}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors font-semibold"
            >
              <Save className="w-4 h-4" />
              Save Campaign
            </button>
          </div>
        </div>
      )}

      {/* Templates Section - Always visible */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="mb-3">
          <p className="text-sm text-gray-600 mb-1">
            Need inspiration? Check out some best practices <a href="#" className="text-[#0a61d7] underline">here</a>.
          </p>
          <h3 className="text-base font-semibold text-black">Select a template</h3>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (currentPage > 0) {
                setTemplateScrollIndex(prev => prev - 1);
              }
            }}
            disabled={currentPage === 0}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white border border-gray-300 rounded-full shadow-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="overflow-hidden">
            <div
              ref={templatesContainerRef}
              className="flex transition-transform duration-300 ease-in-out"
              style={{
                transform: `translateX(-${currentPage * 100}%)`,
              }}
            >
              {Array.from({ length: totalPages }).map((_, pageIndex) => {
                const pageTemplates = getPageTemplates(pageIndex);
                return (
                  <div
                    key={pageIndex}
                    className="flex gap-4 flex-shrink-0 w-full"
                  >
                    {pageTemplates.map((template) => {
                      const isSelected = selectedTemplate === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleApplyTemplate(template.id)}
                          className={`flex-1 w-0 p-4 border-2 rounded-lg transition-all text-left group ${
                            isSelected
                              ? 'border-[#0a61d7] bg-blue-50'
                              : 'border-gray-200 hover:border-[#0a61d7] hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className={`transition-colors ${
                              isSelected ? 'text-[#0a61d7]' : 'text-gray-600 group-hover:text-[#0a61d7]'
                            }`}>
                              {template.icon}
                            </div>
                            <div className="text-center w-full">
                              <div className={`font-semibold text-sm mb-1 ${
                                isSelected ? 'text-[#0a61d7]' : 'text-black'
                              }`}>
                                {template.name}
                              </div>
                              <div className="text-xs text-gray-600">{template.description}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (currentPage < maxPageIndex) {
                setTemplateScrollIndex(prev => prev + 1);
              }
            }}
            disabled={currentPage >= maxPageIndex}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white border border-gray-300 rounded-full shadow-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`${embedded ? 'flex min-h-[600px]' : 'flex-1'} flex overflow-hidden`}>
        {/* Left: WhatsApp Preview */}
        <div className={`${embedded ? 'flex-1 min-h-[600px]' : 'flex-1'} bg-gray-100 ${embedded ? '' : 'border-r-2 border-gray-300'}`}>
          {renderWhatsAppPreview()}
        </div>

        {/* Right: Content Blocks Palette */}
        <div className={`${embedded ? 'w-80' : 'w-80'} bg-white ${embedded ? '' : 'border-l-2 border-gray-300'} flex flex-col`}>
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-black mb-1">Content</h2>
            <p className="text-xs text-gray-600">Add blocks to build your campaign</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {CONTENT_BLOCKS.map((block) => (
                <button
                  key={block.type}
                  type="button"
                  onClick={() => handleAddBlock(block.type)}
                  className="p-3 border border-gray-200 rounded-lg hover:border-[#0a61d7] hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-gray-600">{block.icon}</div>
                    <span className="text-xs font-medium text-black">{block.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const blockId = e.currentTarget.getAttribute('data-block-id');
              if (blockId) {
                handleFileInputChange(e, blockId);
              }
            }}
          />

          {/* Block Editor */}
          {selectedBlockId && renderBlockEditor()}
        </div>
      </div>
    </div>
  );
}

    