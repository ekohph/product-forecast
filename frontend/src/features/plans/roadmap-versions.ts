// Compare decimal versions exactly, without floating-point rounding or row order.
export function formatVersionUpdatedAt(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"}).formatToParts(new Date(value));
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export function nextRoadmapVersions(versions: string[]) {
  const parsed = versions.flatMap(value => {
    const match = /^(\d+)\.(\d+)$/.exec(value);
    return match ? [{major: BigInt(match[1]), fraction: match[2].replace(/0+$/, "") || "0"}] : [];
  });
  const latest = parsed.reduce((max, value) => {
    if (value.major !== max.major) return value.major > max.major ? value : max;
    const width = Math.max(value.fraction.length, max.fraction.length);
    return value.fraction.padEnd(width, "0") > max.fraction.padEnd(width, "0") ? value : max;
  }, {major: BigInt(0), fraction: "0"});
  const digits = latest.fraction.length + (/^9+$/.test(latest.fraction) ? 1 : 0);
  const fraction = (BigInt(latest.fraction.padEnd(digits, "0")) + BigInt(1)).toString().padStart(digits, "0");
  return {
    minor: `${latest.major}.${fraction}`,
    major: `${latest.major + BigInt(1)}.0`,
    increment: `0.${"0".repeat(digits - 1)}1`,
  };
}

export function phaseAdvanceVersions(versions: {version: string; has_content?: boolean}[]): string[] {
  if (!versions.find(row => row.version === "0.0")?.has_content) return ["0.0"];
  const next = nextRoadmapVersions(versions.map(row => row.version));
  return [next.minor, next.major];
}

export function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((left, right) => {
    const a = /^(\d+)\.(\d+)$/.exec(left), b = /^(\d+)\.(\d+)$/.exec(right);
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    const majorA = BigInt(a[1]), majorB = BigInt(b[1]);
    if (majorA !== majorB) return majorA > majorB ? -1 : 1;
    const width = Math.max(a[2].length, b[2].length);
    const minorA = a[2].padEnd(width, "0"), minorB = b[2].padEnd(width, "0");
    return minorA === minorB ? 0 : minorA > minorB ? -1 : 1;
  });
}
