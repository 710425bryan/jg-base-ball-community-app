/**
 * Google Calendar 賽事資料解析與防重複模組
 */

export interface ParsedMatch {
  id: string
  title: string
  tournamentName: string
  opponent: string
  date: string
  startTime: string
  endTime: string
  location: string
  locationAddress: string
  category: string
  level: string
  gatherTime: string
  coaches: string[]
  players: Array<{ number: string; name: string }>
  absentPlayers: string[]
}

/**
 * 從 Google Calendar 的 Event 物件解析出賽事詳細資訊
 * @param event Google Calendar Event Object
 */
export function parseMatchRecord(event: any): ParsedMatch {
  // 1. 解析標題 (例如: "就是棒春季聯賽 中港國小 V.S 華興小學 08:00-09:30")
  const title = event.summary || ''
  let tournamentName = ''
  let opponent = ''
  
  // 假設格式常常是 "賽事名稱 中港國小 V.S 隊伍B" 或是直接 "V.S 對手"
  // 新增支援結尾帶有時間，例如 "08:00-09:30"
  const vsMatch = title.match(/(.*?)\s+(?:中港國小\s+V\.S\s+|V\.S\s+|vs\s+)(.*?)(?:\s+\d{2}:\d{2}|$)/i)
  if (vsMatch) {
    // 移除開頭的 emoji 與數字 (例如 1️⃣0️⃣)
    tournamentName = vsMatch[1].replace(/^[0-9\uFE0F\u20E3\s]+/g, '').trim()
    opponent = vsMatch[2].trim()
  } else {
    tournamentName = title.replace(/^[0-9\uFE0F\u20E3\s]+/g, '').trim()
  }

  // 2. 解析日期與時間
  const start = event.start?.dateTime || event.start?.date || ''
  const end = event.end?.dateTime || event.end?.date || ''
  
  // 3. 解析地點 (例如: "迪化壘球場, 103台灣臺北市大同區延平北路四段179號")
  const locationRaw = event.location || ''
  const [locationName, ...addressParts] = locationRaw.split(',')
  const locationAddress = addressParts.join(',').trim()

  // 4. 解析說明/備註 (Description)
  const description = event.description || ''
  const descLines = description.split('\n').map((l: string) => l.trim())
  
  let category = ''
  let level = ''
  let gatherTime = ''
  const coaches: string[] = []
  const players: Array<{ number: string; name: string }> = []
  const absentPlayers: string[] = []
  
  let currentSection = ''

  for (const line of descLines) {
    if (!line) continue

    if (line.includes('組別 / 類別：')) {
      category = line.split('：')[1]?.trim() || ''
      currentSection = ''
    } else if (line.includes('賽事等級：')) {
      level = line.split('：')[1]?.trim() || ''
      currentSection = ''
    } else if (line.includes('集合時間：')) {
      gatherTime = line.split('：')[1]?.trim() || ''
      currentSection = ''
    } else if (line.includes('帶隊教練：')) {
      currentSection = 'COACHES'
    } else if (line.includes('參賽球員：')) {
      currentSection = 'PLAYERS'
    } else {
      // 讀取區塊內容
      if (currentSection === 'COACHES') {
        coaches.push(line)
      } else if (currentSection === 'PLAYERS') {
        // 如果包含 (請假)，放入 absentPlayers
        if (line.includes('(請假)')) {
          const name = line.replace('(請假)', '').replace(/^\d+\s*/, '').trim()
          absentPlayers.push(name)
          continue
        }
        
        // 解析球員背號與姓名 (例如: "15 尤丞洋")
        const playerMatch = line.match(/^(\d+)\s+(.+)$/)
        if (playerMatch) {
          players.push({ number: playerMatch[1], name: playerMatch[2].trim() })
        } else {
          // 如果沒有背號的例外處理
          players.push({ number: '', name: line.trim() })
        }
      }
    }
  }

  return {
    id: event.id || '', // 使用 Google 原始 ID 來防止同步重複
    title,
    tournamentName,
    opponent,
    date: start.split('T')[0] || '',
    startTime: start.includes('T') ? start.split('T')[1].substring(0, 5) : '',
    endTime: end.includes('T') ? end.split('T')[1].substring(0, 5) : '',
    location: locationName ? locationName.trim() : '',
    locationAddress,
    category,
    level,
    gatherTime,
    coaches,
    players,
    absentPlayers
  }
}

/**
 * 透過 allorigins.win API Proxy 抓取並解析 .ics 網址內容
 * 這是為了繞過瀏覽器的 CORS 限制並轉換成前端可用的格式。
 */
