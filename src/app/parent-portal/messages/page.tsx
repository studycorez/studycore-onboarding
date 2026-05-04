'use client';

import { useParentAuth } from '@/hooks/useParentAuth';
import ParentPortalLayout from '@/components/parent-portal/ParentPortalLayout';
import { Mail, MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  const { parent, loading } = useParentAuth();

  if (loading) {
    return (
      <ParentPortalLayout parent={null}>
        <div className="animate-pulse space-y-4 max-w-md">
          <div className="h-8 bg-gray-100 rounded-lg w-48" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      </ParentPortalLayout>
    );
  }

  return (
    <ParentPortalLayout parent={parent}>
      <div className="max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Get in Touch</h1>
          <p className="text-gray-500 text-sm mt-1">We typically respond within 24 hours.</p>
        </div>

        <div className="card divide-y divide-gray-100">
          <a
            href="mailto:support@studycore.net"
            className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Email</p>
              <p className="text-sm text-blue-600">support@studycore.net</p>
            </div>
          </a>

          <a
            href="sms:+19254815501"
            className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Text Us</p>
              <p className="text-sm text-green-600">+1 (925) 481-5501</p>
            </div>
          </a>
        </div>
      </div>
    </ParentPortalLayout>
  );
}
