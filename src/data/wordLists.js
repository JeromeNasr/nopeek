export const commonWords = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with',
  'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just',
  'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'find', 'tell', 'ask', 'need', 'feel', 'become', 'leave',
  'put', 'mean', 'keep', 'let', 'begin', 'seem', 'help', 'talk', 'turn', 'start', 'show', 'hear',
  'play', 'run', 'move', 'live', 'believe', 'hold', 'bring', 'happen', 'write', 'provide', 'sit',
  'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand',
  'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open',
  'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die',
  'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'remain', 'suggest', 'raise',
  'pass', 'sell', 'require', 'report', 'decide', 'pull', 'break', 'push', 'practice', 'type', 'fast',
  'slow', 'word', 'world', 'home', 'hand', 'part', 'place', 'case', 'week', 'company', 'system',
  'program',
]

export const codeSnippets = [
  'const sum = (a, b) => a + b',
  'if (x > 0) return true',
  'for (let i = 0; i < n; i++)',
  'const items = arr.filter(Boolean)',
  'export default function App() {}',
  'await fetch(url, { method: "GET" })',
  'const { id, name } = user',
  'return items.map(item => item.id)',
  'try { await save() } catch (e) {}',
  'const cache = new Map()',
  'def greet(name):',
  'return x ** 2 + y',
  'for item in data:',
  'if __name__ == "__main__":',
  'result = [x for x in nums if x > 0]',
  'with open(path, "r") as f:',
  'class User: pass',
  'len(sorted(set(values)))',
  'import json',
  'print(f"score: {score}")',
]

export const quotes = [
  'The only way to do great work is to love what you do.',
  'In the middle of every difficulty lies opportunity.',
  'It does not matter how slowly you go as long as you do not stop.',
  'Life is what happens when you are busy making other plans.',
  'The future belongs to those who believe in the beauty of their dreams.',
  'Simplicity is the ultimate sophistication.',
  'Not all those who wander are lost.',
  'To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.',
  'Stay hungry, stay foolish.',
  'The best time to plant a tree was twenty years ago. The second best time is now.',
]

export const numbers = [
  '8472916350 1928374650 3847562910 5647382910',
  '1029384756 5647382910 9182736450 7364528190',
  '3141592653 2718281828 1618033988 1414213562',
  '8675309 1234567 8901234 5678901 2345678',
  '9988776655 4433221100 5566778899 1122334455',
  '2468135790 1357924680 9753186420 8642097531',
  '5051525354 6061626364 7071727374 8081828384',
  '420691337 1337420690 800813500 867530900',
  '9998887776 5554443332 1112223334 7778889990',
  '3692581470 7418529630 1593574862 4862739150',
]

export const practiceCategories = [
  { id: 'common', label: 'Common words', source: commonWords },
  { id: 'code', label: 'Code', source: codeSnippets },
  { id: 'quotes', label: 'Quotes', source: quotes },
  { id: 'numbers', label: 'Numbers', source: numbers },
]

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)]
}

export function generatePracticeTokens(categoryId, count = 150) {
  const category = practiceCategories.find((item) => item.id === categoryId) ?? practiceCategories[0]

  if (category.id === 'common') {
    return Array.from({ length: count }, () => pickRandom(commonWords))
  }

  const tokens = []
  while (tokens.length < count) {
    const fragment = pickRandom(category.source)
    tokens.push(...fragment.split(' '))
  }

  return tokens.slice(0, count)
}
