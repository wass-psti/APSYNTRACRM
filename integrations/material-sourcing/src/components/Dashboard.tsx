import {
  committedCosts,
  exactSum,
  percentOf,
  type FxReference,
  money,
  rates,
  type Material,
  type Source,
} from "../utils/material";
export default function Dashboard({
  items,
  hidden,
  onToggle,
  onFilter,
  reference,
  databaseMode = false,
}: {
  items: Material[];
  reference?: FxReference | null;
  databaseMode?: boolean;
  hidden: boolean;
  onToggle: () => void;
  onFilter: (source: Source) => void;
}) {
  const totals = ["Local", "Import", "Unknown"].map((source) => ({
    source,
    count: items.filter((i) => i.source === source).length,
    cost: exactSum(
      items
        .filter((i) => i.source === source)
        .map((i) => committedCosts(i).totalLanded),
      2,
    ),
  }));
  const total = exactSum(
    totals.map((i) => i.cost),
    2,
  );
  const compact = (n: string) =>
    "₱" +
    Intl.NumberFormat("en-PH", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(Number(n));
  const local = percentOf(totals[0].cost, total),
    imported = percentOf(totals[1].cost, total);
  const usd = databaseMode ? reference?.usd : rates.usd;
  const eur = databaseMode ? reference?.eur : rates.eur;
  return (
    <>
      <div className="section-title">
        <span>Key metrics</span>
        <button className="plain" onClick={onToggle}>
          {hidden ? "⌄ Show" : "⌃ Hide"}
        </button>
      </div>
      {!hidden && (
        <div className="metrics">
          <div className="metric">
            <i>◇</i>
            <div>
              <small>Total items</small>
              <strong>{items.length.toLocaleString()}</strong>
            </div>
          </div>
          <div className="metric">
            <i className="green">↗</i>
            <div>
              <small>Total buying</small>
              <strong title={money(total)}>{compact(total)}</strong>
            </div>
          </div>
          {totals.slice(0, 2).map((t, i) => (
            <button
              className="metric"
              key={t.source}
              onClick={() => onFilter(t.source as Source)}
            >
              <i className={i ? "blue" : "orange"}>{i ? "◎" : "⌖"}</i>
              <div>
                <small>{t.source}</small>
                <strong>{t.count}</strong>
              </div>
            </button>
          ))}
          <div className="metric">
            <i className="green">$</i>
            <div>
              <small>USD rate</small>
              <strong>₱{usd === undefined ? "—" : money(usd)}</strong>
            </div>
          </div>
          <div className="metric">
            <i>€</i>
            <div>
              <small>EUR rate</small>
              <strong>₱{eur === undefined ? "—" : money(eur)}</strong>
            </div>
          </div>
          <div className="metric distribution">
            <div
              className="donut"
              style={{
                background: Number(total)
                  ? "conic-gradient(#10b981 0 " +
                    local +
                    "%, #0ea5e9 " +
                    local +
                    "% " +
                    (local + imported) +
                    "%, #94a3b8 " +
                    (local + imported) +
                    "% 100%)"
                  : "#d9dee6",
              }}
            />
            <div>
              <small>Cost by source</small>
              {totals.map((t, i) => (
                <div key={t.source} className="legend">
                  <span style={{ color: ["#10b981", "#0ea5e9", "#94a3b8"][i] }}>
                    ●
                  </span>{" "}
                  {t.source}: <b title={money(t.cost)}>{compact(t.cost)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="forex">
        <span>
          ⇄ {databaseMode ? "Stored reference rates:" : "Demo exchange rates:"}
        </span>
        <span className="rate">
          USD → ₱{usd === undefined ? "—" : money(usd)}
        </span>
        <span className="rate">
          EUR → ₱{eur === undefined ? "—" : money(eur)}
        </span>
        <small>Reference snapshot · not live</small>
      </div>
    </>
  );
}
