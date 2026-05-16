import type { ChartData, ChartOptions } from "chart.js";
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export type WellbeingChartView = {
  hasAnyData: boolean;
  hasVisibleData: boolean;
  data: ChartData<"line", { x: string; y: number }[], string>;
  options: ChartOptions<"line">;
};

export default function WellbeingChart({
  data,
  options,
}: {
  data: WellbeingChartView["data"];
  options: WellbeingChartView["options"];
}) {
  return <Line data={data} options={options} />;
}
