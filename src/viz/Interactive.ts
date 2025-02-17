import dagre from "@dagrejs/dagre";
import * as OPlot from "@observablehq/plot";
import { select } from "d3";

const tooltip = document.createElement("div"); // Tooltip setup
tooltip.style.position = "absolute";
tooltip.style.background = "white";
tooltip.style.border = "1px solid black";
tooltip.style.borderRadius = "5px";
tooltip.style.padding = "5px";
tooltip.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.2)";
tooltip.style.display = "none";
tooltip.style.pointerEvents = "none";
document.body.appendChild(tooltip);

/**
 * Function to create the parallel coordinates graph
 * @param {HTMLElement} container - The container where the graph will be placed
 * @param {any[]} data - The dataset used for visualization
 */
export function createGraph(container: HTMLElement, data: any[]) {
    const width = 1800, height = 800;

    // Create SVG container
    const svg = select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Define scales and axes
    const dimensions = ["exang", "cp", "target", "sex", "fbs", "slope", "ca", "thal"];
    
    const scaleY = new Map(
        dimensions.map((dim) => [
            dim,
            OPlot.scaleLinear({
                domain: [0, 4], // Adjust based on your data range
                range: [height - 50, 50],
            }),
        ])
    );

    const scaleX = OPlot.scalePoint({
        domain: dimensions,
        range: [50, width - 50],
    });

    // Draw lines for each data entry
    const paths = svg
        .selectAll(".data-line")
        .data(data)
        .enter()
        .append("path")
        .attr("class", "data-line")
        .attr("d", (d) =>
            dimensions
                .map((dim, i) => `${i === 0 ? "M" : "L"} ${scaleX(dim)},${scaleY.get(dim)(d[dim])}`)
                .join(" ")
        )
        .attr("fill", "none")
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("opacity", 0.6)
        .on("mouseover", function (event, d) {
            // Calculate percentage for this path
            const totalEntries = data.length;
            const matchingEntries = data.filter(
                (entry) => JSON.stringify(entry) === JSON.stringify(d)
            ).length;
            const percentage = ((matchingEntries / totalEntries) * 100).toFixed(2) + "%";

            // Show tooltip
            tooltip.style.display = "block";
            tooltip.innerHTML = `<strong>Data Flow:</strong> ${percentage}`;

            // Position tooltip
            tooltip.style.left = `${event.pageX + 10}px`;
            tooltip.style.top = `${event.pageY + 10}px`;

            select(this).attr("stroke", "red").attr("stroke-width", 2);
        })
        .on("mouseout", function () {
            tooltip.style.display = "none";
            select(this).attr("stroke", "black").attr("stroke-width", 1);
        });

    // Draw axes labels
    svg.selectAll(".axis-label")
        .data(dimensions)
        .enter()
        .append("text")
        .attr("class", "axis-label")
        .attr("x", (d) => scaleX(d))
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .text((d) => d)
        .style("font-size", "14px");
}
