import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Lakupak | Pricing'
  }
  
  export default function LandingLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return children;
  }