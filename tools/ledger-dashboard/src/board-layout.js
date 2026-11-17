export const cardWidth = 166;
export const cardHeight = 64;
export const dutHeight = 46;
const columnWidth = 218;

export const layoutBoard = (nodes) => {
  const levels = new Map();
  const lanesByLevel = new Map();
  const steps = nodes.map((node) => {
    const parents = node.prev.map((id) => levels.get(id)).filter(Boolean);
    const column = parents.reduce((depth, parent) => Math.max(depth, parent.column + 1), 0);
    const used = lanesByLevel.get(column) ?? new Set();
    const preferred = parents[0]?.lane ?? 0;
    let lane = preferred;
    for (let offset = 1; used.has(lane); offset += 1) {
      lane = !used.has(preferred + offset) ? preferred + offset : preferred - offset;
    }
    used.add(lane);
    lanesByLevel.set(column, used);
    const step = { node, column, lane, x: column * columnWidth, y: lane * 156 };
    levels.set(node.cid, step);
    return step;
  });
  const minY = steps.reduce((minimum, step) => Math.min(minimum, step.y), 0);
  for (const step of steps) step.y -= minY;
  const edges = steps.flatMap((target) =>
    target.node.prev.flatMap((id) => {
      const source = levels.get(id);
      return source ? [{ source, target }] : [];
    }),
  );
  const width = steps.reduce((maximum, step) => Math.max(maximum, step.x + cardWidth), cardWidth);
  const height = steps.reduce(
    (maximum, step) => Math.max(maximum, step.y + (step.node.dut ? 136 : cardHeight)),
    cardHeight,
  );
  return { steps, edges, width, height };
};
