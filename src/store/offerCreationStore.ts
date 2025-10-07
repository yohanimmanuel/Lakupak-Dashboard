import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OfferDiscountType {
  id: string; // Temporary ID for UI state management
  name?: string;
  description?: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  minOrderValue?: string;
  minQuantity?: number;
  maxUsage?: number;
  perCustomerLimit?: number;
  isActive: boolean;
  priority: number;
}

export interface DateRange {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface TimeSlot {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: string[];
  isActive: boolean;
}

export interface SelectedProduct {
  productId: string;
  name: string;
  productType: string;
  productCategory: string;
  sellingPrice: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
}

export interface OfferCreationState {
  // Basic Information
  name: string;
  description: string;
  type: 'discount' | 'promotion';
  
  // Multiple Discount Types
  discountTypes: OfferDiscountType[];
  
  // Order Requirements
  minOrderValue: string;
  minQuantity: number;
  
  // Date Range
  selectedDateRange: DateRange | null;
  selectedTimeSlot: TimeSlot | null;
  dateRanges: DateRange[];
  timeSlots: TimeSlot[];
  startDate: string;
  endDate: string;
  
  // Usage Limits
  maxUsage: number;
  perCustomerLimit: number;
  
  // Selected Products
  selectedProducts: SelectedProduct[];
  
  // UI State
  isOfferTypeConfigured: boolean;
  isDateRangeConfigured: boolean;
  areProductsSelected: boolean;
  isReadyToCreate: boolean;
}

interface OfferCreationActions {
  // Basic Information
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setType: (type: 'discount' | 'promotion') => void;
  
  // Discount Types
  addDiscountType: (discountType: Omit<OfferDiscountType, 'id'>) => void;
  updateDiscountType: (id: string, updates: Partial<OfferDiscountType>) => void;
  removeDiscountType: (id: string) => void;
  reorderDiscountTypes: (fromIndex: number, toIndex: number) => void;
  
  // Order Requirements
  setMinOrderValue: (value: string) => void;
  setMinQuantity: (quantity: number) => void;
  
  // Date Range
  setSelectedDateRange: (dateRange: DateRange | null) => void;
  setSelectedTimeSlot: (timeSlot: TimeSlot | null) => void;
  addDateRange: (dateRange: DateRange) => void;
  updateDateRange: (id: string, updates: Partial<DateRange>) => void;
  removeDateRange: (id: string) => void;
  addTimeSlot: (timeSlot: TimeSlot) => void;
  updateTimeSlot: (id: string, updates: Partial<TimeSlot>) => void;
  removeTimeSlot: (id: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  
  // Usage Limits
  setMaxUsage: (usage: number) => void;
  setPerCustomerLimit: (limit: number) => void;
  
  // Products
  addProduct: (product: SelectedProduct) => void;
  removeProduct: (productId: string) => void;
  updateProductDiscount: (productId: string, discountType: 'percentage' | 'fixed', discountValue: number) => void;
  clearProducts: () => void;
  
  // UI State
  setOfferTypeConfigured: (configured: boolean) => void;
  setDateRangeConfigured: (configured: boolean) => void;
  setProductsSelected: (selected: boolean) => void;
  updateReadyToCreate: () => void;
  
  // Reset
  reset: () => void;
  resetToDefaults: () => void;
}

const initialState: OfferCreationState = {
  // Basic Information
  name: '',
  description: '',
  type: 'discount',
  
  // Multiple Discount Types
  discountTypes: [],
  
  // Order Requirements
  minOrderValue: '',
  minQuantity: 1,
  
  // Date Range
  selectedDateRange: null,
  selectedTimeSlot: null,
  dateRanges: [],
  timeSlots: [],
  startDate: '',
  endDate: '',
  
  // Usage Limits
  maxUsage: 0,
  perCustomerLimit: 0,
  
  // Selected Products
  selectedProducts: [],
  
  // UI State
  isOfferTypeConfigured: false,
  isDateRangeConfigured: false,
  areProductsSelected: false,
  isReadyToCreate: false,
};

export const useOfferCreationStore = create<OfferCreationState & OfferCreationActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      // Basic Information
      setName: (name) => set({ name }),
      setDescription: (description) => set({ description }),
      setType: (type) => set({ type }),
      
