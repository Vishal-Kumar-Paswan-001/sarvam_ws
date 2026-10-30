import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import ShareClient from '@/components/ShareClient';

export const dynamic = 'force-dynamic';

export default function SharePage() {
  if (!isAuthed(cookies())) redirect('/login');
  return <ShareClient />;
}
