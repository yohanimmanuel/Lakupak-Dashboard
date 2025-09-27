// Category utility for Laku-Laku Dashboard
// Provides dynamic category management for product forms

import { 
  Utensils, Smartphone, Shirt, Home, Dumbbell, Sparkles, Book, Car, Heart, 
  Gamepad2, Briefcase, Leaf, Gem, Music, PawPrint, Plane, Palette, Camera, 
  Bed, Wrench, Baby, Bike, ChefHat, Bath, Tv, Package, Lightbulb, Image, 
  Cpu, Droplets, Folder, Shield 
} from 'lucide-react';

export interface CategoryOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

// Predefined categories with Lucide React icons and colors
const predefinedCategories: CategoryOption[] = [
  { value: 'Food & Beverage', label: 'Food & Beverage', icon: 'Utensils', color: '#84CC16' },
  { value: 'Technology', label: 'Technology', icon: 'Smartphone', color: '#3B82F6' },
  { value: 'Fashion', label: 'Fashion', icon: 'Shirt', color: '#EF4444' },
  { value: 'Home & Garden', label: 'Home & Garden', icon: 'Home', color: '#10B981' },
  { value: 'Sports', label: 'Sports', icon: 'Dumbbell', color: '#F59E0B' },
  { value: 'Beauty', label: 'Beauty', icon: 'Sparkles', color: '#8B5CF6' },
  { value: 'Books', label: 'Books', icon: 'Book', color: '#6B7280' },
  { value: 'Automotive', label: 'Automotive', icon: 'Car', color: '#374151' },
  { value: 'Health', label: 'Health', icon: 'Heart', color: '#EC4899' },
  { value: 'Toys', label: 'Toys', icon: 'Gamepad2', color: '#F97316' },
  { value: 'Office', label: 'Office', icon: 'Briefcase', color: '#6366F1' },
  { value: 'Garden', label: 'Garden', icon: 'Leaf', color: '#22C55E' },
  { value: 'Jewelry', label: 'Jewelry', icon: 'Gem', color: '#F59E0B' },
  { value: 'Music', label: 'Music', icon: 'Music', color: '#8B5CF6' },
  { value: 'Pets', label: 'Pets', icon: 'PawPrint', color: '#F97316' },
  { value: 'Travel', label: 'Travel', icon: 'Plane', color: '#06B6D4' },
  { value: 'Art', label: 'Art', icon: 'Palette', color: '#EC4899' },
  { value: 'Photography', label: 'Photography', icon: 'Camera', color: '#6B7280' },
  { value: 'Gaming', label: 'Gaming', icon: 'Gamepad2', color: '#8B5CF6' },
  { value: 'Furniture', label: 'Furniture', icon: 'Bed', color: '#A78BFA' },
  { value: 'Tools', label: 'Tools', icon: 'Wrench', color: '#6B7280' },
  { value: 'Baby', label: 'Baby', icon: 'Baby', color: '#FBBF24' },
  { value: 'Outdoor', label: 'Outdoor', icon: 'Bicycle', color: '#10B981' },
  { value: 'Kitchen', label: 'Kitchen', icon: 'ChefHat', color: '#F59E0B' },
  { value: 'Bathroom', label: 'Bathroom', icon: 'Bath', color: '#06B6D4' },
  { value: 'Bedroom', label: 'Bedroom', icon: 'Bed', color: '#8B5CF6' },
  { value: 'Living Room', label: 'Living Room', icon: 'Tv', color: '#3B82F6' },
  { value: 'Dining', label: 'Dining', icon: 'Utensils', color: '#F59E0B' },
  { value: 'Storage', label: 'Storage', icon: 'Package', color: '#6B7280' },
  { value: 'Lighting', label: 'Lighting', icon: 'Lightbulb', color: '#FBBF24' },
  { value: 'Decor', label: 'Decor', icon: 'Image', color: '#EC4899' },
  { value: 'Appliances', label: 'Appliances', icon: 'Cpu', color: '#374151' },
  { value: 'Cleaning', label: 'Cleaning', icon: 'Spray', color: '#06B6D4' },
  { value: 'Organization', label: 'Organization', icon: 'Folder', color: '#6366F1' },
  { value: 'Safety', label: 'Safety', icon: 'Shield', color: '#EF4444' },
];

// Get all available categories
export const getAvailableCategories = (): CategoryOption[] => {
  return [...predefinedCategories];
};

// Get category by value
export const getCategoryByValue = (value: string): CategoryOption | undefined => {
  return predefinedCategories.find(category => category.value === value);
};

// Get category icon name
export const getCategoryIcon = (value: string): string => {
  const category = getCategoryByValue(value);
  return category?.icon || 'Package';
};

// Get category icon component
export const getCategoryIconComponent = (value: string) => {
  const iconName = getCategoryIcon(value);
  const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
    'Utensils': Utensils,
    'Smartphone': Smartphone,
    'Shirt': Shirt,
    'Home': Home,
    'Dumbbell': Dumbbell,
    'Sparkles': Sparkles,
    'Book': Book,
    'Car': Car,
    'Heart': Heart,
    'Gamepad2': Gamepad2,
    'Briefcase': Briefcase,
    'Leaf': Leaf,
    'Gem': Gem,
    'Music': Music,
    'PawPrint': PawPrint,
    'Plane': Plane,
    'Palette': Palette,
    'Camera': Camera,
    'Bed': Bed,
    'Wrench': Wrench,
    'Baby': Baby,
    'Bicycle': Bike,
    'ChefHat': ChefHat,
    'Bath': Bath,
    'Tv': Tv,
    'Package': Package,
    'Lightbulb': Lightbulb,
    'Image': Image,
    'Cpu': Cpu,
    'Spray': Droplets,
    'Folder': Folder,
    'Shield': Shield,
  };
  return iconMap[iconName] || Package;
};

// Get category color
export const getCategoryColor = (value: string): string => {
  const category = getCategoryByValue(value);
  return category?.color || '#6B7280';
};

// Check if category exists
export const categoryExists = (value: string): boolean => {
  return predefinedCategories.some(category => category.value === value);
};

// Add custom category (for future use)
export const addCustomCategory = (value: string, label: string): CategoryOption => {
  const customCategory: CategoryOption = {
    value,
    label,
    icon: 'Package',
    color: '#6B7280'
  };
  
  // In a real implementation, this would be saved to a database
  // For now, we'll just return the category
  return customCategory;
};