export async function fetchAndParseICal(url: string): Promise<ParsedMatch[]> {
  try {
    let text = ''
    try {
      // 嘗試 1: 使用 codetabs (非常穩定且不會遇到 CORS 問題)
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
      const res = await fetch(proxyUrl)
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`)
      text = await res.text()
    } catch (err) {
      console.warn('First proxy failed, trying fallback 1...', err)
      try {
        // 嘗試 2: 使用 allorigins get (回傳 JSON)
        const proxyUrl2 = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
        const res2 = await fetch(proxyUrl2)
        if (!res2.ok) throw new Error(`HTTP error: ${res2.status}`)
        const data = await res2.json()
        text = data.contents
        if (!text) throw new Error('Empty content from proxy')
      } catch (err2) {
        console.warn('Fallback 1 failed, trying fallback 2...', err2)
        // 嘗試 3: 使用 corsproxy.io 備援
        const proxyUrl3 = `https://corsproxy.io/?${encodeURIComponent(url)}`
        const res3 = await fetch(proxyUrl3)
        if (!res3.ok) throw new Error(`HTTP error: ${res3.status}`)
        text = await res3.text()
      }
    }

    const events: any[] = []
    const lines = text.split(/\r?\n/)
    let currentEvent: any = null
    let inDescription = false
    let descriptionBuffer = ''

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      // 處理 .ics 換行截斷問題 (下行開頭為空白表示接續上行)
      if (line.match(/^\s/)) {
        if (inDescription) descriptionBuffer += line.substring(1)
        continue
      }

      if (line.startsWith('BEGIN:VEVENT')) {
        currentEvent = { start: {}, end: {} }
      } else if (line.startsWith('END:VEVENT')) {
        if (currentEvent) {
          if (descriptionBuffer) {
              currentEvent.description = descriptionBuffer.replace(/\\n/g, '\n')
          }
          events.push(currentEvent)
        }
        currentEvent = null
        inDescription = false
        descriptionBuffer = ''
      } else if (currentEvent) {
        if (line.startsWith('SUMMARY:')) {
            currentEvent.summary = line.substring(8)
            inDescription = false
        } else if (line.startsWith('UID:')) {
            currentEvent.id = line.substring(4)
            inDescription = false
        } else if (line.startsWith('LOCATION:')) {
            currentEvent.location = line.substring(9).replace(/\\,/g, ',')
            inDescription = false
        } else if (line.startsWith('DESCRIPTION:')) {
            inDescription = true
            descriptionBuffer = line.substring(12)
        } else if (line.startsWith('DTSTART')) {
            // 處理 format DTSTART;VALUE=DATE:20260401 or DTSTART;TZID=Asia/Taipei:20260401T080000
            const matchIndex = line.indexOf(':')
            if (matchIndex !== -1) {
               const val = line.substring(matchIndex + 1)
               if(val.includes('T')) {
                  const y = val.substring(0,4), m = val.substring(4,6), d = val.substring(6,8)
                  const hr = val.substring(9,11), min = val.substring(11,13)
                  currentEvent.start.dateTime = `${y}-${m}-${d}T${hr}:${min}:00`
               } else {
                  const y = val.substring(0,4), m = val.substring(4,6), d = val.substring(6,8)
                  currentEvent.start.date = `${y}-${m}-${d}`
               }
            }
            inDescription = false
        } else if (line.startsWith('DTEND')) {
            const matchIndex = line.indexOf(':')
            if (matchIndex !== -1) {
               const val = line.substring(matchIndex + 1)
               if(val.includes('T')) {
                  const y = val.substring(0,4), m = val.substring(4,6), d = val.substring(6,8)
                  const hr = val.substring(9,11), min = val.substring(11,13)
                  currentEvent.end.dateTime = `${y}-${m}-${d}T${hr}:${min}:00`
               } else {
                  const y = val.substring(0,4), m = val.substring(4,6), d = val.substring(6,8)
                  currentEvent.end.date = `${y}-${m}-${d}`
               }
            }
            inDescription = false
        } else {
            inDescription = false // Reset mode
        }
      }
    }

    // 轉換成 ParsedMatch 格式，過濾掉沒有 DTSTART 的無效事件
    return events.filter(e => e.start && (e.start.dateTime || e.start.date)).map(parseMatchRecord)

  } catch (error) {
    console.error('Failed to fetch/parse iCal:', error)
    throw new Error('無法擷取行事曆連結，請確認連結正確或為「公開網址」格式 (.ics)。')
  }
}


/**
 * 處理資料同步時的去重複邏輯
 * 解決「同月同日同時間會發生 同步的時候資料重複」的問題
 * @param existingMatches 資料庫中現有的賽事
 * @param newEvents 從 Google Calendar 拿到的新事件
 */
export function deduplicateAndSyncEvents(existingMatches: ParsedMatch[], newEvents: any[]): ParsedMatch[] {
  const parsedNewEvents = newEvents.map(parseMatchRecord)
  
  // 建立現有資料的 HashMap
  const matchesMap = new Map<string, ParsedMatch>()
  
  existingMatches.forEach(match => {
    // 使用 Google Calendar 原始 ID 作為唯一鍵值，杜絕重複
    matchesMap.set(match.id, match)
  })

  parsedNewEvents.forEach(newEvent => {
    // 另外加入雙重保險：即使 ID 改變，若「日期+時間+標題」完全一樣也視為重複
    const isDuplicateByContent = Array.from(matchesMap.values()).some(
      existing => existing.date === newEvent.date && 
                  existing.startTime === newEvent.startTime && 
                  existing.title === newEvent.title &&
                  existing.id !== newEvent.id // 排除本身
    )

    if (!isDuplicateByContent) {
      matchesMap.set(newEvent.id, newEvent) // 覆寫或新增
    }
  })

  return Array.from(matchesMap.values())
}
