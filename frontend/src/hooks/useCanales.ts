import { useState, useEffect } from 'react'
import { canalesApi } from '../services/api'
import type { Canal } from '../types'

export function useCanales() {
  const [canales, setCanales] = useState<Canal[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    canalesApi.list()
      .then(setCanales)
      .catch(() => null)
      .finally(() => setIsLoading(false))
  }, [])

  const whatsappCanales = canales.filter((c) => c.tipo === 'whatsapp')
  const emailCanales = canales.filter((c) => c.tipo === 'email')

  return { canales, whatsappCanales, emailCanales, isLoading }
}
