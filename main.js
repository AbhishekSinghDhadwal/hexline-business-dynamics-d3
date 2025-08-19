// How to read : Relevant code sections are described "Step wise" where each steps code is prefaced with a comment regarding the step and its relevance. Extra code is labelled the same way.
// GLOBALS
var businessDynamicsData = [];
var geoData = null;
var playInterval = null;
var lassoCoords = [];
var tooltip;

// ONLOAD
document.addEventListener('DOMContentLoaded', function () {
    tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip");
     // STEP 2 Code - dynamic form range i.e, span shows the year which is selected by slider
    // Used event listener for this purpose
    const yearSlider = document.getElementById('year-selector');
    const yearDisplay = document.getElementById('year-display');
    yearDisplay.textContent = yearSlider.value;
    yearSlider.addEventListener('input', function(event) 
    {
        yearDisplay.textContent = event.target.value;
    });

    // STEP 3 - ONLOAD - 
    // loads data, autoconverts then stores in global var
    // STEP 4 - loading geojson data for hexmap then storing in global var
    Promise.all([d3.csv("data/business_dynamics.csv", d3.autoType),d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/us_states_hexgrid.geojson.json")])
    .then(function([business_data, geo_data])
    {
        console.log("Input business data loaded:", business_data);
        console.log("Input geo data loaded:", geo_data);
        businessDynamicsData = business_data;
        console.log(businessDynamicsData);
        geoData = geo_data;
        renderHexMap();
    })
    .catch(function(error) 
    {
        console.error("Error loading input data:", error);
    });
    
    // attached event listeners for controls to update hex map when changed
    document.getElementById('attribute-select').addEventListener('change', renderHexMap);
    document.getElementById('year-selector').addEventListener('input', renderHexMap);
    document.getElementById('scale-toggle').addEventListener('change', renderHexMap);
    // line chart input listener
    document.getElementById('attribute-select').addEventListener('change', updateLineChart);
    document.getElementById('year-selector').addEventListener('input', updateLineChart);
    document.getElementById('scale-toggle').addEventListener('change', updateLineChart);

    // STEP 4 - the "Play" button functionality - uses setInterval to run fn continuously 
    document.getElementById('play-button').addEventListener('click', 
        function () 
        {
            // if playInterval is null, the animation is NOT playing
            if (playInterval === null) 
            {
                this.textContent = "Pause";
                // NOTE TO SELF - setInterval - used an interval to update the year slider every X milliseconds (which is at bottom of the fn if you want to change it)
                playInterval = setInterval(function () 
                {
                    const yearSlider = document.getElementById('year-selector');
                    var currentYear = +yearSlider.value;
                    const maxYear = +yearSlider.max;
                    const minYear = +yearSlider.min;
                    
                    // increment the current year or cycle back to the start based on ip 
                    if (currentYear < maxYear) 
                    {
                        currentYear++;
                    } 
                    else 
                    {
                        currentYear = minYear;
                    }
                    yearSlider.value = currentYear;
                    document.getElementById('year-display').textContent = currentYear;
                    renderHexMap();
                    // fix attempt - rendering vertical line updates with other parts of the code
                    // line chart group added in order to make some stuff
                    const svgLineChart = d3.select("#line-chart-svg");
                    const g = svgLineChart.select("g.line-chart-group");

                    // only update if group exists
                    if (!g.empty()) 
                    {
                        const updateMargin = { top: 20, right: 20, bottom: 30, left: 50 };
                        const updateWidth = +svgLineChart.attr("width") - updateMargin.left - updateMargin.right || 400;
                        const updateHeight = +svgLineChart.attr("height") - updateMargin.top - updateMargin.bottom || 300;
                        const allYears = businessDynamicsData.map(d => d.Year);
                        const xScale = d3.scaleLinear().domain(d3.extent(allYears)).range([0, updateWidth]);
                        updateVerticalLine(g, xScale, updateHeight);
                    }
                }, 500); 
            } 
            else 
            {
                // if playInterval var has value, that means it is playing, and we need to pause our code
                // and set it to null to restart the cycle
                clearInterval(playInterval);
                playInterval = null;
                this.textContent = "Play";
            }
        });
    // extra - tooltip icon which on enter shows a description of the current var
    document.getElementById('attribute-tooltip-icon').addEventListener("mouseenter", (event) => 
    {
        const currentAttr = document.getElementById("attribute-select").value;
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(getAttributeDescription(currentAttr)).style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 20) + "px");
    });
    
    document.getElementById('attribute-tooltip-icon').addEventListener("mouseleave", () => 
    {
        tooltip.transition().duration(200).style("opacity", 0);
    });
    // create a drag behavior for the lasso
    const lassoDrag = d3.drag().on("start", lassoDragStart).on("drag", lassoDragMove).on("end", lassoDragEnd);
    d3.select("#hex-map-svg").call(lassoDrag);


});

