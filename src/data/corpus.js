// Original practice texts (written for TouchType) for the real-world stage.

export const prose = [
  'The morning train pulled out of the station just as the rain began to fall. Maya pressed her forehead against the cool window and watched the city blur into long ribbons of grey and gold. She had a notebook open on her lap, but the page stayed empty. Some days the words came easily; today they were hiding.',
  'Learning to type without looking is a lot like learning to ride a bicycle. At first every movement feels deliberate and clumsy, and you are certain you will never stop thinking about it. Then one day you notice that your hands have simply been doing the work while your mind was somewhere else entirely.',
  'A good routine is built from small, repeatable actions. Ten focused minutes every day will do more for your skill than a single long session once a week. The goal is not to push harder, but to show up often and to stay curious about what your fingers are telling you.',
  'On the far side of the valley, the old observatory stood alone against the sky. Its copper dome had turned green long ago, yet the telescope inside still worked. On clear nights the caretaker would open the shutters and invite anyone who was awake to look up and wonder.',
  'When the power went out, the whole street fell quiet. Neighbors came onto their porches with candles and flashlights, and for an hour nobody checked a phone. Someone brought out a guitar, someone else a pot of soup, and it felt for a little while like a different decade.',
  'Accuracy is the foundation of speed. If you slow down just enough to avoid mistakes, your brain learns the correct movement pattern each time. If you rush, it learns the mistake instead. Over weeks, the careful typist usually overtakes the hurried one.',
]

export const emails = [
  'Hi Daniel, thanks for sending over the draft. I read it this morning and I think the structure works well. Two small notes: the summary on page 2 could be shorter, and the budget table needs the final figures. Could you send an updated version by Thursday? Best regards, Priya',
  'Dear Ms. Alvarez, I am writing to confirm our meeting on Tuesday, March 14, at 10:30 a.m. in Room 204. Please bring the signed forms and a copy of your ID. If you need to reschedule, call 555-0148 or reply to this email. Sincerely, Tom Becker',
  'Hello team, a quick reminder that the quarterly review is next Monday. Please upload your slides to the shared folder by Friday at 5 p.m. If you run into any problems, message me directly. Thanks for all your hard work this quarter! Cheers, Jordan',
  'Hi Sam, I just booked the tickets for the 7:45 flight on June 3rd. The confirmation number is KX92TQ. We land at 11:20, so we can still make lunch. Let me know if you want me to reserve a rental car as well. See you soon, Elena',
]

export const technicalWords = [
  'algorithm', 'asynchronous', 'authentication', 'bandwidth', 'compiler', 'concurrency', 'configuration', 'database', 'deployment', 'encryption',
  'framework', 'function', 'hypervisor', 'implementation', 'infrastructure', 'interface', 'iteration', 'kubernetes', 'latency', 'middleware',
  'namespace', 'optimization', 'parameter', 'polymorphism', 'protocol', 'recursion', 'repository', 'serialization', 'synchronize', 'throughput',
  'transaction', 'validation', 'variable', 'virtualization', 'websocket', 'architecture', 'dependency', 'documentation', 'environment', 'integration',
  'microservice', 'orchestration', 'performance', 'refactoring', 'scalability', 'telemetry', 'abstraction', 'idempotent', 'normalization', 'vulnerability',
]

export const extraCode = [
  'function add(a, b) { return a + b; }',
  'const total = items.reduce((s, x) => s + x.price, 0);',
  'if (user && user.isActive) { save(user); }',
  'SELECT id, name FROM users WHERE age > 21;',
  'git commit -m "fix: handle empty input"',
  'for (const [key, value] of Object.entries(obj)) {}',
  'const ok = /^[a-z0-9_-]{3,16}$/.test(name);',
  'items.sort((a, b) => a.id - b.id);',
  'export const API_URL = process.env.API_URL ?? "";',
  'while (queue.length > 0) { process(queue.shift()); }',
]
