import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { fill: 'var(--n-500)', fontSize: 12 }
const tip = { backgroundColor: 'var(--n-800)', border: 'none', borderRadius: 8, color: 'var(--n-100)' }

/** @param {{data: Array, lines: Array<{key:string,name:string,color:string,axis?:'left'|'right'}>, rightDomain?:number[]}} props */
export default function ProgressChart({ data, lines, rightDomain = [0, 100], height = 280 }) {
  const hasRight = lines.some((l) => l.axis === 'right')
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--n-800)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axis} axisLine={{ stroke: 'var(--n-800)' }} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="left" tick={axis} axisLine={false} tickLine={false} />
          {hasRight && <YAxis yAxisId="right" orientation="right" domain={rightDomain} tick={axis} axisLine={false} tickLine={false} />}
          <Tooltip contentStyle={tip} labelStyle={{ color: 'var(--n-400)' }} />
          <Legend wrapperStyle={{ color: 'var(--n-400)', paddingTop: 8, fontSize: 12 }} />
          {lines.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} yAxisId={l.axis ?? 'left'} stroke={l.color} strokeWidth={1.75} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