      // Discount Types
      addDiscountType: (discountType) => {
        const id = `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newDiscountType = { ...discountType, id };
        set((state) => ({
          discountTypes: [...state.discountTypes, newDiscountType],
          isOfferTypeConfigured: true,
        }));
        get().updateReadyToCreate();
      },
      
      updateDiscountType: (id, updates) => {
        set((state) => ({
          discountTypes: state.discountTypes.map((dt) =>
            dt.id === id ? { ...dt, ...updates } : dt
          ),
        }));
        get().updateReadyToCreate();
      },
      
      removeDiscountType: (id) => {
        set((state) => {
          const newDiscountTypes = state.discountTypes.filter((dt) => dt.id !== id);
          return {
            discountTypes: newDiscountTypes,
            isOfferTypeConfigured: newDiscountTypes.length > 0,
          };
        });
        get().updateReadyToCreate();
      },
      
      reorderDiscountTypes: (fromIndex, toIndex) => {
        set((state) => {
          const newDiscountTypes = [...state.discountTypes];
          const [moved] = newDiscountTypes.splice(fromIndex, 1);
          newDiscountTypes.splice(toIndex, 0, moved);
          
          // Update priorities based on new order
          const updatedDiscountTypes = newDiscountTypes.map((dt, index) => ({
            ...dt,
            priority: index + 1,
          }));
          
          return { discountTypes: updatedDiscountTypes };
        });
      },
      
      // Order Requirements
      setMinOrderValue: (value) => set({ minOrderValue: value }),
      setMinQuantity: (quantity) => set({ minQuantity: quantity }),
      
      // Date Range
      setSelectedDateRange: (dateRange) => {
        set({ selectedDateRange: dateRange });
        if (dateRange) {
          set({ 
            startDate: dateRange.startDate, 
            endDate: dateRange.endDate,
            isDateRangeConfigured: true 
          });
        } else {
          set({ 
            startDate: '', 
            endDate: '',
            isDateRangeConfigured: false 
          });
        }
        get().updateReadyToCreate();
      },
      
      setSelectedTimeSlot: (timeSlot) => {
        set({ selectedTimeSlot: timeSlot });
        get().updateReadyToCreate();
      },

      addDateRange: (dateRange) => {
        set((state) => ({
          dateRanges: [...state.dateRanges, dateRange],
          selectedDateRange: dateRange,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          isDateRangeConfigured: true,
        }));
        get().updateReadyToCreate();
      },

      updateDateRange: (id, updates) => {
        set((state) => ({
          dateRanges: state.dateRanges.map((dr) => (dr.id === id ? { ...dr, ...updates } : dr)),
          selectedDateRange: state.selectedDateRange && state.selectedDateRange.id === id ? { ...state.selectedDateRange, ...updates } : state.selectedDateRange,
        }));
        get().updateReadyToCreate();
      },

      removeDateRange: (id) => {
        set((state) => {
          const filtered = state.dateRanges.filter((dr) => dr.id !== id);
          const selectedRemoved = state.selectedDateRange?.id === id;
          return {
            dateRanges: filtered,
            selectedDateRange: selectedRemoved ? null : state.selectedDateRange,
            isDateRangeConfigured: filtered.length > 0 || Boolean(state.selectedTimeSlot),
          };
        });
        get().updateReadyToCreate();
      },

      addTimeSlot: (timeSlot) => {
        set((state) => ({
          timeSlots: [...state.timeSlots, timeSlot],
          selectedTimeSlot: timeSlot,
          isDateRangeConfigured: true,
        }));
        get().updateReadyToCreate();
      },

      updateTimeSlot: (id, updates) => {
        set((state) => ({
          timeSlots: state.timeSlots.map((ts) => (ts.id === id ? { ...ts, ...updates } : ts)),
          selectedTimeSlot: state.selectedTimeSlot && state.selectedTimeSlot.id === id ? { ...state.selectedTimeSlot, ...updates } : state.selectedTimeSlot,
        }));
        get().updateReadyToCreate();
      },

      removeTimeSlot: (id) => {
        set((state) => {
          const filtered = state.timeSlots.filter((ts) => ts.id !== id);
          const selectedRemoved = state.selectedTimeSlot?.id === id;
          return {
            timeSlots: filtered,
            selectedTimeSlot: selectedRemoved ? null : state.selectedTimeSlot,
            isDateRangeConfigured: filtered.length > 0 || Boolean(state.selectedDateRange),
          };
        });
        get().updateReadyToCreate();
      },
      
      setStartDate: (date) => {
        set({ startDate: date });
        get().updateReadyToCreate();
      },
      
      setEndDate: (date) => {
        set({ endDate: date });
        get().updateReadyToCreate();
      },
      
      // Usage Limits
      setMaxUsage: (usage) => set({ maxUsage: usage }),
      setPerCustomerLimit: (limit) => set({ perCustomerLimit: limit }),
      
      // Products
      addProduct: (product) => {
        set((state) => ({
          selectedProducts: [...state.selectedProducts, product],
          areProductsSelected: true,
        }));
        get().updateReadyToCreate();
      },
      
      removeProduct: (productId) => {
        set((state) => {
          const newProducts = state.selectedProducts.filter((p) => p.productId !== productId);
          return {
            selectedProducts: newProducts,
            areProductsSelected: newProducts.length > 0,
          };
        });
        get().updateReadyToCreate();
      },
      
      updateProductDiscount: (productId, discountType, discountValue) => {
        set((state) => ({
          selectedProducts: state.selectedProducts.map((p) =>
            p.productId === productId
              ? { ...p, discountType, discountValue }
              : p
          ),
        }));
      },
      
      clearProducts: () => {
        set({ selectedProducts: [], areProductsSelected: false });
        get().updateReadyToCreate();
      },
      
      // UI State
      setOfferTypeConfigured: (configured) => {
        set({ isOfferTypeConfigured: configured });
        get().updateReadyToCreate();
      },
      
      setDateRangeConfigured: (configured) => {
        set({ isDateRangeConfigured: configured });
        get().updateReadyToCreate();
      },
      
      setProductsSelected: (selected) => {
        set({ areProductsSelected: selected });
        get().updateReadyToCreate();
      },
      
      updateReadyToCreate: () => {
        const state = get();
        const isReady = 
          state.name.trim() !== '' &&
          state.discountTypes.length > 0 &&
          ((state.startDate !== '' && state.endDate !== '') || state.selectedTimeSlot !== null) &&
          state.selectedProducts.length > 0;
        
        set({ isReadyToCreate: isReady });
      },
      
      // Reset
      reset: () => set(initialState),
      
      resetToDefaults: () => {
        set({
          ...initialState,
          type: 'discount',
          minQuantity: 1,
        });
      },
    }),
    {
      name: 'offer-creation-store',
      partialize: (state) => ({
        // Only persist the essential data, not UI state
        name: state.name,
        description: state.description,
        type: state.type,
        discountTypes: state.discountTypes,
        minOrderValue: state.minOrderValue,
        minQuantity: state.minQuantity,
        dateRanges: state.dateRanges,
        timeSlots: state.timeSlots,
        selectedDateRange: state.selectedDateRange,
        selectedTimeSlot: state.selectedTimeSlot,
        startDate: state.startDate,
        endDate: state.endDate,
        maxUsage: state.maxUsage,
        perCustomerLimit: state.perCustomerLimit,
        selectedProducts: state.selectedProducts,
      }),
    }
  )
);
