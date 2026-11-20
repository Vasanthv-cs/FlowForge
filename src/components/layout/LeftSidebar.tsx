import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { nodeDefinitions, nodeCategories } from '@/data/nodeDefinitions';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { NodeCategory } from '@/types/workflow';

export function LeftSidebar() {
  const [search, setSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(['trigger', 'data', 'logic', 'utility']),
  );
  const addNode = useWorkflowStore((s) => s.addNode);

  const filteredDefs = nodeDefinitions.filter(
    (d) =>
      d.label.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCats(next);
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    type: string,
  ) => {
    e.dataTransfer.setData('application/flowforge-node-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  const grouped = nodeCategories.map((cat) => ({
    ...cat,
    nodes: filteredDefs.filter((d) => d.category === cat.id as NodeCategory),
  }));

  return (
    <aside className="flex w-60 flex-col border-r border-[#1e1e2e] bg-[#13131d] shrink-0 select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#1e1e2e] px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Nodes
        </h2>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#1e1e2e]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto py-1">
        {grouped.map((cat) => (
          <div key={cat.id}>
            {/* Category header */}
            <button
              onClick={() => toggleCat(cat.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span className="uppercase tracking-wider">{cat.label}</span>
              <span className="ml-auto text-[10px] text-gray-600">
                {cat.nodes.length}
              </span>
              <svg
                className={cn(
                  'h-3 w-3 text-gray-500 transition-transform',
                  expandedCats.has(cat.id) && 'rotate-90',
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* Nodes */}
            {expandedCats.has(cat.id) && (
              <div className="space-y-0.5 px-2 pb-1">
                {cat.nodes.map((def) => (
                  <div
                    key={def.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, def.type)}
                    onClick={() => {
                      addNode(def.type, {
                        x: 250 + Math.random() * 200,
                        y: 150 + Math.random() * 200,
                      });
                    }}
                    className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-[#1e1e2e] transition-colors"
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                      style={{
                        borderColor: def.color + '40',
                        backgroundColor: def.color + '15',
                      }}
                    >
                      <DynamicIcon
                        name={def.icon}
                        className="h-3.5 w-3.5"
                        style={{ color: def.color }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-300 group-hover:text-white truncate">
                        {def.label}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {def.description}
                      </div>
                    </div>
                  </div>
                ))}
                {cat.nodes.length === 0 && (
                  <p className="px-2 py-2 text-[10px] text-gray-600 italic">
                    No matching nodes
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-[#1e1e2e] px-3 py-2">
        <p className="text-[10px] text-gray-600 text-center">
          Drag a node onto the canvas or click to add
        </p>
      </div>
    </aside>
  );
}
