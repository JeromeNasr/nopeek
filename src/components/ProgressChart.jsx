import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { fill: '#a1a1aa', fontSize: 12 }
const tip = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '0.5rem', color: '#fafafa' }

/** @param {{data: Array, lines: Array<{key:string,name:string,color:string,axis?:'left'|'right'}>, rightDomain?:number[]}} props */
export default function ProgressChart({ data, lines, rightDomain = [0, 100], height = 280 }) {
  const hasRight = lines.some((l) => l.axis === 'right')
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axis} axisLine={{ stroke: '#3f3f46' }} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="left" tick={axis} axisLine={false} tickLine={false} />
          {hasRight && <YAxis yAxisId="right" orientation="right" domain={rightDomain} tick={axis} axisLine={false} tickLine={false} />}
          <Tooltip contentStyle={tip} labelStyle={{ color: '#a1a1aa' }} />
          <Legend wrapperStyle={{ color: '#d4d4d8', paddingTop: 8 }} />
          {lines.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} yAxisId={l.axis ?? 'left'} stroke={l.color} strokeWidth={2} dot={{ r: 2.5, fill: l.color }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
