const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

const cache = {}
const CACHE_TTL = 5 * 60 * 1000

function getCache(key) {
  const e = cache[key]
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) { delete cache[key]; return null }
  return e.data
}
function setCache(key, data) { cache[key] = { data, ts: Date.now() } }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
  'Cache-Control': 'no-cache',
}

async function sfFetch(path) {
  const url = `https://api.sofascore.com/api/v1${path}`
  console.log('Fetching:', url)
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Sofascore HTTP ${res.status}`)
  return res.json()
}

function hoje() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'ScoutAI Sofascore', versao: '2.0.0', data: hoje() })
})

app.get('/api/jogos/hoje', async (req, res) => {
  const data = req.query.data || hoje()
  const cacheKey = `jogos_${data}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return res.json({ source: 'cache', ...cached })

    const sf = await sfFetch(`/sport/football/scheduled-events/${data}`)
    const matches = (sf.events || []).map(e => formatEvent(e))

    const result = { total: matches.length, matches, geradoEm: new Date().toISOString(), data, fonte: 'sofascore' }
    setCache(cacheKey, result)
    res.json({ source: 'api', ...result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/jogos/data/:data', async (req, res) => {
  const { data } = req.params
  try {
    const sf = await sfFetch(`/sport/football/scheduled-events/${data}`)
    const matches = (sf.events || []).map(e => formatEvent(e))
    res.json({ total: matches.length, matches, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/partida/:id/stats', async (req, res) => {
  const cacheKey = `stats_${req.params.id}`
  try {
    const cached = getCache(cacheKey)
    if (cached) return res.json({ source: 'cache', ...cached })
    const sf = await sfFetch(`/event/${req.params.id}/statistics`)
    setCache(cacheKey, sf)
    res.json({ source: 'api', ...sf })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/partida/:id/lineups', async (req, res) => {
  try {
    const sf = await sfFetch(`/event/${req.params.id}/lineups`)
    res.json(sf)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function formatEvent(e) {
  const statusMap = { 0:'SCHEDULED', 1:'IN_PLAY', 2:'IN_PLAY', 3:'FINISHED', 4:'FINISHED', 5:'POSTPONED', 6:'CANCELLED', 7:'IN_PLAY' }
  const code = e.status?.code ?? 0
  const status = statusMap[code] || 'SCHEDULED'
  const isLive = [1,2,7].includes(code)
  const isFT = [3,4].includes(code)
  const kickoff = new Date(e.startTimestamp * 1000)
  const horario = kickoff.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' })

  return {
    id: e.id, status, isLive, isFT, horario,
    minuto: isLive && e.time?.currentPeriodStartTimestamp
      ? Math.floor((Date.now()/1000 - e.time.currentPeriodStartTimestamp) / 60) : null,
    competition: {
      id: e.tournament?.uniqueTournament?.id,
      code: String(e.tournament?.uniqueTournament?.id || ''),
      name: e.tournament?.name || '?',
      country: e.tournament?.category?.name || '',
      flag: e.tournament?.category?.alpha2?.toLowerCase() || ''
    },
    homeTeam: {
      id: e.homeTeam?.id,
      name: e.homeTeam?.name || '?',
      shortName: e.homeTeam?.shortName || e.homeTeam?.name || '?',
      crest: e.homeTeam?.id ? `https://api.sofascore.com/api/v1/team/${e.homeTeam.id}/image` : null
    },
    awayTeam: {
      id: e.awayTeam?.id,
      name: e.awayTeam?.name || '?',
      shortName: e.awayTeam?.shortName || e.awayTeam?.name || '?',
      crest: e.awayTeam?.id ? `https://api.sofascore.com/api/v1/team/${e.awayTeam.id}/image` : null
    },
    score: { home: e.homeScore?.current ?? null, away: e.awayScore?.current ?? null },
    winProbability: {
      home: e.winProbability?.home ?? null,
      draw: e.winProbability?.draw ?? null,
      away: e.winProbability?.away ?? null,
    }
  }
}

app.listen(PORT, () => console.log(`✅ ScoutAI Sofascore na porta ${PORT}`))
