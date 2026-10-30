import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import ReaderClient from '@/components/ReaderClient';

export const dynamic = 'force-dynamic';

export default function ReaderPage() {
  if (!isAuthed(cookies())) redirect('/login');
  return <ReaderClient />;
}
