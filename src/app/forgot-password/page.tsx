import type { Metadata } from 'next'
import { ForgotPasswordClient } from './ForgotPasswordClient'

export const metadata: Metadata = { title: 'Forgot Password — ServiceOps' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />
}
