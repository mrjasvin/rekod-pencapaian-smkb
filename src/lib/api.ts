export async function api<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) headers.set('Content-Type', 'application/json')
  if (csrf) headers.set('X-CSRF-Token', csrf)
  const response = await fetch(`/api/${path}`, { ...options, headers, credentials: 'same-origin' })
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) throw new Error(data?.error || 'Permintaan tidak berjaya.')
  return data as T
}

export async function download(path: string) {
  try {
    const response = await fetch(`/api/${path}`, { credentials: 'same-origin' })
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Muat turun tidak berjaya.' }))
      const suggestion = data.suggestions?.years?.length ? `\n\nCuba tapis satu tahun: ${data.suggestions.years.join(', ')}.` : ''
      window.alert(`${data.error || 'Muat turun tidak berjaya.'}${suggestion}`)
      return
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const disposition = response.headers.get('content-disposition') || ''
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1]
    const basic = disposition.match(/filename="?([^";]+)"?/)?.[1]
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = encoded ? decodeURIComponent(encoded) : basic || 'muat-turun'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.alert('Sambungan terputus semasa memuat turun. Sila cuba lagi.')
  }
}
