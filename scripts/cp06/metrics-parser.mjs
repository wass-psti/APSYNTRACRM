const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

function parseLabels(source) {
  const labels = {};
  let index = 0;

  while (index < source.length) {
    while (source[index] === " " || source[index] === ",") index += 1;
    if (index >= source.length) break;

    const nameStart = index;
    while (index < source.length && /[a-zA-Z0-9_]/.test(source[index]))
      index += 1;
    const name = source.slice(nameStart, index);
    if (!name || source[index] !== "=")
      throw new Error("Invalid Prometheus label");
    index += 1;
    if (source[index] !== '"')
      throw new Error("Prometheus label value must be quoted");
    index += 1;

    let value = "";
    let closed = false;
    while (index < source.length) {
      const character = source[index];
      if (character === '"') {
        index += 1;
        closed = true;
        break;
      }
      if (character === "\\") {
        index += 1;
        const escaped = source[index];
        if (escaped === "n") value += "\n";
        else if (escaped === '"' || escaped === "\\") value += escaped;
        else throw new Error("Invalid Prometheus label escape");
        index += 1;
        continue;
      }
      value += character;
      index += 1;
    }

    if (!closed || Object.hasOwn(labels, name))
      throw new Error("Invalid or duplicate Prometheus label");
    labels[name] = value;
    if (index < source.length && source[index] !== ",")
      throw new Error("Invalid Prometheus label separator");
  }

  return labels;
}

function parseMetricLine(line) {
  const match = line.match(
    /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)(?:\s+\d+)?\s*$/,
  );
  if (!match) throw new Error("Invalid Prometheus sample line");

  const [, name, labelSource, rawValue] = match;
  if (!METRIC_NAME.test(name))
    throw new Error("Invalid Prometheus metric name");

  let value;
  if (rawValue === "+Inf") value = Infinity;
  else if (rawValue === "-Inf") value = -Infinity;
  else if (rawValue === "NaN") value = Number.NaN;
  else value = Number(rawValue);
  if (Number.isNaN(value) && rawValue !== "NaN")
    throw new Error("Invalid Prometheus metric value");

  return {
    name,
    labels: labelSource === undefined ? {} : parseLabels(labelSource),
    value,
  };
}

export function parsePrometheusMetrics(text) {
  if (typeof text !== "string")
    throw new TypeError("Metrics response must be text");

  const samples = [];
  const lines = text.split(/\r?\n/);
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber].trim();
    if (!line || line.startsWith("#")) continue;
    try {
      samples.push(parseMetricLine(line));
    } catch (error) {
      throw new Error(
        `Invalid Prometheus metric at line ${lineNumber + 1}: ${error.message}`,
      );
    }
  }
  return samples;
}
