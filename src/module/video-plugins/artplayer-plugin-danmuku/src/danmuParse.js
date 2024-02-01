export function getMode(key) {
  switch (key) {
    case 1:
    case 2:
    case 3:
      return 0
    case 4:
    case 5:
      return 1
    default:
      return 0
  }
}

export function UniversalDanmuParseFromXml(xmlString, option) {
  if (typeof xmlString !== 'string') return []
  const matches = xmlString.matchAll(/<d (?:.*? )??p="(?<p>.+?)"(?: .*?)?>(?<text>.+?)<\/d>/gs)
  return Array.from(matches)
    .map((match) => {
      const attr = match.groups.p.split(',')
      if (attr.length >= 8) {
        const text = match.groups.text
          .trim()
          .replaceAll('&quot;', '"')
          .replaceAll('&apos;', '\'')
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&amp;', '&')

        return {
          text,
          time: Number(attr[0]),
          mode: getMode(Number(attr[1])) || option.mode,
          fontSize: Number(attr[2]) || option.fontSize,
          color: `#${Number(attr[3]).toString(16)}` || option.color,
          timestamp: Number(attr[4]) || 0
        }
      } else {
        return null
      }
    })
    .filter(Boolean)
}

export function UniversalDanmuParseFromUrl(url, option) {
  return fetch(url)
    .then((res) => res.text())
    .then((xmlString) => UniversalDanmuParseFromXml(xmlString, option))
}
