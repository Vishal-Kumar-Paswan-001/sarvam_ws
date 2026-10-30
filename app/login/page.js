import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import LoginClient from '@/components/LoginClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  if (isAuthed(cookies())) redirect('/share');
  return <LoginClient />;
}
