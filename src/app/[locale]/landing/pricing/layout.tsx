import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Laku-Laku | Pricing'
  }
  
  export default function LandingLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return children;
  }