function glyphWidthFactor(character: string): number {
  if (/\s/.test(character)) return 0.34;
  if (/[ilI1|.,':;!]/.test(character)) return 0.32;
  if (/[MW@#%&]/.test(character)) return 0.92;
  if (/[A-Z]/.test(character)) return 0.68;
  if (/[0-9]/.test(character)) return 0.56;
  return 0.56;
}

export function estimateTextWidth(text: string, fontSize: number, fontWeight = 400): number {
  const weightFactor = fontWeight >= 600 ? 1.04 : 1;
  return Array.from(text).reduce((width, character) => width + glyphWidthFactor(character), 0)
    * fontSize
    * weightFactor;
}
