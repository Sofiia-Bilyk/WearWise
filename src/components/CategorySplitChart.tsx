import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface CategorySplitChartProps {
  data: { name: string; value: number }[];
}

const COLORS = ['#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4', '#57534e'];

/** Donut chart showing the wardrobe's category distribution. */
export const CategorySplitChart: React.FC<CategorySplitChartProps> = ({ data }) => (
  <div className="bg-white p-5 rounded-xl border border-stone-100 shadow-sm flex flex-col h-[320px]">
    <h3 className="text-sm font-bold text-stone-800 mb-3">Category Split</h3>
    <div className="flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={65}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <ul className="flex flex-wrap gap-2 justify-center mt-2">
      {data.map((entry, idx) => (
        <li key={entry.name} className="flex items-center gap-1 text-[10px] text-stone-500">
          <span
            aria-hidden="true"
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
          />
          {entry.name}
        </li>
      ))}
    </ul>
  </div>
);
