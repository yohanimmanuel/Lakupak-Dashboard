import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Laku-Laku | Solutions'
  }
  
  export default function LandingLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return children;
  }