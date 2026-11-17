import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import {
  IconBraces,
  IconChevronRight,
  IconFocus2,
  IconGitBranch,
  IconHandMove,
  IconLayersIntersect,
  IconLink,
  IconMinus,
  IconPlus,
  IconShieldCheck,
} from '@tabler/icons-react';
import { cardHeight, cardWidth, dutHeight, layoutBoard } from './board-layout.js';
import { callLabel, elapsedTime, formatDate, stepInfo } from './ledger.js';

const minZoom = 0.18;
const maxZoom = 2.25;

const zoomAt = (camera, nextZoom, x, y) => {
  const zoom = Math.max(minZoom, Math.min(maxZoom, nextZoom));
  const ratio = zoom / camera.zoom;
  return { x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio, zoom };
};

const ToolbarButton = ({ title, icon: Icon, action, disabled }) => {
  return (
    <Tooltip label={title}>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={title}
        onClick={action}
        disabled={disabled}
      >
        <Icon size={17} />
      </ActionIcon>
    </Tooltip>
  );
};

const LineageBoard = ({
  nodes,
  decisions,
  startMs,
  selected,
  selectedDut,
  select,
  openDut,
  dockOpen,
  upstream,
  traceCid,
}) => {
  const layout = useMemo(() => layoutBoard(nodes), [nodes]);
  const frame = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState({ x: 48, y: 110, zoom: 1 });
  const { steps, edges, width, height } = layout;
  const dockWidth = (boardWidth) => (dockOpen ? Math.min(364, boardWidth * 0.48) : 0);
  const fittedTrace = useRef('');

  const fit = (widthPx = size.width, heightPx = size.height, occupied = 0) => {
    if (!widthPx || !heightPx) return;
    const usable = widthPx - occupied;
    const zoom = Math.max(minZoom, Math.min(1.1, (usable - 64) / width, (heightPx - 128) / height));
    setCamera({
      x: Math.max(28, (usable - width * zoom) / 2),
      y: Math.max(78, (heightPx - height * zoom) / 2),
      zoom,
    });
  };

  useLayoutEffect(() => {
    const element = frame.current;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      const { width: nextWidth, height: nextHeight } = entry.contentRect;
      if (!nextWidth || !nextHeight) return;
      setSize({ width: nextWidth, height: nextHeight });
      if (first) {
        first = false;
        fit(nextWidth, nextHeight, dockWidth(nextWidth));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  useEffect(() => {
    const element = frame.current;
    const onWheel = (event) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const multiplier =
        event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? element.clientHeight : 1;
      const factor = Math.exp(-event.deltaY * multiplier * 0.0018);
      setCamera((current) =>
        zoomAt(
          current,
          current.zoom * factor,
          event.clientX - bounds.left,
          event.clientY - bounds.top,
        ),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!size.width) return;
    if (traceCid && traceCid !== fittedTrace.current) {
      fit(size.width, size.height, dockWidth(size.width));
      fittedTrace.current = traceCid;
      return;
    }
    if (!traceCid) fittedTrace.current = '';
    const step = steps.find(({ node }) => node.cid === (selected || traceCid));
    if (!step) return;
    const right = size.width - dockWidth(size.width) - 18;
    setCamera((current) => {
      const x = current.x + (step.x + cardWidth / 2) * current.zoom;
      const y = current.y + (step.y + (selectedDut ? 110 : cardHeight / 2)) * current.zoom;
      const targetX = Math.max(65, Math.min(right - (cardWidth * current.zoom) / 2, x));
      const targetY = Math.max(95, Math.min(size.height - 80, y));
      return x === targetX && y === targetY
        ? current
        : { ...current, x: current.x + targetX - x, y: current.y + targetY - y };
    });
  }, [dockOpen, selected, selectedDut, traceCid, size, steps]);

  const changeZoom = (factor) => {
    setCamera((current) => zoomAt(current, current.zoom * factor, size.width / 2, size.height / 2));
  };
  const beginDrag = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera };
    setDragging(true);
  };
  const moveDrag = (event) => {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    setCamera({
      ...start.camera,
      x: start.camera.x + event.clientX - start.x,
      y: start.camera.y + event.clientY - start.y,
    });
  };
  const endDrag = (event) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };
  const onKey = (event) => {
    if (event.target !== event.currentTarget) return;
    const offsets = {
      ArrowUp: [0, 44],
      ArrowDown: [0, -44],
      ArrowLeft: [44, 0],
      ArrowRight: [-44, 0],
    };
    const offset = offsets[event.key];
    if (offset)
      setCamera((current) => ({ ...current, x: current.x + offset[0], y: current.y + offset[1] }));
    else if (event.key === '0') fit(size.width, size.height, dockWidth(size.width));
    else if (event.key === '+' || event.key === '=') changeZoom(1.2);
    else if (event.key === '-') changeZoom(1 / 1.2);
    else return;
    event.preventDefault();
  };

  const mapWidth = 126;
  const mapHeight = 66;
  const mapZoom = Math.min((mapWidth - 12) / width, (mapHeight - 12) / height);
  const mapX = (mapWidth - width * mapZoom) / 2;
  const mapY = (mapHeight - height * mapZoom) / 2;
  const moveFromMap = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left - mapX) / mapZoom;
    const y = (event.clientY - bounds.top - mapY) / mapZoom;
    setCamera((current) => ({
      ...current,
      x: (size.width - dockWidth(size.width)) / 2 - x * current.zoom,
      y: size.height / 2 - y * current.zoom,
    }));
  };

  return (
    <div
      className="lineage-board"
      data-dragging={dragging}
      data-docked={dockOpen}
    >
      <div
        ref={frame}
        className="board-viewport"
        role="region"
        tabIndex={0}
        aria-label="Interactive lineage canvas"
        aria-describedby="board-controls-hint"
        onKeyDown={onKey}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        style={{
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          backgroundSize: `${20 * camera.zoom}px ${20 * camera.zoom}px`,
        }}
      >
        <div
          className="board-world"
          style={{
            width,
            height,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <svg
            className="board-connections"
            width={width}
            height={height}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="lineage-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path
                  d="M 0 0 L 7 3.5 L 0 7 z"
                  fill="context-stroke"
                />
              </marker>
            </defs>
            {edges.map(({ source, target }) => {
              const x = source.x + cardWidth;
              const y = source.y + cardHeight / 2;
              const toX = target.x - 3;
              const toY = target.y + cardHeight / 2;
              const middle = x + (toX - x) / 2;
              const active = [source.node.cid, target.node.cid].includes(selected);
              return (
                <path
                  key={`${source.node.cid}/${target.node.cid}`}
                  className="board-edge"
                  data-active={active}
                  data-traced={Boolean(
                    upstream?.has(source.node.cid) && upstream?.has(target.node.cid),
                  )}
                  data-muted={Boolean(
                    upstream && !(upstream.has(source.node.cid) && upstream.has(target.node.cid)),
                  )}
                  d={`M ${x} ${y} C ${middle} ${y}, ${middle} ${toY}, ${toX} ${toY}`}
                  markerEnd="url(#lineage-arrow)"
                />
              );
            })}
            {steps
              .filter(({ node }) => node.dut)
              .map(({ node, x, y }) => (
                <path
                  key={node.cid}
                  className="board-dut-edge"
                  data-muted={Boolean(upstream && !upstream.has(node.cid))}
                  d={`M ${x + 31} ${y + cardHeight} V ${y + 82}`}
                />
              ))}
          </svg>
          {steps.map(({ node, x, y }) => {
            const decision = decisions.get(node.cid);
            const info = stepInfo(node, decision);
            const Icon = decision
              ? IconShieldCheck
              : node.dut
                ? IconBraces
                : info.kind === 'Run start'
                  ? IconGitBranch
                  : IconLayersIntersect;
            const muted = Boolean(upstream && !upstream.has(node.cid));
            return (
              <div key={node.cid}>
                <button
                  className="board-node"
                  data-tone={info.color}
                  data-active={node.cid === selected && !selectedDut}
                  data-traced={Boolean(upstream?.has(node.cid))}
                  data-muted={muted}
                  aria-pressed={node.cid === selected && !selectedDut}
                  onClick={() => select(node.cid)}
                  style={{ left: x, top: y, width: cardWidth, height: cardHeight }}
                  title={`${info.title} · ${formatDate(node.occurred_at)}`}
                >
                  <span className="board-node-icon">
                    <Icon size={17} />
                  </span>
                  <span className="board-node-copy">
                    <strong>{info.title}</strong>
                    <span>{elapsedTime(node.occurred_at, startMs)}</span>
                  </span>
                  {node.derived_from.length > 0 && (
                    <span
                      className="board-handoff"
                      aria-label="Uses evidence from another run"
                      title="Uses evidence from another run"
                    >
                      <IconLink size={14} />
                    </span>
                  )}
                </button>
                {node.dut && (
                  <button
                    className="board-node board-dut"
                    data-tone="violet"
                    data-active={node.dut === selectedDut && node.cid === selected}
                    data-muted={muted}
                    aria-pressed={node.dut === selectedDut && node.cid === selected}
                    aria-label={`Open ${callLabel(node).toLowerCase()} for ${info.title}`}
                    onClick={() => openDut(node.dut, node.cid)}
                    style={{ left: x + 12, top: y + 82, width: cardWidth - 18, height: dutHeight }}
                  >
                    <IconBraces size={15} />
                    <span className="board-node-copy">
                      <strong>{callLabel(node)}</strong>
                      <span>Input and output</span>
                    </span>
                    <IconChevronRight size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        id="board-controls-hint"
        className="board-hint"
      >
        <IconHandMove size={15} /> Drag to pan · Scroll to zoom
      </div>
      <div
        className="board-toolbar"
        aria-label="Canvas zoom controls"
      >
        <ToolbarButton
          title="Zoom out"
          icon={IconMinus}
          action={() => changeZoom(1 / 1.2)}
          disabled={camera.zoom <= minZoom}
        />
        <output aria-label="Zoom level">{Math.round(camera.zoom * 100)}%</output>
        <ToolbarButton
          title="Zoom in"
          icon={IconPlus}
          action={() => changeZoom(1.2)}
          disabled={camera.zoom >= maxZoom}
        />
        <span className="toolbar-divider" />
        <ToolbarButton
          title="Fit graph"
          icon={IconFocus2}
          action={() => fit(size.width, size.height, dockWidth(size.width))}
        />
      </div>
      {!dockOpen && (
        <button
          className="board-minimap"
          aria-label="Recenter from minimap"
          onClick={(event) => {
            if (event.detail === 0) fit(size.width, size.height, dockWidth(size.width));
            else moveFromMap(event);
          }}
        >
          <svg
            width={mapWidth}
            height={mapHeight}
            aria-hidden="true"
          >
            {steps.map(({ node, x, y }) => (
              <rect
                key={node.cid}
                x={mapX + x * mapZoom}
                y={mapY + y * mapZoom}
                width={Math.max(3, cardWidth * mapZoom)}
                height={Math.max(2, cardHeight * mapZoom)}
                rx="2"
                fill={node.cid === selected ? '#8555e4' : '#c7bdd9'}
              />
            ))}
            <rect
              x={mapX - (camera.x / camera.zoom) * mapZoom}
              y={mapY - (camera.y / camera.zoom) * mapZoom}
              width={(size.width / camera.zoom) * mapZoom}
              height={(size.height / camera.zoom) * mapZoom}
              fill="none"
              stroke="#9468e9"
              strokeWidth="1"
              rx="3"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default LineageBoard;
