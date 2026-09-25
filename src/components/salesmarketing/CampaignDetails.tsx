'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Save,
  CheckCircle,
  ArrowLeft,
  Mail,
  Calendar,
  Users,
  ChevronDown,
  Info,
  Edit,
  Send,
  Smartphone,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import { Campaign, CampaignContentBlock } from '@/types/campaign';
import { format } from 'date-fns';
import WhatsAppCampaignBuilder from './WhatsAppCampaignBuilder';
import SendCampaignModal from './SendCampaignModal';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';

interface CampaignFormData {
  id?: string;
  campaignId: string;
  name: string;
  description: string;
  status: 'Draft' | 'Scheduled' | 'Sent' | 'Completed';
  recipients: string;
  scheduledDate?: string;
  scheduledTime?: string;
}

interface CampaignDetailsProps {
  mode: 'add' | 'view' | 'edit';
  campaign?: Campaign;
  onSave?: (data: Campaign, sendChannel?: 'whatsapp' | 'email' | 'both') => void;
  onCancel?: () => void;
}

const recipientOptions = [
  'All Customers',
  'Recurrent Buyers',
  'New Buyers',
  'Unused Credits and Discounts',
  'No recipients yet',
];

// Helper function for deep equality check (more efficient than JSON.stringify)
const isFormDataEqual = (a: CampaignFormData, b: CampaignFormData): boolean => {
  return (
    a.id === b.id &&
    a.campaignId === b.campaignId &&
    a.name === b.name &&
    a.description === b.description &&
    a.status === b.status &&
    a.recipients === b.recipients &&
    a.scheduledDate === b.scheduledDate &&
    a.scheduledTime === b.scheduledTime
  );
};

