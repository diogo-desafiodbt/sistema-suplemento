'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    await fetch('/api/auth/esqueci-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <p className="text-lg font-medium">Email enviado</p>
            <p className="text-gray-500 mt-2">
              Se existir uma conta com esse e-mail, você receberá um código para
              redefinir a senha.
            </p>
            <a
              href="/suplementos/nova-senha"
              className="text-sm text-[#f4001e] font-semibold hover:underline mt-4 block"
            >
              Já tenho o código
            </a>
            <a
              href="/suplementos/login"
              className="text-sm text-gray-500 hover:text-gray-700 mt-2 block"
            >
              Voltar para o login
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Recuperar senha</CardTitle>
          <CardDescription>
            Digite seu e-mail e enviaremos um código para redefinir sua senha
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar código'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <a
              href="/suplementos/login"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Voltar para o login
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
