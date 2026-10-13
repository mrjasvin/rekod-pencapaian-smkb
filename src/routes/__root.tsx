import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({ meta: [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { title: 'Sistem Rekod Pencapaian | SMK Bandau' },
    { name: 'description', content: 'Sistem Rekod Pencapaian Guru dan Sekolah SMK Bandau' },
    { name: 'theme-color', content: '#123c2c' },
  ], links: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }] }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return <html lang="ms"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
