export function timelineLaneOffset(lane: number, step = 4) {
  return lane === 0 ? 0 : Math.ceil(lane / 2) * step * (lane % 2 ? 1 : -1);
}

/** Reuse the first free lane, reserving both the duration and its label width. */
export function layoutTimelineRanges(ranges: {start: number; end: number; labelWidth: number}[], gap = 8) {
  const lanes: number[] = [];
  const result: number[] = [];
  ranges.map((range, index) => {
    const center = (range.start + range.end) / 2;
    return {index, left: Math.min(range.start, center - range.labelWidth / 2), right: Math.max(range.end, center + range.labelWidth / 2)};
  }).sort((a, b) => a.left - b.left || a.index - b.index).forEach(({index, left, right}) => {
    let lane = lanes.findIndex(end => end + gap < left);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = right;
    result[index] = lane;
  });
  return result;
}

/** Keep labels inside the plot and shift horizontally before adding another row. */
export function layoutTimelineLabels(labels: {x: number; width: number}[], width: number, gap = 8) {
  const result: {x: number; row: number}[] = [];
  const rows: number[][] = [];
  let used = 0;
  for (let i = 0; i < labels.length; i++) {
    const size = Math.min(width, labels[i].width);
    if (!rows.length || used + gap + size > width) {rows.push([]); used = 0;}
    const row = rows.at(-1)!;
    used += (row.length ? gap : 0) + size;
    row.push(i);
  }
  rows.forEach((indices, row) => {
    let edge = 0;
    for (const i of indices) {
      const half = Math.min(width, labels[i].width) / 2;
      const x = Math.max(edge + half, Math.min(width - half, labels[i].x));
      result[i] = {x, row}; edge = x + half + gap;
    }
    edge = width;
    for (const i of [...indices].reverse()) {
      const half = Math.min(width, labels[i].width) / 2;
      result[i].x = Math.min(result[i].x, edge - half);
      edge = result[i].x - half - gap;
    }
  });
  return result;
}
