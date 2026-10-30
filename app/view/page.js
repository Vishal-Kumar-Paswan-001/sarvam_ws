import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import ViewClient from '@/components/ViewClient';

export const dynamic = 'force-dynamic';

export default function ViewPage() {
  if (!isAuthed(cookies())) redirect('/login');
  return <ViewClient />;
}
