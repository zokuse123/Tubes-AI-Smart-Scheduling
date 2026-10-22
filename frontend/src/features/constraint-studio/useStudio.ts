import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'
import { invalidateAfterSave } from '@/api/invalidation'
import { scheduleApi } from '@/api/services/scheduling'
import type { ActiveSchedule, GenerateResult } from '@/api/types/scheduling'

type Request = { sequence: number; controller: AbortController }
type SaveRequest = Request & { previewId: string }
const terminalPreviewErrors = new Set(['PREVIEW_EXPIRED', 'STALE_PREVIEW', 'PREVIEW_CONSUMED', 'PREVIEW_NOT_FOUND'])

export function useStudio() {
  const client = useQueryClient()
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [saved, setSaved] = useState<ActiveSchedule | null>(null)
  const [failure, setFailure] = useState<{ stage: 'generate' | 'save'; error: unknown; discarded: boolean; uncertain: boolean } | null>(null)
  const [phase, setPhase] = useState<'idle' | 'generating' | 'saving'>('idle')
  const active = useRef<Request | null>(null)
  const sequence = useRef(0)
  const current = (request: Request) => active.current?.sequence === request.sequence

  useEffect(() => () => {
    sequence.current += 1
    active.current?.controller.abort()
    active.current = null
  }, [])

  function begin(): Request | null {
    // Synchronous guard also covers rapid clicks before React renders disabled state.
    if (active.current) return null
    const request = { sequence: ++sequence.current, controller: new AbortController() }
    active.current = request
    return request
  }

  const generateMutation = useMutation({
    retry: false,
    mutationFn: (request: Request) => scheduleApi.generate({ signal: request.controller.signal }),
    onSuccess: (response, request) => { if (current(request)) setResult(response.data) },
    onError: (error, request) => { if (current(request)) setFailure({ stage: 'generate', error, discarded: true, uncertain: false }) },
    onSettled: (_result, _error, request) => { if (current(request)) { active.current = null; setPhase('idle') } },
  })
  const saveMutation = useMutation({
    retry: false,
    mutationFn: (request: SaveRequest) => scheduleApi.save({ preview_id: request.previewId }, { signal: request.controller.signal }),
    onSuccess: async (response, request) => {
      // Confirmed writes must refresh schedule reads even if this page was unmounted.
      if (current(request)) { setSaved(response.data); setResult(null) }
      await invalidateAfterSave(client)
    },
    onError: (error, request) => {
      if (!current(request)) return
      const uncertain = !(error instanceof ApiError) || error.kind !== 'backend'
      const discarded = uncertain || (error instanceof ApiError && terminalPreviewErrors.has(error.code ?? ''))
      if (discarded) setResult(null)
      setFailure({ stage: 'save', error, discarded, uncertain })
    },
    onSettled: (_result, _error, request) => { if (current(request)) { active.current = null; setPhase('idle') } },
  })

  function generate() {
    const request = begin()
    if (!request) return
    setResult(null)
    setSaved(null)
    setFailure(null)
    setPhase('generating')
    generateMutation.mutate(request)
  }
  function save() {
    if (!result || result.status !== 'success' || saved || Date.now() >= Date.parse(result.expires_at)) return
    const request = begin()
    if (!request) return
    setFailure(null)
    setPhase('saving')
    saveMutation.mutate({ ...request, previewId: result.preview_id })
  }
  return { result, saved, failure, phase, generate, save }
}