// STEP 4 - renderHexMap - Updates the hex map visualization based on the selected attribute, year, and scale mode.
function renderHexMap() {
    console.log("Rendering hex map");
    if (!geoData) 
    {
        console.error("GeoJSON Data load failed");
        return;
    }
    if (businessDynamicsData.length == 0)
    {
        console.error("Business Dynamics Data load failed");
        return;
    }
    // fetch stage - get curr control values
    const attribute = document.getElementById('attribute-select').value;
    const currentYear = +document.getElementById('year-selector').value;
    const useAllYears = document.getElementById('scale-toggle').checked;
    console.log("Current attribute: " + attribute + "; Current year: " + currentYear + " ; Use all years? : " + useAllYears);
    var values = [];
    // get min-max of curr attribute
    // checks if use all years or curr years only
    if (useAllYears) 
    {
        values = businessDynamicsData.map(d => d[attribute]).filter(d => !isNaN(d));
    } 
    else 
    {
        values = businessDynamicsData.filter(d => d.Year === currentYear).map(d => d[attribute]).filter(d => !isNaN(d));
    }
    const domainMin = d3.min(values);
    const domainMax = d3.max(values);
    console.log("Current domain min: " + domainMin + "; Current domain max: " + domainMax);
    
    //const colorScale = d3.scaleSequential().domain([domainMin, domainMax]).interpolator(d3.interpolateWarm);
    // beautification - replaced color scale with custom scale using interpolateRgb
    const colorScale = d3.scaleSequential().domain([domainMin, domainMax]).interpolator(d3.interpolateRgb("#f8f0e7", "#da7756"));
    const svg = d3.select("#hex-map-svg");
    // if legend not there, create, else, update 
    // NOTE TO SELF - BAD, needs a workaround in the future
    if (d3.select("#legend-container").select("svg").empty()) 
    {
        drawLegend(colorScale);
    } 
    else 
    {
        updateLegend(colorScale);
    }
    
    // mercator/ geoJson section - generates projection then binds to map hex
    const projection = getMainProjection();
    const path = d3.geoPath().projection(projection);
    const hexes = svg.selectAll("path.hexagon").data(geoData.features, d => d.properties.iso3166_2);
    
    hexes.enter()
        .append("path")
        // added below for lasso compatibility
        .attr("class", "hexagon")
        .attr("d", path)
        .attr("stroke", "black")
        // added color scale fill w.r.t attributes
        .attr("fill", function(d)
        {
            var stateName = d.properties.google_name.replace(" (United States)", "");
            //console.log("Getting information and records for state: " + stateName);
            var record = businessDynamicsData.find(r => r.State === stateName && r.Year === currentYear);
            if (record && record[attribute] != null) 
            {
                return colorScale(record[attribute]);
            } 
            else 
            {
                console.error("Could not find information for State: " +stateName+ " and year: "+currentYear);
                return "gray"; 
            }
        })
        // adds text labels to each hex (map abbreviations)
        .each(function(d) {
            const centroid = path.centroid(d);
            svg.append("text")
                .attr("x", centroid[0])
                .attr("y", centroid[1])
                .text(d.properties.iso3166_2)
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "central")
                .style("font-size", "11px")
                .style("fill", "black");
        });
    
    // NOTE - FOUR STATES DO NOT EXIST IN THIS DATASET - Arizona, Illinois, Connecticut and Tennessee
    hexes.transition().duration(500)
        .attr("fill", function(d) {
            var stateName = d.properties.google_name.replace(" (United States)", "");
            //find the matching record for this state in the Business Dynamics dataset for the current year
            console.log("Getting information and records for state: " + stateName);
            var record = businessDynamicsData.find(r => r.State === stateName && r.Year === currentYear);
            if (record && record[attribute] != null) 
            {
                return colorScale(record[attribute]);
            } 
            else 
            {
                console.error("Could not find information for State: " +stateName+ " and year: "+currentYear);
                return "gray"; 
            }
        });

    
    hexes.exit().remove();
}


