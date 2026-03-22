const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')

const app = express()
const PORT = process.env.PORT || 3000
const API_TOKEN = process.env.API_TOKEN || '3e425947176c4062be16422e25dc13ea'

// ── Libera acesso do seu app frontend ──
app.use(cors())
app.use(express.json())

// ── Cache simples em memória (evita gastar requests da API) ──
const cache = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

function getCache(key) {
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { delete cache[key]; return null }
  return entry.data
}
function setCache(key, data) {
  cache[key] = { data, ts: Date.now() }
}

// ── Helper: chama a football-data.org ──
async function fdFetch(path) {
  const res = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: { 'X-Auth-Token': API_TOKEN }
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ──────────────────────────────────────────────
//  ROTAS
// ──────────────────────────────────────────────

// Saúde do servidor
app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'ScoutAI Backend', version: '1.0.0' })
})

// Jogos de hoje (todas as competições do plano)
app.get('/api/jogos/hoje', async (req, res) => {
  try {
    const cached = getCache('jogos_hoje')
    if (cached) return res.json({ source: 'cache', ...cached })

    // Data de hoje no fuso de Brasília
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

    const data = await fdFetch(`/matches?dateFrom=${hoje}&dateTo=${hoje}`)

    const result = {
      total: data.matches?.length || 0,
      matches: data.matches || [],
      geradoEm: new Date().toISOString(),
      data: hoje
    }
    setCache('jogos_hoje', result)
    res.json({ source: 'api', ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Jogos por competição específica
app.get('/api/jogos/:competicao', async (req, res) => {
  // Códigos: BSA=Brasileirão, PL=Premier, PD=La Liga, BL1=Bundesliga, SA=Serie A, CL=Champions
  const { competicao } = req.params
  const { data } = req.query // opcional: ?data=2026-03-22

  const cacheKey = `jogos_${competicao}_${data || 'hoje'}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return res.json({ source: 'cache', ...cached })

    const path = data
      ? `/competitions/${competicao}/matches?dateFrom=${data}&dateTo=${data}`
      : `/competitions/${competicao}/matches?status=SCHEDULED,IN_PLAY,PAUSED`

    const apiData = await fdFetch(path)
    const result = {
      competicao,
      total: apiData.matches?.length || 0,
      matches: apiData.matches || [],
      geradoEm: new Date().toISOString()
    }
    setCache(cacheKey, result)
    res.json({ source: 'api', ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Classificação de uma competição
app.get('/api/classificacao/:competicao', async (req, res) => {
  const { competicao } = req.params
  const cacheKey = `class_${competicao}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return res.json({ source: 'cache', ...cached })

    const data = await fdFetch(`/competitions/${competicao}/standings`)
    setCache(cacheKey, data)
    res.json({ source: 'api', ...data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Detalhes de uma partida específica
app.get('/api/partida/:id', async (req, res) => {
  const { id } = req.params
  try {
    const data = await fdFetch(`/matches/${id}`)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Artilheiros de uma competição
app.get('/api/artilheiros/:competicao', async (req, res) => {
  const { competicao } = req.params
  const cacheKey = `artilheiros_${competicao}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return res.json({ source: 'cache', ...cached })

    const data = await fdFetch(`/competitions/${competicao}/scorers`)
    setCache(cacheKey, data)
    res.json({ source: 'api', ...data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── START ──
app.listen(PORT, () => {
  console.log(`✅ ScoutAI Backend rodando na porta ${PORT}`)
})
