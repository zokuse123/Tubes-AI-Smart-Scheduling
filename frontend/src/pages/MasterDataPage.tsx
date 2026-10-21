import { useState } from 'react'
import { Tabs } from 'radix-ui'
import type { MasterResource } from '@/api/types/master'
import { PageHeader } from '@/components/PageHeader'
import { ResourceWorkspace } from '@/features/master-data/ResourceWorkspace'
import { resources } from '@/features/master-data/resources'

export function MasterDataPage() {
  const [resource, setResource] = useState<MasterResource>('mata-praktikum')
  return (
    <>
      <PageHeader section="Workspace" title="Data Master" description="Kelola katalog mata praktikum, kelompok, asisten, laboratorium, slot waktu, dan kegiatan praktikum." badge="Flask REST API" />
      <Tabs.Root value={resource} onValueChange={(value) => { const match = resources.find((item) => item.key === value); if (match) setResource(match.key) }}>
        <Tabs.List aria-label="Resource data master" className="mb-5 flex gap-1 overflow-x-auto border-b border-border pb-2">
          {resources.map((item) => <Tabs.Trigger key={item.key} value={item.key} className="shrink-0 rounded-md px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=active]:bg-accent data-[state=active]:font-medium data-[state=active]:text-accent-foreground">{item.label}</Tabs.Trigger>)}
        </Tabs.List>
        {resources.map((item) => <Tabs.Content key={item.key} value={item.key} className="outline-none focus-visible:ring-2 focus-visible:ring-ring"><ResourceWorkspace resource={item.key} /></Tabs.Content>)}
      </Tabs.Root>
    </>
  )
}
