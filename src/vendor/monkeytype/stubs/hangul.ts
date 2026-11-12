// TouchType shim (not Monkeytype code): hangul-js is only called when the text is Korean (context.hasKorean),
// which TouchType never sets. Identity keeps the vendored stats code unmodified.
export default { disassemble: (s: string): string[] => [...s] };
