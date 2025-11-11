import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Laku-Laku | Registration'
  }
  
  export default function RegisterLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return children;
  }