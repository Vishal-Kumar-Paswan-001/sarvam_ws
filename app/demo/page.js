import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import DemoClient from '@/components/DemoClient';

export const dynamic = 'force-dynamic';

export default function DemoPage() {
  if (!isAuthed(cookies())) redirect('/login');
  return <DemoClient />;
}
