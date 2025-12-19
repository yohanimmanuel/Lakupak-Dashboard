import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Laku | Solutions'
  }
  
  export default function LandingLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return children;
  } 