// STEP 4 - LASSO STUFF - START
// Adaptation of ref [7], modifications for shapes and css
// Adapted lasso code for hex map (using #hex-map-svg and hexagon paths)
function drawLassoPath() 
{
    d3.select("#lasso")
        .style("stroke", "black")
        .style("stroke-width", 2)
        .style("fill", "rgba(0, 0, 0, 0.33)")
        .attr("d", d3.line()(lassoCoords));
}

function lassoDragStart() 
{
    lassoCoords = [];
    d3.select("#hex-map-svg").selectAll("path.hexagon").classed("selected_hex", false);
    d3.select("#lasso").remove();
    d3.select("#hex-map-svg").append("path").attr("id", "lasso");
}

// use event.offsetX/Y relative to the SVG container
function lassoDragMove(event) 
{
    var mouseX = event.sourceEvent.offsetX;
    var mouseY = event.sourceEvent.offsetY;
    lassoCoords.push([mouseX, mouseY]);
    drawLassoPath();
}

// create geoPath render using same proj as hexmap then find selected hex
function lassoDragEnd() 
{
    const projection = getMainProjection();
    const pathGenerator = d3.geoPath().projection(projection);
    
    d3.select("#hex-map-svg").selectAll("path.hexagon")
        .each(function(d) {
            // use generator to compute the centroid
            var point = pathGenerator.centroid(d);
            if (pointInPolygon(point, lassoCoords)) 
            {
                d3.select(this).classed("selected_hex", true);
            }
      });
    updateLineChart();
}

// added to prevent lasso drag end and main fn mismatches
function getMainProjection() 
{
    return d3.geoMercator().scale(380).translate([950, 500]);
}

function pointInPolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) 
    {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}


// STEP 4 - LASSO STUFF - END

