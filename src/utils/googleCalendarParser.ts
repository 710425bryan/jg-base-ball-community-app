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
  
  // 假設格式常常是 "賽事名稱 隊伍A V.S 隊伍B" 或是直接 "V.S 對手"
  const vsMatch = title.match(/(.*?)\s+(?:中港國小\s+V\.S\s+|V\.S\s+)(.*?)(?:\s+\d{2}:\d{2}|$)/i)
  if (vsMatch) {
    tournamentName = vsMatch[1].replace(/1️⃣0️⃣/g, '').trim() // 移除開頭的 emoji
    opponent = vsMatch[2].trim()
  } else {
    tournamentName = title
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
        // 解析球員背號與姓名 (例如: "15 尤丞洋")
        const playerMatch = line.match(/^(\d+)\s+(.+)$/)
        if (playerMatch) {
          players.push({ number: playerMatch[1], name: playerMatch[2] })
        } else {
          // 如果沒有背號的例外處理
          players.push({ number: '', name: line })
        }
      }
    }
  }

  return {
    id: event.id, // 使用 Google 原始 ID 來防止同步重複
    title,
    tournamentName,
    opponent,
    date: start.split('T')[0] || '',
    startTime: start.includes('T') ? start.split('T')[1].substring(0, 5) : '',
    endTime: end.includes('T') ? end.split('T')[1].substring(0, 5) : '',
    location: locationName.trim(),
    locationAddress,
    category,
    level,
    gatherTime,
    coaches,
    players
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
