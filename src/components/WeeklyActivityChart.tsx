import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface WeeklyActivityChartProps {
  data: { name: string; wears: number }[];
}

/** Bar chart showing how many outfits were logged on each day of the week. */
export const WeeklyActivityChart: React.FC<WeeklyActivityChartProps> = ({ data }) => (
  <div className="bg-white p-5 rounded-xl border border-stone-100 shadow-sm flex flex-col h-[300px]">
    <h3 className="text-sm font-bold text-stone-800 mb-3">Weekly Activity</h3>
    <div className="flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#a8a29e', fontSize: 11 }}
            dy={5}
          />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: '#f5f5f4' }}
            contentStyle={{
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="wears" fill="#e05d45" radius={[4, 4, 0, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);
