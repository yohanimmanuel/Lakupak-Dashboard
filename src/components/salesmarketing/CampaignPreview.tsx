'use client';

import React from 'react';
import { Campaign, CampaignContentBlock } from '@/types/campaign';

interface CampaignPreviewProps {
  campaign: Campaign;
  onTrackClick?: () => void;
}

export default function CampaignPreview({ campaign, onTrackClick }: CampaignPreviewProps) {
  const contentBlocks = campaign.contentBlocks || [];
  const sortedBlocks = [...contentBlocks].sort((a, b) => a.order - b.order);

  const renderBlock = (block: CampaignContentBlock) => {
    switch (block.type) {
      case 'header':
        return (
          <div className="text-center">
            {block.headerImage && (
              <img src={block.headerImage} alt="Header" className="w-16 h-16 mx-auto mb-2 rounded" />
            )}
            {block.headerText && (
              <h2 className="text-lg font-bold text-black">{block.headerText}</h2>
            )}
          </div>
        );

      case 'text':
        return (
          <p
            className={`text-black ${
              block.textStyle === 'bold' ? 'font-bold' : block.textStyle === 'italic' ? 'italic' : ''
            }`}
          >
            {block.text}
          </p>
        );

      case 'image':
        return block.imageUrl ? (
          <img src={block.imageUrl} alt={block.imageAlt || 'Campaign image'} className="w-full rounded-lg" />
        ) : null;

      case 'product':
        return (
          <div className="border border-gray-200 rounded-lg p-3">
            {block.productName && (
              <h3 className="font-semibold text-black">{block.productName}</h3>
            )}
            {block.productPrice !== undefined && (
              <p className="text-black mt-1">
                Price: {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                }).format(block.productPrice)}
              </p>
            )}
            {block.productImage && (
              <img src={block.productImage} alt={block.productName || 'Product'} className="w-full mt-2 rounded-lg" />
            )}
            {block.productButtonText && (
              <button
                type="button"
                className="mt-2 w-full bg-[#0a61d7] text-white py-2 rounded-lg text-sm font-semibold"
                onClick={() => {
                  if (onTrackClick) {
                    onTrackClick();
                  }
                  if (block.productButtonLink) {
                    window.open(block.productButtonLink, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                {block.productButtonText}
              </button>
            )}
          </div>
        );

      case 'button':
        return (
          <button
            type="button"
            className={`w-full py-3 rounded-lg font-semibold text-sm ${
              block.buttonStyle === 'primary'
                ? 'bg-[#0a61d7] text-white'
                : 'bg-gray-200 text-black'
            }`}
            onClick={() => {
              if (onTrackClick) {
                onTrackClick();
              }
              if (block.buttonLink) {
                window.open(block.buttonLink, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            {block.buttonText || 'Button'}
          </button>
        );

      case 'list':
        return block.listItems && block.listItems.length > 0 ? (
          <ul className="space-y-2">
            {block.listItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <span className="text-[#0a61d7] mt-1">•</span>
                <div className="flex-1">
                  <div className="font-semibold text-black">{item.title}</div>
                  {item.description && (
                    <div className="text-sm text-gray-600">{item.description}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null;

      case 'divider':
        return <div className="border-t border-gray-200 my-2"></div>;

      case 'spacing':
        return <div className="h-4"></div>;

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 bg-gray-100 p-4 overflow-y-auto">
      <div className="max-w-md mx-auto">
        {/* Campaign Content */}
        <div className="bg-white rounded-lg p-4 space-y-4">
          {sortedBlocks.map((block) => (
            <div key={block.id}>
              {renderBlock(block)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

