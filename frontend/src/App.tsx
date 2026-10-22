import { useRoutes } from 'react-router'
import { appRoutes } from '@/app/routes'

export default function App() {
  return useRoutes(appRoutes)
}
