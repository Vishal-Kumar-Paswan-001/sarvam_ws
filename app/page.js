import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';

export default function Home() {
  redirect(isAuthed(cookies()) ? '/share' : '/login');
}
