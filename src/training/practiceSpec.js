// (De)serialise a practice spec to URL search params so exercises are linkable.

export function specFromParams(params) {
  const kind = params.get('kind')
  if (!kind) return null
  return {
    kind,
    chars: (params.get('chars') ?? '').split('').filter(Boolean),
    grams: (params.get('grams') ?? '').split(',').filter(Boolean),
    fingerCodes: (params.get('codes') ?? '').split(',').filter(Boolean),
    label: params.get('label') ?? null,
  }
}

export function specToParams(spec) {
  const p = new URLSearchParams({ kind: spec.kind })
  if (spec.chars?.length) p.set('chars', spec.chars.join(''))
  if (spec.grams?.length) p.set('grams', spec.grams.join(','))
  if (spec.fingerCodes?.length) p.set('codes', spec.fingerCodes.join(','))
  if (spec.label) p.set('label', spec.label)
  return p.toString()
}