// STEP 5 - LINE CHART 
function updateLineChart() 
{
    console.info("In function updateLineChart");
    const selectedHex = d3.selectAll("#hex-map-svg path.selected_hex").data();
    var selectedStates = selectedHex.map(d => {
        var stateName = d.properties.google_name ? d.properties.google_name.replace(" (United States)", "") : d.properties.label;
        return stateName;
    });
    // these states do not exist in our map 
    // BUG - keeping these states in the list causes downstream issues
    const excludedStates = ["Illinois", "Tennessee", "Arizona", "Connecticut"];
    selectedStates = selectedStates.filter(state => !excludedStates.includes(state));
    console.log("Selected states: " + selectedStates);
    
    
    // cleanup
    const svg = d3.select("#line-chart-svg");
    svg.selectAll("*").transition()
    .duration(500)
    .style("opacity", 0).remove();
    
    // if no states - disp message
    
    if(selectedStates.length === 0) {
        svg.append("text")
           .attr("x", 200)
           .attr("y", 200)
           .text("No States Selected :(")
           .style("font-size", "18px").style("opacity", 0).transition().duration(500).style("opacity", 1);
        return;
    }
    
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const width = +svg.attr("width") - margin.left - margin.right || 400;
    const height = +svg.attr("height") - margin.top - margin.bottom || 300;
    
    // append group container to chart
    // fix - added class to make it accessible to outside fns (updateLineChart)
    const g = svg.append("g").attr("class","line-chart-group").attr("transform", `translate(${margin.left},${margin.top})`);
    
    // EC1 - adding the "click" to change year functionality
    // insert a clickable bg, then get mouse coordinates relative to the svg
    g.insert("rect", ":first-child")
        .attr("class", "chart-background")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", height)
        .style("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", function(event) 
        {
            // "my" not needed :/
            var [mx, my] = d3.pointer(event);
            var newYear = Math.round(xScale.invert(mx));
            const yearSlider = document.getElementById('year-selector');
            newYear = Math.max(+yearSlider.min, Math.min(newYear, +yearSlider.max));
            yearSlider.value = newYear;
            document.getElementById('year-display').textContent = newYear;
            renderHexMap();
            updateLineChart();
        }
);
    const attribute = document.getElementById('attribute-select').value;
    
    // process data: for each selected state, filter businessDynamicsData by state and prepare time-series data
    const stateData = selectedStates.map(state => {
        return {
            state: state,
            values: businessDynamicsData.filter(d => d.State === state).map(d => ({ year: d.Year, value: d[attribute] })).sort((a, b) => a.year - b.year)
        }
    });
    
    // x scale: use the full year range from the dataset.
    const allYears = businessDynamicsData.map(d => d.Year);
    const xScale = d3.scaleLinear().domain(d3.extent(allYears)).range([0, width]);
                
    // y scale Compute domain from all values of the selected attribute for the selected states
    const allValues = stateData.flatMap(d => d.values.map(v => v.value));
    const yScale = d3.scaleLinear().domain([d3.min(allValues), d3.max(allValues)]).nice().range([height, 0]);
    
    // define line generator add x and y axis, then draw line for each state using join
    const line = d3.line().x(d => xScale(d.year)).y(d => yScale(d.value));
    g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.format("d")));    
    g.append("g").call(d3.axisLeft(yScale));
    const stateLines = g.selectAll(".line").data(stateData, d => d.state);
    
    // fix - labels overlap with axes
    g.selectAll(".x-axis-label").remove();
    g.selectAll(".y-axis-label").remove();
    // label additions for axes
    g.append("text")
        .attr("class", "x-axis-label")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text("Year")
        .style("opacity", 0)
        .transition()
        .duration(500)
        .style("opacity", 1);;

    g.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .text(document.getElementById('attribute-select').value.replace("Data.","").replace("."," "))
        .style("opacity", 0)
        .transition()
        .duration(500)
        .style("opacity", 1);;
    
    // fix - moving line behind other elements
    updateVerticalLine(g, xScale, height);
    stateLines.enter()
        .append("path")
        .attr("class", "line")
        .merge(stateLines)
        .attr("fill", "none")
        .attr("stroke", (d, i) => d3.schemeCategory10[i % 10])
        .attr("stroke-width", 2)
        .attr("d", d => line(d.values))
        // added for transition purposes
        .style("opacity", 0)
        .transition()
        .duration(500)
        .style("opacity", 1);
    // for existing to new lines
    stateLines.transition().duration(500).attr("d", d => line(d.values));
    stateLines.exit().transition().duration(500).style("opacity",0).remove();
    
    g.select("#currentYearLine").transition().duration(500)
        .attr("x1", xScale(+document.getElementById('year-selector').value))
        .attr("x2", xScale(+document.getElementById('year-selector').value));

    // add state labels at the end of each line
    g.selectAll(".state-label")
        .data(stateData, d => d.state)
        .enter()
        .append("text")
        .attr("class", "state-label")
        // EC 3 - storing x pos final to ensure proper changes
        .attr("x", d => 
        {
            const finalX = xScale(d.values[d.values.length - 1].year) + 5;
            d.finalX = finalX; // store it for reuse
            return finalX;
        })
        .attr("y", d => 
        {
            const finalY = yScale(d.values[d.values.length - 1].value);
            d.finalY = finalY;
            return finalY;
        })
        // EC 3 - storing state details for overlap fixes - no longer needed
        .attr("data-state", d => d.state) 
        .attr("data-color", (d, i) => d3.schemeCategory10[i % 10]) 
        .text(d => d.state)
        .style("font-size", "8px")
        .style("fill", (d, i) => d3.schemeCategory10[i % 10])
        // EC 3 - fix - adding delay for label merges
        setTimeout(mergeCloseLabels,600);
    console.info("Leaving function updateLegend");
}


 // updateVerticalLine - Draws a vertical dashed line indicating the current year. 
function updateVerticalLine(g, xScale, height) 
{
    console.info("In function updateVerticalLine");
    // get curr year from slider, remove prev lines
    const currentYear = +document.getElementById('year-selector').value;
    console.log("updateVerticalLine selected year: " + currentYear);
    g.select("#currentYearLine").remove();
    
    // add new line
    // fix - should be always behind other lines
    g.append("line", ":first-child")
        .attr("id", "currentYearLine")
        .attr("x1", xScale(currentYear))
        .attr("x2", xScale(currentYear))
        .attr("y1", 0)
        .attr("y2", height - 5)
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "3 3");
}