export default function CampaignDetails({
  mode = 'add',
  campaign,
  onSave,
  onCancel,
}: CampaignDetailsProps) {
  const {
    tCampaignDetails,
    tShared,
    translateCampaignStatus,
    translateRecipientOption,
  } = useMarketingTranslations();
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const [formData, setFormData] = useState<CampaignFormData>({
    id: campaign?.id,
    campaignId: campaign?.campaignId || '',
    name: campaign?.name || '',
    description: campaign?.description || '',
    status: campaign?.status || 'Draft',
    recipients: campaign?.recipients || 'No recipients yet',
    scheduledDate: campaign?.sentDate ? new Date(campaign.sentDate).toISOString().split('T')[0] : '',
    scheduledTime: campaign?.sentDate ? new Date(campaign.sentDate).toTimeString().slice(0, 5) : '',
  });

  const [originalFormData, setOriginalFormData] = useState<CampaignFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRecipientsDropdown, setShowRecipientsDropdown] = useState(false);
  const recipientsDropdownRef = useRef<HTMLDivElement>(null);
  const [contentBlocks, setContentBlocks] = useState<CampaignContentBlock[]>(
    campaign?.contentBlocks || []
  );
  const [showSendModal, setShowSendModal] = useState(false);
  const [campaignToSend, setCampaignToSend] = useState<Campaign | null>(null);

  const isViewMode = mode === 'view';

  // Track previous campaign ID to detect when campaign actually changes
  const prevCampaignIdRef = useRef<string | undefined>(undefined);
  const hasInitializedRef = useRef(false);

  // Initialize form data when campaign changes (legitimate use case for synchronizing with external prop)
  // This follows the same pattern as ProductCatalog component
  // According to React best practices: Use Effects to synchronize with external systems (props in this case)
  useEffect(() => {
    const currentCampaignId = campaign?.id;
    const campaignChanged = campaign && currentCampaignId !== prevCampaignIdRef.current;
    
    if (campaign && campaignChanged) {
      prevCampaignIdRef.current = currentCampaignId;
      const freshFormData: CampaignFormData = {
        id: campaign.id,
        campaignId: campaign.campaignId || '',
        name: campaign.name || '',
        description: campaign.description || '',
        status: campaign.status || 'Draft',
        recipients: campaign.recipients || 'No recipients yet',
        scheduledDate: campaign.sentDate ? new Date(campaign.sentDate).toISOString().split('T')[0] : '',
        scheduledTime: campaign.sentDate ? new Date(campaign.sentDate).toTimeString().slice(0, 5) : '',
      };
      
      // Update content blocks when campaign changes
      if (campaign.contentBlocks) {
        setContentBlocks(campaign.contentBlocks);
      }
      
      // Only update form data if it's actually different (using efficient comparison)
      // This prevents unnecessary re-renders
      setFormData(prev => {
        return isFormDataEqual(prev, freshFormData) ? prev : freshFormData;
      });
      
      setOriginalFormData({ ...freshFormData });
      hasInitializedRef.current = true;
    } else if (!campaign && mode === 'add' && !hasInitializedRef.current) {
      // Generate campaign ID for new campaigns only once
      const generateCampaignId = () => {
        const randomNumbers = Math.floor(Math.random() * 900000) + 100000; // 6 digits
        return `CAMP${randomNumbers}`;
      };
      const newCampaignId = generateCampaignId();
      const initialData: CampaignFormData = {
        campaignId: newCampaignId,
        name: '',
        description: '',
        status: 'Draft',
        recipients: 'No recipients yet',
        scheduledDate: '',
        scheduledTime: '',
      };
      setFormData(initialData);
      hasInitializedRef.current = true;
    } else if (!campaign) {
      prevCampaignIdRef.current = undefined;
    }
  }, [campaign, mode]);

  // Track unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (mode !== 'edit' || !originalFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  }, [formData, originalFormData, mode]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recipientsDropdownRef.current && !recipientsDropdownRef.current.contains(event.target as Node)) {
        setShowRecipientsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (mode !== 'edit') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, mode]);

  const handleInputChange = (field: keyof CampaignFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewMode) return;

    setSaving(true);
    try {
      const campaignData: Campaign = {
        id: formData.id || '',
        campaignId: formData.campaignId,
        name: formData.name,
        description: formData.description,
        status: formData.status,
        recipients: formData.recipients,
        sentDate: undefined,
        opensCount: campaign?.opensCount || 0,
        clicksCount: campaign?.clicksCount || 0,
        revenue: campaign?.revenue || 0,
        orders: campaign?.orders || 0,
        userId: user?.id || undefined,
        createdAt: campaign?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        contentBlocks: contentBlocks,
      };

      // Open send modal (don't navigate)
      // Don't call onSave here to avoid navigation - we'll save when user confirms sending
      // Just open the send modal with the campaign data
      setCampaignToSend(campaignData);
      setShowSendModal(true);
      setSaving(false);
    } catch (error) {
      // Handle error
    } finally {
      setSaving(false);
    }
  };

  const handleSendCampaign = async (
    campaignData: Campaign,
    sendChannel: 'whatsapp' | 'email' | 'both',
  ) => {
    // Save the campaign with Sent status when user confirms sending
    if (onSave) {
      const isResend = campaignData.status === 'Sent' || campaignData.status === 'Completed';
      await onSave(
        {
          ...campaignData,
          status: 'Sent',
          // Only update sentDate for first send, keep original for resends
          sentDate: isResend ? campaignData.sentDate : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        sendChannel,
      );
    }
    setShowSendModal(false);
    setCampaignToSend(null);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push('/sales/campaigns');
    }
  };

  const validation = useMemo(() => {
    const missingFields: string[] = [];
    if (!formData.name.trim()) missingFields.push(tCampaignDetails('validation.campaignName'));
    if (!formData.campaignId.trim()) missingFields.push(tCampaignDetails('validation.campaignId'));
    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }, [formData, tCampaignDetails]);

  // Completion percentage
  const completionPercentage = useMemo(() => {
    const requiredFields = [
      { name: tCampaignDetails('validation.campaignName'), value: formData.name.trim() },
      { name: tCampaignDetails('validation.campaignId'), value: formData.campaignId.trim() },
      { name: tCampaignDetails('validation.recipients'), value: formData.recipients.trim() },
    ];
    const completedFields = requiredFields.filter((field) => field.value !== '');
    return Math.round((completedFields.length / requiredFields.length) * 100);
  }, [formData, tCampaignDetails]);

  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {tCampaignDetails('back')}
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {mode === 'add' && tCampaignDetails('createTitle')}
              {mode === 'view' && tCampaignDetails('viewTitle')}
              {mode === 'edit' && tCampaignDetails('editTitle')}
            </h1>
            {(mode === 'add' || (mode !== 'view' && formData.status === 'Draft')) && (
              <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-700">
                {translateCampaignStatus('Draft')}
              </span>
            )}
            {mode === 'view' && (
              <span
                className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  formData.status === 'Sent' || formData.status === 'Completed'
                    ? 'bg-green-100 text-green-700'
                    : formData.status === 'Scheduled'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {translateCampaignStatus(formData.status)}
              </span>
            )}
            {mode === 'edit' && hasUnsavedChanges && (
              <span className="text-sm text-orange-600 font-medium">• {tCampaignDetails('unsavedChanges')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'view' && campaign?.status === 'Draft' && (
            <button
              type="button"
              onClick={() => {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('mode', 'edit');
                window.location.href = currentUrl.toString();
              }}
              className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              <Edit className="w-4 h-4" />
              {tCampaignDetails('edit')}
            </button>
          )}
          {mode === 'view' && (campaign?.status === 'Sent' || campaign?.status === 'Completed') && (
            <button
              type="button"
              onClick={() => {
                if (campaign) {
                  setCampaignToSend(campaign);
                  setShowSendModal(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
            >
              <Send className="w-4 h-4" />
              {tCampaignDetails('resendCampaign')}
            </button>
          )}
          {!isViewMode && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
              >
                <X className="w-4 h-4" />
                {tShared('cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const draftData = { ...formData, status: 'Draft' as const };
                  if (saving) return;
                  setSaving(true);
                  try {
                    const campaignData: Campaign = {
                      id: draftData.id || '',
                      campaignId: draftData.campaignId,
                      name: draftData.name,
                      description: draftData.description,
                      status: draftData.status,
                      recipients: draftData.recipients,
                      sentDate: undefined,
                      opensCount: campaign?.opensCount || 0,
                      clicksCount: campaign?.clicksCount || 0,
                      revenue: campaign?.revenue || 0,
                      orders: campaign?.orders || 0,
                      userId: user?.id || undefined,
                      createdAt: campaign?.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      contentBlocks: contentBlocks,
                    };

                    if (onSave) {
                      await onSave(campaignData);
                    } else {
                      router.push('/sales/campaigns');
                    }
                  } catch (error) {
                    // Handle error
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCampaignDetails('saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {tCampaignDetails('saveDraft')}
                  </>
                )}
              </button>
              <button
                type="submit"
                form="campaign-form"
                disabled={saving || !validation.isValid}
                className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !validation.isValid
                    ? tCampaignDetails('missingRequiredFieldsTitle', {
                        fields: validation.missingFields.join(', '),
                      })
                    : ''
                }
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCampaignDetails('saving')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {tCampaignDetails('saveAndSend')}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mode Description */}
      <div className="px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
        {mode === 'add' && (
          <p className="text-sm text-gray-600">
            {tCampaignDetails('modeAddDescription')}
          </p>
        )}
        {mode === 'view' && (
          <p className="text-sm text-gray-600">
            {tCampaignDetails('modeViewDescription')}
          </p>
        )}
        {mode === 'edit' && (
          <p className="text-sm text-gray-600">
            {tCampaignDetails('modeEditDescription')}
          </p>
        )}
      </div>

      {/* Completion Progress */}
      {!isViewMode && (
        <div className="mx-4 mt-4 mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-black">{tCampaignDetails('completionTitle')}</h3>
            <span
              className={`text-sm font-bold ${completionPercentage === 100 ? 'text-green-600' : 'text-amber-700'}`}
            >
              {completionPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                completionPercentage === 100 ? 'bg-green-500' : 'bg-amber-500'
              }`}
              style={{ width: `${completionPercentage}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-600">
            {validation.missingFields.length === 0
              ? tCampaignDetails('allFieldsCompleted')
              : tCampaignDetails('missingFields', { fields: validation.missingFields.join(', ') })}
          </div>
        </div>
      )}

      <form id="campaign-form" onSubmit={handleSubmit} className="p-4">
        {/* Campaign Information */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 mb-4">
          <h2 className="text-md font-semibold text-black mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-gray-500" />
            {tCampaignDetails('campaignInformation')}
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-black mb-2">
                  {tCampaignDetails('campaignId')}
                </label>
                <input
                  type="text"
                  value={formData.campaignId}
                  disabled={true}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                  placeholder={tCampaignDetails('campaignIdPlaceholder')}
                />
                {mode === 'add' && (
                  <p className="text-xs text-gray-500 mt-1">{tCampaignDetails('campaignIdHint')}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-black mb-2">
                  {tCampaignDetails('recipients')} <span className="text-red-500">*</span>
                </label>
                <div className="relative" ref={recipientsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isViewMode) {
                        setShowRecipientsDropdown(!showRecipientsDropdown);
                      }
                    }}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black text-left flex items-center justify-between"
                  >
                    <span className="text-black">{translateRecipientOption(formData.recipients)}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>

                  {showRecipientsDropdown && !isViewMode && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {recipientOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            handleInputChange('recipients', option);
                            setShowRecipientsDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 text-black"
                        >
                          {translateRecipientOption(option)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-2">
                {tCampaignDetails('campaignName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                disabled={isViewMode}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder={tCampaignDetails('campaignNamePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-2">
                {tCampaignDetails('description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                disabled={isViewMode}
                rows={4}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                placeholder={tCampaignDetails('descriptionPlaceholder')}
              />
            </div>
          </div>
        </div>

        {/* WhatsApp Campaign Design */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4 mb-4">
          <h2 className="text-md font-semibold text-black mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-gray-500" />
            {tCampaignDetails('whatsappDesign')}
          </h2>
          <div className="border border-[#e6e6e6] rounded-lg overflow-hidden">
            <WhatsAppCampaignBuilder
              campaign={campaign ? {
                ...campaign,
                contentBlocks,
              } : {
                id: '',
                campaignId: formData.campaignId,
                name: formData.name,
                status: formData.status,
                recipients: formData.recipients,
                opensCount: 0,
                clicksCount: 0,
                revenue: 0,
                orders: 0,
                contentBlocks,
              } as Campaign}
              embedded={true}
              onContentBlocksChange={(blocks) => {
                setContentBlocks(blocks);
              }}
            />
          </div>
        </div>

        {/* Campaign Metrics */}
        <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
          <h2 className="text-md font-semibold text-black mb-4">{tCampaignDetails('campaignPerformance')}</h2>
          {mode === 'view' && campaign ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">{tCampaignDetails('metricsOpened')}</p>
                <p className="text-lg font-semibold text-black">{campaign.opensCount || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{tCampaignDetails('metricsClicked')}</p>
                <p className="text-lg font-semibold text-black">{campaign.clicksCount || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{tCampaignDetails('metricsRevenue')}</p>
                <p className="text-lg font-semibold text-black">${campaign.revenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">{tCampaignDetails('metricsOrders')}</p>
                <p className="text-lg font-semibold text-black">{campaign.orders}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-white border border-[#e6e6e6] rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">{tCampaignDetails('metricsUnavailableTitle')}</p>
                  <p className="text-xs text-gray-500">
                    {tCampaignDetails('metricsUnavailableBody')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Send Campaign Modal */}
      <SendCampaignModal
        open={showSendModal}
        onClose={() => {
          setShowSendModal(false);
          setCampaignToSend(null);
        }}
        campaign={campaignToSend}
        onSend={handleSendCampaign}
      />
    </div>
  );
}

