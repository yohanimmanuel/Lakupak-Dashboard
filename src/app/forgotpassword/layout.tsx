import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Laku | Forgot Password'
  }
  
  export default function ForgotPasswordLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return children;
  }