// STEP 5 - LINE CHART END

// STEP 4 - COLOR LEGEND 
function drawLegend(colorScale, containerId = "#legend-container", width = 350, height = 50) 
{
    console.info("In function drawLegend");
    // cleanup
    d3.select(containerId).selectAll("svg").remove();
  
    const svgLegend = d3.select(containerId).append("svg").attr("width", width).attr("height", height);
    const gradientId = "legend-gradient";
    const defs = svgLegend.append("defs");
    const linearGradient = defs.append("linearGradient").attr("id", gradientId);
    const nStops = 10;
    const domain = colorScale.domain();
    
    const stops = d3.range(nStops).map(i => 
        {
        const t = i / (nStops - 1);
        return {
            offset: t * 100 + "%",
            color: colorScale(domain[0] + t * (domain[1] - domain[0]))
        };
    });
  
    linearGradient.selectAll("stop")
        .data(stops)
        .enter()
        .append("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);
  
    // draw rect and fill
    svgLegend.append("rect")
        .attr("x", 20)
        .attr("y", 10)
        .attr("width", width - 40)
        .attr("height", height - 30)
        .style("fill", `url(#${gradientId})`);
  
    const legendScale = d3.scaleLinear().domain(domain).range([20, width - 20]);
  
    // Create an axis using the legend scale
    const legendAxis = d3.axisBottom(legendScale).ticks(5);
  
    svgLegend.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(0, ${height - 20})`)
        .call(legendAxis);
    /* test code for adding min max for legend
    svgLegend.append("text")
    .attr("class", "legend-min")
    .attr("x", 10)
    .attr("y", height - 5) 
    .attr("text-anchor", "start")
    .style("font-size", "10px")
    .text(Math.floor(domain[0]));
    //.attr("transform", "rotate(30)");

    svgLegend.append("text")
    .attr("class", "legend-max")
    .attr("x", width)
    .attr("y", height - 5) 
    .attr("text-anchor", "end")
    .style("font-size", "10px")
    .text(Math.floor(domain[1]));
    //.attr("transform", "rotate(30)");
    console.info("Leaving function drawLegend");
    */
}

// VERY SIMILAR TO ABOVE FUNCTION, SHOULD BE MERGED IN FUTURE ITERATIONS
// updates and provides transtitions to legend
function updateLegend(colorScale, containerId = "#legend-container", width = 350, height = 50) 
{
    console.info("In function updateLegend");
    // select curr legend
    const svgLegend = d3.select(containerId).select("svg");
    if (svgLegend.empty()) 
    {
      // if no legend, create a new one! should not happen :/
      drawLegend(colorScale, containerId, width, height);
      console.log("Update Legend:- Created a new legend since no previous legends existed. Check decision tree");
      return;
    }
    
    // update gradient stops with our transitions!
    const nStops = 10;
    const domain = colorScale.domain();
    const stopsData = d3.range(nStops).map(i => 
    {
        const t = i / (nStops - 1);
        return {
            offset: (t * 100) + "%",
            color: colorScale(domain[0] + t * (domain[1] - domain[0]))
        };
    });
    
    svgLegend.select("defs")
        .select("linearGradient")
        .selectAll("stop")
        .data(stopsData)
        .transition()
        .duration(500)
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);
    
    // update axis now
    const legendScale = d3.scaleLinear().domain(domain).range([20, width - 20]);
    const legendAxis = d3.axisBottom(legendScale).ticks(5);
    
    svgLegend.select(".legend-axis")
        .transition()
        .duration(500)
        .call(legendAxis);

    /* test code for min max legend 
    const legendMinText = svgLegend.selectAll(".legend-min").data(Math.floor([domain[0]]));
    legendMinText.enter()
        .append("text")
        .attr("class", "legend-min")
        .attr("x", 10)
        .attr("y", height - 5)
        .attr("text-anchor", "start")
        .style("font-size", "10px")
        .merge(legendMinText)
        .transition()
        .duration(500)
        .text(d => d);
       // .attr("transform", "rotate(30)");
    
    const legendMaxText = svgLegend.selectAll(".legend-max").data(Math.floor([domain[1]]));
    legendMaxText.enter()
        .append("text")
        .attr("class", "legend-max")
        .attr("x", width - 5)
        .attr("y", height - 5)
        .attr("text-anchor", "end")
        .style("font-size", "10px")
        .merge(legendMaxText)
        .transition()
        .duration(500)
        .text(d => d);
        //.attr("transform", "rotate(30)");
    */
    console.info("Leaving function updateLegend");
}
// COLOR LEGEND END

// EC 3 START - logic provided belew 
// we use original x and y positions to group nearby labels (within n px vertically)
// then, we place up to 3 labels in the same horizontal line, offset slightly if needed
// repeat until no overlaps so labels stay close to their lines but don’t collide
function mergeCloseLabels() 
{
    console.log("Entering mergeCloseLabels");
    const labels = d3.selectAll(".state-label").nodes();
    // vertical threshold for grouping labels
    const threshold = 5; 

    var groups = [];

    // group labels by their original finalY position
    labels.forEach(function(label) 
    {
        const originalY = label.__data__.finalY;
        var added = false;
        groups.forEach(function(group) 
        {
            if (Math.abs(originalY - group.y) < threshold) 
            {
                group.labels.push(label);
                added = true;
            }
        });
        if (!added) 
        {
            groups.push({ y: originalY, labels: [label] });
        }
    });

    const horizontalSpacing = 3;  // spacing between labels on same line
    const verticalSpacing = 10;   // spacing between rows
    const maxPerLine = 3;         // max labels per line
    var changed = true;
    var iterationCount = 0;
    const maxIterations = 100;
    console.info("Current iter stats : horizontal spacing - " + horizontalSpacing + " vertical spacing - " + verticalSpacing + " max labels per line - " + maxPerLine + " max iter counts - " + maxIterations);
    // kept at max 100 iterations hopefully never reaches 100 :/
    while (changed && iterationCount < maxIterations) 
    {
        changed = false;
        iterationCount++;

        groups.forEach(function(group) 
        {
            // final x and final y kept due to interpolation issues 
            group.labels.sort((a, b) => a.__data__.finalX - b.__data__.finalX);
            var baseY = group.y;

            for (var i = 0; i < group.labels.length; i += maxPerLine) 
            {
                var lineLabels = group.labels.slice(i, i + maxPerLine);
                var lineNumber = Math.floor(i / maxPerLine);
                var newY = baseY + lineNumber * verticalSpacing;

                // first label keeps its original finalX
                var firstLabel = lineLabels[0];
                var currentX = firstLabel.__data__.finalX;
                if (Number(firstLabel.getAttribute("x")) !== currentX || Number(firstLabel.getAttribute("y") !== newY)) 
                {
                    changed = true;
                    firstLabel.setAttribute("x", currentX);
                    firstLabel.setAttribute("y", newY);
                }

                // position the rest in the line
                for (var j = 1; j < lineLabels.length; j++) 
                {
                    var prevLabel = lineLabels[j - 1];
                    var prevBBox = prevLabel.getBBox();
                    currentX = parseFloat(prevLabel.getAttribute("x")) +prevBBox.width + horizontalSpacing;
                    var label = lineLabels[j];
                    if (Number(label.getAttribute("x")) !== currentX || Number(label.getAttribute("y")) !== newY) 
                    {
                        changed = true;
                        label.setAttribute("x", currentX);
                        label.setAttribute("y", newY);
                    }
                }
            }
        });

        // re-check grouping based on updated Y positions
        var newGroups = [];
        labels.forEach(function(label) 
        {
            const y = +label.getAttribute("y");
            var added = false;
            newGroups.forEach(function(group) 
            {
                if (Math.abs(y - group.y) < threshold) 
                {
                    group.labels.push(label);
                    added = true;
                }
            });
            if (!added) 
            {
                newGroups.push({ y: y, labels: [label] });
            }
        });

        if (newGroups.length !== groups.length) 
        {
            groups = newGroups;
            changed = true;
        } 
        else 
        {
            for (var i = 0; i < groups.length; i++) 
            {
                if (groups[i].labels.length !== newGroups[i].labels.length)
                {
                    groups = newGroups;
                    changed = true;
                    break;
                }
            }
        }
    }
    console.info("mergeCloseLabels closed after " + iterationCount + " iterations");
    console.log("Leaving mergeCloseLabels");
}

// EXTRA - provides description of attribute on hover
function getAttributeDescription(attribute) {
    const descriptions = 
    {
        "Data.Job Creation.Rate": "The number of jobs that were created in the last year divided by the DHS denominator. The result is the rate at which jobs have been created.",
        "Data.Job Destruction.Rate": "The number of jobs that were destroyed in the last year divided by the DHS denominator. The result is the rate at which jobs have been destroyed.",
        "Data.Job Creation.Count": "The number of jobs that were created in the last year.",
        "Data.DHS Denominator": "The Davis-Haltiwanger-Schuh (DHS) denominator is the two-period trailing moving average of employment, intended to prevent transitory shocks from distorting net growth. In other words, this value roughly represents the employment for the area, but is resistant to sudden, spiking growth.",
        "Data.Job Destruction.Continuers": "The number of jobs at continuing establishments that were destroyed in the last year.",
    };
    return descriptions[attribute] || "No description available for this attribute.";
}

/**
 * Bibliography/ Links Referenced - 
 * 1. https://getbootstrap.com/docs/4.1/getting-started/introduction/ - Bootstrap docs for beautification (step 1)
 * 2. https://getbootstrap.com/docs/5.1/forms/checks-radios/ - Bootstrap - checks and radio selection (step 1)
 * 3. https://css-tricks.com/value-bubbles-for-range-inputs/ - Range slider dynamic creation (step 2)
 * 4. https://corgis-edu.github.io/corgis/csv/business_dynamics/ - CORGIS Business Dynamics dataset (step 3)
 * 5. https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/us_states_hexgrid.geojson.json - geojson (step 4)
 * 6. https://d3-graph-gallery.com/graph/hexbinmap_geo_label.html - Hexbinmap ref - d3 gallery (step 4)
 * 7. https://stackoverflow.com/questions/64107576/lasso-plugin-wont-work-with-d3-upgrade-to-v6 - d3 lasso selection for v7 (step 4)
 * 8. https://d3js.org/d3-scale/sequential - ref point for hexmap color scale - used interpolateBlues (step 4)
 * 9. https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval - used for setting "play" button intervals (step 4)
 * 10. https://observablehq.com/@fil/lasso-selection - secondary reference source for lasso functionality (step 4)
 * 11. https://observablehq.com/@d3/color-legend - color legend reference point (step 4)
 * 12. https://www.d3indepth.com/axes/ - axes info (step 4)
 * 13. https://www.d3indepth.com/selections/#general-update-pattern - update pattern info used for line chart transtitions (step 5)
 * 14. https://observablehq.com/@nikomccarty/multiline-chart-d3 - used for adding axes labels in d3 (step 5)
 * 15. https://www.d3indepth.com/transitions/ - used for referencing more advanced d3 transitions (step 5, EC)
 * 16. https://stackoverflow.com/questions/21753126/d3-js-starting-and-ending-tick - showing min and max values of legend in scale (step 4)
 * 17. https://getbootstrap.com/docs/5.1/layout/grid/ - updating grid matching for line and hexmap (step 1)
 * 18. https://blog.octoperf.com/d3js-tutorial-mouse-events-handling/ - mouse event handling for position details (EC 1)
 * 19. https://d3js.org/d3-scale/linear - scale inversion using xScale.invert (EC 1)
 * 20. https://beginswithai.com/claude-ai-logo-color-codes-fonts-downloadable-assets/ - assets for beautification
 * 21. https://d3js.org/d3-interpolate/color - color scale changes - beautification  
 * 22. https://css-tricks.com/styling-cross-browser-compatible-range-inputs-css/ - slider thumb color changes - beautification
 * 23. https://gist.github.com/wdickerson/bd654e61f536dcef3736f41e0ad87786 - forced layout, introduces d3 collide and bboxes (EC 3)
 * 24. https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getBBox - MDN getBBox() method (EC3)
 */