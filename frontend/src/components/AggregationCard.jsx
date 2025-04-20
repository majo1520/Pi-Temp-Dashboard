// Komponent karty pre agregáciu
function AggregationCard({ type, value, time }) {
  const typeMap = {
    min: { icon: "🌡️", label: "Min", color: "text-blue-500" },
    avg: { icon: "📊", label: "Avg", color: "text-green-500" },
    max: { icon: "🔺", label: "Max", color: "text-red-500" },
  };
  const { icon, label, color } = typeMap[type];
  const isValueNull = value === null || value === "N/A" || isNaN(value);
  return (
    <div className="flex flex-col items-start bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm w-full">
      <div className={`text-sm font-semibold ${color}`}>
        {icon} {label}
      </div>
      {isValueNull ? (
        <p className="text-xs text-gray-500 mt-1">Žiadne dáta</p>
      ) : (
        <>
          <p className="text-lg font-bold text-gray-800 dark:text-white">
            {Number(value).toFixed(2)} °C
          </p>
          {time && (
            <p className="text-xs text-gray-500 mt-1">
              {new Date(time).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default AggregationCard; 