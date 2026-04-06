import React from 'react';
import AdminClientLayout from './AdminClientLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminClientLayout>{children}</AdminClientLayout>;
}

