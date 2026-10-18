import { NOW, mission, overview } from './fixtures'

// Install the isolated data source BEFORE importing the unchanged application entry.
// Unknown requests fail closed; no request can fall back to a real daemon.
Date.now = () => NOW
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
  const method = init?.method || (input instanceof Request ? input.method : 'GET')
  if (url.origin !== location.origin || method !== 'GET') throw new Error(`Documentation renderer blocked request: ${method} ${url.pathname}`)
  if (url.pathname === '/api/overview') return Response.json(overview)
  if (url.pathname === `/api/missions/${mission.id}`) return Response.json(mission)
  throw new Error(`No public fixture for ${url.pathname}`)
}

await import('../src/main')
