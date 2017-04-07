var sprintf = require('sprintf-js').sprintf;

angular.module('psvelApp')
.directive('d3Fold', [function() {
  function link(scope, element) {
    'use strict';
    var margins = {left: 50,right: 30,top: 30,bottom: 30},
      w = 800 - margins.left - margins.right,
      h = 200 - margins.top - margins.bottom;

    // semblance array is of the form {t:..., v:..., a:...}
    // where t is time, v is velocity, and a is semblance power
    var data = scope.data;
    console.log('in d3fold', data);

    var svg = d3.select(element[0])
        .append('svg')
        .attr('width', w + margins.left + margins.right)
        .attr('height', h + margins.top + margins.bottom)
        .append('g')
        .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

    var cdpmin = d3.min(data, function(d) {return d.cdp;});
    var cdpmax = d3.max(data, function(d) {return d.cdp;});
    var foldmin = d3.min(data, function(d) {return d.fold;});
    var foldmax = d3.max(data, function(d) {return d.fold;});

    var xScale = d3.scaleLinear().range([0, w]).domain([0, cdpmax]);
    var yScale = d3.scaleLinear().range([h, 0]).domain([0, foldmax]).nice();

    var xAxis = d3.axisBottom(xScale);
    var yAxis = d3.axisLeft(yScale);

    console.log('d3 fold min/max', cdpmin, cdpmax, foldmin, foldmax);
    svg.append('g')
      .attr('class', 'axis x-axis')
      .attr('transform', 'translate(0, ' + h + ')')
      .call(xAxis.ticks(5));
    svg.append('g')
      .attr('class', 'axis y-axis')
      .call(yAxis.ticks(5))

    var fold= svg.append('g')
      .selectAll('.fold')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'fold')
      .attr('cx', function(d) {return xScale(d.cdp);})
      .attr('cy', function(d) {return yScale(d.fold);})
      .attr('r', '2px')
      .attr('fill', 'blue')

    svg.append('text')
      .text('CDP Fold')
      .attr('transform', 'translate(' + w/2 + ',-10)')

  }

  return {
    link: link,
    restrict: 'E',
    scope: {
      data: '=',
    }
  }
}])
